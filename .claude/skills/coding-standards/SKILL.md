---
name: coding-standards
description: Worked examples (violation and fix) for every rule in .claude/rules/typescript.md, .claude/rules/ui/server-components.md, .claude/rules/ui/react.md, .claude/rules/ui/tailwind.md, and .claude/rules/server-boundary.md, covering SOLID, DRY, YAGNI, and KISS applied pragmatically, one level of abstraction, named predicates, discriminated unions for state, one source per set of values, satisfies, branded IDs, narrowing over `as`, Result for business failures, Zod at the boundary, @/ imports, no enums, configuration from the environment, Server and Client Components, state in the URL, React components, effects, and keys, Tailwind components, cva variants, cn(), and theme tokens, and Server Actions, cached reads, and Route Handlers bound to what a context publishes. Use in the refactor step of the test-driven-development skill, when reviewing TypeScript, or when unsure how to apply one of those rules.
---

# Coding standards

Worked examples for the rules in `.claude/rules/typescript.md`, in the same order. The rules are the authority; these show what following them looks like. `tsconfig.base.json` and ESLint already enforce strict typing, no `any`, `interface` for object shapes, exhaustive switches, and explicit return types on context and Server Action exports, so those need no examples.

React examples (Server and Client Components, state in the URL, components, hooks, effects, prop drilling, keys, naming) are in [react.md](react.md); Tailwind examples (extraction, `cva`, `cn()`, theme tokens, accessibility) are in [tailwind.md](tailwind.md); server boundary examples (what a context publishes, Server Actions, cached reads, Route Handlers, fixtures) are in [server-boundary.md](server-boundary.md).

## Design

### Principles, applied pragmatically

Apply design patterns (Gang of Four), SOLID, DRY, YAGNI, and KISS **pragmatically**: introduce a pattern only when the problem in front of you calls for it. Never apply them mechanically or speculatively.

**Violation:** a strategy interface and a factory for the one pricing rule the business has.

```ts
interface PricingStrategy { price(rental: Rental): Money }
class PricingStrategyFactory { create(kind: PricingKind): PricingStrategy { ... } }
```

**Fix:** a function. Introduce the strategy when a second pricing rule arrives and the tests show the duplication.

```ts
function calculateRentalPrice(rental: Rental): Money { ... }
```

DRY is about knowledge, not text. Two functions that look alike but change for different business reasons are not duplication; merging them couples two rules that will diverge.

### Single responsibility

Every class, function, component, and hook has exactly one reason to change. If a unit does validation **and** pricing **and** formatting, split it: each piece owns one concept.

**Violation:**

```ts
function processRental(car: Car, customer: Customer): string {
  // checks eligibility, calculates the price, formats a receipt: three reasons to change
}
```

**Fix:** `checkRentalEligibility()`, `calculateRentalPrice()`, `formatReceipt()`, one concept each.

### One level of abstraction

A function either orchestrates or does low-level work. Never both.

**Violation:**

```ts
function checkout(cart: Cart, customer: Customer): void {
  for (const item of cart.items) { /* raw loop logic */ }
  sendEmail(customer.email, `Dear ${customer.name}...`); // low-level detail
  updateInventory(cart);
}
```

**Fix:** `checkout` only orchestrates; the details move into named steps.

```ts
function checkout(cart: Cart, customer: Customer): void {
  applyCartItems(cart);
  sendConfirmationEmail(customer);
  updateInventory(cart);
}
```

### When a complexity cap trips

ESLint caps cyclomatic complexity at 8. Every `case` counts, so an exhaustive switch that only maps a value fails once the union grows past about eight members.

**Violation:** complexity 10, and it grows with every new failure.

```ts
export function reservationRejectionMessage(error: ReserveCarError): string {
  switch (error.kind) {
    case "car_unavailable": return "That car has just been booked by someone else.";
    case "customer_ineligible": return "Your account can't make this booking.";
    case "period_invalid": return "Choose a return time after the pick-up time.";
    case "payment_declined": return "Your payment was declined.";
    case "licence_expired": return "Your driving licence has expired.";
    case "car_off_fleet": return "That car is no longer available to rent.";
    case "overdue_returns": return "Return your overdue car before booking another.";
    case "branch_closed": return "The branch is closed at that time.";
    case "quote_expired": return "That price has expired. Check the new price and try again.";
  }
}
```

