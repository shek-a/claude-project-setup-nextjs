# React coding standards

Worked examples for `.claude/rules/ui/server-components.md` and `.claude/rules/ui/react.md`. Deciding a capability's server/client split, state, and actions is the `ui-modeling` skill.

## Server by default

**Violation:** `"use client"` on a whole page because one button needs a click handler. The page's data fetching moves to the browser and every import joins the bundle.

```tsx
"use client";

export default function RentalPage({ params }: { params: { id: string } }) {
  const [rental, setRental] = useState<RentalSummary | null>(null);
  useEffect(() => { void fetch(`/api/rentals/${params.id}`).then((r) => r.json()).then(setRental); }, [params.id]);
  return rental && <><RentalDetails rental={rental} /><button onClick={() => { cancel(rental.id); }}>Cancel</button></>;
}
```

**Fix:** the page stays on the server and awaits the data; only the button is a Client Component.

```tsx
// src/app/rentals/[id]/page.tsx: no await here, so the shell renders at once
export default function RentalPage({ params }: PageProps<"/rentals/[id]">) {
  return (
    <Suspense fallback={<RentalDetailsSkeleton />}>
      <RentalDetails params={params} />
    </Suspense>
  );
}

// src/features/manage-rentals/ui/rental-details.tsx: an async Server Component
export async function RentalDetails({ params }: RentalDetailsProps) {
  const rentalId = RentalIdSchema.safeParse((await params).id);
  if (!rentalId.success) notFound();                             // a malformed URL is a 404, not a crash

  const actor = await requireActor();
  const rental = await findRentalSummary(actor, rentalId.data);  // the context checks the actor may see it
  if (!rental) notFound();

  return (
    <article>
      <h1>{rental.car.displayName}</h1>
      {rental.allowedActions.includes("cancel") && <CancelRentalButton rentalId={rental.id} />}
    </article>
  );
}

// src/features/manage-rentals/ui/cancel-rental-button.tsx: the only client code
"use client";

export function CancelRentalButton({ rentalId }: CancelRentalButtonProps) {
  const [state, formAction, isPending] = useActionState(cancelRental.bind(null, rentalId), { status: "idle" });
  return (
    <form action={formAction}>
      <button disabled={isPending}>Cancel rental</button>
      {state.status === "rejected" && <p role="alert">{cancellationMessage(state.reason)}</p>}
    </form>
  );
}
```

## Server content inside client UI

**Violation:** a Client Component imports a component meant for the server. Importing from a client file makes that module and its imports client code: a build error if they are `server-only`, a runtime error if the component is `async`, and unnoticed bundle growth otherwise.

```tsx
"use client";
import { Cart } from "@/features/checkout";   // drags the cart's data access toward the browser

export function Modal() {
  const [isOpen, setIsOpen] = useState(true);
  return isOpen && <div role="dialog"><Cart /></div>;
}
```

**Fix:** the Client Component takes a slot; a Server Component fills it.

```tsx
"use client";
export function Modal({ children }: ModalProps) {
  const [isOpen, setIsOpen] = useState(true);
  return isOpen && <div role="dialog">{children}</div>;
}

// in a Server Component
<Modal><Cart /></Modal>
```

## State in the URL

**Violation:** filters in `useState`, so a reload or a shared link loses them, and the list has to be fetched in the browser.

```tsx
"use client";
const [status, setStatus] = useState<RentalStatus>("active");
const rentals = useRentals({ status });
```

**Fix:** the URL holds the filter; the server reads it and renders the list.

```tsx
// src/app/rentals/page.tsx
export default function RentalsPage({ searchParams }: PageProps<"/rentals">) {
  return (
    <Suspense fallback={<RentalsSkeleton />}>
      <Rentals searchParams={searchParams} />
    </Suspense>
  );
}

// src/features/manage-rentals/ui/rentals.tsx
export async function Rentals({ searchParams }: RentalsProps) {
  const filters = parseRentalFilters(await searchParams);   // Zod, in the feature's model/; falls back to defaults
  return (
    <>
      <RentalStatusTabs current={filters.status} />
      <RentalsTable filters={filters} />
    </>
  );
}

// a Server Component: plain links, no client state
export function RentalStatusTabs({ current }: RentalStatusTabsProps) {
  return RENTAL_STATUSES.map((status) => (
    <Link key={status} href={ROUTES.rentals({ status })} aria-current={status === current ? "page" : undefined}>
      {statusLabel(status)}
    </Link>
  ));
}
```

