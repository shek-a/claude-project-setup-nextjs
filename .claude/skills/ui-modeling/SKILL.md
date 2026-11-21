---
name: ui-modeling
description: Models a user capability in the Next.js App Router UI before it is built, server-first, covering the capability and its language, the bounded contexts and published queries, DTOs, and use cases it uses, the routes, the split between Server and Client Components, where each piece of state lives (URL, server, client, derived), the Server Actions and their outcomes, usability-only validation, and the UI test list. Use before building a new page, journey, or form, and when deciding whether something should be a Client Component, where state belongs, how a mutation's result is shown, or where UI logic belongs. Do not use it to define aggregates, persistence, or business rules; that is the domain-driven-design skill.
---

# UI modeling

Use this to decide **what renders where** and **where state lives** for one user capability. The bounded contexts own the business rules and are the source of truth; the UI renders what they publish and sends them the user's intent.

The `test-driven-development` skill governs implementation, `.claude/rules/ui/server-components.md` and `.claude/rules/ui/react.md` govern the mechanics, and the `coding-standards` skill has worked examples. Do not write production code in this skill.

## Modeling workflow

Before implementing a new UI capability:

1. Describe the user capability in business language, from the brief's user journey.
2. Identify the bounded contexts involved, and read their `docs/domain/<context>.md`.
3. Identify what those contexts publish for it: the queries and DTOs to read, the use cases to call, their command schemas and named failures. Take them from each context's `index.ts`, or, for ones not built yet, from the Use cases table in the domain document.
4. Lay out the routes: which segments the journey uses, what each page shows, and which parts can render at once (the static shell) while the parts that depend on the request, the user, or a slow read stream in behind `<Suspense>`.
5. Split server and client. Everything is a Server Component unless it needs state, an event handler, an effect, or a browser API; list each Client Component, the one reason it has to be one, and the server-rendered content it receives as `children`.
6. Place each piece of state: in the URL, on the server, in a Client Component, or derived.
7. Define the user actions: each Server Action named after the user's intent, the states its result can be in (including each named failure of the use case), and what it invalidates or where it navigates.
8. Identify validation that improves usability without treating it as enforcement.
9. Derive the test list: behaviors as test names, from the user's point of view. Write it under `UI` in the test list of `docs/domain/<context>.md`, for the context whose use cases the capability mainly drives, marking which items are component tests and which are journeys. This is the backlog for the `test-driven-development` skill.
10. Present the model and the test list for review, and stop before implementation.

If the capability needs a rule, a query, or a use case that no context publishes yet, run the `domain-driven-design` skill first. This skill consumes what the contexts publish; it doesn't invent it.

Do not design component, hook, or file structure beyond what is needed to establish these boundaries. Allow implementation details to emerge through TDD.

## Ubiquitous language

Use the terms from `docs/domain/` in component names, props, action names, routes, and UI copy. If the screen needs a word the domain documents don't have, that is a question for the brief, not a name to coin.

```tsx
// Violation: generic names hide what the user is doing
function ItemList({ data, onSubmit }: ItemListProps) { ... }

// Fix: the business's words
function AvailableCars({ cars }: AvailableCarsProps) { ... }
```

## Organize around user capabilities

Features represent user capabilities or journeys. They do not mirror bounded contexts one-to-one.

```text
src/
├── app/                      # routes only: thin pages that compose features
│   └── rentals/[id]/page.tsx
├── features/
│   ├── book-rental/          # reads fleet (availability) and billing (quote); writes rentals
│   │   ├── ui/               # components: server by default, small client leaves
│   │   ├── actions.ts        # Server Actions ("use server")
│   │   ├── queries.ts        # cached reads for this feature's routes ("server-only")
│   │   ├── model/            # pure types and functions: action states, filters, messages
│   │   └── index.ts          # what routes compose
│   └── manage-rentals/
├── ui/                       # generic design-system kit: Button, cn
└── contexts/                 # the business logic (domain-driven-design skill)
```

A feature that only displays published data can be `ui/` alone. Add `queries.ts` when a read needs caching, `actions.ts` when the user can change something, and `model/` when the journey has its own types or calculations.

**Placement test:** does the code import a domain concept (`RentalSummary`, `CarStatus`)? Then it belongs to a feature. Pure presentation with no domain import belongs in `src/ui/`. A domain-aware component several features need (a `CarCard`) lives in the feature that owns the concept's journey and is exported from its `index.ts`.

## Server or client

The default answer is server. A Client Component is a cost: its code, and everything it imports, is downloaded and run in the browser.

| The component needs | It is |
|---|---|
| Data from a context, secrets, or nothing interactive | A Server Component |
| `useState`, `useReducer`, `useActionState`, an event handler, `useEffect`, a browser API | A Client Component, as small as possible |
| To wrap server-rendered content in something interactive (a dialog, a disclosure, tabs) | A Client Component that takes the content as `children` |

Model the split as a tree, marking only the client leaves:

```text
RentalPage (server, passes the params promise down)
└── Suspense
    └── RentalDetails (server, awaits params, the actor, and the rentals context's query)
        ├── RentalTimeline (server)
        ├── CancelRentalButton (client: useActionState for the cancelRental action)
        └── ExtendRentalDialog (client: open/closed state)
            └── ExtendRentalQuote (server, passed as children)
```

If the tree has a Client Component near the root, look for the state that put it there and move that state to a leaf or into the URL.

