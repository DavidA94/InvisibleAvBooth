import { describe, it, expect, vi } from "vitest";
import { PostFaderMeterPool } from "./PostFaderMeterPool.js";
import type { OscTransport } from "./MixerControlInterface.js";

vi.mock("../logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

/** Minimal transport whose open() resolves when the test says so. */
function deferredTransport(): OscTransport & { resolveOpen: (ok: boolean) => void; sent: string[]; closed: boolean } {
  let resolveOpen: (ok: boolean) => void = () => {};
  const transport = {
    sent: [] as string[],
    closed: false,
    resolveOpen: (ok: boolean) => resolveOpen(ok),
    open: () => new Promise<boolean>((resolve) => (resolveOpen = resolve)),
    send: (address: string) => void transport.sent.push(address),
    onMessage: () => () => {},
    close: () => void (transport.closed = true),
  };
  return transport;
}

describe("PostFaderMeterPool", () => {
  it("closes a socket that was released while it was still opening (no leaked client)", async () => {
    const transport = deferredTransport();
    const pool = new PostFaderMeterPool(() => transport, 1, vi.fn(), "m1");
    pool.reconcile(new Set([1]));
    pool.reconcile(new Set()); // released before open() resolved
    transport.resolveOpen(true);
    await Promise.resolve();
    expect(transport.closed).toBe(true);
    expect(transport.sent).toEqual([]); // never registered or subscribed
    expect(pool.channels()).toEqual([]);
  });

  it("does not register when the socket fails to open", async () => {
    const transport = deferredTransport();
    const pool = new PostFaderMeterPool(() => transport, 1, vi.fn(), "m1");
    pool.reconcile(new Set([2]));
    transport.resolveOpen(false);
    await Promise.resolve();
    expect(transport.sent).toEqual([]);
    expect(pool.channels()).toEqual([2]); // still tracked; released normally on reconcile/disconnect
    pool.releaseAll();
    expect(transport.closed).toBe(true);
  });
});
