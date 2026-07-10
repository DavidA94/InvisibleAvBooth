# Follow-Up Issues & Findings

## Coverage Threshold Blockers

### 1. Type-Only Files at 0% Coverage (Requires Decision)

The following files contain **only TypeScript interfaces/types** with zero runtime code. V8 coverage cannot ever report them as covered because their content is erased at compile time:

- `src/camera/CameraControlInterface.ts` (18 lines)
- `src/gateway/modules/socketModule.ts` (29 lines)
- `src/gateway/modules/camera/types.ts` (9 lines)
- `src/gateway/modules/lowerThird/types.ts` (7 lines)
- `src/gateway/modules/platform/types.ts` (60 lines)
- `src/gateway/modules/sessionManifest/types.ts` (26 lines)

**Recommendation:** Add these to the `coverage.exclude` array in `vitest.config.ts`. They are genuinely untestable (no executable code exists) and drag down all metrics artificially.

### 2. PreviewStreamManager Branch Coverage (49% → needs ~85%)

The core WebSocket connection handling, pipeline spawning, fan-out, grace period, and restart logic are all in private methods that require real HTTP server + WebSocket connections to exercise. The integration tests (`tests/integration/preview/preview.test.ts`) cover the auth and connection rejection paths, but cannot cover the actual pipeline execution (requires GStreamer and NDI sources).

**Options:**

- Accept lower coverage for this file (it's hardware-dependent)
- Extract testable pure functions from the class (parseSourceId, buildArgs already done)
- Make key private methods `_` prefixed for direct testing (per testing.md convention)

### 3. CameraService.discoverRange (0% coverage)

This method runs a 60-iteration hardware discovery loop with 1-second sleeps between iterations. It's designed for real VISCA cameras and would take 60+ seconds to run even in tests with fake timers. The integration tests don't cover it either.

**Options:**

- Accept as hardware-only code
- Extract the iteration logic into a testable helper with injected sleep function

### 4. app.ts Branch Coverage (15%)

Route registration code with conditional middleware has many branches that are only reached through full HTTP integration testing. The integration tests cover these paths, but V8's per-project coverage only counts if both projects are combined.

---

## Code Style Issues Still Pending

These are cosmetic naming changes that don't affect functionality or tests:

1. **`req`/`res` → `request`/`response`** in:
   - `packages/backend/src/routes/platformRoutes.ts` (44 occurrences)
   - `packages/backend/src/routes/adminPresetRoutes.ts` (29 occurrences)

2. **`err` → `error`** in catch blocks (8 source files, 18+ occurrences):
   - obsService.ts, streamingPlatformService.ts, authService.ts, ViscaCameraDriver.ts
   - TongveoAiDriver.ts, CameraService.ts, obsModule.ts, streamingPlatformModule.ts
   - platformRoutes.ts, index.ts

3. **`buf` → `buffer`** in `previewStreamManager.ts` (5 occurrences in helper functions)

4. **Missing return types** on 3 exported functions in `middleware/auth.ts`

---

## Dead Code / Unused Components Found

1. **`StreamPreviewModal.tsx`** — Component exists but is no longer imported or used by `ObsPreviewWidget`. It was part of an older tap-to-expand feature that was removed.

2. **`usePreviewStream.ts`** — Original fMP4 preview hook. The system has moved to MJPEG (`useObsPreviewStream`, `useMjpegStream`). Still has a test file but may be dead code if nothing imports it.

3. **`_buildMp4Box`** in `previewStreamManager.test.ts` — Unused test helper (prefixed with _ to suppress lint).

---

## Spec/Implementation Mismatches

1. **ViscaCameraDriver normalization functions** — Tests existed for `normalizeZoom`, `denormalizeZoom`, `normalizeFocus`, `denormalizeFocus`, `normalizePan`, `denormalizePan` but these were intentionally removed from the source (comment says "REMOVED. All positions are now raw VISCA integers"). Tests were removed during this cleanup.

2. **Preset reorder API** — The route expects `presetIds` in the request body but the integration test was sending `order`. Fixed during this cleanup.

---

## Integration Test Issues Fixed

1. **`createFakeSpawn`** — Missing `ffmpeg -version` handler (only had `--version` for gst-launch). All 19 integration tests were timing out because of this.

2. **OAuth env vars** — `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` were missing from integration test config, causing all OAuth tests to fail with 400.

---

## Questions for David

1. Should we exclude the type-only files from coverage? They literally cannot be covered and drag numbers down by ~2-3%.

2. Should `previewStreamManager.ts` be refactored to make its private methods testable (using the `_` prefix convention)? The core business logic is inaccessible to unit tests without significant infrastructure.

3. Is `StreamPreviewModal.tsx` dead code that should be removed?

4. Is `usePreviewStream.ts` (fMP4 hook) still needed, or has it been fully replaced by `useObsPreviewStream`/`useMjpegStream`?

5. `CameraDeviceForm.tsx` is 805 lines with no test coverage. It's the biggest single drag on frontend coverage. Should we prioritize testing it now, or accept it as technical debt?

---

## Current Coverage State After Cleanup

| Package  | Statements | Lines  | Branches | Target                        |
| -------- | ---------- | ------ | -------- | ----------------------------- |
| Backend  | 88.51%     | 89.87% | 76.98%   | 90% stmts/lines, 85% branches |
| Frontend | 85.25%     | 86.68% | 77.63%   | 90% stmts/lines, 85% branches |
| Shared   | 94.68%     | 95.12% | 91.3%    | ✅ Passes                     |

### What was fixed:

- All test failures resolved (was 20+ broken tests across both packages)
- Integration tests fixed (were all 19 timing out due to missing ffmpeg -version fake)
- ViscaCameraDriver coverage: 49% → ~88%
- CameraService coverage: 60% → ~72%
- ObsNdiPreviewSource coverage: 60% → ~90%
- Frontend test fixes: ObsPreviewWidget, PtzJoystick, PresetConfigModal, CameraWidget, usePtzMove
