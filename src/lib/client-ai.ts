/**
 * Client / owner AI.
 *
 * 35. answerOwnerQuestion — RAG over project data for owner portal
 * 36. winProbability — predictive scoring for opportunities
 * 37. analyzeSurvey — extract themes from survey text
 * 38. clientLtvPredict — 5y lifetime value + BD strategy
 */

import { prisma } from "@/lib/prisma";
import { aiCall, stableHash } from "@/lib/ai";
import { sumMoney, addMoney, toNum } from "@/lib/money";
import { approvedCoValue, isApprovedCo, isPendingCo } from "@/lib/change-order-totals";

export type OwnerAnswer = { answer: string; sources: string[] };

export async function answerOwnerQuestion(params: { question: string; projectId: string; tenantId: string }): Promise<OwnerAnswer> {
  const project = await prisma.project.findFirst({
    where: { id: params.projectId, tenantId: params.tenantId },
    include: {
      contracts: true,
      payApplications: { orderBy: { periodTo: "desc" } },
      changeOrders: true,
      scheduleTasks: { orderBy: { startDate: "asc" } },
      rfis: { orderBy: { createdAt: "desc" } },
      safetyIncidents: { orderBy: { occurredAt: "desc" } },
      submittals: { orderBy: { createdAt: "desc" } },
      dailyLogs: { orderBy: { logDate: "desc" }, take: 14 },
    },
  });
  if (!project) throw new Error("project not found");

  return aiCall<OwnerAnswer>({
    kind: "owner-qa",
    prompt: `Answer owner question: ${params.question}`,
    fallback: () => {
      const q = params.question.toLowerCase();
      const sources: string[] = [];
      const contractValue = toNum(project.contractValue);

      // SCHEDULE
      if (/schedule|deadline|complete|when|finish|milestone|target\s+date/i.test(q)) {
        const tasksDone = project.scheduleTasks.filter((t) => t.percentComplete >= 100).length;
        const total = project.scheduleTasks.length;
        const avgProgress = total > 0 ? project.scheduleTasks.reduce((s, t) => s + t.percentComplete, 0) / total : 0;
        const earliest = project.scheduleTasks[0]?.startDate;
        const latest = project.scheduleTasks.reduce((l, t) => t.endDate > l ? t.endDate : l, new Date(0));
        const late = project.scheduleTasks.filter((t) => t.endDate < new Date() && t.percentComplete < 100).length;
        const next = project.scheduleTasks.filter((t) => t.endDate > new Date() && t.percentComplete < 100).slice(0, 3);
        sources.push("ScheduleTask");
        return {
          answer: `Of ${total} schedule tasks, ${tasksDone} are complete (${avgProgress.toFixed(0)}% overall progress). The project spans ${earliest?.toISOString().slice(0, 10) ?? "—"} to ${latest.toISOString().slice(0, 10) ?? "—"}.${late > 0 ? ` ${late} tasks are past their planned end date.` : ""}${next.length > 0 ? ` Next milestones: ${next.map((t) => `${t.name} (${t.endDate.toISOString().slice(0, 10)})`).join("; ")}.` : ""}`,
          sources,
        };
      }
      // COST / BILLING
      if (/spent|cost|budget|expense|bill|invoice|pay.*app|cash/i.test(q)) {
        const billed = sumMoney(project.payApplications.map((p) => p.currentPaymentDue));
        const approvedCos = approvedCoValue(project.changeOrders);
        const currentContract = addMoney(contractValue, approvedCos);
        const lastApp = project.payApplications[0];
        sources.push("PayApplication", "ChangeOrder", "Contract");
        return {
          answer: `Current contract value: $${currentContract.toLocaleString()} (original $${contractValue.toLocaleString()} + $${approvedCos.toLocaleString()} in approved change orders). Billed to date: $${billed.toLocaleString()} across ${project.payApplications.length} pay applications.${lastApp ? ` Most recent pay app period ending ${lastApp.periodTo.toISOString().slice(0, 10)} requested $${toNum(lastApp.currentPaymentDue).toLocaleString()}.` : ""}`,
          sources,
        };
      }
      // CHANGE ORDERS
      if (/change\s+order|extra|co\b|scope\s+change|cor\b/i.test(q)) {
        const approved = project.changeOrders.filter((c) => isApprovedCo(c.status));
        const pending = project.changeOrders.filter((c) => isPendingCo(c.status));
        sources.push("ChangeOrder");
        return {
          answer: `${project.changeOrders.length} change orders on file. ${approved.length} approved totaling $${sumMoney(approved.map((c) => c.amount)).toLocaleString()}. ${pending.length} pending review totaling $${sumMoney(pending.map((c) => c.amount)).toLocaleString()}. Total schedule impact from approved COs: ${approved.reduce((s, c) => s + c.scheduleImpactDays, 0)} days.`,
          sources,
        };
      }
      // RFIs
      if (/rfi|question|clarification|information\s+request/i.test(q)) {
        const open = project.rfis.filter((r) => r.status !== "CLOSED" && r.status !== "APPROVED").length;
        const overdue = project.rfis.filter((r) => r.dueDate && r.dueDate < new Date() && r.status !== "CLOSED").length;
        sources.push("RFI");
        return { answer: `${project.rfis.length} RFIs on file. ${open} open, ${overdue} overdue. All RFIs are logged in the project record and tracked to closure.`, sources };
      }
      // SAFETY
      if (/safety|incident|injury|osha/i.test(q)) {
        const recordable = project.safetyIncidents.filter((i) => /recordable/i.test(i.severity)).length;
        sources.push("SafetyIncident");
        return { answer: `${project.safetyIncidents.length} safety events on record: ${recordable} recordable. All events follow OSHA documentation and root-cause analysis. Safety performance is reviewed weekly with the site team.`, sources };
      }
      // SUBMITTALS
      if (/submittal|shop\s+drawing|product\s+data|spec/i.test(q)) {
        const open = project.submittals.filter((s) => s.status !== "APPROVED" && s.status !== "CLOSED").length;
        const longLead = project.submittals.filter((s) => s.longLead).length;
        sources.push("Submittal");
        return { answer: `${project.submittals.length} submittals tracked. ${open} still in review cycle, ${longLead} flagged as long-lead items requiring early procurement.`, sources };
      }
      // CONTRACT
      if (/contract|value|award|agreement|executed/i.test(q)) {
        sources.push("Contract");
        return { answer: `Executed prime contract value is $${contractValue.toLocaleString()}. ${project.contracts.length} contract document${project.contracts.length === 1 ? "" : "s"} on file. Contract documents are maintained in the secure document repository; a copy is available to authorized owner representatives.`, sources };
      }
      // PROGRESS / STATUS
      if (/progress|status|update|how.*going|where.*are\s+we/i.test(q)) {
        const tasksDone = project.scheduleTasks.filter((t) => t.percentComplete >= 100).length;
        const total = project.scheduleTasks.length;
        const avgProgress = total > 0 ? project.scheduleTasks.reduce((s, t) => s + t.percentComplete, 0) / total : 0;
        const recentLog = project.dailyLogs[0];
        sources.push("ScheduleTask", "DailyLog");
        return {
          answer: `Overall progress: ${avgProgress.toFixed(0)}% (${tasksDone}/${total} tasks complete). Project stage: ${project.stage.replaceAll("_", " ")}.${recentLog ? ` Most recent daily log (${recentLog.logDate.toISOString().slice(0, 10)}): ${recentLog.summary.slice(0, 200)}` : ""}`,
          sources,
        };
      }
      // WEATHER
      if (/weather|rain|storm|delay/i.test(q)) {
        const weatherLogs = project.dailyLogs.filter((l) => l.weather && /rain|storm|snow|freez|wind/i.test(l.weather ?? "")).slice(0, 5);
        sources.push("DailyLog");
        return { answer: weatherLogs.length === 0 ? `No significant weather events in the last 14 daily logs.` : `${weatherLogs.length} weather events in last 14 days: ${weatherLogs.map((l) => `${l.logDate.toISOString().slice(0, 10)} (${l.weather})`).join("; ")}.`, sources };
      }
      // TEAM
      if (/team|who.*work|superintendent|project\s+manager|pm/i.test(q)) {
        return { answer: `Current project team is assigned and listed in the project record. Your dedicated Project Manager and Superintendent are the single points of contact for questions. Weekly owner coordination meetings keep all stakeholders aligned.`, sources: ["Membership"] };
      }
      // FALLBACK
      return {
        answer: `I can answer questions about:\n• Schedule and milestones · Completion dates\n• Costs spent, amounts billed, pay applications\n• Change orders (approved, pending, schedule impact)\n• RFIs (open, overdue)\n• Safety incidents\n• Submittals\n• Contract and awards\n• Progress / weekly status\n• Weather impacts\n• Project team\n\nPlease rephrase your question with specifics about what you'd like to know about ${project.name}.`,
        sources: [],
      };
    },
  });
}

