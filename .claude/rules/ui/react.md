---
paths:
  - "src/app/**/*.{ts,tsx}"
  - "src/features/**/*.{ts,tsx}"
  - "src/ui/**/*.{ts,tsx}"
---

# React rules

These apply to Server and Client Components alike. When a component runs on the server or the client, and how data and mutations flow, is in `.claude/rules/ui/server-components.md`.

## No prop drilling
A component must not receive a prop only to pass it to a child. Fix in this order:
1. Composition: pass the child in via `children` or a slot prop so the parent never needs the data.
2. Server data: read it in the Server Component that renders it. Two components calling the same cached query cost one read, so there is no reason to fetch high and pass down.
3. Move client state down to the lowest component that uses it, or into the URL if it should survive a reload.
4. Shared client state within one feature: a feature-scoped context, provided by a small Client Component that takes `children`.
Do not create app-wide context just to avoid passing props; app-wide context is only for cross-cutting client state (theme, locale).

## Components
- Components are function declarations with a props `interface`; no `React.FC`. Handlers defined inside a component are `const` arrow functions named `handleX`, where X is the intent (`handleReserveCar`, never `handleSubmit`). Handler props are `onX`; hooks are `useX`.
- Keep components small (ESLint caps them at 80 lines). Extract a child when a block of JSX is reused, has its own state, or is a self-contained unit. More than about 5 to 7 props means the component does too much.
- Separate components that read data and compose (async Server Components) from presentational ones (props in, markup out). Presentational components have no directive, so they render wherever they are imported.
- List items get a stable, unique `key`, never the array index. Never mutate props or state.
- Route paths, search-param names, cache tags, and storage keys are defined once and imported.

## Effects
- `useEffect` synchronises with external systems (subscriptions, timers, the DOM). Never use it to compute derived data (do it during render), handle an event (do it in the handler), reset state when a prop changes (remount with `key`), or fetch (read in a Server Component).
- The cleanup test: if nothing needs undoing, it probably shouldn't be an effect.
- `useMemo` only for genuinely expensive calculations.

## Structure
- `src/app/` holds routes only: `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, and `route.ts`. They compose features and contain no business logic.
- Organize features by user capability or journey (`src/features/book-rental/`), not by bounded context; a feature may read several contexts.
- Inside a feature: `ui/` (components), `actions.ts` (Server Actions), `queries.ts` (cached reads), `model/` (pure types and calculations: action states, search-param parsing, derivations), `index.ts` (what routes compose). Start with `ui/`; add the others when the journey needs them.
- Routes and other features import a feature only through its `index.ts`, and contexts only through theirs; `src/ui/` is the generic kit and imports neither (ESLint enforces this). A Client Component never imports another feature; it takes that feature's component as `children`.
- `model/` is pure TypeScript: no React, no Next.js (ESLint enforces the imports).
- Components render. Derivations, business conditions, and state updates are named pure functions in `model/`. Never store derived state; compute it.
- Name user actions after the user's intent (`reserveCar`), and model their outcome as a discriminated union, including the use case's named rejections.
- The contexts own business rules. Never re-implement one (availability, eligibility, pricing) in a component or an action; show what the context returns.
- Only `NEXT_PUBLIC_` variables reach the browser, and they are inlined into the JavaScript at build time: put no secrets there. Everything else is read through `src/config/server.ts` and stays on the server.
- Before building a new capability, ask the user to run `/grill-me`, then `/implement`, which models it with the `ui-modeling` skill.

## Examples
- Worked examples of these rules: `.claude/skills/coding-standards/react.md`. Deciding the server/client split and the state of a capability: the `ui-modeling` skill.

## Tests
- Follow `.claude/skills/test-driven-development/ui.md`: capability test files, accessible queries, Client Components through React Testing Library, async Server Components and journeys through Playwright.
