// Root flat config for the Next.js app.
// The lint hook runs this on every edited file; layer-specific rules are scoped with `files`.
// devDependencies: eslint, @eslint/js, typescript-eslint, @next/eslint-plugin-next, eslint-plugin-react-hooks, eslint-plugin-react,
// eslint-plugin-better-tailwindcss, eslint-plugin-boundaries, eslint-import-resolver-typescript.
// @next/eslint-plugin-next is used directly instead of eslint-config-next, which registers its own react, react-hooks and
// typescript-eslint plugins and would collide with the stricter ones configured here (the route the Next.js docs give for this case).
// eslint-plugin-react 7.37 declares ESLint <=9 as its peer; its rules used here work on ESLint 10 (Yarn warns, npm needs --legacy-peer-deps).
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import react from "eslint-plugin-react";
import tailwind from "eslint-plugin-better-tailwindcss";
import boundaries from "eslint-plugin-boundaries";
import next from "@next/eslint-plugin-next";

// Modules are imported through the @/ alias (including CSS: import "@/app/globals.css"). Every no-restricted-imports
// block under src/ must include this pattern, because a later block's options replace an earlier block's instead of merging.
const noRelativeImports = { regex: "^\\.{1,2}/", message: "Import modules through the @/ alias, not relative paths." };
const noFunctionComponentType = { message: "Type props directly: function Button({ label }: ButtonProps)." };
const noEnums = { selector: "TSEnumDeclaration", message: "No enums: use an as const array or a Zod enum." };
const noDirectEnvAccess = {
  selector: 'MemberExpression[object.name="process"][property.name="env"]',
  message: "Read the environment only in src/config/ (server.ts or public.ts), through its Zod schema; import the parsed config elsewhere.",
};

// Boundary policies are last-match-wins: an element reaches others only through index.ts,
// and a later policy re-allows imports within the same element.
const throughIndexOnly = (fromTypes, toTypes, message) => ({
  from: { element: { type: fromTypes } },
  disallow: { to: { element: { type: toTypes, fileInternalPath: "!index.{ts,tsx}" } } },
  message,
});
const withinSameElement = (type) => ({
  from: { element: { type } },
  allow: { to: { element: { type, captured: { name: "{{ from.element.captured.name }}" } } } },
});
const never = (fromType, toTypes, message) => ({
  from: { element: { type: fromType } },
  disallow: { to: { element: { type: toTypes } } },
  message,
});

