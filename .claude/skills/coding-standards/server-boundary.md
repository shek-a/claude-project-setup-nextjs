# Server boundary examples

Worked examples for `.claude/rules/server-boundary.md`: what a context publishes, and how Server Actions, cached reads, and Route Handlers bind to it.

## The context publishes its shapes once

```ts
// src/contexts/rentals/application/reserve-car.ts
import { z } from "zod";

export const ReserveCarCommandSchema = z.object({
  carId: CarIdSchema,
  startsAt: z.iso.datetime({ local: true }),   // what <input type="datetime-local"> posts: no offset
  endsAt: z.iso.datetime({ local: true }),
});
export type ReserveCarCommand = z.infer<typeof ReserveCarCommandSchema>;

export type ReserveCarError =
  | { kind: "car_unavailable"; carId: CarId }
  | { kind: "customer_ineligible"; reason: IneligibilityReason };   // derived from INELIGIBILITY_REASONS in domain/

export const RentalSummarySchema = z.object({
  id: RentalIdSchema,
  car: z.object({ displayName: z.string() }),
  status: z.enum(RENTAL_STATUSES),
  startsAt: z.iso.datetime({ local: true }),
  endsAt: z.iso.datetime({ local: true }),
  allowedActions: z.array(z.enum(RENTAL_ACTIONS)),
});
export type RentalSummary = z.infer<typeof RentalSummarySchema>;
```

```ts
// src/contexts/rentals/index.ts: the entire public surface
import "server-only";

export { reserveCar, cancelRental, findRentalSummary } from "@/contexts/rentals/composition";
export { ReserveCarCommandSchema, RentalSummarySchema } from "@/contexts/rentals/application/reserve-car";
export type { ReserveCarCommand, ReserveCarError, RentalSummary } from "@/contexts/rentals/application/reserve-car";
export { RentalIdSchema } from "@/contexts/rentals/domain/rental-id";
export type { RentalId } from "@/contexts/rentals/domain/rental-id";
```

`reserveCar(actor, command)` returns `Promise<Result<RentalSummary, ReserveCarError>>`. The UI and the actions import these; nobody writes a second copy of the shapes. A Client Component may `import type { RentalSummary }` from here: a type-only import is erased, so `server-only` is never loaded in the browser. It cannot import a value (a schema, a list of statuses); a Server Component passes those down as props.

## A Server Action is a thin adapter

**Violation:** the action trusts its arguments, holds a business rule, talks to the database, and throws a business outcome.

```ts
"use server";

export async function reserve(carId: string, userId: string, startsAt: string, endsAt: string) {
  const overlapping = await db.rental.count({ where: { carId, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } } });
  if (overlapping > 0) throw new Error("Car unavailable");          // a business outcome, thrown
  return db.rental.create({ data: { carId, userId, startsAt, endsAt } });   // userId came from the browser
}
```

**Fix:** read the actor from the session, parse, call one use case, map the result, invalidate.

```ts
// src/features/book-rental/model/reservation-state.ts
export type ReservationState =
  | { status: "idle" }
  | { status: "invalid"; fieldErrors: Partial<Record<keyof ReserveCarCommand, string[]>> }
  | { status: "rejected"; reason: ReserveCarError }
  | { status: "reserved"; rentalId: RentalId };
```

```ts
// src/features/book-rental/actions.ts
"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { reserveCar as reserveCarUseCase, ReserveCarCommandSchema } from "@/contexts/rentals";
import { requireActor } from "@/auth/session";
import { RENTALS_TAG, carAvailabilityTag } from "@/cache/tags";

export async function reserveCar(_previous: ReservationState, formData: FormData): Promise<ReservationState> {
  const actor = await requireActor();                                   // redirects to sign-in if there is none
  const parsed = ReserveCarCommandSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "invalid", fieldErrors: z.flattenError(parsed.error).fieldErrors };

  const result = await reserveCarUseCase(actor, parsed.data);
  if (!result.ok) return { status: "rejected", reason: result.error };

  updateTag(RENTALS_TAG);
  updateTag(carAvailabilityTag(parsed.data.carId));
  return { status: "reserved", rentalId: result.value.id };
}
```

The availability rule and the ownership check are in the `rentals` context, where the use case enforces them whoever calls it. When the action should navigate afterwards, call `redirect(ROUTES.rental(result.value.id))` as the last statement, after the `updateTag` calls and outside any `try`: it works by throwing.

## The form renders the action's state

```tsx
// src/features/book-rental/ui/reserve-car-form.tsx
"use client";

import { useActionState } from "react";
import { reserveCar } from "@/features/book-rental/actions";

export function ReserveCarForm({ carId }: ReserveCarFormProps) {
  const [state, formAction, isPending] = useActionState(reserveCar, { status: "idle" });

  return (
    <form action={formAction}>
      <input type="hidden" name="carId" value={carId} />
      <label htmlFor="startsAt">Pick-up</label>
      <input id="startsAt" name="startsAt" type="datetime-local" required aria-describedby="startsAt-error" />
      {state.status === "invalid" && <p id="startsAt-error">{state.fieldErrors.startsAt?.[0]}</p>}
      {state.status === "rejected" && <p role="alert">{reservationRejectionMessage(state.reason)}</p>}
      <button disabled={isPending}>Reserve car</button>
    </form>
  );
}
```

