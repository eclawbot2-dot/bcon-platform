"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Tag-style input that turns comma-or-newline-separated text into
 * removable pills. The serialized value (one item per line) goes into
 * a hidden form field of the given `name` so server actions read it
 * exactly like a textarea.
 *
 * Usage:
 *   <ChipInput name="targetNaics" defaultValue="236220, 237310"
 *              placeholder="Add NAICS code…" />
 *
 * Accepts: typing + Enter / comma / Tab to commit a chip; Backspace
 * on empty input removes the last chip; paste from Excel splits on
 * newlines, tabs, and commas.
 */
export function ChipInput({
  name,
  defaultValue = "",
  placeholder = "Add and press Enter…",
  className = "",
  suggestKind,
}: {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  className?: string;
  /**
   * When set, the draft text is debounced against /api/ai/suggest
   * (kind=naics|costCode) and matches render as clickable suggestions
   * under the input. Click to commit the suggested code as a chip.
   */
  suggestKind?: "naics" | "costCode";
}) {
  const [chips, setChips] = useState<string[]>(() => parseSeed(defaultValue));
  const [draft, setDraft] = useState("");
  const [suggestions, setSuggestions] = useState<Array<{ code: string; label: string }>>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (hiddenRef.current) hiddenRef.current.value = chips.join("\n");
  }, [chips]);

  useEffect(() => {
    if (!suggestKind) return;
    const q = draft.trim();
    if (q.length < 3) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/ai/suggest?kind=${suggestKind}&input=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : { suggestions: [] }))
        .then((json: { suggestions?: Array<{ code: string; label: string }> }) => {
          setSuggestions((json.suggestions ?? []).slice(0, 5));
        })
        .catch(() => setSuggestions([]));
    }, 250);
    return () => clearTimeout(t);
  }, [draft, suggestKind]);

  function commit(raw: string) {
    const items = raw
      .split(/[,\n\t]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (items.length === 0) return;
    setChips((prev) => Array.from(new Set([...prev, ...items])));
    setDraft("");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
      if (draft.trim()) {
        e.preventDefault();
        commit(draft);
      }
    } else if (e.key === "Backspace" && draft === "" && chips.length > 0) {
      e.preventDefault();
      setChips((prev) => prev.slice(0, -1));
    }
  }

  function onPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text");
    if (/[,\n\t]/.test(text)) {
      e.preventDefault();
      commit(text);
    }
  }

  function remove(idx: number) {
    setChips((prev) => prev.filter((_, i) => i !== idx));
    inputRef.current?.focus();
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-1.5 rounded-lg border border-white/10 bg-slate-900 p-2 transition focus-within:border-cyan-500 ${className}`}
      onClick={() => inputRef.current?.focus()}
    >
      {chips.map((c, i) => (
        <span key={`${c}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-cyan-500/15 px-2 py-0.5 text-xs text-cyan-100">
          {c}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); remove(i); }}
            aria-label={`Remove ${c}`}
            className="text-cyan-300 hover:text-white"
          >
            ×
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onBlur={() => draft.trim() && commit(draft)}
        placeholder={chips.length === 0 ? placeholder : ""}
        className="min-w-[8rem] flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
      />
      <input ref={hiddenRef} type="hidden" name={name} defaultValue={chips.join("\n")} />
      {suggestKind && suggestions.length > 0 ? (
        <div className="w-full pt-1.5" role="listbox" aria-label="Suggestions">
          {suggestions.map((s) => (
            <button
              key={s.code}
              type="button"
              role="option"
              aria-selected={false}
              onClick={(e) => {
                e.stopPropagation();
                setChips((prev) => Array.from(new Set([...prev, s.code])));
                setDraft("");
                setSuggestions([]);
                inputRef.current?.focus();
              }}
              className="mb-1 mr-1 inline-flex items-center gap-1 rounded-full border border-cyan-500/30 bg-slate-800 px-2 py-0.5 text-xs text-slate-300 hover:border-cyan-400 hover:text-white"
            >
              <span className="font-mono text-cyan-300">{s.code}</span>
              <span>{s.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function parseSeed(raw: string): string[] {
  return raw
    .split(/[,\n\t]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
