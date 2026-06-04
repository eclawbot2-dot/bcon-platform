"use client";

import { useState, useTransition } from "react";
import { setAllowExternalEmailLoginsAction } from "./access-control-actions";

export function AccessControlForm({ initial }: { initial: boolean }) {
  const [allow, setAllow] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function onToggle(next: boolean) {
    setAllow(next);
    setSaved(false);
    const fd = new FormData();
    fd.set("allow", next ? "on" : "false");
    startTransition(async () => {
      await setAllowExternalEmailLoginsAction(fd);
      setSaved(true);
    });
  }

  return (
    <div className="mt-4">
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={allow}
          disabled={pending}
          onChange={(e) => onToggle(e.target.checked)}
          className="mt-0.5 h-4 w-4"
        />
        <span>
          <span className="text-white">Allow External Email Logins</span>
          <span className="mt-0.5 block text-xs text-slate-400">
            Off (default): only provisioned accounts — members of this tenant — can sign in;
            everyone else is denied. Platform super-admins are always allowed. Turn on to let
            any provisioned user access this tenant.
          </span>
        </span>
      </label>
      <div className="mt-1 text-xs" aria-live="polite">
        {pending ? <span className="text-slate-500">Saving…</span> : saved ? <span className="text-emerald-400">Saved.</span> : null}
      </div>
    </div>
  );
}
