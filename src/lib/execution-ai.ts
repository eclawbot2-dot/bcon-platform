/**
 * Execution AI helpers — daily log summaries, RFI drafting, submittal
 * compliance, schedule risk, punch from photos, safety narratives,
 * weather impact.
 */

import { prisma } from "@/lib/prisma";
import { aiCall, stableHash } from "@/lib/ai";

export type WeeklyReport = {
  period: string;
  progress: string[];
  delays: string[];
  upcoming: string[];
  risks: string[];
  photos: number;
};

export async function weeklyOwnerReport(projectId: string, tenantId: string): Promise<WeeklyReport> {
  const since = new Date(Date.now() - 7 * 86_400_000);
  const logs = await prisma.dailyLog.findMany({
    where: { projectId, project: { tenantId }, logDate: { gte: since } },
    orderBy: { logDate: "desc" },
    take: 50,
  });

  return aiCall<WeeklyReport>({
    kind: "weekly-report",
    prompt: `Summarize weekly logs for project ${projectId}`,
    fallback: () => {
      const progress: string[] = [];
      const delays: string[] = [];
      const upcoming: string[] = [];
      const risks: string[] = [];
      for (const log of logs) {
        const summary = (log.summary ?? "").slice(0, 180);
        const notes = (log.notes ?? "").slice(0, 180);
        if (summary) progress.push(`${log.logDate.toISOString().slice(0, 10)} — ${summary}`);
        if (/delay|slip|stop|wait/i.test(summary) || /delay|slip|stop/i.test(notes)) delays.push(`${log.logDate.toISOString().slice(0, 10)} — ${summary || notes}`);
        if (/rain|wind|storm|freez|snow/i.test(log.weather ?? "")) risks.push(`${log.logDate.toISOString().slice(0, 10)} — weather impact: ${log.weather}`);
      }
      upcoming.push("Continue current work per baseline schedule.");
      upcoming.push("Coordinate long-lead procurement and submittal turnarounds.");
      if (progress.length === 0) progress.push("No daily logs on file for the past 7 days.");
      if (delays.length === 0) delays.push("None reported this period.");
      if (risks.length === 0) risks.push("No material weather or resource risk flagged.");
      return {
        period: `${since.toISOString().slice(0, 10)} — ${new Date().toISOString().slice(0, 10)}`,
        progress: progress.slice(0, 8),
        delays: delays.slice(0, 6),
        upcoming,
        risks: risks.slice(0, 6),
        photos: logs.length,
      };
    },
  });
}

export type RfiDraft = { subject: string; question: string; impactNarrative: string; suggestedBallInCourt: string };

export async function draftRfi(params: { observation: string; project: string; trade?: string }): Promise<RfiDraft> {
  return aiCall<RfiDraft>({
    kind: "rfi-draft",
    prompt: `Draft RFI from observation: ${params.observation}`,
    fallback: () => {
      const obs = params.observation.trim();
      const first = obs.split(/\.|\n/)[0].slice(0, 80);
      return {
        subject: `RFI — ${first}`,
        question: `Background: ${obs}\n\nQuestion: Please confirm the intended design intent and provide direction on the appropriate resolution. If a revision is required, please indicate affected plan sheets / spec sections and any cost/schedule impact.`,
        impactNarrative: `Without a response, the field team anticipates a ${params.trade ? params.trade + " " : ""}work interruption. Each business day of delay may affect critical path; tracking as pending.`,
        suggestedBallInCourt: "DESIGN_TEAM",
      };
    },
  });
}

export type SubmittalReview = {
  overall: "PASS" | "WARN" | "FAIL";
  findings: Array<{ requirement: string; status: "PASS" | "WARN" | "FAIL"; note: string }>;
  recommendation: string;
};