## Only safe, serialisable props cross to the client

**Violation:** the whole record goes to a Client Component, so every field is sent to the browser, including ones the user must not see.

```tsx
<CustomerBadge customer={customer} />   // customer has creditLimit, internalNotes, ...
```

**Fix:** the context's query returns a DTO with only publishable fields, and the component receives just what it shows.

```tsx
<CustomerBadge displayName={customer.displayName} tier={customer.tier} />
```

## No prop drilling

**Violation:** `user` threaded through layers that ignore it.

```tsx
<Page user={user}>
  <Sidebar user={user}>        {/* Sidebar doesn't use user... */}
    <Nav user={user}>          {/* ...nor Nav; it's only passing it through */}
      <Avatar user={user} />   {/* only Avatar needs it */}
```

**Fix (composition):** the parent that owns `user` composes the leaf, so the middle layers stay unaware of it.

```tsx
<Page>
  <Sidebar>
    <Nav>
      <Avatar user={user} />
```

**Fix (read where it is used):** a Server Component reads what it needs itself. Wrap a per-request read in React's `cache()` so two components asking for it in one render cost one read.

```tsx
// src/features/account/queries.ts
export const getCurrentUserSummary = cache(async () => findUserSummary(await requireActor()));

async function Avatar() {
  const user = await getCurrentUserSummary();
  return <Image src={user.avatarUrl} alt={user.displayName} width={32} height={32} />;
}
```

## Single responsibility

**Violation:** one component fetches, transforms, and renders.

```tsx
function UserProfile({ userId }: UserProfileProps) {
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    fetch(`/api/users/${userId}`)
      .then((response) => response.json())
      .then((raw) => { setUser({ ...raw, fullName: `${raw.first} ${raw.last}` }); });
  }, [userId]);
  return <div>{user?.fullName}</div>;
}
```

**Fix:** an async Server Component reads through the feature's query, which returns the model already shaped; the component only renders.

```tsx
async function UserProfile({ userId }: UserProfileProps) {
  const user = await getUserProfile(userId);
  return <div>{user.fullName}</div>;
}
```

## One level of abstraction

**Violation:** arithmetic, a pricing rule, formatting, and a raw request, mixed into the render.

```tsx
"use client";
function Checkout({ cart }: CheckoutProps) {
  const total = cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0) * 1.2;
  return (
    <form onSubmit={(event) => { event.preventDefault(); void fetch("/api/payments", { method: "POST" }); }}>
      <span>{new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(total)}</span>
    </form>
  );
}
```

**Fix:** the context prices the cart, the payment is a named Server Action, and formatting is a named function; the component only composes.

```tsx
async function Checkout({ cartId }: CheckoutProps) {
  const quote = await getCheckoutQuote(cartId);
  return (
    <>
      <span>{formatMoney(quote.total)}</span>
      <PayForCartForm cartId={cartId} />   {/* a small Client Component around the payForCart action */}
    </>
  );
}
```

## Naming and function style

**Violation:** a `React.FC` arrow component and a generic handler name.

```tsx
const RentalCard: React.FC<{ rental: RentalSummary }> = ({ rental }) => {
  const handleClick = () => { cancel(rental.id); };
  return <button onClick={handleClick}>Cancel rental</button>;
};
```

**Fix:** a function declaration with a props `interface`; the handler inside is a `const` arrow named for the intent, and the handler prop is `onX`. ESLint rejects arrow components and `React.FC`.

```tsx
interface RentalCardProps {
  rental: RentalSummary;
  onCancelRental: (id: RentalId) => void;
}

function RentalCard({ rental, onCancelRental }: RentalCardProps) {
  const handleCancelRental = () => { onCancelRental(rental.id); };
  return <button onClick={handleCancelRental}>Cancel rental</button>;
}
```

