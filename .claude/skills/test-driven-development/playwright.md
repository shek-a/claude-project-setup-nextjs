# Browser journeys

One Playwright suite, run against the real app. The universal discipline (test behavior, organize by capability, assert real values) is in [SKILL.md](SKILL.md); this file holds the Playwright mechanics.

```
e2e/                       # journeys            -> yarn test:e2e
playwright.config.ts
```

```
browser -> next start (production build) -> Server Components and Server Actions -> contexts -> Postgres (Docker Compose)
```

This suite is where async Server Components, pages, streaming, caching and revalidation, redirects, and forms working end to end are tested, because Vitest cannot render an async Server Component. It does not belong in `test`: the Stop hook runs that on every turn, and it must not need browsers or Docker. Run it yourself after changing a page, a journey, a Server Action, a Route Handler, or the app shell. `e2e/` must be in the tsconfig `include`, or the lint hook reports files it can't typecheck.

## Writing journeys

- **Test journeys, not pages.** A spec describes a journey a user would recognise (`booking-a-rental.spec.ts`), not one file per page or component.
- **User-facing locators.** `getByRole` with a name, then `getByLabel`, then text. Test IDs are a last resort, and CSS or XPath selectors never: `page.locator(".btn-primary")` breaks on restyling.
- **Web-first assertions, never hard waits.** `await expect(page.getByText("Your car is reserved")).toBeVisible()` retries until it passes or fails; `page.waitForTimeout(2000)` is flaky by construction. Assert absence with `await expect(locator).toHaveCount(0)`.
- **Each test sets up its own state**, so specs don't depend on order. Put shared setup in Playwright fixtures, and reuse a signed-in session with `storageState` rather than logging in through the UI in every test.
- **Assert what the server rendered after a write.** After submitting a form, reload or navigate and check the change is there: that proves the action invalidated the right cache tag, which no unit test can.
- **Earn the cost.** A browser test is slow. Cover each journey's happy path and the failures a user can actually reach (a rejection message, a not-found page). Leave input variants and edge cases to the use-case, action, and component tests, which cover them faster.

## Running against the real stack

- Run against a production build (`next build` then `next start`), not `next dev`: caching, prerendering, and streaming behave differently in development, and those are what this suite exists to check.
- Playwright starts `webServer` before `globalSetup`, and with Cache Components `next build` already runs cached reads. So the database must be up, migrated, and seeded before the build: the `test:e2e` script does that, not a Playwright hook.
  ```json
  "test:e2e": "docker compose -f docker-compose.integration.yml up -d --wait && dotenv -e .env.test -- sh -c 'yarn migrate && yarn seed:e2e && playwright test'"
  ```
  `yarn seed:e2e` truncates `app_test` and inserts what the journeys need (a bookable car, a customer); it refuses to run against a database whose name does not end in `_test`. Seeding is a script, so no test-only route reaches production code. `dotenv` is `dotenv-cli`; it gives the migration, the seed, the build, and the server the same test environment. Next.js does not override variables already set, so a `.env.local` pointing at `app_dev` cannot leak into the run.
- `webServer` builds and starts the app; `use.baseURL` points at it:
  ```ts
  // playwright.config.ts
  export default defineConfig({
    testDir: "./e2e",
    use: { baseURL: "http://localhost:3100" },
    webServer: {
      command: "yarn build && yarn start --port 3100",   // inherits the test environment from the script above
      url: "http://localhost:3100",
      reuseExistingServer: !process.env["CI"],
      timeout: 180_000,
    },
  });
  ```
- Genuinely external third parties (payment, email) are replaced at their adapter: the test environment points the adapter at a fake, chosen through the Zod-parsed server config, never by a test-only branch in a use case.
- When a journey fails but the unit tests pass, the pieces disagree: a form field the action does not parse, a cache tag nobody invalidates, a prop that did not survive the server-to-client boundary.
- Any change to a page, a Server Action, a command schema, or a DTO is unfinished until its journey passes. Green unit tests on each piece prove nothing about them together.
