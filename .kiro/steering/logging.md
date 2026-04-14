---
inclusion: always
---

# Logging

This document defines how logging is approached across Invisible A/V Booth. It covers philosophy, levels, format, and conventions — not what specific things to log. What to log is determined by the context of each feature.

---

## Philosophy

Logs exist to answer one question after a failure: *what happened?*

Log things that matter for tracing a failure path — state transitions, commands issued, errors encountered, and significant decisions the system made. Do not log things that are almost always noise: successful health checks, routine polling ticks, or state that hasn't changed.

The test: if the system crashed right after this line, would this log entry help you understand why? If yes, log it. If it would just add clutter to scroll past, don't.

---

## Log Levels

| Level | When to use |
|---|---|
| `DEBUG` | Detailed internal state useful during development — off by default in production |
| `INFO` | Significant events in normal operation (service started, user logged in, stream started) |
| `WARN` | Something unexpected happened but the system recovered or can continue (retry attempt, fallback used, non-critical config issue) |
| `ERROR` | Something failed and requires attention (command failed, device unreachable, unhandled exception) |

`DEBUG` is disabled by default and must be explicitly enabled via environment configuration. In production, `INFO` is the default floor.

---

## Format

Logs are written in two formats simultaneously — structured JSON to file for machine parsing, and human-readable output to the console for live monitoring.

Every log entry includes:

| Field | Description |
|---|---|
| `timestamp` | ISO 8601, local to the host |
| `level` | `debug`, `info`, `warn`, `error` |
| `source` | `backend` or `frontend` |
| `message` | Human-readable description of what happened |
| `userId` | Present on any entry triggered by a user action |
| `context` | Optional structured object with relevant data (e.g., command type, device ID, error code) |

Frontend log entries are forwarded to the backend and written to the same log file, tagged with `"source": "frontend"`. This gives a unified view of what both sides were doing at the time of a failure.

---

## Atomicity

Log entries must never interleave — two concurrent writes must not produce a single corrupted line. If the chosen logging library cannot guarantee this for a shared file, use two separate files instead.

Log race conditions (entries from frontend and backend appearing slightly out of strict chronological order) are acceptable — the network is unpredictable. Corrupted entries are not.

---

## What to Log

**Always log:**
- Service startup and shutdown
- Authentication events (login, logout, failed login)
- Device connection state changes (connected, disconnected, reconnecting, retry exhausted)
- Commands issued and their outcomes (success or failure)
- Errors and exceptions, with enough context to reproduce the failure path
- Any action taken by a user that changes system state

**Never log:**
- Successful no-op polls where nothing changed
- Routine internal state reads with no side effects
- Sensitive data — passwords, tokens, encryption keys

---

## userId on User-Triggered Actions

Any log entry triggered by a user action must include the `userId` of the authenticated user who triggered it. This applies to both frontend and backend log entries.

This makes it possible to answer "what was this specific user doing when the failure occurred?" without guessing.