**Fix:** a lookup table. Complexity 1, the pairs read as data, and `satisfies` still requires an entry for every member of the union.

```ts
const REJECTION_MESSAGE = {
  car_unavailable: "That car has just been booked by someone else.",
  customer_ineligible: "Your account can't make this booking.",
  period_invalid: "Choose a return time after the pick-up time.",
  payment_declined: "Your payment was declined.",
  licence_expired: "Your driving licence has expired.",
  car_off_fleet: "That car is no longer available to rent.",
  overdue_returns: "Return your overdue car before booking another.",
  branch_closed: "The branch is closed at that time.",
  quote_expired: "That price has expired. Check the new price and try again.",
} as const satisfies Record<ReserveCarError["kind"], string>;

export function reservationRejectionMessage(error: ReserveCarError): string {
  return REJECTION_MESSAGE[error.kind];
}
```

### Named predicates

**Violation:**

```ts
if (car.status === "available" && !customer.hasOverdueRentals && customer.licenseExpiry > now) {
```

**Fix:**

```ts
if (isEligibleForRental(car, customer, now)) {
```

### Ubiquitous language, not generic names

**Violation:**

```ts
class RentalManager {
  updateData(info: RentalInfo): void { ... }
}
```

**Fix:** name the business operation (see the `domain-driven-design` skill).

```ts
rental.returnCar(returnedAt);
```

### Clean code

- Name variables and functions so the code reads like prose; a reader should understand intent without comments.
- Minimize cognitive load: short functions, few parameters (ESLint caps them at 3), no surprise side effects.
- Prefer explicit over clever. If a future reader would pause to decode it, rewrite it.

## Types

### Discriminated unions for state

**Violation:** which flag combinations are valid? The type doesn't say.

```ts
interface Rental {
  isActive: boolean;
  isReturned: boolean;
  pickedUpAt?: Date;
  returnedAt?: Date;
}
```

**Fix:** each state carries exactly the data it has.

```ts
type RentalState =
  | { kind: "booked" }
  | { kind: "active"; pickedUpAt: Date }
  | { kind: "returned"; pickedUpAt: Date; returnedAt: Date };
```

### One source for each set of values

**Violation:** the same set declared twice, already drifted.

```ts
type CarStatus = "available" | "rented";                          // in the fleet context
const CAR_STATUSES = ["available", "rented", "in_maintenance"];   // in a filter component
```

**Fix:** declare the set once and derive the type from it. A Zod enum exported from the owning context's `index.ts` when it is parsed from input or shown by the UI; otherwise an `as const` array.

```ts
export const CarStatusSchema = z.enum(["available", "rented", "maintenance"]);
export type CarStatus = z.infer<typeof CarStatusSchema>;

const ROLES = ["admin", "customer", "agent"] as const;
type Role = (typeof ROLES)[number]; // "admin" | "customer" | "agent"
```

Once the type is a union, comparing against a literal is checked: `car.status === "availble"` is a compile error, so no separate constant is needed for a single value.

The set lives in the module of the concept it belongs to, as the `domain/` folder is grouped, and owns the subsets the domain names. A set that exists only as a type union has no runtime home, so the next lookup table or test spells it out again.

**Violation:** the event kinds exist only in the union, and a test relists the ones billing cares about, untyped.

```ts
export type RentalEvent = { kind: "car_booked"; … } | { kind: "car_returned"; … } | { kind: "car_returned_late"; … };   // domain/events.ts
const billable = ["car_returned", "car_returned_late"];                                                           // a test file
```

**Fix:** the set and its named subset beside the type, declared once; the subset is annotated with the set's type rather than declared `as const`, so a misspelled member fails to compile and `includes` accepts any member of the set. Tests import them.

```ts
// src/contexts/rentals/domain/events.ts
export const RENTAL_EVENT_KINDS = ["car_booked", "car_returned", "car_returned_late"] as const;
export type RentalEventKind = (typeof RENTAL_EVENT_KINDS)[number];
/** The events billing reacts to: a named subset, declared once beside its set. */
export const BILLABLE_EVENT_KINDS: readonly RentalEventKind[] = ["car_returned", "car_returned_late"];
```

