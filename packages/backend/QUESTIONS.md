# Integration Test — Open Questions & Assumptions

## Assumptions Made

1. **In-process fakes for platform clients** — Using fake `StreamingPlatformClient` implementations injected directly rather than spinning up fake HTTP servers for YouTube/Facebook APIs. The HTTP serialization layer in those clients is thin and covered by unit tests. If you want full HTTP-level fakes later, we can add them.

2. **Fake OBS as a mock object** — Using a mock OBSWebSocket object (same pattern as existing unit tests) rather than a real WebSocket server. The reconnection/event-listener logic is already well-tested in `obsService.test.ts`. The integration tests focus on the full server orchestration path.

3. **One server per test file, reset between tests** — Each test file starts one HTTP server in `beforeAll` and resets DB state between tests via table truncation + re-bootstrap. This keeps tests fast (~50ms startup) while ensuring isolation.

4. **KJV data loaded from real SQL file** — The KJV integration tests load `bibledb_kjv.sql` from the repo root, same as the existing tests. If the file is missing, those tests will be skipped gracefully.

5. **Event bus is global singleton** — The `eventBus` is a module-level singleton. Between tests we call `eventBus.removeAllListeners()` to prevent cross-test leakage. This matches the production behavior where there's one event bus per process.

6. **OAuth callback tests don't exchange tokens** — The existing `handleOAuthCallback` returns a success stub ("Token exchange pending"). Integration tests verify the state management flow (create state → callback consumes state) without mocking Google/Facebook token exchange.

7. **Platform health endpoint** — `GET /api/platforms/health` reads from the DAO (database), not from live platform clients. Integration tests verify the DB-backed response, not live API health.

8. **Test directory** — Integration tests live in `tests/integration/` (outside `src/`) to make the boundary explicit and simplify vitest config separation.

9. **`decryptDevicePassword` export** — The existing test checks `typeof decryptDevicePassword === 'function'`. This is a trivial re-export of `decrypt` and doesn't need an integration test; the encryption round-trip test covers the real behavior.

## Open Questions

_All resolved._

1. **Should integration tests cover the `StreamingPlatformService` orchestration flow end-to-end?** _Resolved: Yes. `streaming.test.ts` covers startAll/stopAll/startPlatform/stopPlatform, broadcast failure → error, concurrent operation rejection, no_source handling, and manifest-clear-while-live blocking._

2. **Should we test WebSocket reconnection behavior in integration tests?** _Resolved: We test the `cts:obs:reconnect` command path and OBS-disconnected error paths. Backoff/retry-exhaustion timing is deferred to unit tests._

3. **Should the `buildApp()` factory live in `src/` (shared with production) or only in test utilities?** _Resolved: Extracted to `src/app.ts`. `index.ts` calls it for production; tests call it with fakes._

## Bugs Found

1. **`sessionManifestModule.ts` — `getTemplate()` does not exist.** The `emitInitialState` method called `this.manifestService.getTemplate()` which was never implemented on `SessionManifestService`. This was a pre-existing bug that was never caught because the old integration tests didn't test the `cts:request:initial:state` flow for the manifest module. Fixed by using `getInterpolated()` instead, which already computes the interpolated title server-side.

## Benchmark

- **Unit tests:** 17 files, 281 tests — ~31s total (12s test execution)
- **Integration tests:** 12 files, 155 tests — ~210s total (13.5s test execution, rest is import/transform overhead)
- **Server startup per file:** <50ms (in-memory DB + schema + fake services)
- **Reset between tests:** <1ms (table truncation)
- Integration tests run sequentially (`fileParallelism: false`) to avoid event bus singleton interference between test files. If this becomes a bottleneck, switching to `pool: 'forks'` would give true process isolation with parallel execution.

## Integration Test Coverage Summary

### Auth & Security

| Feature                                           | Status | Test File           |
| ------------------------------------------------- | ------ | ------------------- |
| Login (valid/invalid/missing fields)              | ✅     | auth.test.ts        |
| Logout (cookie clearing)                          | ✅     | auth.test.ts        |
| Password change (self-service)                    | ✅     | auth.test.ts        |
| Admin password reset                              | ✅     | auth.test.ts        |
| Expired JWT on HTTP routes                        | ✅     | edge-cases.test.ts  |
| Expired JWT on socket connections                 | ✅     | edge-cases.test.ts  |
| Invalid JWT on HTTP routes                        | ✅     | admin-users.test.ts |
| Invalid JWT on socket connections                 | ✅     | socket.test.ts      |
| Socket cookie-based auth (valid)                  | ✅     | edge-cases.test.ts  |
| Socket cookie-based auth (expired)                | ✅     | edge-cases.test.ts  |
| Role-based 403 on all 19 admin endpoints          | ✅     | edge-cases.test.ts  |
| Password-change enforcement on 9 protected routes | ✅     | edge-cases.test.ts  |
| Self-delete guard                                 | ✅     | admin-users.test.ts |
| Self-role-change guard                            | ✅     | admin-users.test.ts |

