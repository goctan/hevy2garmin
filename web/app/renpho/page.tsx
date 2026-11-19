"use client";

import { useState } from "react";

type PreviewMeasurement = {
  date: string; weight: number; weightUnit: number;
  bodyFatPercent: number | null; waterPercent: number | null; musclePercent: number | null;
  boneMassKg: number | null; visceralFat: number | null; metabolicAge: number | null;
  basalMetabolismKcal: number | null; bmi: number | null; heartRateBpm: number | null;
  proteinPercent: number | null; fatFreeMassKg: number | null;
  rawComposition?: Record<string, unknown>; receivedKeys?: string[];
};
type DryRunResult = {
  ok?: boolean; dryRun?: boolean; found?: number; valid?: number;
  oldestDate?: string | null; newestDate?: string | null; preview?: PreviewMeasurement[];
  message?: string; error?: string;
};
function formatDate(value?: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
function toKg(weight: number, unit: number): number {
  if (unit === 2) return weight / 2.2046;
  if (unit === 3 || unit === 4) return weight / 0.15747;
  return weight;
}
function metric(value: number | null, unit: string, digits = 2): string {
  return value === null || !Number.isFinite(value) ? "Non fourni par Renpho" : `${value.toFixed(digits)} ${unit}`;
}
export default function RenphoPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DryRunResult | null>(null);
  async function runDryRun(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setResult(null);
    try {
      const response = await fetch("/api/renpho-sync", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "same-origin", body: JSON.stringify({ username, password, live: false }),
      });
      const data = (await response.json()) as DryRunResult;
      setResult(response.ok ? data : { error: data.error ?? `Erreur HTTP ${response.status}` });
    } catch (error) {
      setResult({ error: error instanceof Error ? error.message : "Erreur réseau." });
    } finally { setLoading(false); }
  }
  return (
    <main className="mx-auto max-w-xl px-4 py-8 md:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-text">Renpho → Garmin</h1>
        <p className="mt-2 text-sm text-text-secondary">Vérification de l&apos;historique et de la composition corporelle. Aucun envoi vers Garmin.</p>
      </header>
      <form onSubmit={runDryRun} className="space-y-4 rounded-xl border border-border bg-surface-elevated p-5">
        <div><label htmlFor="renpho-username" className="mb-1 block text-sm font-medium text-text">Identifiant Renpho</label>
          <input id="renpho-username" type="text" autoComplete="username" required value={username} onChange={event => setUsername(event.target.value)} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-text" /></div>
        <div><label htmlFor="renpho-password" className="mb-1 block text-sm font-medium text-text">Mot de passe Renpho</label>
          <input id="renpho-password" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-text" /></div>
        <button type="submit" disabled={loading} className="w-full rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-base disabled:cursor-not-allowed disabled:opacity-60">{loading ? "Vérification…" : "Vérifier les mesures (sans synchroniser)"}</button>
      </form>
      {result && <section aria-live="polite" className={`mt-5 rounded-xl border p-4 ${result.error ? "border-danger/40 bg-danger/10" : "border-success/40 bg-success/10"}`}>
        {result.error ? <p className="text-sm text-danger">{result.error}</p> : <>
          <h2 className="text-sm font-semibold text-text">Connexion Renpho réussie</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-text-muted">Mesures récupérées</dt><dd className="text-xl font-bold text-text">{result.found ?? 0}</dd></div>
            <div><dt className="text-text-muted">Mesures retenues</dt><dd className="text-xl font-bold text-text">{result.valid ?? 0}</dd></div>
          </dl>
          <div className="mt-4 space-y-1 text-sm text-text"><p>Première mesure : <strong>{formatDate(result.oldestDate)}</strong></p><p>Dernière mesure : <strong>{formatDate(result.newestDate)}</strong></p></div>
          {result.preview?.map((m, i) => <div key={`${m.date}-${i}`} className="mt-4 rounded-lg border border-border p-3">
            <h3 className="font-semibold text-text">{formatDate(m.date)}</h3>
            <p className="mt-2 text-lg font-bold text-text">{metric(toKg(m.weight, m.weightUnit), "kg")}</p>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <div><dt className="text-text-muted">Graisse corporelle</dt><dd className="text-text">{metric(m.bodyFatPercent, "%")}</dd></div>
              <div><dt className="text-text-muted">Eau</dt><dd className="text-text">{metric(m.waterPercent, "%")}</dd></div>
              <div><dt className="text-text-muted">Muscle Renpho</dt><dd className="text-text">{metric(m.musclePercent, "%")}</dd></div>
              <div><dt className="text-text-muted">Masse osseuse</dt><dd className="text-text">{metric(m.boneMassKg, "kg")}</dd></div>
              <div><dt className="text-text-muted">Graisse viscérale</dt><dd className="text-text">{m.visceralFat ?? "Non fourni par Renpho"}</dd></div>
              <div><dt className="text-text-muted">Âge métabolique</dt><dd className="text-text">{m.metabolicAge ?? "Non fourni par Renpho"}</dd></div>
              <div><dt className="text-text-muted">Métabolisme basal</dt><dd className="text-text">{metric(m.basalMetabolismKcal, "kcal", 0)}</dd></div>
              <div><dt className="text-text-muted">IMC</dt><dd className="text-text">{metric(m.bmi, "", 1)}</dd></div>
              <div><dt className="text-text-muted">Fréquence cardiaque</dt><dd className="text-text">{metric(m.heartRateBpm, "bpm", 0)}</dd></div>
              <div><dt className="text-text-muted">Protéines</dt><dd className="text-text">{metric(m.proteinPercent, "%")}</dd></div>
              <div><dt className="text-text-muted">Masse maigre</dt><dd className="text-text">{metric(m.fatFreeMassKg, "kg")}</dd></div>
            </dl>
            <details className="mt-4 text-xs text-text-secondary"><summary className="cursor-pointer font-semibold">Diagnostic Renpho — valeurs réellement reçues</summary>
              <p className="mt-2">Champs présents : {(m.receivedKeys ?? []).join(", ") || "aucun"}</p>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-surface p-2">{JSON.stringify(m.rawComposition ?? {}, null, 2)}</pre>
            </details>
          </div>)}
          <p className="mt-3 text-xs text-text-secondary">{result.message ?? "Mode test : aucune donnée envoyée à Garmin."}</p>
        </>}
      </section>}
    </main>
  );
}
