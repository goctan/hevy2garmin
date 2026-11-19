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
async function isAuthorized(): Promise<boolean> { if (!authEnabled()) return true; const store = await cookies(); return verifySession(store.get(SESSION_COOKIE)?.value ?? null); }
function measurementKey(userId: string, measurement: RenphoMeasurement): string { if (measurement.id === null || measurement.id === undefined) throw new Error("Renpho returned a measurement without an ID; refusing an unsafe upload."); return `${userId}:${measurement.id}`; }
export async function POST(request: Request) {
 if (!(await isAuthorized())) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
 let body: { username?: unknown; password?: unknown; live?: unknown };
 try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }
 const username = typeof body.username === "string" ? body.username.trim() : ""; const password = typeof body.password === "string" ? body.password : ""; const live = body.live === true;
 if (!username || !password) return NextResponse.json({ error: "Renpho username and password are required." }, { status: 400 });
 const encryptionSecret = process.env.RENPHO_ENCRYPTION_SECRET; if (!encryptionSecret) return NextResponse.json({ error: "RENPHO_ENCRYPTION_SECRET is not configured on the server." }, { status: 503 });
 let sql: ReturnType<typeof getDb>;
 try { sql = getDb(); await sql`CREATE TABLE IF NOT EXISTS renpho_synced_measurements (measurement_key TEXT PRIMARY KEY, renpho_user_id BIGINT NOT NULL, renpho_measurement_id BIGINT NOT NULL, measured_at TIMESTAMPTZ, status TEXT NOT NULL CHECK (status IN ('pending', 'uploaded')), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), uploaded_at TIMESTAMPTZ)`; } catch (err) { return NextResponse.json({ error: `Database unavailable: ${err instanceof Error ? err.message : String(err)}` }, { status: 503 }); }
 try { const config: RenphoConfig = { username, password, encryptionSecret }; const session = await loginRenpho(config); const result = await getRenphoMeasurements(config, session); const measurements = result.measurements.filter(m => typeof m.weight === "number" && m.weight > 0 && typeof m.timeStamp === "number").sort((a,b)=>(a.timeStamp??0)-(b.timeStamp??0));
 if (!live) return NextResponse.json({ ok: true, dryRun: true, found: result.measurements.length, valid: measurements.length, userId: result.userId, message: "Aucun envoi effectué. Relancez avec live=true pour importer les mesures." });
 let uploaded=0, skipped=0, failed=0;
 for (const measurement of measurements) { let key: string; try { key=measurementKey(result.userId,measurement); } catch { failed++; continue; }
 const claim=await sql`INSERT INTO renpho_synced_measurements (measurement_key, renpho_user_id, renpho_measurement_id, measured_at, status) VALUES (${key}, ${result.userId}, ${String(measurement.id)}, ${new Date((measurement.timeStamp??0)*1000)}, 'pending') ON CONFLICT (measurement_key) DO NOTHING RETURNING measurement_key`;
 if (claim.length===0) { skipped++; continue; }
 try { const fit=generateRenphoFit(measurement); await uploadRenphoFit(fit); await sql`UPDATE renpho_synced_measurements SET status='uploaded', uploaded_at=NOW() WHERE measurement_key=${key}`; uploaded++; } catch(err) { failed++; console.error("Renpho measurement upload failed:",key,err); }
 }
 return NextResponse.json({ ok: failed===0, dryRun:false, found:result.measurements.length, valid:measurements.length, uploaded, skipped, failed, note:"Les entrées pending ne sont jamais renvoyées automatiquement afin d'éviter les doublons Garmin." });
 } catch(err) { return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status:502 }); }
}
