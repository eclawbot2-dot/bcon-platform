import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { useTempDevDb } from "./_db";

/**
 * Weather auto-capture. Tests the pure parser plus the idempotent capture
 * flow (create / fill-missing / skip-existing) against a throwaway dev.db
 * copy with a mocked Open-Meteo fetch.
 */

// Bind DATABASE_URL to a temp copy before the lib's prisma singleton loads.
const { cleanupFile } = useTempDevDb("weather");

let prisma: PrismaClient;
let parseWeather: typeof import("@/lib/weather").parseWeather;
let captureWeatherForProject: typeof import("@/lib/weather").captureWeatherForProject;

beforeAll(async () => {
  ({ prisma } = await import("@/lib/prisma"));
  ({ parseWeather, captureWeatherForProject } = await import("@/lib/weather"));
});

afterAll(async () => {
  await prisma?.$disconnect();
  cleanupFile();
});

async function newProjectWithCoords(lat: number, lng: number) {
  const tenant = await prisma.tenant.create({
    data: { name: `wx-${Date.now()}`, slug: `wx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, primaryMode: "VERTICAL" },
  });
  return prisma.project.create({
    data: {
      tenantId: tenant.id,
      name: "Weather test",
      code: `WX-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      mode: "VERTICAL",
      configurationJson: JSON.stringify({ latitude: lat, longitude: lng }),
    },
  });
}

function mockMeteo(code: number, tempF: number) {
  // Return a FRESH Response per call — a Response body can only be read
  // once, so mockResolvedValue (same instance) would 'no-weather' on call 2.
  return vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
    new Response(
      JSON.stringify({ current: { temperature_2m: tempF, precipitation: 0, wind_speed_10m: 7, weather_code: code } }),
      { status: 200, headers: { "content-type": "application/json" } },
    ),
  );
}

describe("parseWeather", () => {
  it("builds a human summary from an Open-Meteo current object", () => {
    const r = parseWeather({ temperature_2m: 72.4, precipitation: 0, wind_speed_10m: 9, weather_code: 2 });
    expect(r.summary).toContain("Partly cloudy");
    expect(r.summary).toContain("72°F");
    expect(r.summary).toContain("wind 9 mph");
    expect(r.code).toBe(2);
  });

  it("includes precipitation only when > 0", () => {
    expect(parseWeather({ precipitation: 0, weather_code: 0 }).summary).not.toContain("precip");
    expect(parseWeather({ precipitation: 0.2, weather_code: 63 }).summary).toContain("precip 0.2");
  });
});

describe("captureWeatherForProject", () => {
  it("creates a GENERAL daily log with weather when none exists for today", async () => {
    const project = await newProjectWithCoords(38.9, -77.03);
    const spy = mockMeteo(3, 55);
    try {
      const res = await captureWeatherForProject(project.id);
      expect(res.ok).toBe(true);
      expect(res.action).toBe("created");
      expect(res.weather).toContain("Overcast");
      const log = await prisma.dailyLog.findFirst({ where: { projectId: project.id } });
      expect(log?.weather).toContain("Overcast");
      expect(log?.logType).toBe("GENERAL");
    } finally {
      spy.mockRestore();
    }
  });

  it("is idempotent — does not overwrite an existing weather string", async () => {
    const project = await newProjectWithCoords(40.71, -74.0);
    const spy = mockMeteo(0, 80);
    try {
      const first = await captureWeatherForProject(project.id);
      expect(first.action).toBe("created");
      const second = await captureWeatherForProject(project.id);
      expect(second.action).toBe("skipped-has-weather");
      const count = await prisma.dailyLog.count({ where: { projectId: project.id } });
      expect(count).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });

  it("fills weather into an existing same-day log that lacks it", async () => {
    const project = await newProjectWithCoords(34.05, -118.24);
    const today = new Date();
    const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    await prisma.dailyLog.create({
      data: { projectId: project.id, logDate: dayStart, logType: "GENERAL", summary: "Manual log, no weather", manpower: 4 },
    });
    const spy = mockMeteo(61, 60);
    try {
      const res = await captureWeatherForProject(project.id);
      expect(res.action).toBe("updated");
      const log = await prisma.dailyLog.findFirst({ where: { projectId: project.id } });
      expect(log?.weather).toContain("Light rain");
      expect(log?.summary).toBe("Manual log, no weather"); // untouched
    } finally {
      spy.mockRestore();
    }
  });

  it("skips projects with no resolvable coordinates", async () => {
    const tenant = await prisma.tenant.create({
      data: { name: `wx2-${Date.now()}`, slug: `wx2-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, primaryMode: "VERTICAL" },
    });
    const project = await prisma.project.create({
      data: { tenantId: tenant.id, name: "No coords", code: `NC-${Date.now()}`, mode: "VERTICAL" },
    });
    const res = await captureWeatherForProject(project.id);
    expect(res.ok).toBe(true);
    expect(res.action).toBe("no-coords");
    // graceful: a coordinate-less project must not get a phantom log row
    const count = await prisma.dailyLog.count({ where: { projectId: project.id } });
    expect(count).toBe(0);
  });

  it("returns no-weather (and writes nothing) when the upstream fetch fails", async () => {
    const project = await newProjectWithCoords(47.6, -122.33);
    // Non-OK response -> fetchCurrentWeather returns null -> action no-weather.
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("upstream down", { status: 503 }),
    );
    try {
      const res = await captureWeatherForProject(project.id);
      expect(res.ok).toBe(true);
      expect(res.action).toBe("no-weather");
      const count = await prisma.dailyLog.count({ where: { projectId: project.id } });
      expect(count).toBe(0); // no half-written log on a failed pull
    } finally {
      spy.mockRestore();
    }
  });

  it("is idempotent across repeated sweeps — never creates a duplicate same-day log", async () => {
    const project = await newProjectWithCoords(41.88, -87.63);
    const spy = mockMeteo(1, 70);
    try {
      await captureWeatherForProject(project.id); // created
      await captureWeatherForProject(project.id); // skipped-has-weather
      await captureWeatherForProject(project.id); // skipped-has-weather
      const count = await prisma.dailyLog.count({ where: { projectId: project.id } });
      expect(count).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });
});
