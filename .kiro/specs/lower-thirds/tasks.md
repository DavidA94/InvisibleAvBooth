# Implementation Tasks — Lower Thirds

Tests are part of each task's definition of done. Unit tests follow the unit or component they cover. Integration tests exercise the full path from socket command to overlay response.

---

## Phase 1: Shared Infrastructure & Database

- [x] 1. Add shared types — `LowerThirdItem`, `LowerThirdState`, `LowerThirdCommand`, `AnimationPhase`, `LowerThirdType`, `LowerThirdStyle`, `PageBreakdown`, `PageInfo`, `TitleContent`, `TitleSubtitleContent`, `ScriptureContent`, `VerseData`, `AddLowerThirdInput`, `EditLowerThirdInput` to `packages/shared/src/types/`
  - _Requirements: 4, 5, 6, 7, 8_

- [x] 2. Add socket event constants — `CTS_LOWER_THIRD_COMMAND`, `STC_LOWER_THIRD_STATE`, `STO_LOWER_THIRD_SHOW`, `STO_LOWER_THIRD_DISMISS`, `STO_LOWER_THIRD_PUSH_UP`, `STO_LOWER_THIRD_PAGE`, `STO_LOWER_THIRD_STATE`, `STO_LOWER_THIRD_MEASURE`, `STO_LOWER_THIRD_FORCE_CLEAR`, `OTS_LOWER_THIRD_PHASE`, `OTS_LOWER_THIRD_RESOLUTION`, `OTS_LOWER_THIRD_PAGES` to `packages/shared/src/constants/socketEvents.ts`. Update header comment to document `STO_`/`OTS_` prefixes.
  - _Requirements: 8_

- [x] 3. Add `BUS_LOWER_THIRD_STATE_CHANGED` constant and `LowerThirdEventMap` to backend EventBus types. Extend root `EventMap`.
  - _Requirements: 4, 8_

- [x] 4. Database migration — extend `metadata_templates` table: add `lowerThirdType` and `autoDismissMs` columns, expand `category` CHECK constraint to include `'lower_third'`. Implement detect-and-recreate migration in `applySchema()`.
  - _Requirements: 3_

- [x] 5. Write unit tests for migration — verify existing title/description templates survive migration, new columns are nullable, CHECK constraint accepts `'lower_third'` category.
  - _Requirements: 3_

---

## Phase 2: Backend Service & DAO

- [x] 6. Extend `MetadataTemplateDao` — expand `TemplateCategory` type, add `getByCategory('lower_third')` support, add canonical JSON normalization on write for lower-third templates, add duplicate detection for lower-third category.
  - _Requirements: 3_

- [x] 7. Write unit tests for DAO lower-third support — canonical JSON storage, duplicate detection, CRUD with new columns, existing title/description methods unaffected.
  - _Requirements: 3_

- [x] 8. Extend admin template routes — accept `lowerThirdType` and `autoDismissMs` fields for lower-third category, validate JSON formatString structure per type, validate tokens within JSON values.
  - _Requirements: 3_

- [x] 9. Write unit/integration tests for admin template routes — create/update/delete lower-third templates, validation rejects unknown tokens in JSON, duplicate detection works on canonical form.
  - _Requirements: 3_

- [x] 10. Create `LowerThirdService` — constructor with DAO + Database + SessionManifestService deps, library management (add/remove/edit), template-derived item computation, KJV verse lookup, `BUS_SESSION_MANIFEST_UPDATED` subscription.
  - _Requirements: 4, 3_

- [x] 11. Add activation and dismiss logic to `LowerThirdService` — activate from library, push-up transition detection, dismiss with phase tracking, Force Clear (bypass lock).
  - _Requirements: 4, 9_

- [x] 12. Add auto-dismiss timer logic — start on activate, cancel on manual dismiss/push-up/force-clear, timer isolation (never dismiss wrong item), phase transition on fire regardless of overlay connectivity.
  - _Requirements: 4_

- [x] 13. Add transition lock and 5-second fallback — lock on `showing`/`dismissing`, unlock on `visible`/`hidden`, Force Clear bypass, fallback timer advances phase and emits warning notification.
  - _Requirements: 4_

- [x] 14. Add scripture measurement tracking — pending measurements list, cache page breakdowns, 10-second measurement timeout with single-page fallback.
  - _Requirements: 7_

- [x] 15. Add page navigation — `pageNext`/`pagePrevious` methods, reject during transition lock, emit state change.
  - _Requirements: 7, 5_

