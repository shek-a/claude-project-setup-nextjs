# <Context name>

## Purpose
One paragraph: what this context is responsible for and what it is not.

Subdomain: core | supporting | generic

## Ubiquitous language
| Term | Meaning | Not to be confused with |
|---|---|---|

## Aggregates
### <Aggregate>
- Identity:
- Invariants (always true):
- Operations (commands it accepts):
- Domain events it raises:

## Value objects
| Name | Validation rules |
|---|---|

## Use cases
| Use case or query | Actor | Entry point (Server Action and its feature, a page's read, or a Route Handler with method and path) | Command schema | Result (DTO) | Named failures (with HTTP status if a Route Handler) |
|---|---|---|---|---|---|

## Public interface
The UI and other contexts use this context only through `src/contexts/<context>/index.ts`, which exports use cases, DTOs, and the domain events it publishes, never aggregates or entities.
- Exposes (use cases and queries, with the DTOs they take and return):
- Publishes (domain events, past tense, each with its payload and the contexts that consume it):

| Other context | Upstream or downstream | Command or event | Conform or translate |
|---|---|---|---|

## Rule placement
Every rule and edge case this context owns, and its owner: an invariant of a named aggregate, a value object's validation, a rule spanning several aggregates, or a reaction to a named event. Rules live in `domain/`; use cases and handlers hold none. A check in the UI is for usability only and never replaces the context's. Whether a rule sits on an entity or in a domain service is settled in TDD, not here.

| Rule | Owner | UI check (usability only) |
|---|---|---|

## Test list
- Domain:
- Application:
- UI:

## Out of scope