`<form action>` submits before JavaScript loads. `reservationRejectionMessage` is a pure function in the feature's `model/`, with an exhaustive `switch` over the failure `kind`, so a new failure fails to compile until it has a message.

## Cached reads, and tags defined once

**Violation:** the tag is typed in two places, so the action invalidates a tag nothing uses.

```ts
cacheTag(`car-availability-${id}`);   // in the read
updateTag(`car-availability:${id}`);   // in the action
```

**Fix:** one module owns the tags; the read and the write import it.

```ts
// src/cache/tags.ts
export const RENTALS_TAG = "rentals";
export const invoiceTag = (id: InvoiceId) => `invoice:${id}`;
export const carAvailabilityTag = (id: CarId) => `car-availability:${id}`;
```

```ts
// src/features/book-rental/queries.ts: the same for every visitor, so it can be cached
import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { findCarAvailability } from "@/contexts/fleet";

export async function getCarAvailability(id: CarId): Promise<CarAvailability | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(carAvailabilityTag(id));
  return findCarAvailability(id);
}
```

A read that depends on who is asking never goes in `"use cache"`: it would be served to the next person. Read the actor in the component, pass it to the context's query, which decides what that actor may see, and wrap the component in `<Suspense>` so the rest of the page does not wait for it:

```tsx
async function MyRentals() {
  const actor = await requireActor();
  const rentals = await listRentalsFor(actor);
  return <RentalsTable rentals={rentals} />;
}
```

When several components in one render need the same per-request read, wrap it in React's `cache()` in `queries.ts` so it runs once.

## Route Handlers are for other callers

**Violation:** the app's own page fetches the app's own API, adding a network hop and a second place to authorise.

```tsx
const response = await fetch(`${config.appUrl}/api/rentals/${id}`);
```

**Fix:** the page calls the query. A Route Handler exists only when something that is not this UI needs HTTP, and it is as thin as an action:

```ts
// src/app/api/webhooks/payments/route.ts
import { revalidateTag } from "next/cache";
import { recordPayment, RecordPaymentCommandSchema } from "@/contexts/billing";
import { PAYMENT_ERROR_STATUS } from "@/app/api/webhooks/payments/error-status";

export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  if (!isValidSignature(body, request.headers.get(SIGNATURE_HEADER))) return new Response(null, { status: 401 });

  const parsed = RecordPaymentCommandSchema.safeParse(JSON.parse(body));
  if (!parsed.success) return Response.json({ kind: "invalid_payload" }, { status: 400 });

  const result = await recordPayment(parsed.data);
  if (!result.ok) return Response.json(result.error, { status: PAYMENT_ERROR_STATUS[result.error.kind] });

  revalidateTag(invoiceTag(result.value.invoiceId), "max");   // updateTag works only in Server Actions
  return new Response(null, { status: 204 });
}
```

```ts
// src/app/api/webhooks/payments/error-status.ts: one table, checked against the failure union.
// HTTP statuses are a delivery detail, so the table lives with the route, not in the context.
export const PAYMENT_ERROR_STATUS = {
  payment_already_recorded: 409,
  invoice_not_found: 404,
} as const satisfies Record<RecordPaymentError["kind"], number>;
```

## One set of fixtures

**Violation:** the same summary invented in two tests, so both pass while they disagree.

```ts
const rental = { id: "r-1", carName: "VW Golf", status: "BOOKED" };                       // an action test
const rental = { id: "r-1", car: { displayName: "VW Golf" }, status: "booked" };          // a component test
```

**Fix:** a factory in the context's `testing/` folder, parsed through the DTO's schema so an invalid fixture fails where it is written.

```ts
// src/contexts/rentals/testing/fixtures.ts
export function aReservedRental(overrides: Partial<RentalSummary> = {}): RentalSummary {
  return RentalSummarySchema.parse({
    id: "b3f1c0de-0000-4000-8000-000000000001",
    car: { displayName: "VW Golf" },
    status: "booked",
    startsAt: "2026-10-01T09:00",
    endsAt: "2026-10-04T09:00",
    allowedActions: ["cancel"],
    ...overrides,
  });
}
```

Fixtures live in the context's `testing/` folder and are imported only by tests, never exported from `index.ts`, so test data never ships.

## Changing the boundary

Change the context, the action, and the component in the same change. What the compiler catches, and when:

| Change | Fails where |
|---|---|
| A DTO field is renamed or removed | The query that builds it and every component that reads it |
| A failure `kind` is added | The exhaustive `switch` that turns failures into messages, and any `ERROR_STATUS` table |
| A command field is added | The use case; the form is not caught by the compiler, so the journey test in `yarn test:e2e` is what proves it sends the field |
| A fixture no longer matches its schema | At runtime, the moment a test calls the factory |