- [x] 16. Write unit tests for `LowerThirdService` — all state transitions, timer lifecycle, transition lock enforcement, Force Clear bypass, template resolution, library computation, measurement caching, page navigation, manifest change handling.
  - _Requirements: 4, 7, 9_

---

## Phase 3: Backend Socket Gateway & REST

- [x] 17. Create `LowerThirdModule` (default namespace) — implements `SocketModule`, handles `CTS_LOWER_THIRD_COMMAND`, emits `STC_LOWER_THIRD_STATE` on bus event, `emitInitialState` with full state including `autoDismissAt`.
  - _Requirements: 8_

- [x] 18. Create overlay namespace handler (`registerOverlayNamespace`) — unauthenticated `/overlay` namespace, single-client enforcement (forcibly disconnect previous), initial state with `skipEntrance`, pending measurements on connect, phase/resolution/pages event handlers, disconnect handling.
  - _Requirements: 8, 1_

- [x] 19. Register `LowerThirdModule` in `SocketGateway` and `registerOverlayNamespace` in `buildApp`. Wire `LowerThirdService` into `AppContext`.
  - _Requirements: 8_

- [x] 20. Create overlay log route — `POST /api/overlay/logs`, unauthenticated, rate-limited (10 req/min per IP), max 10 entries/batch, 1KB/entry limit with 413 response and device info logging. Mount without auth middleware.
  - _Requirements: 8_

- [x] 21. Add resolution telemetry handling — `LowerThirdService.handleResolutionReport()`, emit/clear Banner notification for resolution mismatch.
  - _Requirements: 2_

- [x] 22. Write unit tests for `LowerThirdModule` — command dispatch, ack responses, initial state emission.
  - _Requirements: 8_

- [x] 23. Write integration tests for overlay namespace — connection/disconnection, single-client enforcement, phase reporting, measurement flow, initial state with skipEntrance.
  - _Requirements: 8, 1_

---

## Phase 4: Frontend — Store, Socket Module, Widget

- [x] 24. Create `lowerThirdSlice` — `LowerThirdState` + `setLowerThirdState` action. Add to combined store.
  - _Requirements: 5_

- [x] 25. Create `lowerThirdSocketModule` — register `STC_LOWER_THIRD_STATE` listener, wire to store.
  - _Requirements: 5, 8_

- [x] 26. Create `useLowerThirdState` hook — read from store, provide `sendCommand` via socket with ack handling.
  - _Requirements: 5_

- [x] 27. Create `LowerThirdWidget` — `WidgetContainer` with overlay connection indicator, Active section, Library section, empty states, Add button.
  - _Requirements: 5_

- [x] 28. Create `LowerThirdRow` component — shared row with title/subtitle, primary button, swipe-to-reveal actions (left/right), used indicator border, active badge overlay, status overlay.
  - _Requirements: 5_

- [x] 29. Create swipe-to-reveal infrastructure — touch event handlers, `translateX` animation, single-row-open enforcement, icon+label-below button layout.
  - _Requirements: 5_

- [x] 30. Create `ActiveCountdown` component — circular countdown from `autoDismissAt`, local timer, "Dismissing" overlay on zero.
  - _Requirements: 5_

- [x] 31. Create `PaginationControls` component — Previous/Next buttons, current page reference display, disabled states.
  - _Requirements: 5_

- [x] 32. Create `PreviewDialog` component — modal showing item content/type/style, Cancel and Go Live buttons, disabled during transition lock.
  - _Requirements: 5_

- [x] 33. Create `AddLowerThirdDialog` — type dropdown, type-specific input fields (Title: title input; TitleSubtitle: title+subtitle inputs; Scripture: ScriptureReferenceInput), Cancel/Save actions.
  - _Requirements: 5_

- [x] 34. Create `EditLowerThirdDialog` — pre-populated from existing item, same fields as Add, preserves sort position on save.
  - _Requirements: 5, 9_

- [x] 35. Write unit tests for widget components — section rendering, button states, swipe actions, countdown, pagination, preview dialog, add/edit dialogs, empty states, connection indicator.
  - _Requirements: 5_

---

## Phase 5: Frontend — Overlay Page

- [x] 36. Create `/overlay/lower-thirds` route — register outside `ProtectedRoutes`, no layout wrapper, transparent background.
  - _Requirements: 1_

