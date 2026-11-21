# Test-driven development on the server

Work outside-in: start a feature with one failing use-case test, then drive the domain with unit tests until it passes. The Server Action comes last and is the thinnest test.

| Layer | What to test | Doubles | Share of tests |
|---|---|---|---|
| domain | Aggregate invariants, value object validation, domain events raised | None; pure objects | Most |
| application | Use case orchestration and returned results; who may do what | Mocked repositories returning real aggregates | Some |
| infrastructure | Repository and adapter behavior against the real dependency | None: real DB in Docker Compose; read [integration.md](integration.md) | Few |
| Server Actions, Route Handlers | Input parsing, the mapping from `Result` to action state or HTTP status, what gets invalidated, that an unauthenticated call is refused | The context's public interface, the session, and `next/cache` | Few |

- Mock at the persistence layer: put a typed mock factory next to each repository interface (`mockOrderRepository()`) instead of hand-rolling mocks per test. Mocked finds return real aggregates built with the factory functions below, never mocked domain objects.
- Build test data with small factory functions named in domain terms (`aPaidOrder()`), not large literals. For anything the UI sees, use the fixture factories in the context's `testing/` folder, so component and journey tests see the same data.
- Keep each capability's test file beside the code of the layer it tests. A use case is one capability: `cancel-order.ts` → `cancel-order.test.ts`.
- Nothing in `domain/` or `application/` imports Next.js, so those tests need no framework mocks. If one seems to, the code has reached outside its layer.

## Server Actions and Route Handlers

Call the exported function directly; it is an ordinary async function. Mock only what sits on the other side of a boundary: the context's `index.ts`, the session reader, and the framework's cache and navigation functions.

```ts
// src/features/book-rental/actions.test.ts
vi.mock("next/cache", () => ({ updateTag: vi.fn() }));
vi.mock("@/auth/session", () => ({ requireActor: vi.fn() }));
vi.mock("@/contexts/rentals", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/contexts/rentals")>()),   // keep the real schemas
  reserveCar: vi.fn(),
}));

describe("reserving a car", () => {
  it("passes the signed-in customer and the parsed period to the use case", async () => {
    vi.mocked(requireActor).mockResolvedValue(aCustomer);
    vi.mocked(reserveCarUseCase).mockResolvedValue(ok(aReservedRental()));

    await reserveCar({ status: "idle" }, reservationForm({ carId, startsAt, endsAt }));

    expect(vi.mocked(reserveCarUseCase).mock.calls[0]).toEqual([aCustomer, { carId, startsAt, endsAt }]);
  });

  it("tells the customer the car is unavailable when the use case rejects the reservation", async () => {
    vi.mocked(reserveCarUseCase).mockResolvedValue(err({ kind: "car_unavailable", carId }));

    const state = await reserveCar({ status: "idle" }, reservationForm({ carId, startsAt, endsAt }));

    expect(state).toEqual({ status: "rejected", reason: { kind: "car_unavailable", carId } });
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("returns field errors and never calls the use case when the period is missing");
  it("refreshes the rentals list and the car's availability after reserving", async () => {
    // ...
    expect(vi.mocked(updateTag).mock.calls).toEqual([[RENTALS_TAG], [carAvailabilityTag(carId)]]);
  });
});
```

- The partial mock above imports the real context to keep its schemas, so a context's `composition.ts` must not open connections at import time: create database and API clients lazily, on first use. It also loads `src/config/server.ts`, which parses the environment on import, so the Vitest config below supplies test values.
- Assert on the exact arguments the use case received, taken from `mock.calls`; never `expect.anything()`.
- `redirect()` and `notFound()` work by throwing. Mock `next/navigation` so `redirect` throws a recognisable error, and assert the action rejects with it and that the invalidation happened first.
- A Route Handler test builds a `Request`, calls `POST(request)`, and asserts on the `Response` status and JSON body.
- An action test proves the adapter. That the form posts the right fields, and that the page shows the result, is proved by the component test and the journey ([ui.md](ui.md), [playwright.md](playwright.md)).

## Setup (once per project)

`server-only` throws when imported outside a server build, so stub it for Vitest in the setup file. Vitest does not load `.env` files into `process.env` by itself, so the config loads `.env.test` (committed, with no real secrets: local ports and dummy keys only; add `!.env.test` to `.gitignore`):

```ts
// src/testing/setup.ts
import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

vi.mock("server-only", () => ({}));
```

```ts
// vitest.config.mts
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { loadEnv } from "vite";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    env: loadEnv("test", process.cwd(), ""),   // .env.test into process.env, every variable
    setupFiles: ["./src/testing/setup.ts"],
    exclude: [...configDefaults.exclude, "**/*.integration.test.ts", "e2e/**"],
  },
});
```
