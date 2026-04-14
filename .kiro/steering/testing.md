---
inclusion: always
---

# Testing Strategy

This document defines how testing is approached across Invisible A/V Booth. It covers tooling, structure, and conventions — not what to test. Specific test cases and correctness properties live in feature specs.

---

## Stack

| Layer | Tool | Scope |
|---|---|---|
| Unit & component | Vitest + React Testing Library | Logic, hooks, components |
| Property-based | Vitest + fast-check | Correctness properties defined in design docs |
| E2E / integration | Playwright | Full user flows, mocked backend (HTTP + WebSocket) |

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

### Backend Tests

- Use Vitest with `environment: "node"`
- Mock external device clients at the abstraction layer boundary — never mock internal logic
- Test state reconciliation, error handling, and command routing

---

## E2E Tests (Playwright)

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

## data-* Attribute Conventions

See `code-style.md` for the full attribute reference. In tests:

- Use `data-testid` to select elements — never use class names, IDs, or DOM structure
- Use `data-state` and `data-status` for assertions about UI state

---

## General Rules

- Tests must be deterministic — no reliance on timing, random values, or external network calls
- Each test is independent — no shared mutable state between tests
- Prefer testing one behavior per test