- [x] 37. Create `LowerThirdOverlay` component — Socket.io `/overlay` connection (no auth), `document.fonts.ready` gate, `postMessage` ready signal, heartbeat every 5s, disconnect timeout (configurable via env var, default 15s).
  - _Requirements: 1, 2_

- [x] 38. Create Aspect Ratio Jail CSS — `aspect-ratio: 16/9`, `container-type: size`, centered, `max-width: 100vw`, `max-height: 100vh`.
  - _Requirements: 2_

- [x] 39. Create `BlueRhombusStyle` component — rhombus shape, dark plate, text area with type-specific layouts (Title, TitleSubtitle, Scripture), all sizing in `cqw`/`cqh`.
  - _Requirements: 6_

- [x] 40. Implement entrance animation — rhombus `scaleY` from center, plate+text unfold right, phase reporting (`showing` → `visible`).
  - _Requirements: 6_

- [x] 41. Implement exit animation — rhombus slides right as traveling curtain, shrinks to center, phase reporting (`dismissing` → `hidden`).
  - _Requirements: 6_

- [x] 42. Implement push-up transition — `overflow: hidden` clipping, old text up/out + new text up/in, plate height transition, cross-type reference line behavior, phase reporting.
  - _Requirements: 6_

- [x] 43. Implement Force Clear — instant `display: none`, immediate `hidden` phase report.
  - _Requirements: 6_

- [x] 44. Implement scripture measurement — hidden container with matching CSS, 70%/80% width optimization, page break calculation (4-line max, no verse split, single-verse overflow), report via `OTS_LOWER_THIRD_PAGES`. Cancel in-progress measurement on new `show` command.
  - _Requirements: 7_

- [x] 45. Implement scripture page display and transitions — fixed reference line, verse content pagination, page-chunk slide-up animation, plate height adaptation.
  - _Requirements: 6, 7_

- [x] 46. Implement overlay reconnect logic — handle `skipEntrance`, restart animation on `showing` phase, complete dismiss on `dismissing` phase, report `hidden` immediately if backend phase is `dismissing`/`hidden`.
  - _Requirements: 8_

- [x] 47. Implement resolution telemetry — detect dimensions on init, report `OTS_LOWER_THIRD_RESOLUTION` with `isCorrect` flag.
  - _Requirements: 2_

- [x] 48. Implement overlay logging — batch log entries, send via `POST /api/overlay/logs`, fire-and-forget (no retry).
  - _Requirements: 8_

- [ ] 49. Write unit tests for overlay components — phase reporting, measurement, disconnect timeout, Force Clear, reconnect behavior, resolution detection.
  - _Requirements: 1, 2, 6, 7, 8_

---

## Phase 6: Static Wrapper & Admin UI

- [ ] 50. Create `packages/overlay/lower-thirds.html` — static wrapper with `data-overlay-url` config, iFrame lifecycle, postMessage handshake, heartbeat monitoring (10s timeout), retry loop.
  - _Requirements: 1_

- [ ] 51. Extend Admin Templates Page — add "Lower Third Templates" section, type badge, create/edit modal with type-specific fields and auto-dismiss toggle.
  - _Requirements: 3_

- [ ] 52. Write unit tests for admin template UI — lower-third section rendering, create/edit modal fields per type, auto-dismiss toggle behavior.
  - _Requirements: 3_

---

## Phase 7: Documentation & Integration Testing

- [ ] 53. Update `docs/setup.md` — OBS browser source configuration (1920×1080, unchecked shutdown/refresh, `data-overlay-url` configuration), `OVERLAY_DISCONNECT_TIMEOUT_MS` env var.
  - _Requirements: 1, 2_

- [ ] 54. Update steering doc — add `sto:`/`ots:` prefixes to §7, add `"overlay"` source to §6, add overlay namespace exception note to §7, add `cqw`/`cqh` note to §10, add overlay boundaries to §3.
  - _Requirements: 8_

- [ ] 55. Write integration tests — full flow (add scripture → measure → activate → paginate → dismiss), auto-dismiss lifecycle, push-up transition, template resolution on manifest change, overlay reconnect with skipEntrance, Force Clear mid-animation.
  - _Requirements: 4, 7, 9_

- [ ] 56. Write Playwright overlay integration tests — show/dismiss/push-up phase reporting, measurement accuracy, disconnect timeout, reconnect with skipEntrance, reconnect after timer fired, Force Clear instant hide, resolution telemetry.
  - _Requirements: 1, 6, 7, 8_
