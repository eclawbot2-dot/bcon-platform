"use client";

import { useState } from "react";

type RestoreResult = {
  ok: boolean;
  dryRun: boolean;
  tenantId?: string;
  tenantSlug?: string;
  planned: Record<string, number>;
  restored?: Record<string, number>;
  error?: string;
};

/**
 * Super-admin restore-from-backup UI for /admin/tenants/[id].
 * Two-step by design: "Dry run" posts confirm:false and shows the
 * planned row counts without writing; "Restore" is only enabled after
 * a successful dry run and posts confirm:true. Accepts the backup
 * JSON via file picker or paste — the same payload backupTenant writes.
 */
export function RestoreTenantForm({ expectedSlug }: { expectedSlug: string }) {
  const [payload, setPayload] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RestoreResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dryRunOk, setDryRunOk] = useState(false);

  async function post(confirm: boolean) {
    setBusy(true);
    setError(null);
    if (!confirm) setDryRunOk(false);
    try {
      const res = await fetch("/api/admin/restore", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payload, confirm }),
      });
      const json = (await res.json()) as RestoreResult & { error?: string };
      setResult(json);
      if (!res.ok || !json.ok) {
        setError(json.error ?? `Restore endpoint returned ${res.status}`);
        setDryRunOk(false);
      } else if (!confirm) {
        if (json.tenantSlug && json.tenantSlug !== expectedSlug) {
          setError(`This backup belongs to tenant "${json.tenantSlug}", not "${expectedSlug}". Restore it from that tenant's admin page instead.`);
          setDryRunOk(false);
        } else {
          setDryRunOk(true);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setDryRunOk(false);
    } finally {
      setBusy(false);
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setResult(null);
    setDryRunOk(false);
    void f.text().then(setPayload);
  }

  const counts = result ? (result.restored ?? result.planned) : null;

  return (
    <div className="mt-4 grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <input type="file" accept=".json,application/json" onChange={onFile} className="form-input max-w-sm text-xs" aria-label="Backup JSON file" />
        <span className="text-xs text-slate-500">or paste below</span>
      </div>
      <textarea
        value={payload}
        onChange={(e) => { setPayload(e.target.value); setResult(null); setDryRunOk(false); }}
        rows={4}
        placeholder='Backup JSON payload (contents of a file written by "Run backup now")'
        className="form-textarea font-mono text-xs"
      />
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-outline text-xs" disabled={busy || payload.trim().length === 0} onClick={() => void post(false)}>
          {busy ? "Working…" : "Dry run (no writes)"}
        </button>
        <button
          type="button"
          className="btn-danger text-xs"
          disabled={busy || !dryRunOk}
          onClick={() => {
            if (window.confirm(`Restore this backup into "${expectedSlug}"? Existing rows are kept; missing rows are re-inserted.`)) {
              void post(true);
            }
          }}
        >
          Restore for real
        </button>
        {!dryRunOk ? <span className="self-center text-xs text-slate-500">Run a dry run first — restore unlocks after it passes.</span> : null}
      </div>
      {error ? <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">{error}</div> : null}
      {result && result.ok && counts ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-xs uppercase tracking-[0.18em] text-cyan-300">
            {result.dryRun ? "Dry run — planned inserts" : "Restored rows"}
            {result.tenantSlug ? <span className="ml-2 text-slate-400">tenant: {result.tenantSlug}</span> : null}
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-300">
            {Object.entries(counts).filter(([, n]) => n > 0).map(([model, n]) => (
              <span key={model} className="rounded-full bg-white/5 px-2 py-0.5">{model}: {n}</span>
            ))}
            {Object.values(counts).every((n) => n === 0) ? <span className="text-slate-500">nothing to insert — database already contains this graph</span> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
