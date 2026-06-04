/**
 * Weather auto-capture for daily logs.
 *
 * Field daily logs need a weather record for every working day — it's
 * contemporaneous evidence for weather-delay change orders and a standard
 * line on the superintendent's report. Capturing it by hand is exactly the
 * kind of chore that gets skipped, so this module pulls current conditions
 * from a free, key-less API (Open-Meteo) keyed on each project's
 * coordinates and writes them into that project's daily log for the day.
 *
 * Coordinate resolution (first hit wins):
 *   1. project.configurationJson.{latitude,longitude} or {lat,lng}
 *   2. the most recent DailyLog row that has latitude+longitude
 * Projects with no resolvable coordinates are skipped (not an error).
 *
 * Idempotent: for a given (project, day) it upserts a single GENERAL log.
 * If a human already created today's log, we only fill in a missing
 * `weather` string — we never overwrite a superintendent's own entry.
 */

import { prisma } from "@/lib/prisma";
import { reportErrorNoWait } from "@/lib/report-error";

// WMO weather-code → short label (Open-Meteo current.weather_code).
const WMO: Record<number, string> = {
  0: "Clear",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  56: "Freezing drizzle",
  57: "Freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Rain showers",
  81: "Rain showers",
  82: "Violent rain showers",
  85: "Snow showers",
  86: "Snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm w/ hail",
  99: "Thunderstorm w/ hail",
};

export type ResolvedCoords = { latitude: number; longitude: number; source: string };

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function coordsFromConfig(configurationJson: string | null | undefined): ResolvedCoords | null {
  if (!configurationJson) return null;
  let cfg: Record<string, unknown>;
  try {
    cfg = JSON.parse(configurationJson) as Record<string, unknown>;
  } catch {
    return null;
  }
  const lat = num(cfg.latitude) ?? num(cfg.lat);
  const lng = num(cfg.longitude) ?? num(cfg.lng);
  if (lat != null && lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    return { latitude: lat, longitude: lng, source: "config" };
  }
  return null;
}

/** Resolve a project's coordinates from config or its latest geotagged log. */
export async function resolveProjectCoords(projectId: string): Promise<ResolvedCoords | null> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { configurationJson: true } });
  const fromCfg = coordsFromConfig(project?.configurationJson);
  if (fromCfg) return fromCfg;

  const log = await prisma.dailyLog.findFirst({
    where: { projectId, latitude: { not: null }, longitude: { not: null } },
    orderBy: { logDate: "desc" },
    select: { latitude: true, longitude: true },
  });
  if (log?.latitude != null && log?.longitude != null) {
    return { latitude: log.latitude, longitude: log.longitude, source: "daily-log" };
  }
  return null;
}

export type WeatherReading = {
  summary: string;
  temperatureF: number | null;
  precipitation: number | null;
  windMph: number | null;
  code: number | null;
};

/**
 * Fetch current conditions from Open-Meteo (free, no API key). Returns null
 * on any network/parse failure so the caller can skip the project rather
 * than abort the whole sweep.
 */
export async function fetchCurrentWeather(lat: number, lng: number, fetchImpl: typeof fetch = fetch): Promise<WeatherReading | null> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,precipitation,wind_speed_10m,weather_code` +
    `&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetchImpl(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = (await res.json()) as { current?: Record<string, unknown> };
    const cur = json.current ?? {};
    return parseWeather(cur);
  } catch {
    return null;
  }
}

/** Pure parser over an Open-Meteo `current` object → reading. Exported for tests. */
export function parseWeather(cur: Record<string, unknown>): WeatherReading {
  const temperatureF = num(cur.temperature_2m);
  const precipitation = num(cur.precipitation);
  const windMph = num(cur.wind_speed_10m);
  const code = num(cur.weather_code);
  const label = code != null ? WMO[code] ?? "Unknown" : "Unknown";
  const parts = [label];
  if (temperatureF != null) parts.push(`${Math.round(temperatureF)}°F`);
  if (windMph != null) parts.push(`wind ${Math.round(windMph)} mph`);
  if (precipitation != null && precipitation > 0) parts.push(`precip ${precipitation}"`);
  return { summary: parts.join(", "), temperatureF, precipitation, windMph, code };
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export type WeatherCaptureResult = {
  projectId: string;
  ok: boolean;
  action?: "created" | "updated" | "skipped-has-weather" | "no-coords" | "no-weather";
  weather?: string;
  error?: string;
};

/**
 * Capture today's weather into one project's daily log. Idempotent per
 * (project, day):
 *   - no resolvable coords → skip
 *   - existing GENERAL log for today with weather already set → leave it
 *   - existing today log without weather → fill weather in
 *   - no today log → create a GENERAL "Auto weather capture" log
 */
export async function captureWeatherForProject(projectId: string, now: Date = new Date()): Promise<WeatherCaptureResult> {
  try {
    const coords = await resolveProjectCoords(projectId);
    if (!coords) return { projectId, ok: true, action: "no-coords" };

    const reading = await fetchCurrentWeather(coords.latitude, coords.longitude);
    if (!reading) return { projectId, ok: true, action: "no-weather" };

    const dayStart = startOfDay(now);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const existing = await prisma.dailyLog.findFirst({
      where: { projectId, logDate: { gte: dayStart, lt: dayEnd } },
      orderBy: { createdAt: "asc" },
    });

    if (existing) {
      if (existing.weather && existing.weather.trim().length > 0) {
        return { projectId, ok: true, action: "skipped-has-weather", weather: existing.weather };
      }
      await prisma.dailyLog.update({ where: { id: existing.id }, data: { weather: reading.summary } });
      return { projectId, ok: true, action: "updated", weather: reading.summary };
    }

    await prisma.dailyLog.create({
      data: {
        projectId,
        logDate: dayStart,
        logType: "GENERAL",
        weather: reading.summary,
        summary: `Automated weather capture (${coords.source}): ${reading.summary}.`,
        manpower: 0,
        latitude: coords.latitude,
        longitude: coords.longitude,
      },
    });
    return { projectId, ok: true, action: "created", weather: reading.summary };
  } catch (err) {
    reportErrorNoWait({ scope: "weather.captureWeatherForProject", error: err, context: { projectId } });
    return { projectId, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Sweep every active project (optionally tenant-scoped). Skips projects
 * with no coordinates. Returns one result per project attempted.
 */
export async function captureWeatherAll(opts?: { tenantId?: string }): Promise<WeatherCaptureResult[]> {
  const projects = await prisma.project.findMany({
    where: {
      ...(opts?.tenantId ? { tenantId: opts.tenantId } : {}),
      // Warranty-phase projects have no daily field activity to weather-log.
      stage: { not: "WARRANTY" },
    },
    select: { id: true },
  });
  const results: WeatherCaptureResult[] = [];
  for (const p of projects) {
    results.push(await captureWeatherForProject(p.id));
  }
  return results;
}
