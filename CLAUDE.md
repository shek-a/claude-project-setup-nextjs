# Project
One Next.js app (App Router, TypeScript), rendered on the server wherever possible. `src/app` holds routes, `src/features` the UI by user capability, `src/contexts` the business logic as server-only bounded contexts, `src/ui` the generic component kit.
Each bounded context has a glossary in `docs/domain/<context>.md`. Use its terms exactly in code, tests, and UI copy.
Setup, stack, and how to run everything: `README.md`.

# Commands
- Install: `yarn install`
- Start locally: `yarn dev`
- Unit and component tests: `yarn test`
- Single test file: `yarn vitest run <path>`
- Integration tests (need Docker): `yarn test:integration`
- Browser journeys (production build, full stack; need Docker): `yarn test:e2e`
- Typecheck: `yarn typecheck` (generates the route types, then runs `tsc`)
- The Stop hook runs only `typecheck` and `test`. Run the integration and browser suites yourself after changing infrastructure, a page, a journey, a Server Action, or a Route Handler.
- Linting runs automatically after every edit, and over every changed file before a turn ends (hooks). Fix what it reports; never add eslint-disable comments.

# Workflow
- IMPORTANT: Test-driven. No production code without a failing test first. Follow the `test-driven-development` skill.
- Never weaken or delete an existing test to get green. If a requirement changed, say so explicitly first.
- New feature, domain concept, or UI capability: before any code, ask the user to run `/grill-me <the requirement>`, then `/implement <brief>`; only the user can start these two. `/grill-me` gathers the requirements, with no design, into a brief in `docs/requirements/`. Then `/implement <brief>` designs it (context map, domain document, entry points, UI model, test list, through the `domain-driven-design` and `ui-modeling` skills), stops once for your review, then builds and commits it.
- Check Next.js, React, and library APIs against current docs with the Context7 MCP tools (`resolve-library-id`, then `query-docs`) instead of relying on memory; Next.js changes APIs and defaults between versions (caching, async request APIs, file conventions).

# Definition of done
- A turn is done when lint, typecheck, and unit tests pass. The Stop hook enforces that much and nothing more.
- A task is done when every test-list item for it passes, plus the suite that matches what changed:
  - a context's `infrastructure/` (repositories, adapters): `yarn test:integration`
  - a page, layout, journey, async Server Component, Server Action, Route Handler, or the app shell: `yarn test:e2e`, the journey against the production build. Vitest cannot render an async Server Component, so such a change is not done until this passes.
- Say which suites you ran and which you didn't. Never describe a suite you skipped as passing.
- The `code-reviewer` has run, and every finding is fixed or declined with a reason.
- `docs/domain/<context>.md`, `docs/domain/context-map.md`, and each use case's entry point match the code, and nothing is left TODO, skipped, or `.only`.

# Architecture
- Server first. A component is a Server Component unless it needs state, an event handler, an effect, or a browser API; `"use client"` goes on the smallest leaf that does. Data is read in Server Components, never fetched in the browser by default.
- The bounded contexts own the business rules and are the source of truth. They are plain TypeScript behind `import "server-only"`: no `next/*`, no React. Components and Server Actions never re-implement a domain invariant.
- Server Components read through a context's queries; Server Actions are the only way the UI writes. An action is a thin adapter: read the actor, parse the input with the context's Zod schema, call one use case, map the `Result`, invalidate the cache. Treat every action as a public endpoint.
- Route Handlers exist only for callers outside the app (webhooks, third parties). The app never fetches its own.
- Only DTOs cross from server to client, and only the fields the component shows. Aggregates, database rows, and anything from `src/config/server.ts` never do.
- Routes, features, and contexts reach a context or a feature only through its `index.ts` (ESLint enforces this).
- `tsconfig.json` extends `tsconfig.base.json`. Never loosen its strict flags; fix the code instead.
