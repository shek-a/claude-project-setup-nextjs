# Integration tests

A passing unit test means the logic is correct. A passing integration test means the system is wired correctly at a boundary. Keep them separate.

## Scope
- Test the boundary: data is persisted and read back, messages are published and consumed, requests and responses map correctly.
- Don't retest business rules or their edge cases; domain and use-case tests own those.
- Use the real dependency. No mocks.

| Boundary | What to check |
|---|---|
| Database | Aggregates map to and from the schema; non-trivial queries (joins, filters, aggregations); transactions and rollback; unique and foreign-key constraints; migrations apply cleanly |
| External APIs | Request shape and response mapping; timeout, retry, and error handling |
| Message queues | Payload and routing on publish; processing and acknowledgement on consume; dead-letter routing |

## Conventions
- Name files `*.integration.test.ts` after the capability (`order-persistence.integration.test.ts`) and keep them beside the adapter they test in `infrastructure/`.
- Each test creates the data it needs with the domain factories (`aPaidOrder()`) and resets state in `beforeEach`, so tests pass in any order.
- Read connection settings from the Zod-parsed server config (`src/config/server.ts`), with the committed `.env.test` pointing at the Compose ports; CI uses the same file and the same Compose services.
- Run all: `yarn test:integration`. One file: `yarn vitest run --config vitest.integration.config.mts <path>`. Both need Docker running.
- The Stop hook runs only unit tests. Run the integration tests yourself before finishing any change to `infrastructure/`.

## Setup (once per project)
Docker Compose runs the infrastructure, started once by Vitest's `globalSetup`, so test files never manage containers and the same Compose file serves local runs and CI.

1. `docker-compose.integration.yml` at the repo root. Give every service a healthcheck:
   ```yaml
   services:
     postgres:
       image: postgres:17
       environment:
         POSTGRES_PASSWORD: test
       ports:
         - "5433:5432"   # not 5432, so it doesn't clash with a local Postgres
       healthcheck:
         test: ["CMD", "pg_isready", "-U", "postgres"]
         interval: 2s
         retries: 15
   ```
2. `test/integration-setup.ts` (add `test` to the tsconfig `include`). `--wait` blocks until every healthcheck passes; it needs Compose v2 (`docker compose`, not `docker-compose`):
   ```ts
   import { execSync } from "node:child_process";
   import { resolve } from "node:path";

   const composeFile = resolve(import.meta.dirname, "../docker-compose.integration.yml");

   export function setup(): void {
     execSync(`docker compose -f ${composeFile} up -d --wait`, { stdio: "inherit" });
   }

   export function teardown(): void {
     // Locally, leave containers running so the next run starts fast.
     if (process.env["CI"]) execSync(`docker compose -f ${composeFile} down`, { stdio: "inherit" });
   }
   ```
3. `vitest.integration.config.mts`:
   ```ts
   import { loadEnv } from "vite";
   import tsconfigPaths from "vite-tsconfig-paths";
   import { defineConfig } from "vitest/config";

   export default defineConfig({
     plugins: [tsconfigPaths()],
     test: {
       environment: "node",
       env: loadEnv("test", process.cwd(), ""),
       include: ["src/**/*.integration.test.ts"],
       globalSetup: ["./test/integration-setup.ts"],
       setupFiles: ["./src/testing/setup.ts"],   // stubs server-only
       testTimeout: 30_000,
     },
   });
   ```
4. The unit config (`vitest.config.mts`, in [server.md](server.md)) already excludes `*.integration.test.ts`, because the default `include` would match them.
5. Scripts in `package.json`:
   ```json
   "test": "vitest run",
   "test:integration": "vitest run --config vitest.integration.config.mts"
   ```