## Where state lives

| State | Lives in | Example |
|---|---|---|
| Anything the server owns | The server; rendered by Server Components and re-rendered after an action invalidates it | The rentals list, a car's availability |
| Anything that should survive a reload or be shared in a link | The URL (`searchParams`, the path) | Filters, sort, page, the selected tab, which record is open |
| Interaction that means nothing after a reload | A Client Component, at the lowest level that needs it | An open menu, an unsent draft, the step of a wizard |
| Anything computable from the above | Nowhere: compute it in a pure function in `model/` | "Due back soon", a total, whether a button is enabled |

Never copy server data into client state, and never store derived state. Model a multi-step workflow as a discriminated union of steps, not boolean flags:

```ts
type BookingStep =
  | { step: "choosing_period" }
  | { step: "choosing_extras"; period: RentalPeriod }
  | { step: "confirming"; period: RentalPeriod; extras: readonly Extra[] };
```

## Keep business logic out of components

A condition the user would call a rule of the screen is a named pure function in `model/`, unit-tested without rendering:

```ts
// model/rental-summary.ts
export function isDueBackSoon(rental: RentalSummary, now: Date): boolean {
  return rental.status === "active" && new Date(rental.endsAt).getTime() - now.getTime() < 86_400_000;
}
```

That is display logic the UI owns: when to show a reminder. A rule the business decides (eligibility, availability, pricing, what may be cancelled) stays in its context, which publishes the decision for the UI to show.

**Violation:** a context's rule copied into a component, which drifts the day the rule changes.

```tsx
const cancellable = rental.status === "booked" && new Date(rental.startsAt) > new Date();
```

**Fix:** the DTO carries the decision.

```tsx
{rental.allowedActions.includes("cancel") && <CancelRentalButton rentalId={rental.id} />}
```

## Explicit user actions

Name each Server Action after the user's intent, and give its result a state for every outcome the user can see, including each named failure of the use case:

```ts
// model/cancellation-state.ts
export type CancellationState =
  | { status: "idle" }
  | { status: "rejected"; reason: CancelRentalError }   // e.g. { kind: "rental_already_started" }
  | { status: "cancelled" };
```

For each action, decide: what the form sends, what each state shows, which cache tags it invalidates, and whether it navigates afterwards. A message for each failure is a pure function with an exhaustive `switch`, so a new failure cannot be forgotten.

## Validation is for usability

Validation in the browser gives fast feedback. The Server Action parses again, and the use case is the only enforcement.

- Use native constraints (`required`, `min`, `type`) first: they work before JavaScript loads.
- Field-level messages come back in the action's `invalid` state, produced by the context's command schema, so there is one definition of a valid field. A Client Component cannot import that schema (the context is `server-only`); if a form needs instant feedback beyond native constraints, a Server Component passes the limits down as props.
- Never reproduce a rule the UI can't see in full: availability, eligibility, cancellation windows, pricing. Show what the context publishes (allowed actions, quotes), and render the rejection when it refuses.
- Always design the state where the action rejects something the form considered valid.

## Where this skill stops

**Decide here:** the capability and its language, the contexts and what they publish for it, the routes, the server/client split, where each piece of state lives, the actions and their states, and the validation that is for usability.

**Let TDD drive:** the component breakdown below the client leaves, hook signatures, file names, and the internal structure of each folder.

**The stop signal:** if the work has moved from drawing boundaries to designing component props or hook signatures, the modeling is finished. Write the test list, get it reviewed, and hand over to the `test-driven-development` skill.

## Anti-patterns

| Anti-pattern | What it means |
| --- | --- |
| `"use client"` on a page, layout, or a feature's top component | Push the interactivity down to a leaf; keep the data fetching on the server |
| A page awaits `params`, `searchParams`, or data before any `<Suspense>` | Pass the promise into the component inside the boundary and await it there |
| `fetch` in `useEffect`, or a client data library, for data the server can render | Read in an async Server Component |
| A Client Component imports a data-reading or `async` component, or a value from a context | Pass the server-rendered content as `children`; pass DTO fields as props; `import type` only |
| Filters, sort, or pagination in `useState` | Put them in the URL and read `searchParams` on the server |
| Server data copied into `useState` or a store | Let the server render it; invalidate after a mutation |
| A derived value stored and synced with `useEffect` | Compute it with a pure function from `model/` |
| A whole record passed to a Client Component | Pass only the fields it shows; everything passed is sent to the browser |
| The UI re-implements a context's rule (availability, cancellation window, pricing) | Show what the context publishes and render its rejection |
| No rendering for the action rejecting a request | Browser validation is for usability; design the rejected state |
| A page fetches the app's own Route Handler | Call the context's query directly |
| A Server Action with a business rule or a database call in it | Parse, call one use case, map the result |
| `handleSubmit`, `setStatus("error")`, `processItem` | Name the user intent; model the outcome as a union |
| Boolean flags for workflow steps | A discriminated union of steps |
| A feature mirrors a bounded context instead of a user capability | Organise around the journey |
| Deep import into another feature or a context | Go through its `index.ts` |
| React or Next.js in `model/` | Keep the model pure |
| A component in `src/ui/` imports a domain concept | Move it to the feature that owns the concept |
| One `<Suspense>` around the whole page, or none | A boundary per slow or per-user part, so the rest renders at once |