export type WinProbability = { probability: number; confidence: number; drivers: string[]; risks: string[] };

export async function winProbability(opportunityId: string, tenantId: string): Promise<WinProbability> {
  const opp = await prisma.opportunity.findFirst({ where: { id: opportunityId, tenantId }, include: { bidDrafts: true } });
  if (!opp) throw new Error("opportunity not found");
  const [clientWon, clientLost, modeWon, modeLost, tenantWon, tenantLost] = await Promise.all([
    opp.clientName ? prisma.opportunity.count({ where: { tenantId, clientName: opp.clientName, stage: "AWARDED" } }) : Promise.resolve(0),
    opp.clientName ? prisma.opportunity.count({ where: { tenantId, clientName: opp.clientName, stage: "LOST" } }) : Promise.resolve(0),
    prisma.opportunity.count({ where: { tenantId, mode: opp.mode, stage: "AWARDED" } }),
    prisma.opportunity.count({ where: { tenantId, mode: opp.mode, stage: "LOST" } }),
    prisma.opportunity.count({ where: { tenantId, stage: "AWARDED" } }),
    prisma.opportunity.count({ where: { tenantId, stage: "LOST" } }),
  ]);

  return aiCall<WinProbability>({
    kind: "win-prob",
    prompt: `Win probability for ${opp.name}`,
    fallback: () => {
      function smooth(won: number, total: number, priorRate = 0.3, priorN = 8): number {
        return ((priorRate * priorN + won) / (priorN + total)) * 100;
      }
      const clientTotal = clientWon + clientLost;
      const modeTotal = modeWon + modeLost;
      const tenantTotal = tenantWon + tenantLost;
      const clientRate = smooth(clientWon, clientTotal);
      const modeRate = smooth(modeWon, modeTotal);
      const tenantRate = smooth(tenantWon, tenantTotal);

      // Blend with weight proportional to sample size.
      const clientWeight = Math.min(1, clientTotal / 4);
      const modeWeight = Math.min(1, modeTotal / 8) * (1 - clientWeight);
      const tenantWeight = 1 - clientWeight - modeWeight;
      let probability = clientWeight * clientRate + modeWeight * modeRate + tenantWeight * tenantRate;

      const drivers: string[] = [];
      const risks: string[] = [];

      // BD team's own estimate — treat as a noisy signal and average with model.
      if (opp.probability > 0) {
        probability = (probability + opp.probability) / 2;
      }

      // Stage-based adjustments.
      const stagePrior: Record<string, number> = { LEAD: -15, QUALIFIED: -5, PROPOSAL: 5, BID: 10, AWARDED: 100, LOST: 0, WITHDRAWN: 0 };
      probability += stagePrior[opp.stage] ?? 0;

      // Time-in-stage decay: old opportunities in early stages are stale.
      const ageDays = Math.round((Date.now() - new Date(opp.updatedAt).getTime()) / 86_400_000);
      if ((opp.stage === "LEAD" || opp.stage === "QUALIFIED") && ageDays > 60) {
        probability -= 15;
        risks.push(`Stale (${ageDays} days since last update in ${opp.stage} stage) — confirm still live before investing more pursuit cost.`);
      }

      // Due date urgency.
      if (opp.dueDate) {
        const daysToDue = Math.round((new Date(opp.dueDate).getTime() - Date.now()) / 86_400_000);
        if (daysToDue < 0 && opp.stage !== "AWARDED" && opp.stage !== "LOST") {
          probability -= 20;
          risks.push(`Past due date by ${-daysToDue} days — confirm extension or withdraw.`);
        } else if (daysToDue < 7 && opp.bidDrafts.length === 0) {
          risks.push(`Due in ${daysToDue} days and no bid draft started — response capacity at risk.`);
        }
      }

      // Drivers.
      if (clientTotal >= 3 && clientRate > 50) drivers.push(`Strong track record with ${opp.clientName} (${clientRate.toFixed(0)}% on ${clientTotal} decided bids).`);
      if (modeTotal >= 8 && modeRate > 45) drivers.push(`Tenant performs well in ${opp.mode} mode overall (${modeRate.toFixed(0)}% win rate on ${modeTotal} decided).`);
      if (opp.bidDrafts.length > 0) drivers.push(`${opp.bidDrafts.length} bid draft${opp.bidDrafts.length === 1 ? "" : "s"} already in progress — response capacity engaged.`);
      if (toNum(opp.estimatedValue) > 5_000_000) drivers.push(`High-value opportunity ($${toNum(opp.estimatedValue).toLocaleString()}) — strategic.`);
      if (opp.source) drivers.push(`Sourced from ${opp.source} — channel yields higher-quality leads.`);

      // Risks.
      if (clientTotal >= 3 && clientRate < 20) risks.push(`Low historical hit rate with ${opp.clientName} (${clientRate.toFixed(0)}%). Understand root cause before pursuing.`);
      if (toNum(opp.estimatedValue) < 250_000) risks.push("Small opportunity — price-driven; margin compression likely.");
      if (opp.stage === "LEAD" && ageDays < 14) risks.push("At LEAD stage — qualify before committing significant BD hours.");
      if (drivers.length === 0) drivers.push("No strong positive drivers identified — standard pursuit.");

      probability = Math.max(5, Math.min(92, probability));

      const confidence = Math.round(Math.min(92, 45 + clientTotal * 5 + modeTotal * 2));
      return { probability: Math.round(probability), confidence, drivers, risks };
    },
  });
}

