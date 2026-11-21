---
paths:
  - "src/app/**/*.{ts,tsx}"
  - "src/features/**/*.{ts,tsx}"
  - "src/ui/**/*.{ts,tsx}"
---

# Server-first rendering rules

Render on the server unless a component needs the browser. `.claude/skills/coding-standards/react.md` has an example of each rule.

## Server by default
- A component is a Server Component unless it needs state, an event handler, an effect, or a browser API. Only then does its file start with `"use client"`.
- `"use client"` marks a boundary: everything the file imports joins the browser bundle. Put it on the smallest leaf that needs it (the `LikeButton`, not the `PostPage`), never on a page, a layout, or a feature's top component to make an error go away.
- When interactive UI wraps server-rendered content, the Client Component takes it as `children` or a slot prop (`<Modal><Cart /></Modal>`). It never imports a component that reads data or is `async`: importing from a client file makes a module client code, which is a build or runtime error for those and silent bundle growth for anything else.
- Props crossing from server to client must be serialisable and safe to publish: DTOs and primitives, never an aggregate, a function other than a Server Action, or anything from `src/config/server.ts`. Pass only the fields the component shows.
- Modules that must never reach the browser (contexts, `queries.ts`, server config) start with `import "server-only"`, so a wrong import fails the build instead of leaking.

## Data
- Fetch in Server Components, where the data is used: an `async` component awaits a context query. Do not fetch in `useEffect`, and do not add a client data-fetching library for data the server can render.
- Start independent reads together (`Promise.all`, or sibling components each in their own `<Suspense>`); never await them one after another by accident.
- A page stays thin: no business logic and no JSX beyond composition. `params` and `searchParams` are promises (type them with `PageProps<"/route">`). Awaiting them makes everything after it wait for the request, so pass the promise into the feature component inside `<Suspense>` and await and parse it there with Zod (`safeParse`, then `notFound()` for a malformed value), or give the segment a `loading.tsx`.
- Give every slow or per-user read a `<Suspense>` boundary with a fallback that matches the final layout, or a `loading.tsx` for the whole segment. The static shell around it should render without waiting.
- A missing record calls `notFound()`; an unexpected failure throws to the segment's `error.tsx` (a Client Component). Expected business outcomes are neither: render them.

## State
- State that should survive a reload or be shareable (filters, sort, page, selected tab, an open record) lives in the URL: read `searchParams` on the server, and change it with `<Link>` or `router.replace`. Never mirror it into `useState`.
- Server data is never copied into client state. After a mutation, invalidate and let the server render again.
- Client state is for interaction only (an open menu, an unsent draft, the step of a wizard), in the lowest component that needs it.
- Never read `window`, `localStorage`, or the clock during render in a component the server also renders; it causes a hydration mismatch. Read them in an effect or an event handler.

## Mutations
- Forms post to a Server Action: `<form action={formAction}>` with `useActionState` for the result and pending state, so the form still submits before JavaScript loads. Where there is no form (a toggle, a drag), call the action from an event handler inside `startTransition`; never `fetch` a route of your own.
- Show the action's state: field errors beside their fields, a named rejection as a message the user can act on, pending on the submit button. Use `useOptimistic` only when waiting would feel broken, and always handle the action rejecting.
- Client-side validation is for usability only; the action parses again and the use case decides.

## Next.js building blocks
- Navigate with `<Link>`; images use `next/image` with dimensions; fonts load through `next/font`; page titles and descriptions come from `metadata` or `generateMetadata`, never a hand-written `<head>`.
- Route paths are built by one module (`src/routes.ts`), never typed out at call sites.
- Request interception (`proxy.ts`) is for redirects and coarse gating only. It is not the authorisation check; the use case is.
