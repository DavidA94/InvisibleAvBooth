// Preview stream configuration shared between frontend and backend.
//
// These constants configure the real-time preview system used for
// OBS output and camera feeds on the dashboard.

// ── Audio Sample Rate ────────────────────────────────────────────────────────
//
// Standard sample rates for PCM audio transport:
//   48000  — Professional/broadcast standard. Best quality. ~1.5 Mbps stereo, ~768 kbps mono.
//   44100  — CD quality. Good balance of quality and bandwidth. ~705 kbps mono.
//   22050  — Half CD rate. Adequate for speech monitoring. ~353 kbps mono.
//   16000  — Telephony wideband. Speech-only. ~256 kbps mono.
//   8000   — Telephony narrowband. Minimal quality. ~128 kbps mono.
//
// For church monitoring (hearing what's happening to react with lower-thirds,
// camera adjustments, etc.), 44100 mono provides more than enough fidelity.
export const PREVIEW_AUDIO_SAMPLE_RATE = 44100;

// ── Audio Channels ───────────────────────────────────────────────────────────
//
// 1 = mono (recommended for monitoring — halves bandwidth, no spatial info needed)
// 2 = stereo
export const PREVIEW_AUDIO_CHANNELS = 1;

// ── Audio Chunk Duration (ms) ────────────────────────────────────────────────
//
// How many milliseconds of audio per WebSocket message.
// Lower = less latency, more messages. Higher = more efficient, more latency.
//   10ms  — Ultra low latency, high message rate (~100/sec)
//   20ms  — Good balance (50 messages/sec, ~1.7KB each at 44.1kHz mono 16-bit)
//   40ms  — Lower overhead but noticeable latency
//   100ms — High latency, very efficient
export const PREVIEW_AUDIO_CHUNK_MS = 20;

// ── Audio Skip-to-Live Threshold (ms) ────────────────────────────────────────
//
// If the audio playback buffer exceeds this duration behind live,
// drop old chunks and skip to the current data. Prevents drift.
// A click/pop may be audible when skipping, but monitoring stays current.
export const PREVIEW_AUDIO_SKIP_THRESHOLD_MS = 150;

// ── Video (MJPEG) ────────────────────────────────────────────────────────────

export const MJPEG_WIDTH = 640;
export const MJPEG_HEIGHT = 360;
export const MJPEG_FRAMERATE = 10;
export const MJPEG_QUALITY = 70;

// ── Video (fMP4 — legacy, used when MJPEG is not suitable) ───────────────────

export const FMP4_WIDTH = 1280;
export const FMP4_HEIGHT = 720;
export const FMP4_FRAMERATE = 15;

// ── WebSocket Message Type Prefixes ──────────────────────────────────────────
//
// When a preview endpoint carries both video and audio (OBS),
// each binary message is prefixed with a type byte:
//   0x01 = JPEG video frame
//   0x02 = PCM audio chunk (signed 16-bit LE, PREVIEW_AUDIO_SAMPLE_RATE, PREVIEW_AUDIO_CHANNELS)
export const PREVIEW_MSG_VIDEO = 0x01;
export const PREVIEW_MSG_AUDIO = 0x02;
