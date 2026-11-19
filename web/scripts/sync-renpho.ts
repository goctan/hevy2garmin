import { getDb } from "../lib/db";
import { loginRenpho, getRenphoMeasurements } from "../lib/renpho-client";
import type { RenphoConfig, RenphoMeasurement } from "../lib/renpho-types";
import { generateRenphoFit } from "../lib/renpho-fit";
import { uploadRenphoFit } from "../lib/garmin-upload";

const START_DATE = "2026-11-18";
const TIME_ZONE = "Europe/Paris";

function parisDay(timestamp: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(timestamp * 1000));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function latestMeasurementPerDay(measurements: RenphoMeasurement[]): RenphoMeasurement[] {
  const latest = new Map<string, RenphoMeasurement>();
  for (const measurement of [...measurements].sort(
    (a, b) => (a.timeStamp ?? 0) - (b.timeStamp ?? 0),
  )) {
    if (typeof measurement.weight !== "number" || measurement.weight <= 0 ||
        typeof measurement.timeStamp !== "number" || measurement.timeStamp <= 0) continue;
    const day = parisDay(measurement.timeStamp);
    if (day >= START_DATE) latest.set(day, measurement);
  }
  return [...latest.values()].sort((a, b) => (a.timeStamp ?? 0) - (b.timeStamp ?? 0));
}

async function main(): Promise<void> {
  const username = process.env.RENPHO_USERNAME?.trim();
  const password = process.env.RENPHO_PASSWORD;
  const encryptionSecret = process.env.RENPHO_ENCRYPTION_SECRET;
  if (!username || !password || !encryptionSecret) {
    throw new Error("Missing RENPHO_USERNAME, RENPHO_PASSWORD or RENPHO_ENCRYPTION_SECRET GitHub secret.");
  }
  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL &&
      !process.env.STORAGE_URL && !process.env.NEON_DATABASE_URL) {
    throw new Error("Missing DATABASE_URL (or POSTGRES_URL) GitHub secret.");
  }

  const sql = getDb();
  await sql`CREATE TABLE IF NOT EXISTS renpho_synced_measurements (
    measurement_key TEXT PRIMARY KEY,
    renpho_user_id BIGINT NOT NULL,
    renpho_measurement_id BIGINT NOT NULL,
    measured_at TIMESTAMPTZ,
    status TEXT NOT NULL CHECK (status IN ('pending', 'uploaded')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    uploaded_at TIMESTAMPTZ
  )`;

  const config: RenphoConfig = { username, password, encryptionSecret };
  console.log("Connexion à Renpho…");
  const session = await loginRenpho(config);
  const result = await getRenphoMeasurements(config, session);
  const measurements = latestMeasurementPerDay(result.measurements);
  console.log(`${result.measurements.length} mesures reçues ; ${measurements.length} dernière(s) pesée(s) par jour à partir du ${START_DATE}.`);

  let uploaded = 0, skipped = 0, failed = 0;
  for (const measurement of measurements) {
    if (measurement.id === null || measurement.id === undefined) {
      console.error("Mesure sans identifiant : ignorée pour éviter un doublon.");
      failed++;
      continue;
    }
    const key = `${result.userId}:${measurement.id}`;
    const measuredAt = new Date((measurement.timeStamp as number) * 1000);
    const claim = await sql`
      INSERT INTO renpho_synced_measurements
        (measurement_key, renpho_user_id, renpho_measurement_id, measured_at, status)
      VALUES (${key}, ${result.userId}, ${String(measurement.id)}, ${measuredAt}, 'pending')
      ON CONFLICT (measurement_key) DO NOTHING
      RETURNING measurement_key
    `;
    if (claim.length === 0) { skipped++; continue; }

    try {
      await uploadRenphoFit(generateRenphoFit(measurement));
      await sql`UPDATE renpho_synced_measurements
        SET status = 'uploaded', uploaded_at = NOW()
        WHERE measurement_key = ${key}`;
      uploaded++;
      console.log(`Envoyé à Garmin : ${measuredAt.toISOString()}`);
    } catch (error) {
      failed++;
      console.error(`Échec d'envoi pour ${measuredAt.toISOString()}:`, error);
    }
  }

  console.log(`Renpho terminé — envoyées : ${uploaded}, déjà traitées : ${skipped}, échecs : ${failed}.`);
  if (failed > 0) throw new Error(`${failed} mesure(s) Renpho n'ont pas été envoyées.`);
}

main().catch((error: unknown) => {
  console.error("Échec de la synchronisation Renpho :", error);
  process.exitCode = 1;
});
