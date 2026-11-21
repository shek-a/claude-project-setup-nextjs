---
paths:
  - "src/contexts/**/*.ts"
---

# Server architecture (DDD, hexagonal)

The business logic lives in bounded contexts, server-only modules the routes and features call directly; there is no internal HTTP API. Each bounded context lives in `src/contexts/<context>/`:
- `domain/`: aggregates, entities, value objects, domain services, domain events, repository interfaces. Pure TypeScript; no Next.js, React, or database imports (ESLint enforces this).
- `application/`: one use case per class or function. Loads aggregates through repository interfaces, calls domain methods, saves, publishes events. Queries live here too: read-only functions that return DTOs for the UI.
- `infrastructure/`: repository implementations, external service adapters.
- `index.ts`: the public interface, starting with `import "server-only"`.

Delivery is outside the context: Server Components call its queries, and Server Actions and Route Handlers call its use cases (see `.claude/rules/server-boundary.md`).

Rules:
- Dependencies point inward: routes and features → application → domain. Infrastructure implements interfaces defined in domain/application.
- Inside `domain/`, keep one flat folder only while it reads at a glance (about ten files). Past that, group by concept, named in the ubiquitous language, never by technical pattern alone: one folder per aggregate (`car/`: the root, its serialisable state and read view, its lifecycle operations, its events, and the tests of the capabilities it owns); a folder for the entities it owns when they are many (`bookings/`); `value-objects/`; a folder for the policies a change is most likely to replace, named as the domain names them (`pricing/`, `eligibility/`), each policy its own file in an ordered list or keyed map rather than a branch in a code path; and `testing/` for hand-placement builders used only by tests. Tests sit beside the code they cover inside those folders; the `@/` alias makes a later move cheap, so regroup the moment the flat folder stops reading.
- Invariants are enforced inside the aggregate. State changes only through aggregate methods named after domain operations; no public setters. Code outside the aggregate never holds references to objects inside it.
- One aggregate per transaction. When an operation must also change a second aggregate, that change reacts to a domain event; eventual consistency between aggregates is intended.
- Domain events are named in the past tense (`CarReturnedLate`) and raised by the aggregate root.
- Names the outside world depends on (event names, queue and topic names, header names, job names) are defined once in the context that owns them; publishers and subscribers import the same constant instead of retyping the string.
- Entities are equal when their IDs are equal. Value objects have no ID, are equal when all their attributes are equal, are immutable, and validate themselves on creation.
- A context never imports `next/*` or React. Nor does it import `@/auth`, `@/cache`, or `@/routes`. What a use case needs from the request (the signed-in actor, a locale) is read by the action or page and passed in as an argument; caching and revalidation belong to the caller.
- Authorisation is a business rule: the use case or query receives the actor and decides. Never rely on a page or a hidden button to keep someone out.
- A rule that spans several aggregates, or belongs to none of them, goes in a stateless domain service in `domain/` (e.g. `RentalEligibility`). It takes aggregates as arguments and does no I/O; the use case loads them and passes them in. Never put such rules in a use case, a Server Action, or a component. A domain service is a last resort: behavior that fits on an entity belongs there, or the model turns anemic.
- Queries return DTOs: plain serialisable objects with only the fields the UI may show. Aggregates, entities, and database rows never leave the context, because anything passed to a Client Component is sent to the browser.
- One repository per aggregate root, returning fully constructed aggregates, never ORM models or raw rows. Other contexts reference an aggregate by ID, never by object.
- A context's public interface is its `index.ts`: the use cases and queries other contexts may call, the DTOs they take and return, and the domain events it publishes. It never exports aggregates or entities. Routes, features, and other contexts import only that file, never its `domain/`, `application/`, or `infrastructure/` (ESLint enforces this). The context's `composition.ts` wires its use cases to their infrastructure; `index.ts` exports them wired.
- Each context owns its data. Never read or write another context's tables; call its interface or react to its events.
- Secrets (database URLs, API keys, signing keys) come from the platform's environment, never from a committed file. Never log the parsed config or return it in an error response.
- Call another context's interface for a command (the caller needs the result now and owns the decision); publish an event for a reaction. Two contexts never depend on each other in both directions. Translate another context's DTOs into your own terms at the boundary.