A shared test value, such as a hold decision every test sends, comes from the test builders in `domain/testing/`, not from a `const` at the top of each test file.

### No enums

**Violation:** an `enum` emits runtime code, is not a plain union, and cannot be derived from or checked against a Zod schema.

```ts
enum CarStatus { Available = "available", Rented = "rented" }
```

**Fix:** the Zod enum or `as const` array above gives the same autocomplete and a derived union type. ESLint rejects `enum`.

### Strings that carry meaning

A meaningful string is defined once, wherever it is used on either side.

**Violation:** the event name is retyped by every subscriber. A rename fixes one of them and silently breaks the rest.

```ts
await queue.publish("rental.booked", payload);     // rentals
await queue.subscribe("rental.booked", handler);   // billing, retyped
```

**Fix:** the context that owns the name owns the constant.

```ts
// src/contexts/rentals/domain/events.ts
export const RENTAL_EVENTS = {
  booked: "rental.booked",
  returned: "rental.returned",
} as const;
```

```ts
await queue.publish(RENTAL_EVENTS.booked, payload);
await queue.subscribe(RENTAL_EVENTS.booked, handler);
```

The UI equivalents are route paths, cache tags, search-param names, and storage keys; see [react.md](react.md) and [server-boundary.md](server-boundary.md).

Two things are **not** magic strings. A value whose type is a literal union is already checked, so `status === "available"` needs no constant. And Tailwind class strings become a component, never a constant ([tailwind.md](tailwind.md)).

### `satisfies`

**Violation:** the annotation widens the keys, so a missing or misspelt car class goes unnoticed.

```ts
const DAILY_RATE: Record<string, number> = { economy: 40, premium: 90 };
```

**Fix:** every `CarClass` must have a rate, and the literal type is kept.

```ts
type CarClass = "economy" | "premium" | "van";
const DAILY_RATE = { economy: 40, premium: 90, van: 70 } satisfies Record<CarClass, number>;
```

### Branded IDs

**Violation:** plain strings can be swapped, and `as` creates a brand without checking anything.

```ts
function reserveCarForCustomer(customerId: string, carId: string): void { ... }
const carId = formData.get("carId") as CarId;
```

**Fix:** brands defined with Zod in the context that owns them and exported from its `index.ts`; the only way to get one is to parse.

```ts
export const CustomerIdSchema = z.uuid().brand<"CustomerId">();
export type CustomerId = z.infer<typeof CustomerIdSchema>;
export const CarIdSchema = z.uuid().brand<"CarId">();
export type CarId = z.infer<typeof CarIdSchema>;

const carId = CarIdSchema.parse(formData.get("carId"));
reserveCarForCustomer(customerId, carId);
reserveCarForCustomer(carId, customerId); // compile error: arguments swapped
```

### Narrowing over `as`

**Violation:** nothing guarantees the list is non-empty; `noUncheckedIndexedAccess` was warning about exactly this.

```ts
const next = upcomingBookings[0] as Booking;
```

**Fix:** narrow, and handle the case the type is pointing at.

```ts
const next = upcomingBookings[0];
if (next === undefined) return noUpcomingBooking();
```

Use a type predicate to narrow your own unions:

```ts
type ActiveRental = Extract<RentalState, { kind: "active" }>;
const active = states.filter((state): state is ActiveRental => state.kind === "active");
```

When `as` is genuinely unavoidable, the comment says why it is safe:

```ts
// Object.keys returns string[]; DAILY_RATE satisfies Record<CarClass, number>, so every key is a CarClass.
const carClasses = Object.keys(DAILY_RATE) as CarClass[];
```

## Imports

### The `@/` alias

**Violation:** relative paths break when files move and hide where the code lives.

```ts
import { parseRentalFilters } from "../../model/rental-filters";
```

**Fix:** import through `@/` (ESLint enforces this under `src/`).

```ts
import { parseRentalFilters } from "@/features/manage-rentals/model/rental-filters";
```

`create-next-app` sets the alias up in `tsconfig.json`, and Next.js resolves it at build time:

```jsonc
// tsconfig.json
{ "extends": "./tsconfig.base.json", "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }
```

Vitest needs to be told once, with `vite-tsconfig-paths` in `vitest.config.mts`.

## Errors and input

### `Result` for business failures

The examples assume this shape, defined once in `src/contexts/shared-kernel` (or a library such as neverthrow):

