# Spec-to-Code Drift Check

Run this before implementing any spec. It catches misalignments between what the spec assumes and what actually exists in the codebase.

## CONTEXT

A new or updated spec is about to be implemented. The spec makes assumptions about existing code — interfaces, file paths, naming conventions, route patterns, type shapes, event names, database schema, and component structure. If any assumption is wrong, implementation will either break existing functionality or produce inconsistent code.

**Code is the source of truth.** If the spec says one thing and the code says another, the code is more likely correct — it's running in production. However, the code CAN be wrong (bugs, incomplete implementations, stale patterns). Flag these for human review rather than auto-correcting.

## PROCESS

### Step 1: Identify Every Touchpoint

Read the spec (requirements + design) and list every reference to existing code:

- **Types and interfaces** it extends, modifies, or depends on (name, shape, location)
- **Functions and methods** it calls, renames, or changes the signature of
- **Files and paths** it references (source files, config files, constants files)
- **Database tables and columns** it reads from, writes to, or adds
- **Route paths** (REST endpoints, frontend routes) it adds or modifies
- **Socket.io / EventBus events** it emits, subscribes to, or extends
- **CSS classes and design tokens** it uses or adds
- **Environment variables** it requires
- **npm packages** it imports
- **Naming conventions** it follows (or should follow)

### Step 2: Cross-Reference Each Touchpoint Against Code

For EACH item from Step 1, read the actual code file and verify:

1. **Does the file exist at the path the spec references?** If not, find the real path.
2. **Does the interface/type match what the spec assumes?** Compare field names, types, optionality.
3. **Does the function signature match?** Compare parameters, return types, export names.
4. **Does the naming convention match?** Check prefixes (BUS_*, STC_*, CTS_*, URL_*), casing, file organization patterns.
5. **Does the route pattern match?** Check whether routes use `/api/` prefix, whether admin routes are under `/api/admin/`, whether frontend routes are separate from backend routes.
6. **Does the database schema match?** Check column names, types, constraints, table relationships.
7. **Does the component structure match?** Check prop interfaces, component hierarchy, state management patterns.
8. **Are there existing patterns the spec should follow but doesn't mention?** (e.g., URL constants file, test ID constants, singleton factories, middleware chains)

### Step 3: Check Spec-to-Spec Alignment

If multiple specs exist (e.g., a foundational spec and an extension spec):

1. **Do they reference the same interfaces consistently?** Same field names, same types, same locations.
2. **Are supersession notes present?** When the new spec changes behavior defined in an older spec, is the older spec annotated?
3. **Are breaking changes listed completely?** Every interface change, every renamed function, every removed method.
4. **Do accepted risks in one spec conflict with requirements in another?**

### Step 4: Classify Findings

For each finding, classify it:

- **AUTO-FIX**: The spec is wrong and the correct answer is obvious from the code. Fix the spec directly.
  - Example: spec says file is at `src/socketEvents.ts`, code has it at `src/constants/socketEvents.ts`
  - Example: spec says function is called `interpolateStreamTitle`, code already renamed it to `interpolateTemplate`

- **SPEC-FIX**: The spec is internally inconsistent (says two different things about the same item). Fix the spec to be consistent.
  - Example: spec says `ConnectionStatus` is in `types.ts` in one section and `WidgetContainer.tsx` in another

- **HUMAN-REQUIRED**: The spec and code disagree, and it's not clear which is correct. Present both versions and ask.
  - Example: spec says a field is required, code has it as optional — could be a bug in either
  - Example: spec describes behavior that the code doesn't implement — could be a missing feature or an outdated spec

- **MISSING-PATTERN**: The spec doesn't mention an existing codebase pattern that it should follow. Add a note to the spec.
  - Example: codebase has a `urls.ts` constants file for all route paths, but the spec hardcodes route strings
  - Example: codebase uses singleton factories for services, but the spec doesn't mention how the new service is instantiated

## WHAT TO CHECK (CHECKLIST)

Use this as a systematic checklist. Do not skip items.

### Types & Interfaces
- [ ] Every type the spec references — verify name, location, and shape against code
- [ ] Every type the spec modifies — verify the current shape before describing the change
- [ ] Every new type — verify it doesn't conflict with an existing type of the same name
- [ ] Re-exports and aliases — verify the chain (shared → backend, shared → frontend)

### Functions & Methods
- [ ] Every function the spec calls — verify it exists, verify the signature
- [ ] Every function the spec renames — verify the old name, list all import sites
- [ ] Every function the spec modifies — verify the current implementation matches what the spec assumes

### File Paths
- [ ] Every file path referenced in the spec — verify it exists at that exact path
- [ ] Directory structure assumptions — verify the spec's file organization matches the codebase

### Routes
- [ ] Every REST endpoint — verify it uses the correct prefix (`/api/`, `/api/admin/`, `/api/auth/`)
- [ ] Frontend routes vs backend routes — verify they're not confused (frontend routes are React Router paths, backend routes are Express paths)
- [ ] URL constants — verify new routes have corresponding constants in the shared `urls.ts` file
- [ ] Caddy/proxy configuration — verify new routes will be correctly routed

### Events
- [ ] Socket.io event names — verify they follow the `CTS_*`/`STC_*` convention and are in the shared constants file
- [ ] EventBus event names — verify they follow the `BUS_*` convention and are in the backend types file
- [ ] Event payloads — verify the shape matches between emitter and subscriber
- [ ] EventMap composition — verify new event slices are added to the root EventMap

### Database
- [ ] New tables — verify they use `CREATE TABLE IF NOT EXISTS` and are added to `applySchema()`
- [ ] Existing tables — verify column names and types match what the spec assumes
- [ ] Bootstrap/seed data — verify it runs idempotently and doesn't conflict with existing seeds

### CSS & Theming
- [ ] CSS class names — verify they follow the existing naming convention in `shared.css`
- [ ] Design tokens — verify they reference existing CSS custom properties from `variables.css`
- [ ] New classes — verify they don't conflict with existing class names

### Dependencies & Wiring
- [ ] Service instantiation — verify the spec describes how new services are created and wired in `index.ts`
- [ ] Constructor injection — verify dependency chains are explicit (not hidden singletons)
- [ ] Module registration — verify new Socket modules are registered in the SocketGateway

### Conventions
- [ ] `data-testid` values — verify they follow the existing constant pattern (if one exists)
- [ ] Error types — verify they follow the existing `class XError extends Error` pattern
- [ ] Result types — verify they use the existing `Result<T, E>` pattern
- [ ] Logging — verify log calls follow the existing `logger.info/warn/error` pattern with `userId` and `context`

## OUTPUT FORMAT

### Auto-Fixed
List each fix applied directly, with the file and what changed.

### Human-Required
For each item needing human input:
- **What the spec says**: [quote]
- **What the code does**: [quote or description]
- **Why they conflict**: [explanation]
- **Options**: [A or B, with tradeoffs]

### Missing Patterns
For each pattern the spec should follow:
- **Pattern**: [description]
- **Where it exists**: [file path]
- **What the spec should add**: [specific addition]

## GUIDING PRINCIPLE

A first-year developer who understands the code but has never talked to the team should be able to read the spec and implement it without asking "wait, is this right?" If they would need tribal knowledge or historical context to resolve an ambiguity, the spec has a gap.
