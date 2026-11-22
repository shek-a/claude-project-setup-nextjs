# Using this template

This repository holds the conventions for a server-first Next.js app, not an application. Follow these steps once to start a project from it, then delete this file.

## Set up the project

1. Create the app: `yarn create next-app <name> --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"`.
2. Copy into it: `CLAUDE.md`, `.claude/`, `.mcp.json`, `.nvmrc`, `docs/`, `tsconfig.base.json`, and `README.md`. Replace the generated `eslint.config.mjs` with this one, and merge the `.gitignore`.
3. Make `tsconfig.json` extend the strict base, and include the test folders:
   ```jsonc
   { "extends": "./tsconfig.base.json", "include": ["next-env.d.ts", ".next/types/**/*.ts", "src", "e2e", "test"] }
   ```
4. Install what the configuration expects:
   ```bash
   yarn add zod server-only clsx tailwind-merge class-variance-authority
   yarn add -D typescript-eslint @eslint/js @next/eslint-plugin-next eslint-plugin-react eslint-plugin-react-hooks \
     eslint-plugin-better-tailwindcss eslint-plugin-boundaries eslint-import-resolver-typescript \
     vitest @vitejs/plugin-react vite-tsconfig-paths jsdom @testing-library/react @testing-library/user-event \
     @testing-library/dom @testing-library/jest-dom @playwright/test dotenv-cli
   yarn remove eslint-config-next   # its bundled plugins collide with the stricter ones configured here
   ```
5. Add the scripts the hooks and the workflow call:
   ```json
   "typecheck": "next typegen && tsc --noEmit",
   "test": "vitest run",
   "test:integration": "vitest run --config vitest.integration.config.mts",
   "test:e2e": "docker compose -f docker-compose.integration.yml up -d --wait && dotenv -e .env.test -- sh -c 'yarn migrate && yarn seed:e2e && playwright test'"
   ```
   `migrate` and `seed:e2e` are yours to add: they depend on the database library you choose.
6. Turn on Cache Components in `next.config.ts`: `cacheComponents: true`.
7. Create `.env.example` (every variable `src/config/` requires, with working local values) and `.env.test` (the same for tests: Compose ports and dummy keys, no real secrets; add `!.env.test` to `.gitignore`).
8. Add the test configuration described in `.claude/skills/test-driven-development/` (`server.md` for Vitest, `integration.md` for Docker Compose, `playwright.md` for the journeys).

Until `package.json` defines `typecheck` and `test`, the Stop hook skips them; the lint hook needs ESLint installed.

## Make it yours

1. In `README.md`, replace every `<placeholder>` and delete the template comment at the top.
2. Check the hooks run: edit any `.ts` file in a Claude Code session and confirm ESLint reports on it.
3. Delete this file.

## Then build the first feature

Run `/grill-me <the requirement>`, then `/implement <the brief it wrote>`. The README's "Building a feature" section walks through an example. The first `/implement` creates `docs/domain/<context>.md` and `docs/domain/context-map.md`.