```ts
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
```

**Violation:** an expected outcome thrown as an exception, invisible in the signature.

```ts
function rentCar(car: Car, customer: Customer, period: RentalPeriod): Rental {
  if (!car.isAvailableFor(period)) throw new Error("Car not available");
  ...
}
```

**Fix:** the failure is a named case in the return type, and the Server Action passes it to the form as a state the user can act on. A missing case is a lint error.

```ts
type RentCarError =
  | { kind: "car_unavailable"; carId: CarId }
  | { kind: "customer_ineligible"; reason: IneligibilityReason };

function rentCar(car: Car, customer: Customer, period: RentalPeriod): Result<Rental, RentCarError> { ... }

function rentalRejectionMessage(error: RentCarError): string {
  switch (error.kind) {
    case "car_unavailable":
      return "That car has just been booked by someone else.";
    case "customer_ineligible":
      return ineligibilityMessage(error.reason);
  }
}
```

### Exceptions are for infrastructure failures and bugs

Give them a class, and keep the original error as `cause`. `Error.captureStackTrace` is unnecessary.

```ts
class PaymentGatewayUnavailable extends Error {
  override readonly name = "PaymentGatewayUnavailable";
}

try {
  await gateway.charge(payment);
} catch (error: unknown) {
  throw new PaymentGatewayUnavailable("Payment gateway did not respond", { cause: error });
}
```

### Zod at the boundary

**Violation:** untrusted input checked by hand and cast; nothing verifies that `name` is a string.

```ts
function createCustomer(body: unknown): Customer {
  if (typeof body === "object" && body !== null && "name" in body) {
    const { name } = body as { name: string };
    ...
  }
}
```

**Fix:** parse with the context's schema at the edge; inside the boundary, trust the type.

```ts
const parsed = CreateCustomerCommandSchema.safeParse(Object.fromEntries(formData));
if (!parsed.success) return { status: "invalid", fieldErrors: z.flattenError(parsed.error).fieldErrors };
return toCustomerState(await createCustomer(actor, parsed.data));
```

### Configuration from the environment

**Violation:** a hardcoded fallback works on one machine and is silently wrong everywhere else.

```ts
const databaseUrl = process.env.DATABASE_URL ?? "postgres://localhost:5432/app";
```

**Fix:** parse the environment once. A missing or malformed variable fails at boot with its name, not at the first request.

```ts
// src/config/server.ts: everything the server needs, secrets included
import "server-only";
import { z } from "zod";

const ServerEnvSchema = z.object({
  DATABASE_URL: z.url(),
  SESSION_SECRET: z.string().min(32),
});
export const serverConfig = ServerEnvSchema.parse(process.env);
```

```ts
// src/config/public.ts: only what the browser may know
import { z } from "zod";

const PublicEnvSchema = z.object({ NEXT_PUBLIC_APP_URL: z.url() });

// Each variable is written out in full: Next.js replaces `process.env.NEXT_PUBLIC_APP_URL` with its value at
// build time, and cannot do that for `process.env[name]` or a destructured `process.env`.
export const publicConfig = PublicEnvSchema.parse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});
```

```ts
// src/env.d.ts: lets the dot access above typecheck under noPropertyAccessFromIndexSignature
declare namespace NodeJS {
  interface ProcessEnv {
    NEXT_PUBLIC_APP_URL?: string;
  }
}
```

Everything else imports `serverConfig` or `publicConfig`; `src/config/` is the only place allowed to touch `process.env`, and ESLint enforces that.

**Violation:** an unvalidated read in a component, far from startup.

```tsx
const timeout = Number(process.env.NEXT_PUBLIC_TIMEOUT_MS ?? 5000);
```

**Fix:**

```tsx
import { publicConfig } from "@/config/public";

const timeout = publicConfig.NEXT_PUBLIC_TIMEOUT_MS;
```

Commit `.env.example` with a working local value for every variable in the schemas, and never commit `.env`. Values that aren't environment-specific (route paths, domain values) stay in code.

Only `NEXT_PUBLIC_`-prefixed variables reach the browser, and they are compiled into the JavaScript it downloads, fixed at build time: no secret belongs there. Secrets stay in `serverConfig`, which `server-only` keeps out of any Client Component, and come from the platform's environment.
