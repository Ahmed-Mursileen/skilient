import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Folders allowed to use the service-role client (CLAUDE.md "Never"; PRD 7, 10):
 * jobs, webhooks and the billing worker only. Pages and server actions acting
 * for a user must use the session client so RLS applies.
 */
export const SERVICE_ROLE_ALLOWED = [
  "lib/supabase/service.ts",
  "lib/jobs/**",
  "lib/billing/**",
  "app/api/webhooks/**",
  "app/api/github/webhook/**",
  "app/api/jobs/**",
];

const serviceRoleImport = {
  group: ["@/lib/supabase/service", "**/lib/supabase/service", "**/supabase/service"],
  message: "The service-role client is only allowed in jobs, webhooks and the billing worker (see eslint.config.mjs).",
};

const serviceRoleEnvSelectors = [
  {
    selector: "MemberExpression[property.name='SUPABASE_SERVICE_ROLE_KEY']",
    message: "SUPABASE_SERVICE_ROLE_KEY may only be read in lib/supabase/service.ts.",
  },
  {
    selector: "MemberExpression[property.value='SUPABASE_SERVICE_ROLE_KEY']",
    message: "SUPABASE_SERVICE_ROLE_KEY may only be read in lib/supabase/service.ts.",
  },
];

const getSessionSelectors = [
  {
    selector: "CallExpression[callee.property.name='getSession']",
    message: "Don't use getSession(): it isn't verified. Use supabase.auth.getUser() (or getClaims() in proxy.ts).",
  },
];

const rawSupabaseRestSelectors = [
  {
    selector: "CallExpression[callee.name='fetch'] TemplateElement[value.raw=/\\/rest\\/v1/]",
    message: "No raw fetch to Supabase REST; use the Supabase client so RLS and auth apply.",
  },
  {
    selector: "CallExpression[callee.name='fetch'] Literal[value=/\\/rest\\/v1/]",
    message: "No raw fetch to Supabase REST; use the Supabase client so RLS and auth apply.",
  },
];

// Decisions 2026-09-28: auth cookies stay browser-readable (@supabase/ssr), so XSS defences
// are mandatory. Never render raw HTML: no dangerouslySetInnerHTML, innerHTML or outerHTML.
const rawHtmlSelectors = [
  {
    selector: "AssignmentExpression > MemberExpression.left[property.name=/^(innerHTML|outerHTML)$/]",
    message: "Never render raw HTML (XSS). Build elements, or escape text.",
  },
  {
    selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
    message: "Never render raw HTML (XSS). Build elements, or escape text.",
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
    "types/database.ts",
    "supabase/functions/**",
    // Vendored agent skills (third-party); not app code.
    ".claude/**",
  ]),
  {
    files: ["**/*.{ts,tsx,js,mjs}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [serviceRoleImport] }],
      "no-restricted-syntax": ["error", ...serviceRoleEnvSelectors, ...getSessionSelectors, ...rawSupabaseRestSelectors, ...rawHtmlSelectors],
      "react/no-danger": "error",
    },
  },
  {
    files: SERVICE_ROLE_ALLOWED,
    rules: {
      "no-restricted-imports": "off",
      // They import the client; only service.ts itself reads the key.
      "no-restricted-syntax": ["error", ...serviceRoleEnvSelectors, ...getSessionSelectors, ...rawSupabaseRestSelectors, ...rawHtmlSelectors],
    },
  },
  {
    files: ["lib/supabase/service.ts"],
    rules: { "no-restricted-syntax": ["error", ...getSessionSelectors, ...rawSupabaseRestSelectors, ...rawHtmlSelectors] },
  },
]);

export default eslintConfig;
