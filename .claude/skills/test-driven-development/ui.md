# Test-driven development for the UI

Test what the user sees and does, not how components are built. Which tool depends on where the component runs:

| Target | Tool | Approach |
|---|---|---|
| Client Components and their interactions | Vitest + React Testing Library + user-event | Render, interact, assert on visible output |
| Presentational components (no directive, not `async`) | Vitest + React Testing Library | Render with props built from the fixture factories |
| Pure logic (`model/` calculations, search-param parsing, action-state messages, formatters) | Vitest | Plain unit tests |
| Custom hooks | `renderHook` | Only when the logic is non-trivial; otherwise test through a component |
| `async` Server Components, pages, layouts, streaming, caching, redirects | Playwright, in `e2e/` | Vitest cannot render an async Server Component: read [playwright.md](playwright.md) |

- No snapshot tests.
- Keep async Server Components thin (await a query, pass the result to a presentational component) so the markup and its states are testable here and only the wiring is left to the journey.
- Cover the empty state and every state of an action (`invalid`, each named rejection, pending, done) for the components that render them. Loading (`loading.tsx`, `<Suspense>` fallbacks), `not-found`, and `error.tsx` are covered by the journey.

## Organize and place tests by capability

- A test file describes a user capability (`booking-a-rental.test.tsx`), not a component (`BookingForm.test.tsx`). It renders the capability's top renderable component and exercises its children together, as the user would.
- A leaf component with meaningful logic of its own can have a focused test, driven by behavior; "every file needs a test" is not a reason.
- Keep tests in the feature folder, beside the code they cover. No parallel `tests/` tree.
- Playwright journeys live in `e2e/`, which must be in the tsconfig `include` (the lint hook flags files outside it).

Test names read as requirements the user would recognize:

```tsx
describe("booking a rental", () => {
  it("shows a validation error when no pick-up time is chosen");
  it("disables the reserve button while the reservation is being made");
  it("reserves the car and shows the confirmation");
  it("tells the customer the car is no longer available when the reservation is rejected");
});
```

## Test behavior, not implementation

A test that breaks when you rename a state variable, extract a child component, or change a CSS class is testing implementation; rewrite it.

**Bad:** internal state and DOM structure.

```tsx
expect(wrapper.state("isOpen")).toBe(true);
expect(container.querySelector(".modal")).toBeTruthy();
```

**Good:** what the user perceives.

```tsx
const user = userEvent.setup();
render(<CancelRentalButton rentalId={rentalId} />);
await user.click(screen.getByRole("button", { name: "Cancel rental" }));
expect(screen.getByRole("dialog", { name: "Cancel this rental?" })).toBeInTheDocument();
```

## Render the real tree; fake only the server boundary

Don't shallow-render, and never mock child components or hooks. In a Client Component test the boundary is the Server Action it calls: mock the feature's `actions` module, make it return each state of the action's union, and assert on what the user sees and on what the action received. If a test seems to need a mock inside the tree, the component has too many responsibilities.

**Bad:**

```tsx
vi.mock("@/features/book-rental/ui/price-summary");   // hides the real integration
vi.mock("react", async (original) => ({ ...(await original()), useActionState: vi.fn() }));   // tests the mock, not the form
```

**Good:** the real form, the real `useActionState`, a faked action.

```tsx
vi.mock("@/features/book-rental/actions", () => ({ reserveCar: vi.fn() }));

it("tells the customer the car is no longer available when the reservation is rejected", async () => {
  vi.mocked(reserveCar).mockResolvedValue({ status: "rejected", reason: { kind: "car_unavailable", carId } });
  const user = userEvent.setup();
  render(<ReserveCarForm carId={carId} />);

  await user.type(screen.getByLabelText("Pick-up"), "2026-10-01T09:00");
  await user.click(screen.getByRole("button", { name: "Reserve car" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("That car has just been booked by someone else");
});
```

Components that use `next/navigation` hooks (`useRouter`, `useSearchParams`, `usePathname`) need them mocked, since there is no router in a unit test. Prefer not needing them: a link built from `ROUTES` and state read from props keeps a component a plain function of its inputs.

## React Testing Library practices

- Query in this order: `getByRole` with a `name`; `getByLabelText` for form fields; `getByText` or `getByDisplayValue`; `getByTestId` only when nothing accessible exists. Never `container.querySelector`.
- Query through `screen`, not the object `render` returns.
- Interact with `userEvent.setup()` and `await` every interaction; not `fireEvent`.
- `getBy*` when the element is there now; `queryBy*` only to assert absence; `findBy*` when it appears asynchronously.
- Wait with `findBy*`, or `waitFor` around an assertion, never a timeout. Keep side effects out of `waitFor`.
- Assert with jest-dom matchers (`toBeInTheDocument`, `toBeDisabled`, `toHaveValue`), registered once in the setup file with `import "@testing-library/jest-dom/vitest"`.

## Verify what was sent, not that something was called

Assert on the exact values that crossed a boundary: a callback prop's arguments, or the form data the action received. Never `expect.anything()`; it hides a component wiring the wrong field.

**Bad:**

```tsx
expect(reserveCar).toHaveBeenCalledWith(expect.anything(), expect.anything());
```

**Good:** read the `FormData` the action was called with.

```tsx
await user.click(screen.getByRole("button", { name: "Reserve car" }));

const [, formData] = vi.mocked(reserveCar).mock.calls[0] ?? [];
expect(Object.fromEntries(formData ?? [])).toEqual({ carId, startsAt: "2026-10-01T09:00", endsAt: "2026-10-04T09:00" });
```

That the action then parses those fields and calls the use case is the action test's job ([server.md](server.md)); that the whole chain works in a browser is the journey's ([playwright.md](playwright.md)).