## Component size and scope

**Violation:** a 400-line `Dashboard` that fetches data, holds filter state, computes totals, and renders the header, filters, chart, and table.

**Fix:** `Dashboard` composes children that each own one slice. Each slow one gets its own `<Suspense>`, so they load independently and the rest of the page does not wait:

```tsx
function Dashboard() {
  return (
    <>
      <DashboardHeader />
      <RentalFilters />
      <Suspense fallback={<ChartSkeleton />}><UtilisationChart /></Suspense>
      <Suspense fallback={<TableSkeleton />}><RentalsTable /></Suspense>
    </>
  );
}
```

Extract a child when a block of JSX is reused, has its own state, or is a self-contained unit. A component taking more than about 5 to 7 props is doing too much: group related props into an object, or split it.

## Keys and immutability

**Violation:** the index as a key, so reordering or removing an item reuses the wrong component state.

```tsx
{rentals.map((rental, index) => <RentalCard key={index} rental={rental} onCancelRental={cancelRental} />)}
```

**Fix:** a stable, unique key from the data.

```tsx
{rentals.map((rental) => <RentalCard key={rental.id} rental={rental} onCancelRental={cancelRental} />)}
```

Never mutate props or state: produce new arrays and objects (`[...extras, extra]`, `{ ...draft, period }`), ideally through a named update function in `model/`.

## Constants for routes, cache tags, and storage keys

**Violation:** the same strings typed in several places.

```tsx
<Link href="/rentals/history">History</Link>
cacheTag(`car-availability-${id}`);     // in the query
updateTag(`car-availabilty-${id}`);     // in the action: a typo, so the page never refreshes
localStorage.getItem("theme");
```

**Fix:** define each once.

```ts
// src/routes.ts
export const ROUTES = {
  rentalHistory: "/rentals/history",
  rental: (id: RentalId) => `/rentals/${id}`,
} as const;

// src/cache/tags.ts
export const carAvailabilityTag = (id: CarId) => `car-availability:${id}`;
export const RENTALS_TAG = "rentals";

export const STORAGE_KEYS = { theme: "theme" } as const;
```

```tsx
<Link href={ROUTES.rentalHistory}>History</Link>
cacheTag(carAvailabilityTag(id));
updateTag(carAvailabilityTag(id));
```

## Effects

`useEffect` synchronises with systems outside React. It is an escape hatch, not a default; each misuse below costs an extra render and invites stale-closure bugs.

**Derived data:** compute it during render.

```tsx
// Violation
const [fullName, setFullName] = useState("");
useEffect(() => { setFullName(`${first} ${last}`); }, [first, last]);

// Fix
const fullName = `${first} ${last}`;
```

**Responding to an event:** do it in the handler.

```tsx
// Violation
useEffect(() => { if (isBreakdownOpen) track("price_breakdown_opened"); }, [isBreakdownOpen]);

// Fix
const handleOpenPriceBreakdown = () => { setIsBreakdownOpen(true); track("price_breakdown_opened"); };
```

**Resetting state when a prop changes:** remount with `key`.

```tsx
// Violation
useEffect(() => { setDraft(emptyDraft); }, [carId]);

// Fix
<BookingForm key={carId} carId={carId} />
```

**Fetching:** read in a Server Component, never `fetch` in an effect (see Server by default).

**A real effect** has something to undo, which is the cleanup test:

```tsx
useEffect(() => {
  const subscription = rentalUpdates.subscribe(rentalId, handleRentalUpdate);
  return () => { subscription.unsubscribe(); };
}, [rentalId, handleRentalUpdate]);
```

Give every effect its complete dependency list; ESLint checks it. If the list causes re-runs, stabilise the value or callback rather than dropping it.

## Custom hooks

Hooks exist only in Client Components. **Violation:** `useState` and `useEffect` for debouncing or a subscription scattered through the component body.

**Fix:** a hook whose name states the intent, so the component reads like prose.

```tsx
const debouncedSearch = useDebouncedValue(search, 300);
const isOnline = useOnlineStatus();
```

A hook that fetches server data is usually a sign the read belongs in a Server Component instead.