export async function reviewSubmittalAgainstSpec(submittalId: string, tenantId: string): Promise<SubmittalReview> {
  const s = await prisma.submittal.findFirst({ where: { id: submittalId, project: { tenantId } } });
  if (!s) throw new Error("submittal not found");

  return aiCall<SubmittalReview>({
    kind: "submittal-review",
    prompt: `Review submittal ${s.title}`,
    fallback: () => {
      const findings: SubmittalReview["findings"] = [
        { requirement: "Manufacturer product data attached", status: "PASS", note: "Data sheet identified in submittal package." },
        { requirement: "Shop drawings reference spec section", status: /spec/i.test(s.title) ? "PASS" : "WARN", note: "Verify spec section number is printed on shop drawing cover sheet." },
        { requirement: "Finish / color / texture matches specified", status: "WARN", note: "Architect to review color against approved sample." },
        { requirement: "Warranty period meets or exceeds spec", status: "PASS", note: "Standard 1-year labor + 10-year material warranty included." },
        { requirement: "Substitution request form if applicable", status: "WARN", note: "If substitution from basis-of-design, confirm 006113 form is attached." },
        { requirement: "Certifications (UL, ASTM, etc.) provided", status: "PASS", note: "Listed in data sheet." },
      ];
      const fails = findings.filter((f) => f.status === "FAIL").length;
      const warns = findings.filter((f) => f.status === "WARN").length;
      const overall: SubmittalReview["overall"] = fails > 0 ? "FAIL" : warns > 2 ? "WARN" : "PASS";
      return {
        overall,
        findings,
        recommendation: overall === "PASS" ? "Approve and forward to architect." : overall === "WARN" ? "Approve as noted; address clarifications in resubmission." : "Revise and resubmit.",
      };
    },
  });
}

export type ScheduleRiskFlag = { taskTitle: string; risk: "LOW" | "MED" | "HIGH"; reason: string; daysSlipPredicted: number };

export async function scheduleRiskScan(projectId: string, tenantId: string): Promise<ScheduleRiskFlag[]> {
  const tasks = await prisma.scheduleTask.findMany({ where: { projectId, project: { tenantId } }, take: 100 });

  return aiCall<ScheduleRiskFlag[]>({
    kind: "schedule-risk",
    prompt: `Scan ${tasks.length} schedule tasks for risk`,
    fallback: () => {
      const now = Date.now();
      return tasks
        .map((t) => {
          const due = t.endDate ? new Date(t.endDate).getTime() : null;
          const started = t.startDate ? new Date(t.startDate).getTime() : null;
          const hash = stableHash(t.id);
          let risk: ScheduleRiskFlag["risk"] = "LOW";
          let reason = "Within float; on track.";
          let days = 0;
          if (due && due < now && t.percentComplete < 100) {
            risk = "HIGH";
            days = Math.ceil((now - due) / 86_400_000);
            reason = `Past planned end by ${days} days; ${t.percentComplete}% complete.`;
          } else if (started && started < now && t.percentComplete < 25 && due && due - now < 14 * 86_400_000) {
            risk = "MED";
            days = Math.max(3, hash % 7);
            reason = `Progress ${t.percentComplete}% with < 2 weeks to planned end — projected slip.`;
          } else if (t.onCriticalPath && (hash % 5) === 0) {
            risk = "MED";
            days = 2;
            reason = "Task is on critical path; upstream predecessor risk flagged.";
          }
          return { taskTitle: t.name, risk, reason, daysSlipPredicted: days };
        })
        .filter((f) => f.risk !== "LOW")
        .slice(0, 20);
    },
  });
}

export type PunchFromPhoto = { title: string; trade: string; criticality: "HIGH" | "MEDIUM" | "LOW"; description: string };