### OBS Control

| Feature                                               | Status | Test File          |
| ----------------------------------------------------- | ------ | ------------------ |
| startStream rejected (managed by platform service)    | ✅     | socket.test.ts     |
| stopStream rejected (managed by platform service)     | ✅     | socket.test.ts     |
| startRecording with state verification                | ✅     | streaming.test.ts  |
| stopRecording with state verification                 | ✅     | streaming.test.ts  |
| Recording failure detection (OBS reports not started) | ✅     | streaming.test.ts  |
| OBS error broadcast to clients                        | ✅     | socket.test.ts     |
| OBS reconnect command                                 | ✅     | edge-cases.test.ts |
| OBS commands when disconnected                        | ✅     | edge-cases.test.ts |
| Initial state emission (OBS + manifest)               | ✅     | socket.test.ts     |

### Streaming Platform

| Feature                                               | Status | Test File         |
| ----------------------------------------------------- | ------ | ----------------- |
| startAll (broadcast creation → OBS start → streaming) | ✅     | streaming.test.ts |
| stopAll (forwarder stop → broadcast end → idle)       | ✅     | streaming.test.ts |
| startPlatform (single platform)                       | ✅     | streaming.test.ts |
| stopPlatform (single platform)                        | ✅     | streaming.test.ts |
| Broadcast failure → error state                       | ✅     | streaming.test.ts |
| Concurrent operation rejection                        | ✅     | streaming.test.ts |
| Unknown command type → error                          | ✅     | streaming.test.ts |
| No source handling (OBS relay disconnect)             | ✅     | streaming.test.ts |
| Manifest clear blocked while streaming                | ✅     | streaming.test.ts |
| Platform config CRUD                                  | ✅     | platforms.test.ts |
| OAuth state lifecycle                                 | ✅     | platforms.test.ts |
| Platform health endpoint                              | ✅     | platforms.test.ts |

### CRUD & Config

| Feature                                          | Status | Test File                                |
| ------------------------------------------------ | ------ | ---------------------------------------- |
| User CRUD (create/read/update/delete)            | ✅     | admin-users.test.ts                      |
| Device CRUD + encryption round-trip              | ✅     | admin-devices.test.ts                    |
| Device password update                           | ✅     | edge-cases.test.ts                       |
| Device password preserved on non-password update | ✅     | admin-devices.test.ts                    |
| Dashboard CRUD                                   | ✅     | admin-dashboards.test.ts                 |
| Widget CRUD + duplicate detection                | ✅     | admin-dashboards.test.ts                 |
| Dashboard role filtering                         | ✅     | admin-dashboards.test.ts                 |
| Dashboard layout endpoint                        | ✅     | admin-dashboards.test.ts                 |
| Template CRUD + validation                       | ✅     | admin-templates.test.ts                  |
| Template role filtering                          | ✅     | templates.test.ts                        |
| Last title template guard                        | ✅     | admin-templates.test.ts                  |
| KJV verse validation                             | ✅     | kjv.test.ts                              |
| Frontend log ingestion                           | ✅     | logs.test.ts                             |
| Session manifest (get/update)                    | ✅     | admin-dashboards.test.ts, socket.test.ts |

### Known Gaps (deferred to unit tests or future work)

- **Health polling interval behavior** — Tested in unit tests; integration tests verify the command path, not the 20s polling timer.
- **FFmpeg forwarder exit recovery** — The full 2s wait + respawn + 5s verify cycle is tested in unit tests. Integration tests verify the no_source → recovery path via relay state events.
- **Token refresh flow** — YouTube/Facebook token refresh is tested in unit tests against mock HTTP responses. Integration tests use in-process fakes.
- **Relay crash recovery** — The 3-retry cycle with 5s delays is tested in unit tests. Integration tests use a fake NMS.
- **Socket disconnection cleanup** — Logged but no observable side effects to test beyond the log message.
- **Mid-session token expiry** — Would require real time manipulation; deferred.
