---
paths:
  - "src/features/*/actions.ts"
  - "src/features/*/actions/**/*.ts"
  - "src/features/*/queries.ts"
  - "src/app/**/route.ts"
  - "src/contexts/*/index.ts"
---

# Server boundary rules (Server Actions, Route Handlers, cached reads)

The UI and the business logic meet at a context's `index.ts`. Reads are function calls from Server Components; writes go through Server Actions. Both are thin, and every one of them is reachable from the internet, so each validates and authorises as if it were a public endpoint.

## What a context publishes
- Each context exports, from `index.ts` only: its use cases, its queries, the Zod schema for each command, the DTO types they return, and the union of named failures each use case can return. Nothing else declares those shapes; import them or infer them from the schema.
- Test data for a DTO is a factory in the context's `testing/` folder (`aReservedRental(overrides)`) that parses through the schema, so a fixture that drifts fails the moment a test calls it. Every suite uses those factories.

## Server Actions
- Actions live in the feature that owns the user action (`src/features/<capability>/actions.ts`, starting with `"use server"`), named after the user's intent (`reserveCar`), never in a component file.
- An action does five things and nothing else: read the actor from the session, parse the input with the context's schema, call one use case, map the `Result` to the action's state, and invalidate what changed. No business rule, no database call, no `if` on domain state.
- Arguments are untrusted even when TypeScript types them: a `FormData`, a bound ID, a hidden field can all be forged. Parse every one. Never trust an ID from the client to imply ownership; the use case checks the actor against the aggregate.
- An action returns a discriminated union the form can render (`idle`, `invalid` with field errors, `rejected` with the use case's named failure, `done`), with the signature `(previous: State, formData: FormData) => Promise<State>` so it works with `useActionState`. Never throw a business failure; a thrown error is a bug and lands in `error.tsx`.
- Return only what the UI needs. Never return an aggregate, a database row, or an error's message or stack.
- After a successful write, invalidate before navigating: `updateTag(tag)` when the user must see their own change on the next render, `revalidateTag(tag, "max")` when stale-while-revalidate is fine. Call `redirect()` last and outside any `try`, because it works by throwing.

## Reads
- Server Components read through a context's queries. Wrap a query for a route in the feature's `queries.ts` (starting with `import "server-only"`) when it needs caching: `"use cache"`, then `cacheTag(...)` and `cacheLife(...)`. A read that depends on the signed-in user or the request is never put in `"use cache"`; pass the actor in and leave it dynamic inside `<Suspense>`. When several components need the same per-request read, wrap it in React's `cache()` in `queries.ts` so it runs once per request.
- Cache tags are defined once, in `src/cache/tags.ts`, as functions (`rentalTag(id)`); the query that tags and the action that invalidates import the same one.
- Never fetch your own Route Handler from a Server Component; call the query.

## Route Handlers
- `src/app/**/route.ts` exists only for callers that are not this app's UI: webhooks, third-party clients, feeds. The app's own pages and forms never use one.
- Same thin shape as an action: authenticate, parse `params` and the body with the context's schema, call one use case or query, map the result. Each failure `kind` maps to an HTTP status through one `ERROR_STATUS` table in a file beside the `route.ts`, never an inline `if`; HTTP statuses are a delivery detail and stay out of the context.
- `updateTag` works only in Server Actions. A Route Handler that writes invalidates with `revalidateTag(tag, "max")`.
- Verify a webhook's signature before parsing its body.

## Changing the boundary
- A change to a command schema, a DTO, or a failure union updates the context, its actions, and the components that render the result in the same change, and is not done until the journey passes in `yarn test:e2e`.
- Worked examples: `.claude/skills/coding-standards/server-boundary.md`.
