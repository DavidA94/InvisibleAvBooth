---
inclusion: always
---

# Code Style & Conventions

This document defines coding standards for Invisible A/V Booth. All code — human-written or AI-generated — must follow these conventions.

---

## Stack

- **Runtime:** Node.js (backend), React (frontend)
- **Language:** TypeScript throughout — no plain `.js` files in `packages/`
- **Monorepo:** `packages/backend`, `packages/frontend`, and `packages/shared`, sharing a root ESLint + Prettier config. `packages/shared` (`@invisible-av-booth/shared`) contains constants shared between frontend and backend (e.g., `BIBLE_BOOKS`); it is consumed via TypeScript project references with no separate build step.

---

## Formatting (enforced by Prettier)

- Double quotes for strings
- Spaces, not tabs — 2-space indent
- Semicolons required
- Trailing commas everywhere (arrays, objects, function params)
- Bracket spacing: `{ foo }` not `{foo}`
- Arrow functions always parenthesize arguments: `(x) => x` not `x => x`
- Max line length: 160 characters
- LF line endings
- Empty newline at end of every file

---

## Naming Conventions

### General Rules

| Construct | Convention | Example |
|---|---|---|
| Classes, interfaces, types, enums | PascalCase | `AudioMixer`, `DevicePlugin` |
| Constants (module-level, truly immutable) | SCREAMING_SNAKE_CASE | `MAX_RETRY_COUNT`, `DEFAULT_PORT` |
| Variables, function arguments, local `let`/`const` | camelCase | `channelVolume`, `isStreaming` |
| Functions and methods | camelCase | `fetchDeviceState()`, `handleMute()` |
| React components | PascalCase | `AudioWidget`, `CameraPresetButton` |
| React hooks | camelCase, prefixed with `use` | `useDeviceState`, `usePreset` |
| Enum members | SCREAMING_SNAKE_CASE | `DeviceStatus.OFFLINE` |
| File names (components) | PascalCase | `AudioWidget.tsx` |
| File names (non-component) | camelCase | `deviceState.ts`, `obsClient.ts` |

### Acronym Casing

Acronyms follow the case of their context — they are not treated as all-caps blocks.

- **PascalCase context:** Only the first letter is capitalized — `ObsClient`, `PtzCamera`, `UsaStates`
- **camelCase context:** Lowercase entirely when not at the start — `obsClient`, `ptzCamera`
- **Exception:** Widely established technical acronyms that read as a single token may stay uppercase — `IOPlugin`, `URLParser`, `HTTPError`

When in doubt, prefer readability over strict rules. `ObsClient` is clearer than `OBSClient` in most contexts.

---

## TypeScript

### Typing Philosophy

Type everything that isn't immediately obvious. If a reader would have to think for even a moment about what a value is, annotate it.

**Always annotate:**
- Exported function return types
- Function parameters
- Class properties
- Anything returned from an API or external source

**Inference is fine for:**
- Simple variable assignments: `const count = 0`
- Obvious return types on short private functions: `const double = (n: number) => n * 2`

### Rules

- `any` is a warning — use `unknown` and narrow it, or define a proper type
- Prefer `interface` for object shapes that may be extended; use `type` for unions, intersections, and aliases
- Use `type` imports: `import type { Foo } from "./foo"`
- No `// @ts-ignore` — use `// @ts-expect-error` with a comment explaining why
- Enable and respect `strict` mode — no exceptions
- `noUncheckedIndexedAccess` is on — always handle the `undefined` case when indexing arrays or records

### Patterns

```ts
// Prefer explicit return types on exported functions
export function getDeviceStatus(id: string): DeviceStatus { ... }

// Interface for extensible shapes
interface DevicePlugin {
  id: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

// Type for unions
type NotificationLevel = "toast" | "banner" | "modal";

// Unknown over any for external data
function parseResponse(raw: unknown): DeviceState {
  // narrow raw before use
}
```

---

## React

- Functional components only — no class components
- One component per file
- Props typed with an `interface`, named `[ComponentName]Props`
- Avoid `React.FC` — type props directly and let return type infer
- Keep components focused — if a component needs more than ~150 lines, consider splitting

```tsx
interface AudioWidgetProps {
  channelId: string;
  onMute: (channelId: string) => void;
}

export function AudioWidget({ channelId, onMute }: AudioWidgetProps) {
  ...
}
```

---

## data-* Attributes

Two distinct attributes are used — they serve different purposes and should not be conflated.

| Attribute | Purpose | Example |
|---|---|---|
| `data-testid` | Element selection in tests | `data-testid="audio-channel"` |
| `data-state` | Reflects the current behavioral state of a component | `data-state="muted"` |
| `data-status` | Reflects device or connection status | `data-status="offline"` |

### Rules

- Every interactive or stateful component must expose the appropriate `data-state` or `data-status` attribute so tests can assert on UI state without inspecting internals
- `data-testid` is required on any element that a test needs to select and that cannot be reliably targeted by role or label alone
- Values must be lowercase kebab-case strings: `"muted"`, `"pending"`, `"stream-live"`, not `"Muted"` or `"MUTED"`
- Do not use `data-testid` for styling hooks — use class names for that
- Do not overload a single attribute with multiple concerns — if a component has both a behavioral state and a device status, use both `data-state` and `data-status`

```tsx
// Good
<div
  data-testid="audio-channel"
  data-state={isMuted ? "muted" : "active"}
  data-status={isOnline ? "online" : "offline"}
>

// Avoid — overloaded, ambiguous
<div data-state="muted-offline">
```

---

## Imports

- No unused imports — enforced by ESLint (`unused-imports/no-unused-imports`)
- Group imports: external packages first, then internal modules, then types
- Use `import type` for type-only imports

---

## General Quality

- `===` always — never `==`
- `prefer-const` — use `let` only when reassignment is needed
- No `console.log` in committed code — use a proper logger (warning enforced by ESLint)
- No `debugger` statements
