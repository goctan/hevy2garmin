/**
 * Garmin client + upload wrappers.
 *
 * The authenticated client and DI token storage are the same ones used by the
 * Hevy2Garmin workout sync. Renpho does not create a second Garmin login.
 */
import { uploadFit as uploadFitToGarmin } from "hevy2garmin";
import { getDb } from "./db";
import { GarminAuth, DBTokenStore, type GarminClient } from "garmin-auth";
import { resolveDatabaseUrl } from "./database-url";

/** The DI tokens live in platform_credentials at this platform key. */
export const GARMIN_TOKEN_PLATFORM = "garmin_tokens";

let cachedClient: GarminClient | null = null;
let normalized = false;

/**
 * Self-heal old flat DI token rows. Newer garmin-auth versions store the
 * payload nested under `garmin_tokens`; older Python logins wrote it flat.
 */
export async function normalizeGarminTokenRow(
  sql: ReturnType<typeof getDb>,
): Promise<void> {
  if (normalized) return;
  try {
    await sql`
      UPDATE platform_credentials
         SET credentials = jsonb_build_object('garmin_tokens', credentials),
             auth_type = 'oauth',
             status = 'active'
       WHERE platform = ${GARMIN_TOKEN_PLATFORM}
         AND credentials ? 'di_token'
         AND NOT (credentials ? 'garmin_tokens')`;
    normalized = true;
  } catch {
    // Best effort; DBTokenStore reports the real problem if any.
  }
}

/**
 * Build (and cache) an authenticated GarminClient from the DI tokens stored in
 * Postgres. Authentication only: this function does not upload an activity.
 */
export async function getGarminClient(
  databaseUrl?: string,
): Promise<GarminClient> {
  if (cachedClient) return cachedClient;

  const url = databaseUrl ?? resolveDatabaseUrl();
  if (!url) {
    throw new Error("DATABASE_URL not set (cannot load Garmin tokens)");
  }

  try {
    await normalizeGarminTokenRow(getDb());
  } catch {
    // DBTokenStore reports the real problem if the DB handle is unavailable.
  }

  const store = new DBTokenStore(url, GARMIN_TOKEN_PLATFORM);
  const auth = new GarminAuth({ store });
  cachedClient = await auth.client();
  return cachedClient;
}

/**
 * Upload a Renpho Weight Scale FIT file using the same Garmin client and
 * upload implementation as Hevy2Garmin. This deliberately does not use the
 * workout deduplication engine: a weight measurement is not a workout.
 */
export async function uploadRenphoFit(fit: Uint8Array): Promise<void> {
  const client = await getGarminClient();
  await uploadFitToGarmin(client, fit);
}

/** Reset the cached client (tests / after a token rotation). */
export function resetGarminClient(): void {
  cachedClient = null;
}
