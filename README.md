<!-- Template: follow TEMPLATE.md to set the project up, replace every <placeholder> below with this project's details, then delete TEMPLATE.md and this comment. -->

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

## Getting started

```bash
yarn install
cp .env.example .env.local                                        # then fill in the values
docker compose -f docker-compose.integration.yml up -d --wait     # Postgres, with app_dev and app_test
yarn migrate                                                      # app_dev, from .env.local
yarn seed:dev                                                     # sample data to click through; rerun to reset
yarn dev                                                          # <http://localhost:3000>
```

The app reads its configuration from environment variables, parsed once at startup (`src/config/`). A missing variable fails immediately and names itself, so a boot error usually means a value is missing from your `.env.local`. Only variables prefixed `NEXT_PUBLIC_` reach the browser.

Your local data lives in `app_dev` and the tests use `app_test`, in the same container, so running the suites never touches what you set up by hand. `yarn seed:dev` replaces `app_dev`'s contents with the sample set.

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

### Building a feature: `/grill-me`, then `/implement`

A feature takes two commands, with one review in between. Example: customers should be able to extend a rental.

**1. `/grill-me customers can extend a rental`**

Claude reads the existing domain documents, then interviews you in rounds of numbered questions, each with a recommended answer, about the business only:

```
❓ Q1 - Overlap: can an extension overlap another booking of the same car?
➡️ No: the extension is rejected and the customer is told the car is booked.

❓ Q2 - Limit: is there a maximum extension?
➡️ Yes, 14 days in total, as the current terms say.
```

You answer ("yes", or a correction), and it asks the next round until nothing is left open and you confirm you share an understanding. It then writes the requirements, with no design, to `docs/requirements/extend-rental.md` (problem, actors, agreed terms, rules, examples with real numbers, edge cases, the user journey, what is out of scope) and ends with the next command to run.

**2. `/implement docs/requirements/extend-rental.md`**

Claude designs the change from the brief and stops once for your review, showing:
- the context map diagram (bounded contexts, what reaches them, events between them);
- what changed in each domain document, and where each rule is enforced;
- the entry points (the Server Action, page read, or Route Handler for each use case, with its command schema, DTO, and named failures) and each event published;
- the test list, as test names, and the suites the change needs.

For this example: an `extendRental` use case in the `rentals` context with the overlap and 14-day rules as invariants of the rental, an `extendRental` Server Action in the `manage-rentals` feature, and a small Client Component form on the server-rendered rental page.

Ask for changes or approve. After approval it builds each test-list item test first (red, green, refactor), runs typecheck, the unit tests, and `yarn test:e2e` (a page and a Server Action changed), runs the `code-reviewer` and fixes or declines each finding, then makes one commit and reports what ran and what did not. It never pushes or opens a pull request; that is yours to do.

**Variations**
- **Something already designed:** `/implement docs/domain/rentals.md "rejects an extension that overlaps another booking"` builds named test-list items without a brief.
- **A trivial change** (a typo, a config value): just ask. The test-first rule and the hooks still apply.
- **A requirements gap found during design or build:** Claude stops and asks rather than inventing a rule, and records the answer in the brief.

Reading `CLAUDE.md` and the rules is also the fastest way for a person to learn the conventions of this codebase.
