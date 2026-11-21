---
paths:
  - "src/**/*.{ts,tsx}"
---

# TypeScript design rules (server and UI)

`tsconfig.base.json` and ESLint already enforce strict typing, no `any`, no `enum`, `interface` for object shapes, exhaustive switches, `@/` imports, and explicit return types on context and Server Action exports. These rules cover what tools can't check; the `coding-standards` skill has a worked example of each.

## Design
- Single responsibility: a class, module, component, or hook has one reason to change. If describing it needs "and", split it.
- One level of abstraction per function: a function either orchestrates (calls well-named steps) or does low-level work (loops, string handling, I/O calls). Never both. Extract the low-level parts into named functions.
- Extract compound boolean conditions into a named predicate: `if (isRefundable(order))`, not three `&&` clauses inline.
- ESLint caps cyclomatic complexity at 8, nesting at 2, parameters at 3, and function length. When one trips, that is a design signal: extract a named function or predicate, replace a branch chain with a lookup table, or model the cases as a discriminated union. Never raise a cap or disable the rule.
- Apply design patterns, SOLID, DRY, YAGNI, and KISS pragmatically: only when the current problem calls for them, never mechanically or speculatively. Prefer explicit over clever.
- Name things with the ubiquitous language from `docs/domain/`. No generic names like `data`, `info`, `manager`, `helper`, `utils`.
- Import modules through the `@/` alias (`@/*` maps to `src/*`), never relative paths. That includes CSS: `import "@/app/globals.css"`.

## Types
- Model states with discriminated unions, not optional-field combinations or boolean flags.
- Define each set of domain values once and derive its type from it: a Zod enum exported from the owning context's `index.ts` if it is parsed from input, otherwise an `as const` array (`type Role = (typeof ROLES)[number]`) in the module of the concept the set belongs to, grouped as `domain/` is: event kinds with the events, rental statuses with the rental, ineligibility reasons with the eligibility policy. A Client Component cannot import a value from a context (its `index.ts` is `server-only`): it imports the type with `import type` and receives the values as props from a Server Component. A set that exists only as a type union, or that a lookup table or a test spells out again, is the same set declared twice. Never a TypeScript `enum`.
- A subset the domain names (the statuses a rental can be cancelled in, the statuses a car can be booked in) is a constant beside its set, annotated as a readonly array of the set's type (`readonly RentalStatus[]`, so a misspelled member fails to compile and `includes` accepts any member), never a literal array at a call site. Tests import sets and subsets; a shared test value such as a rental period comes from the test builders in `domain/testing/`, never from the top of each test file. A set whose values are the domain words themselves needs no per-member constants: the derived union checks every use, and a second name per value is a synonym. The name-to-value object form (`RENTAL_EVENTS.booked`) is for wire strings that can change independently of their code name, and for values used where the type is lost.
- A string that carries meaning is defined once and imported, never retyped: event, queue, and topic names, header names, cache tags, route paths, search-param names, storage keys. Two exceptions: a single value whose type is a literal union, such as the discriminant in an object literal or one side of a comparison, where a typo is already a compile error; and Tailwind class strings, which become a component rather than a constant. Listing several members of a set is never covered by the first exception.
- Use `satisfies` to check a literal against a type without widening it.
- IDs and other easily swapped primitives are branded types, defined with Zod `.brand()` in the context that owns them and exported from its `index.ts`. Get them by parsing, never by `as`.
- Import types with `import type { X }`, never inline `import { type X }`: only the first is guaranteed to be erased, which matters when the module is `server-only` and the importer is a Client Component.
- Prefer narrowing (`typeof`, `in`, `instanceof`, type predicates) over `as`. Every remaining `as` needs a comment saying why it is safe.

## Errors and input
- Expected business failures are returned as `Result<T, E>`, where `E` is a discriminated union of named failures (`{ kind: "order_already_shipped" }`). Never throw them. Exceptions are only for bugs and infrastructure failures.
- Parse untrusted input (form data, Server Action arguments, route `params` and `searchParams`, Route Handler bodies, env vars, external responses) at the boundary with Zod; command shapes use the schemas the context exports. Never check untrusted input with hand-written type guards or `as`. Inside the boundary, trust the types.
- Environment-specific values (service URLs, keys, feature toggles) come from environment variables, never hardcoded defaults. Parse them with a Zod schema at startup so a missing one fails fast, naming the variable. Commit `.env.example` with a working local value for each; never commit `.env`.
- `src/config/` is the only place that reads `process.env` (ESLint enforces this). `server.ts` starts with `import "server-only"` and parses everything the server needs, secrets included. `public.ts` parses only `NEXT_PUBLIC_` variables, each written out as `process.env.NEXT_PUBLIC_NAME` because Next.js inlines them by that literal name at build time; declare them on `NodeJS.ProcessEnv` in `src/env.d.ts` so the dot access typechecks. Everything else imports the parsed config. `.env.example` lists every variable the schemas require.
