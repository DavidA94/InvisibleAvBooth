---
inclusion: always
---

# Testing Strategy

This document defines how testing is approached across Invisible A/V Booth. It covers tooling, structure, and conventions — not what to test. Specific test cases and correctness properties live in feature specs.

---

## Definition of Done

Tests are part of every story's definition of done — not a separate phase. Unit tests follow the unit or component they cover. Integration tests close each backend story. A feature task is not complete until its associated test task passes.

---

## Stack

| Layer               | Tool                           | Scope                                                                      |
| ------------------- | ------------------------------ | -------------------------------------------------------------------------- |
| Unit & component    | Vitest + React Testing Library | Logic, hooks, components — both packages                                   |
| Property-based      | Vitest + fast-check            | Correctness properties (a form of unit test, not a separate layer)         |
| Backend integration | Vitest                         | Full path from REST/Socket.io API boundary → real SQLite + mocked hardware |
| Frontend E2E        | Playwright                     | Full user flows in the browser, mocked backend (HTTP + WebSocket)          |

**Why two integration layers**: Backend integration tests (Vitest) verify that routes, services, and the database work together correctly — no browser involved. Frontend E2E tests (Playwright) verify that the UI drives the correct HTTP and WebSocket calls and responds correctly to server events — no real backend involved. These are complementary, not redundant.

---

## Unit & Component Tests (Vitest + RTL)

Each package manages its own `vitest.config.ts`. Test files live alongside the code they test (`AudioWidget.tsx` → `AudioWidget.test.tsx`).

### Coverage

- Minimum thresholds: **90% lines, branches, and statements**
- Enforced as a hard CI failure
- Measured per-package, not as a monorepo aggregate

### React Testing Library

- Test behavior, not implementation — query by role, label, or `data-testid`, never by class or internal state
- Use `@testing-library/user-event` for all interactions (not `fireEvent`)
- Prefer `screen` queries over destructured render results

### Backend Unit Tests

- Use Vitest with `environment: "node"`
- Mock external device clients at the abstraction layer boundary — never mock internal logic
- Test state reconciliation, error handling, and command routing

### Property-Based Tests

- Use `fast-check` within Vitest — same test file as the unit under test
- Apply where the design doc specifies correctness properties (e.g., template interpolation in `SessionManifestService`)
- Property-based tests are unit tests; they do not require a separate file or test run

---

## Backend Integration Tests (Vitest)

Backend integration tests exercise the full path from the API boundary (REST endpoint or Socket.io event) through services and down to the database or mocked hardware. No browser is involved.

### Boundaries

- **Real**: SQLite database (in-memory or temp file), EventBus, all service logic
- **Mocked**: External hardware clients (obs-websocket), bcrypt timing (use synchronous mock to keep tests fast), file system side effects where needed

### Structure

Integration test files live alongside the route or gateway they test:

```
packages/backend/
  src/
    routes/
      authRoutes.ts
      authRoutes.integration.test.ts   ← or authRoutes.test.ts if no unit test exists for the same file
    gateway/
      socketGateway.ts
      socketGateway.integration.test.ts
```

### Conventions

- Each backend story closes with an integration test that covers the happy path and key failure cases end-to-end
- Use a fresh in-memory SQLite database per test file (or per test if state isolation requires it)
- Mock obs-websocket at the client constructor boundary — never mock internal OBS service logic
- Integration tests for Socket.io use a real Socket.io server bound to a random port; connect a real Socket.io client in the test

---

## Frontend E2E Tests (Playwright)

Playwright handles both HTTP (REST) and WebSocket (Socket.io) mocking natively — no stub server needed.

- HTTP mocked via `page.route()`
- WebSocket mocked via `page.routeWebSocket()`
- Test files are named by user flow, not by component: `obs-stream-start-flow.spec.ts`

### Structure

```
packages/frontend/
  playwright/
    e2e/                    ← test files, named by user flow
    fixtures/
      payloads/             ← typed payload factories, one file per domain
    support/
      routes/               ← shared route handlers (HTTP + WebSocket), one file per domain
      helpers.ts
  playwright.config.ts
```

### Backend Mocking

All backend communication is mocked — no real backend runs during Playwright tests.

- HTTP (REST) requests are mocked via `page.route()`
- WebSocket (Socket.io) connections are mocked via `page.routeWebSocket()`

Use shared route handlers for any mock used in more than one test file. If a mock is only used in a single file, it may be defined inline. If an inline mock later becomes shared, lift it to `support/routes/`.

### Payload Factories

Each domain file in `fixtures/payloads/` exports typed factory functions returning a full happy-path payload by default, with an optional partial override. Use the same factory for both the mock and the assertion — the test and mock stay in sync.

```ts
export function obsStatePayload(overrides: Partial<ObsStatePayload> = {}): ObsStatePayload {
  return { ...OBS_STATE_DEFAULTS, ...overrides };
}
```

### Shared Route Handlers

Each file in `support/routes/` exports functions that register mocks. Defaults always use the happy-path payload. Return the `WebSocketRoute` handle from socket helpers so tests can push server-initiated events mid-test.

### Domain Files

Payload and route files are organized by domain. Only `obs.ts`, `session.ts`, and `auth.ts` are in scope for the initial release. Future domains (`audio.ts`, `camera.ts`, `overlays.ts`) are created when the corresponding widgets are built.

### Route Conventions

- Shared routes always default to happy-path, no errors
- Error and edge-case payloads are passed in via factory overrides
- Never hardcode payload data inline in test files — always use a factory

---

## data-\* Attribute Conventions

See `code-style.md` for the full attribute reference. In tests:

- Use `data-testid` to select elements — never use class names, IDs, or DOM structure
- Use `data-state` and `data-status` for assertions about UI state

---

## General Rules

- Tests must be deterministic — no reliance on timing, random values, or external network calls
- Each test is independent — no shared mutable state between tests
- Prefer testing one behavior per test
- No live hardware is available during development; all hardware clients are mocked at their abstraction boundary
