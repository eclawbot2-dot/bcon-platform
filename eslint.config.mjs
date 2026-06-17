import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored reference material — not part of the app, do not lint.
    "reference_scan/**",
  ]),
  {
    // The React-Compiler lint rules bundled by eslint-config-next 16 do not
    // understand React Server Components and fire false positives on perfectly
    // valid App Router code:
    //   - `react-hooks/purity`: flags `Date.now()` / `new Date()` evaluated in
    //     an async *server* component's body (every error today is exactly
    //     this — server-side date-window math, which is correct and idempotent
    //     per request).
    //   - `react-hooks/set-state-in-effect`: flags the SSR-safe hydration
    //     pattern (read localStorage / media query in an effect, then setState)
    //     and close-on-route-change — both are documented, accepted patterns
    //     that cannot be expressed via a lazy useState initializer because the
    //     browser API is unavailable during server render.
    //   - `react-hooks/preserve-manual-memoization`: flags a hand-written
    //     `useMemo` whose dependency is an inline-derived value the compiler
    //     cannot track (e.g. `eff = ready ? custom : default` in the sidebar
    //     nav). The memo is correct; the compiler just declines to preserve
    //     it — not a real bug.
    // Keep them as warnings (still visible) rather than build-blocking errors.
    rules: {
      "react-hooks/purity": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
  {
    // Test files are plain Node + Vitest, not React. The DB-isolation helper
    // `useTempDevDb()` is named use* but is not a React hook, so the
    // rules-of-hooks check is a false positive here. A `require()` in a test
    // is also fine.
    files: ["tests/**"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
      "@typescript-eslint/no-require-imports": "off",
    },
  },
]);

export default eslintConfig;