export default tseslint.config(
  { ignores: [".next/**", "out/**", "build/**", "coverage/**", "playwright-report/**", "test-results/**", "next-env.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    // Shared: mechanical proxies for single responsibility and one level of abstraction
    rules: {
      "max-lines-per-function": ["error", { max: 40, skipBlankLines: true, skipComments: true }],
      "max-depth": ["error", 2],
      "max-params": ["error", 3],
      complexity: ["error", 8],
      "max-lines": ["error", { max: 250, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    // Shared: TypeScript conventions enforced here instead of written as prose rules
    rules: {
      "@typescript-eslint/consistent-type-definitions": ["error", "interface"],
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      // `import type { X }`, never inline `import { type X }`: only the former is always erased, which is what lets a
      // Client Component take a type from a server-only context
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports", fixStyle: "separate-type-imports" }],
      "no-restricted-syntax": ["error", noEnums],
    },
  },
  {
    // Next.js: the framework's own rules, with the Core Web Vitals ones as errors
    files: ["**/*.{js,jsx,ts,tsx}"],
    plugins: { "@next/next": next },
    rules: { ...next.configs.recommended.rules, ...next.configs["core-web-vitals"].rules },
  },
  {
    // Bounded contexts and Server Actions: exported functions declare their return types
    files: ["src/contexts/**/*.ts", "src/features/*/actions.ts", "src/features/*/actions/**/*.ts"],
    rules: { "@typescript-eslint/explicit-module-boundary-types": "error" },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": ["error", { patterns: [noRelativeImports] }] },
  },
  {
    // React, for Server and Client Components alike
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks, react },
    settings: { react: { version: "19.0" } }, // explicit: "detect" calls context.getFilename(), which ESLint 10 removed
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react/function-component-definition": ["error", { namedComponents: "function-declaration", unnamedComponents: "arrow-function" }],
      "react/no-array-index-key": "error",
      "react/jsx-key": "error",
      "@typescript-eslint/no-restricted-types": ["error", { types: {
        "React.FC": noFunctionComponentType, FC: noFunctionComponentType,
        "React.FunctionComponent": noFunctionComponentType, FunctionComponent: noFunctionComponentType,
      } }],
    },
  },
  {
    files: ["src/**/*.tsx"],
    rules: { "max-lines-per-function": ["error", { max: 80, skipBlankLines: true, skipComments: true }] }, // JSX is verbose
  },
  {
    // Bounded contexts are framework-free: request data, caching and rendering belong to the caller.
    // (index.ts may import "server-only", which is not matched here.)
    files: ["src/contexts/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [noRelativeImports, {
          group: ["next", "next/*", "react", "react-dom", "@/features/**", "@/app/**", "@/ui/**", "@/auth/**", "@/cache/**", "@/routes"],
          message: "A bounded context must not depend on Next.js, React, the UI, or request helpers: pass what it needs as arguments.",
        }],
      }],
    },
  },
  {
    // The domain layer must stay pure: no framework, no React, no infrastructure, no outer layers
    files: ["src/contexts/*/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [noRelativeImports, {
          group: ["next", "next/*", "react", "react-dom", "server-only", "@prisma/*", "drizzle-orm*", "**/infrastructure/**", "**/application/**", "@/features/**", "@/app/**", "@/ui/**", "@/auth/**", "@/cache/**", "@/routes"],
          message: "The domain layer must not depend on frameworks, infrastructure, or outer layers.",
        }],
      }],
    },
  },
  {
    // Bounded contexts and features are reached only through their index.ts. Contexts never depend on the UI,
    // and the generic ui kit depends on neither. app/ composes features and reads contexts, through index.ts too.
    files: ["src/**/*.{ts,tsx}"],
    plugins: { boundaries },
    settings: {
      "boundaries/root-path": import.meta.dirname,
      "import/resolver": { typescript: { project: `${import.meta.dirname}/tsconfig.json` } },
      "boundaries/elements": [
        { type: "context", pattern: "src/contexts/*", capture: ["name"] },
        { type: "feature", pattern: "src/features/*", capture: ["name"] },
        { type: "ui-kit", pattern: "src/ui" },
        { type: "app", pattern: "src/app" },
        { type: "support", pattern: "src/{auth,cache,config,routes.ts}" },   // request and delivery helpers
      ],
    },
    rules: {
      "boundaries/dependencies": ["error", {
        default: "allow",
        policies: [
          throughIndexOnly(["context", "feature", "app", "support"], "context", "Import a bounded context only through its index.ts."),
          withinSameElement("context"),
          throughIndexOnly(["feature", "app"], "feature", "Import a feature only through its index.ts."),
          withinSameElement("feature"),
          never("context", ["feature", "ui-kit", "app"], "A bounded context never depends on the UI or the routes."),
          never("feature", "app", "A feature never depends on a route; routes compose features."),
          never("ui-kit", ["feature", "context", "app"], "src/ui is the generic kit; code that imports a domain concept belongs in a feature."),
        ],
      }],
    },
  },
  {
    // Only the config modules read the environment; test setup files may too
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/config/**", "src/testing/**"],
    rules: { "no-restricted-syntax": ["error", noEnums, noDirectEnvAccess] },
  },
  {
    // Tailwind: canonical class order; no conflicting, duplicate, unknown, or deprecated classes;
    // no class names built dynamically; theme tokens instead of arbitrary values
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "better-tailwindcss": tailwind },
    settings: {
      "better-tailwindcss": {
        entryPoint: `${import.meta.dirname}/src/app/globals.css`, // the CSS file with @import "tailwindcss" and @theme
      },
    },
    rules: {
      "better-tailwindcss/enforce-consistent-class-order": "error",
      "better-tailwindcss/enforce-canonical-classes": "error",
      "better-tailwindcss/no-conflicting-classes": "error",
      "better-tailwindcss/no-duplicate-classes": "error",
      "better-tailwindcss/no-unknown-classes": "error",
      "better-tailwindcss/no-deprecated-classes": "error",
      "better-tailwindcss/no-unnecessary-whitespace": "error",
      "better-tailwindcss/no-concatenated-classes": "error",
      "better-tailwindcss/no-restricted-classes": ["error", { restrict: [{
        pattern: "\\[[^\\]]*\\](?!:)",
        message: "Arbitrary value: use a theme token, adding it to @theme in the CSS entry file if it belongs to the design.",
      }] }],
    },
  },
  {
    // A feature's model stays pure: no React, no Next.js, no other layers
    files: ["src/features/*/model/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [noRelativeImports, {
          group: ["react", "react-dom", "next", "next/*", "**/ui/**", "**/actions", "**/actions/**"],
          message: "A feature's model/ is pure TypeScript: no React, no Next.js, and no ui/ or actions.",
        }],
      }],
    },
  },
  {
    // Tooling config and plain JS usually sit outside every tsconfig, so lint them without type information.
    // Any other .ts file must be in a tsconfig `include`; the lint hook says so when one is missing.
    files: ["**/*.{js,mjs,cjs}", "**/*.config.{ts,mts,cts}"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    // Tests are long by nature, and may import another context's testing/ fixtures
    files: ["**/*.test.{ts,tsx}", "e2e/**/*.ts"],
    rules: { "max-lines-per-function": "off", "max-lines": "off", "boundaries/dependencies": "off" },
  },
);
