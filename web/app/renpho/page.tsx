"use client";

import { useState } from "react";

type DryRunResult = {
  ok?: boolean;
  dryRun?: boolean;
  found?: number;
  valid?: number;
  message?: string;
  error?: string;
};

export default function RenphoPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DryRunResult | null>(null);

  async function runDryRun(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/renpho-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ username, password, live: false }),
      });

      const data = (await response.json()) as DryRunResult;
      if (!response.ok) {
        setResult({ error: data.error ?? `Erreur HTTP ${response.status}` });
      } else {
        setResult(data);
      }
    } catch (error) {
      setResult({
        error: error instanceof Error ? error.message : "Erreur réseau.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-8 md:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-text">Renpho → Garmin</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Test de connexion et lecture des mesures Renpho. Aucun envoi vers Garmin
          ne sera effectué.
        </p>
      </header>

      <form
        onSubmit={runDryRun}
        className="space-y-4 rounded-xl border border-border bg-surface-elevated p-5"
      >
        <div>
          <label htmlFor="renpho-username" className="mb-1 block text-sm font-medium text-text">
            Identifiant Renpho
          </label>
          <input
            id="renpho-username"
            type="text"
            autoComplete="username"
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-text"
          />
        </div>

        <div>
          <label htmlFor="renpho-password" className="mb-1 block text-sm font-medium text-text">
            Mot de passe Renpho
          </label>
          <input
            id="renpho-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-text"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-base disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Test en cours…" : "Tester Renpho (sans synchroniser)"}
        </button>
      </form>

      {result && (
        <section
          aria-live="polite"
          className={`mt-5 rounded-xl border p-4 ${
            result.error
              ? "border-danger/40 bg-danger/10"
              : "border-success/40 bg-success/10"
          }`}
        >
          {result.error ? (
            <p className="text-sm text-danger">{result.error}</p>
          ) : (
            <>
              <h2 className="text-sm font-semibold text-text">
                Connexion Renpho réussie
              </h2>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-text-muted">Mesures récupérées</dt>
                  <dd className="text-xl font-bold text-text">{result.found ?? 0}</dd>
                </div>
                <div>
                  <dt className="text-text-muted">Mesures valides</dt>
                  <dd className="text-xl font-bold text-text">{result.valid ?? 0}</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-text-secondary">
                {result.message ?? "Mode test : aucune donnée envoyée à Garmin."}
              </p>
            </>
          )}
        </section>
      )}
    </main>
  );
}
