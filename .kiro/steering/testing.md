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
| Backend E2E         | Vitest                         | Full server with fake devices — REST/Socket.io API → services → SQLite     |
| Frontend E2E        | Playwright                     | Full user flows in the browser, mocked backend (HTTP + WebSocket)          |

**Why two E2E layers**: Backend E2E tests (Vitest) verify that routes, services, the database, and socket events work together correctly with fake device clients — no browser involved. Frontend E2E tests (Playwright) verify that the UI drives the correct HTTP and WebSocket calls and responds correctly to server events — no real backend involved. These are complementary, not redundant. Both run via `npm run test:e2e` in their respective packages and are included in root `npm run ci`.

---

## Unit & Component Tests (Vitest + RTL)

Each package manages its own `vitest.config.ts`. Test files live alongside the code they test (`AudioWidget.tsx` → `AudioWidget.test.tsx`).

### Coverage

- Minimum thresholds: **90% lines and statements, 85% branches**
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

## Backend E2E Tests (Vitest)

Backend e2e tests exercise the full path from the API boundary (REST endpoint or Socket.io event) through services and down to the database, using fake device clients with configurable responses. No browser or real hardware is involved.

### Architecture

The tests use a shared `buildApp()` factory (`src/app.ts`) that assembles the full Express + Socket.io application. This is the same factory used by `index.ts` in production, ensuring test and production wiring never drift apart. Tests inject fakes for external dependencies:

| Dependency | Production | Test |
|------------|-----------|------|
| OBS WebSocket | `obs-websocket-js` | `createFakeObs()` — mock with event simulation and stateful recording tracking |
| Platform APIs (YouTube/Facebook) | `YouTubeClient` / `FacebookClient` | `FakePlatformClient` — enqueueable responses and call recording |
| RTMP relay (node-media-server) | Real NMS instance | `createFakeNms()` — no-op |
| FFmpeg forwarders | `child_process.spawn` | `createFakeSpawn()` — emits `close` immediately |
| Database | File-backed SQLite | In-memory SQLite (`:memory:`) with identical schema |

### Fake Response Sequencing

`FakePlatformClient` supports enqueueable responses so tests can configure multi-step scenarios:

```typescript
// First call succeeds, second call throws
fakePlatformClient
  .enqueue("createBroadcast", { broadcastId: "b1", ... })
  .enqueue("createBroadcast", new PlatformError("BROADCAST_CREATE_FAILED", "quota exceeded"));
```

When no response is enqueued, the fake returns a sensible default. Errors are thrown when an `Error` instance is enqueued.

### Test Harness

All e2e tests use a shared harness (`tests/integration/harness.ts`) that provides:

- `buildTestServer(opts?)` — creates an in-memory DB, applies schema, optionally seeds KJV data or platform configs, wires up the full app with fakes, and listens on an ephemeral port. Returns the app context, fakes, port, and a supertest agent.
- `resetServer(server)` — truncates all tables and resets fakes between tests. Does not restart the server or re-register event bus listeners (~1ms).
- `destroyServer(server)` — tears down the server, services, and event bus listeners.
- `loginAs(agent, authService, username, password, role)` — creates a user, logs in, changes password, and returns the auth cookie.
- `loginAsAdmin(agent, authService)` — shorthand for creating and logging in as an ADMIN.
- `loginRaw(agent, authService, ...)` — logs in without changing password, for testing password-change enforcement.

### Structure

E2e test files live in `tests/integration/`, separate from unit tests in `src/`:

```
packages/backend/
  src/
    app.ts                              ← shared buildApp() factory
    routes/
      authRoutes.ts
      authRoutes.test.ts                ← unit test
  tests/
    integration/
      fakes.ts                          ← FakePlatformClient, createFakeObs, etc.
      harness.ts                        ← buildTestServer, resetServer, login helpers
      routes/
        auth.test.ts                    ← e2e: full server, real DB, fake devices
        admin-users.test.ts
        edge-cases.test.ts              ← expired JWTs, 403 sweep, password enforcement
        ...
      gateway/
        socket.test.ts                  ← Socket.io e2e: OBS commands, manifest, auth
        streaming.test.ts               ← streaming lifecycle, recording, no_source
```

### Execution

- **Config:** `vitest.integration.config.ts` — separate from unit test config
- **Script:** `npm run test:e2e` (backend package), also run by root `npm run ci`
- **Parallelism:** `fileParallelism: false` — tests run sequentially because the `eventBus` is a module-level singleton shared across files in the same thread pool
- **Lifecycle:** One server per test file (`beforeAll`), table truncation between tests (`beforeEach`), full teardown (`afterAll`)

### Conventions

- Each test is independent — `resetServer()` between tests ensures no state leakage
- Tests verify the full wiring path: HTTP request → middleware → route → service → database → response, or socket event → gateway → module → service → event bus → broadcast
- Streaming lifecycle tests use `afterEach` cleanup to ensure the platform state machine returns to idle, preventing cross-test contamination
- Socket tests extract the raw JWT from the auth cookie for `socket.io-client` auth; cookie-based socket auth is also tested separately
- `BCRYPT_ROUNDS=1` in test env keeps password hashing fast (~1ms vs ~200ms)

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