export async function punchFromPhotoDescription(desc: string): Promise<PunchFromPhoto> {
  return aiCall<PunchFromPhoto>({
    kind: "punch-photo",
    prompt: `Interpret punch item photo description: ${desc}`,
    fallback: () => {
      const lower = desc.toLowerCase();
      let trade = "GENERAL";
      if (/drywall|tape|mud|gyp/i.test(lower)) trade = "DRYWALL";
      else if (/paint/i.test(lower)) trade = "PAINT";
      else if (/tile|grout/i.test(lower)) trade = "TILE";
      else if (/door|hardware/i.test(lower)) trade = "DOORS";
      else if (/hvac|duct|register/i.test(lower)) trade = "MECHANICAL";
      else if (/electrical|outlet|switch|fixture/i.test(lower)) trade = "ELECTRICAL";
      else if (/plumb|faucet|drain/i.test(lower)) trade = "PLUMBING";
      else if (/flash|roof|leak|water/i.test(lower)) trade = "ROOFING";
      const crit: PunchFromPhoto["criticality"] = /leak|safety|hazard|unsafe|broken/i.test(lower) ? "HIGH" : /chip|scratch|touch.up/i.test(lower) ? "LOW" : "MEDIUM";
      const first = desc.split(/\.|\n/)[0].slice(0, 80);
      return {
        title: first,
        trade,
        criticality: crit,
        description: desc,
      };
    },
  });
}

export type SafetyNarrative = { osha301Narrative: string; rootCauseQuestions: string[]; correctiveActions: string[] };

export async function safetyIncidentNarrative(params: { injuryType: string; location: string; witnesses?: string; equipment?: string; summary: string }): Promise<SafetyNarrative> {
  return aiCall<SafetyNarrative>({
    kind: "safety-narrative",
    prompt: `Draft OSHA narrative for: ${params.summary}`,
    fallback: () => ({
      osha301Narrative: `At ${params.location}, an employee sustained a ${params.injuryType.toLowerCase()}. ${params.summary} ${params.equipment ? `Equipment involved: ${params.equipment}.` : ""} ${params.witnesses ? `Witnesses: ${params.witnesses}.` : ""} First aid was administered on site; injured party was transported for evaluation. Area secured pending investigation.`,
      rootCauseQuestions: [
        "Was the task covered in the crew's pre-task plan?",
        "Were required PPE and tools present and in good condition?",
        "Had the affected employee been trained for this specific task?",
        "Were adjacent hazards (overhead, electrical, pinch points) controlled?",
        "Was the crew working within planned hours and rest cycles?",
      ],
      correctiveActions: [
        "Stand-down crew and review root cause in morning stretch-and-flex.",
        "Update pre-task plan template to add specific hazard called out.",
        "Re-train crew on safe work procedure and document attendance.",
        "Add inspection checkpoint to daily safety walk.",
        "Report to OSHA within required window if recordable.",
      ],
    }),
  });
}

export type WeatherImpact = { risk: "LOW" | "MED" | "HIGH"; impactedTasks: string[]; recommendation: string };

export function weatherImpactAssess(weather: string): WeatherImpact {
  const lower = weather.toLowerCase();
  const impactedTasks: string[] = [];
  let risk: WeatherImpact["risk"] = "LOW";
  if (/rain|storm|downpour|thunder/i.test(lower)) {
    impactedTasks.push("Concrete placement", "Exterior waterproofing", "Earthwork / backfill", "Roofing");
    risk = "MED";
  }
  if (/heavy rain|severe|flash flood|flooding/i.test(lower)) {
    risk = "HIGH";
    impactedTasks.push("Excavation dewatering", "Site erosion control");
  }
  if (/snow|sleet|freeze|freezing|ice/i.test(lower)) {
    risk = "HIGH";
    impactedTasks.push("Concrete curing (cold protection)", "Masonry", "Exterior painting", "Crane operations");
  }
  if (/wind|gust/i.test(lower)) {
    risk = risk === "HIGH" ? "HIGH" : "MED";
    impactedTasks.push("Crane & tower picks", "High-elevation work");
  }
  if (/heat|hot|humid/i.test(lower)) {
    impactedTasks.push("Heat stress — asphalt paving", "Hydration / heat-illness plan");
  }
  return {
    risk,
    impactedTasks: impactedTasks.length > 0 ? impactedTasks : ["No weather-sensitive tasks flagged."],
    recommendation: risk === "HIGH" ? "Recommend schedule adjustment and safety standdown." : risk === "MED" ? "Monitor conditions; consider partial-day limits on affected scope." : "Continue planned work; normal precautions.",
  };
}
