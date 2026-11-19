import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { verifySession, SESSION_COOKIE, authEnabled } from "@/lib/auth";
import { loginRenpho, getRenphoMeasurements } from "@/lib/renpho-client";
import type { RenphoConfig, RenphoMeasurement } from "@/lib/renpho-types";
import { generateRenphoFit } from "@/lib/renpho-fit";
import { uploadRenphoFit } from "@/lib/garmin-upload";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const START_DATE = "2026-11-18";
const TIME_ZONE = "Europe/Paris";

async function isAuthorized(): Promise<boolean> {
  if (!authEnabled()) return true;
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value ?? null);
}

function measurementKey(userId: string, measurement: RenphoMeasurement): string {
  if (measurement.id === null || measurement.id === undefined) {
    throw new Error("Renpho returned a measurement without an ID; refusing an unsafe upload.");
  }
  return `${userId}:${measurement.id}`;
}

function parisDay(timestamp: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(timestamp * 1000));
  const part = (type: string) => parts.find(p => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function latestMeasurementPerDay(measurements: RenphoMeasurement[]): RenphoMeasurement[] {
  const latestByDay = new Map<string, RenphoMeasurement>();
  for (const measurement of [...measurements].sort((a, b) => (a.timeStamp ?? 0) - (b.timeStamp ?? 0))) {
    if (typeof measurement.weight !== "number" || measurement.weight <= 0 ||
        typeof measurement.timeStamp !== "number" || measurement.timeStamp <= 0) continue;
    const day = parisDay(measurement.timeStamp);
    if (day < START_DATE) continue;
    latestByDay.set(day, measurement);
  }
  return [...latestByDay.values()].sort((a, b) => (a.timeStamp ?? 0) - (b.timeStamp ?? 0));
}

function previewMeasurement(m: RenphoMeasurement) {
  return {
    date: new Date((m.timeStamp as number) * 1000).toISOString(),
    weight: m.weight,
    weightUnit: m.weightUnit ?? 1,
    bodyFatPercent: m.bodyfat ?? null,
    waterPercent: m.water ?? null,
    musclePercent: m.muscle ?? null,
    boneMassKg: m.bone ?? null,
    visceralFat: m.visfat ?? null,
    metabolicAge: m.bodyage ?? null,
    basalMetabolismKcal: m.bmr ?? null,
    bmi: m.bmi ?? null,
    heartRateBpm: m.heartRate ?? null,
    proteinPercent: m.protein ?? null,
    fatFreeMassKg: m.fatFreeWeight ?? null,
  };
}

export async function POST(request: Request) {
  if (!(await isAuthorized())) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let body: { username?: unknown; password?: unknown; live?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }

  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const live = body.live === true;
  if (!username || !password) return NextResponse.json({ error: "Renpho username and password are required." }, { status: 400 });

  const encryptionSecret = process.env.RENPHO_ENCRYPTION_SECRET;
  if (!encryptionSecret) return NextResponse.json({ error: "RENPHO_ENCRYPTION_SECRET is not configured on the server." }, { status: 503 });

  let sql: ReturnType<typeof getDb>;
  try {
    sql = getDb();
    await sql`CREATE TABLE IF NOT EXISTS renpho_synced_measurements (measurement_key TEXT PRIMARY KEY, renpho_user_id BIGINT NOT NULL, renpho_measurement_id BIGINT NOT NULL, measured_at TIMESTAMPTZ, status TEXT NOT NULL CHECK (status IN ('pending', 'uploaded')), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), uploaded_at TIMESTAMPTZ)`;
  } catch (err) {
    return NextResponse.json({ error: `Database unavailable: ${err instanceof Error ? err.message : String(err)}` }, { status: 503 });
  }

  try {
    const config: RenphoConfig = { username, password, encryptionSecret };
    const session = await loginRenpho(config);
    const result = await getRenphoMeasurements(config, session);
    const measurements = latestMeasurementPerDay(result.measurements);

    if (!live) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        found: result.measurements.length,
        valid: measurements.length,
        startDate: START_DATE,
        oldestDate: measurements.length ? new Date((measurements[0].timeStamp as number) * 1000).toISOString() : null,
        newestDate: measurements.length ? new Date((measurements[measurements.length - 1].timeStamp as number) * 1000).toISOString() : null,
        preview: measurements.slice(-10).reverse().map(previewMeasurement),
        message: `Une seule mesure par jour (la dernière), à partir du ${START_DATE}. Aucun envoi effectué.`,
      });
    }

    let uploaded = 0, skipped = 0, failed = 0;
    for (const measurement of measurements) {
      let key: string;
      try { key = measurementKey(result.userId, measurement); }
      catch { failed++; continue; }

      const claim = await sql`INSERT INTO renpho_synced_measurements (measurement_key, renpho_user_id, renpho_measurement_id, measured_at, status) VALUES (${key}, ${result.userId}, ${String(measurement.id)}, ${new Date((measurement.timeStamp ?? 0) * 1000)}, 'pending') ON CONFLICT (measurement_key) DO NOTHING RETURNING measurement_key`;
      if (claim.length === 0) { skipped++; continue; }

      try {
        const fit = generateRenphoFit(measurement);
        await uploadRenphoFit(fit);
        await sql`UPDATE renpho_synced_measurements SET status='uploaded', uploaded_at=NOW() WHERE measurement_key=${key}`;
        uploaded++;
      } catch (err) {
        failed++;
        console.error("Renpho measurement upload failed:", key, err);
      }
    }
    return NextResponse.json({
      ok: failed === 0, dryRun: false, found: result.measurements.length,
      valid: measurements.length, uploaded, skipped, failed, startDate: START_DATE,
      note: "Une seule mesure par jour (la dernière), à partir du 18 novembre 2026.",
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
