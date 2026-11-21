<!-- Template: replace every <placeholder> with this project's details, then delete this comment. -->

# \<Product name\>

\<One paragraph: what the product does, who uses it, and the problem it solves.\>

The business domain is documented per bounded context in [`docs/domain/`](docs/domain/): each file holds that context's glossary, aggregates and rules. Read the one you're working in before changing code; the terms there are the terms used in the code, the tests and the UI.

## Tech stack

| Part | What it is |
|---|---|
| App | Next.js 16 (App Router) + React 19 + TypeScript, rendered on the server wherever possible: Server Components for reads, Server Actions for writes, Cache Components (`"use cache"`) for caching |
| `src/contexts` | The business logic: one server-only folder per bounded context, each with `domain/`, `application/`, `infrastructure/`, and a public `index.ts`. Postgres for persistence |
| `src/features` | The UI by user capability: components, Server Actions, cached reads, and a pure model |
| Styling | Tailwind 4, with a small generic kit in `src/ui` |
| Tooling | Yarn, strict `tsconfig.base.json`, ESLint (flat config, with Next.js, architecture-boundary, React, and Tailwind rules), Zod, Vitest, React Testing Library, Playwright, Docker Compose |

## Prerequisites

- **Node 24** (the LTS line), pinned in `.nvmrc`: `nvm use`
- **Yarn** via Corepack: `corepack enable`
- **Docker Desktop**, for the integration and end-to-end suites

## Using this template

This repository holds the conventions, not an application. To start a project from it:

1. Create the app: `yarn create next-app <name> --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"`.
2. Copy into it: `CLAUDE.md`, `.claude/`, `.mcp.json`, `.nvmrc`, `docs/`, `tsconfig.base.json`, and this `README.md`. Replace the generated `eslint.config.mjs` with this one, and merge the `.gitignore`.
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

## Getting started

```bash
yarn install
cp .env.example .env.local                                        # then fill in the values
docker compose -f docker-compose.integration.yml up -d --wait     # Postgres
yarn migrate
yarn dev                                                          # <http://localhost:3000>
```

The app reads its configuration from environment variables, parsed once at startup (`src/config/`). A missing variable fails immediately and names itself, so a boot error usually means a value is missing from your `.env.local`. Only variables prefixed `NEXT_PUBLIC_` reach the browser.

## Running the app

| Command | What it does |
|---|---|
| `yarn dev` | Runs the app in development mode |
| `yarn build` then `yarn start` | Production build, then serves it |
| `yarn typecheck` | Generates route types, then TypeScript with no emit |
| `yarn eslint .` | Lints the whole repo (editors and the Claude hooks do this per file) |

## Testing

Each layer answers a different question. Run the first constantly; the rest when you touch what they cover.

**Unit and component tests** — is the logic right? Domain rules, use cases (repositories mocked), Server Actions (called directly), Client Components and presentational components.

```bash
yarn test
yarn vitest run <path>   # a single file
```

**Integration tests** — does the boundary work? Repositories and adapters against real Postgres, started by Docker Compose. Needs Docker.

```bash
yarn test:integration
```

**Browser journeys** — does the whole thing actually work? Playwright drives a production build: browser → Server Components and Server Actions → contexts → Postgres, with nothing mocked in between. This is the only suite that renders async Server Components, so it is also where pages, streaming, caching, and revalidation are checked. Needs Docker. The script starts Postgres, runs `migrate`, then `seed:e2e`, before building, so each run begins from a known state.

```bash
yarn test:e2e
```

## Project layout

```
src/
├── app/                        # routes only: page, layout, loading, error, not-found, route handlers
├── features/<capability>/      # one user journey, e.g. book-rental/
│   ├── ui/                     # components: Server Components by default, small Client Component leaves
│   ├── actions.ts              # Server Actions: parse, call one use case, map the result, invalidate
│   ├── queries.ts              # cached reads for this feature's routes
│   ├── model/                  # pure types and functions: action states, filters, messages
│   └── index.ts                # what routes compose
├── contexts/<context>/         # one bounded context, e.g. rentals/ (server-only)
│   ├── domain/                 # pure TypeScript, grouped by concept once it grows:
│   │   ├── <aggregate>/        #   root, state, lifecycle operations, events, its tests
│   │   ├── value-objects/
│   │   ├── <policies>/         #   replaceable rules named as the domain names them
│   │   └── testing/            #   hand-placement builders, tests only
│   ├── application/            # use cases, and queries returning DTOs
│   ├── infrastructure/         # repository implementations, adapters
│   ├── testing/                # DTO fixture factories, tests only
│   ├── composition.ts          # wires use cases to infrastructure
│   └── index.ts                # the context's public interface
├── ui/                         # generic design-system kit
├── auth/                       # reads the session and returns the actor
├── cache/tags.ts               # every cache tag, defined once
├── config/                     # server.ts and public.ts: the parsed environment
├── routes.ts                   # every route path, defined once
└── testing/                    # Vitest setup
e2e/                            # Playwright journeys                    -> test:e2e
test/                           # integration-test setup (Docker Compose)
docs/
├── requirements/               # one brief per change, written by /grill-me
└── domain/                     # one document per bounded context, plus the context map
```

Dependencies point inward: routes and features call a context's `index.ts`, its `application/` uses its `domain/`, and `infrastructure/` implements interfaces the domain defines. Contexts import nothing from Next.js or React. ESLint enforces all of that, along with routes, features, and contexts importing each other only through `index.ts`.

## How this project works with Claude Code

The repo is set up so Claude follows the same conventions you do:

- **`CLAUDE.md`** — the standing instructions: commands, workflow, architecture.
- **`.claude/rules/`** — always-on rules, loaded for the files they apply to (TypeScript, server-first rendering, React, Tailwind, the bounded-context architecture, and the server boundary: Server Actions, cached reads, Route Handlers).
- **`.claude/skills/`** — the workflows. A feature takes two commands: `/grill-me <the requirement>` interviews you until you share an understanding and writes the requirements, with no design, as a brief in `docs/requirements/`; `/implement <brief>` designs it (context map, domain document, entry points, UI model, test list), stops once for your review, then builds it through to a reviewed commit. Underneath, `domain-driven-design` and `ui-modeling` do the modelling, `test-driven-development` governs all production code, and `coding-standards` has worked examples. `grilling` is vendored from [mattpocock/skills](https://github.com/mattpocock/skills), and `grill-me` adapted from it, under its MIT licence.
- **`.claude/hooks/`** — the gates: ESLint runs after every edit, and a turn can't end with failing typechecks or tests.
- **`.mcp.json`** — the Context7 server, so Claude checks Next.js and library APIs against current documentation instead of memory.
- **`.claude/agents/code-reviewer.md`** — reviews a diff against the domain documents and the rules.

Reading `CLAUDE.md` and the rules is also the fastest way for a person to learn the conventions of this codebase.