export type SurveyAnalysis = { themes: Array<{ theme: string; sentiment: "POS" | "NEG" | "MIXED"; quoteExcerpt: string }>; npsScore: number; recommendations: string[] };

export async function analyzeSurvey(responses: string[]): Promise<SurveyAnalysis> {
  return aiCall<SurveyAnalysis>({
    kind: "survey-analyze",
    prompt: `Analyze ${responses.length} survey responses`,
    fallback: () => {
      const combined = responses.join(" ").toLowerCase();
      const themes: SurveyAnalysis["themes"] = [];
      if (/communicat|update|respons/i.test(combined)) themes.push({ theme: "Communication cadence", sentiment: /poor|slow|lack/i.test(combined) ? "NEG" : "POS", quoteExcerpt: responses.find((r) => /communicat/i.test(r))?.slice(0, 100) ?? "" });
      if (/quality|craftsmanship/i.test(combined)) themes.push({ theme: "Workmanship quality", sentiment: /poor|issue|defect/i.test(combined) ? "NEG" : "POS", quoteExcerpt: responses.find((r) => /quality/i.test(r))?.slice(0, 100) ?? "" });
      if (/schedule|delay|late|time/i.test(combined)) themes.push({ theme: "Schedule adherence", sentiment: /delay|late/i.test(combined) ? "NEG" : "POS", quoteExcerpt: responses.find((r) => /schedule/i.test(r))?.slice(0, 100) ?? "" });
      if (/safe/i.test(combined)) themes.push({ theme: "Safety culture", sentiment: "POS", quoteExcerpt: responses.find((r) => /safe/i.test(r))?.slice(0, 100) ?? "" });
      const posCount = themes.filter((t) => t.sentiment === "POS").length;
      const negCount = themes.filter((t) => t.sentiment === "NEG").length;
      const nps = Math.min(100, Math.max(-100, Math.round(((posCount - negCount) / Math.max(1, themes.length)) * 60 + 20)));
      const recs: string[] = [];
      if (negCount > posCount) recs.push("Root-cause clinic with PM team on recurring negative themes.");
      if (themes.some((t) => t.theme === "Communication cadence" && t.sentiment === "NEG")) recs.push("Implement weekly owner standing meeting for future projects.");
      if (themes.some((t) => t.theme === "Schedule adherence" && t.sentiment === "NEG")) recs.push("Pre-award schedule buffer and risk-register cadence review.");
      return { themes, npsScore: nps, recommendations: recs };
    },
  });
}

export type ClientLtv = { clientName: string; past5Y: number; projected5Y: number; accounts: number; retention: number; strategy: "CHASE" | "NURTURE" | "DROP"; rationale: string };

export async function clientLtvPredict(tenantId: string): Promise<ClientLtv[]> {
  // Pull individual opps with dates so we can compute time-weighted revenue and hit rate.
  const opps = await prisma.opportunity.findMany({
    where: { tenantId, clientName: { not: null } },
    select: { clientName: true, estimatedValue: true, stage: true, createdAt: true, updatedAt: true },
  });

  return aiCall<ClientLtv[]>({
    kind: "clv",
    prompt: `Client LTV rollup`,
    fallback: () => {
      const byClient = new Map<string, typeof opps>();
      for (const o of opps) {
        const k = o.clientName ?? "";
        if (!k) continue;
        const arr = byClient.get(k) ?? [];
        arr.push(o);
        byClient.set(k, arr);
      }

      const now = Date.now();
      return Array.from(byClient.entries()).map(([clientName, list]) => {
        const won = list.filter((l) => l.stage === "AWARDED");
        const lost = list.filter((l) => l.stage === "LOST");
        const decided = won.length + lost.length;
        const winRate = decided > 0 ? won.length / decided : 0.3;

        // Time-weighted revenue: decay older wins at half-life 2 years.
        const HALF_LIFE_DAYS = 730;
        const weightedRevenue = won.reduce((s, o) => {
          const ageDays = (now - new Date(o.updatedAt).getTime()) / 86_400_000;
          const weight = Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
          return s + (toNum(o.estimatedValue) * weight);
        }, 0);
        const rawPastRevenue = sumMoney(won.map((o) => o.estimatedValue));

        // Project 5 years forward: weighted annual rate × 5 × win probability.
        const oldestWin = won.length > 0 ? Math.min(...won.map((o) => new Date(o.updatedAt).getTime())) : now;
        const yearsObserved = Math.max(1, (now - oldestWin) / (365 * 86_400_000));
        const annualRate = weightedRevenue / yearsObserved;
        const pipeline = sumMoney(list.filter((l) => ["LEAD", "QUALIFIED", "PROPOSAL", "BID"].includes(l.stage)).map((o) => o.estimatedValue));
        const projected5Y = annualRate * 5 + pipeline * winRate;

        // Retention = recent activity / historical rate.
        const recentOpps = list.filter((l) => (now - new Date(l.updatedAt).getTime()) / 86_400_000 < 365).length;
        const retention = Math.min(95, Math.round(winRate * 100 * 0.6 + Math.min(30, recentOpps * 10)));

        let strategy: ClientLtv["strategy"] = "NURTURE";
        const rationaleParts: string[] = [];
        if (projected5Y > 10_000_000 && retention > 70) {
          strategy = "CHASE";
          rationaleParts.push(`Strong projected value ($${Math.round(projected5Y).toLocaleString()} over 5y) with ${retention}% retention.`);
          rationaleParts.push("Assign dedicated BD lead; pursue every opportunity aggressively.");
        } else if (decided >= 3 && winRate < 0.15) {
          strategy = "DROP";
          rationaleParts.push(`${won.length}-for-${decided} historical win rate — client may be using us as a check-bidder.`);
          rationaleParts.push("Deprioritize until win rate improves or stop pursuing unless strategic.");
        } else if (rawPastRevenue < 500_000 && list.length < 2) {
          strategy = "DROP";
          rationaleParts.push(`Single small engagement ($${rawPastRevenue.toLocaleString()}) — not enough signal to invest.`);
        } else {
          rationaleParts.push(`Steady mid-tier client: ${won.length} wins, ${lost.length} losses, $${Math.round(annualRate).toLocaleString()}/yr run-rate.`);
          rationaleParts.push("Maintain quarterly touch cadence; look for expansion.");
        }

        return {
          clientName,
          past5Y: rawPastRevenue,
          projected5Y,
          accounts: list.length,
          retention,
          strategy,
          rationale: rationaleParts.join(" "),
        };
      }).sort((a, b) => b.projected5Y - a.projected5Y);
    },
  });
}
