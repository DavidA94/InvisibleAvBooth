import type { PositionInquiry } from "@invisible-av-booth/shared";
import type { CameraControlInterface } from "./CameraControlInterface.js";
import { getNdiModule } from "./ndiLoader.js";
import { logger } from "../logger.js";

/**
 * NDI Camera Driver — video receive only.
 *
 * grandi does not yet support PTZ control APIs. All PTZ commands are
 * handled by ViscaCameraDriver (required for camera control).
 * This driver provides NDI source connection and video frame access.
 */
export class NdiCameraDriver implements CameraControlInterface {
  private sourceName: string;
  private extraIPs: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private receiver: any = null;
  private connected = false;
  private lastCommanded: PositionInquiry = { pan: 0, tilt: 0, zoom: 0, focus: 0.5, autoFocus: true };

  constructor(sourceName: string, extraIPs?: string) {
    this.sourceName = sourceName;
    this.extraIPs = extraIPs ?? null;
  }

  async connect(): Promise<boolean> {
    const ndi = getNdiModule();
    if (!ndi) return false;
    try {
      const mod = ndi.default ?? ndi;
      const findOpts: Record<string, unknown> = { showLocalSources: true };
      if (this.extraIPs) findOpts["extraIPs"] = this.extraIPs;
      logger.info(`NDI camera connecting: "${this.sourceName}" (extraIPs: ${this.extraIPs ?? "none"})`);
      const finder = await mod.find(findOpts);
      if (finder.wait) finder.wait(3000);
      const sources = finder.sources ? finder.sources() : finder;
      const sourceList = Array.isArray(sources) ? sources : [];
      logger.info(`NDI finder discovered ${sourceList.length} source(s): ${sourceList.map((s: { name: string }) => s.name).join(", ") || "(none)"}`);
      const source = sourceList.find((s: { name: string }) => s.name === this.sourceName);
      if (finder.destroy) finder.destroy();
      if (!source) {
        logger.warn(`NDI source "${this.sourceName}" not found`);
        return false;
      }
      this.receiver = await mod.receive({ source, colorFormat: mod.COLOR_FORMAT_BEST ?? mod.COLOR_FORMAT_BGRX_BGRA ?? 101 });
      this.connected = true;
      return true;
    } catch (err) {
      logger.error(`NDI connect failed for "${this.sourceName}"`, { context: { error: String(err) } });
      return false;
    }
  }

  disconnect(): void {
    if (this.receiver?.destroy) this.receiver.destroy();
    this.receiver = null;
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  // PTZ commands are no-ops — grandi doesn't support PTZ yet.
  // All PTZ is handled by ViscaCameraDriver.
  async panTiltSpeed(_panSpeed: number, _tiltSpeed: number): Promise<void> {}
  async panTiltAbsolute(pan: number, tilt: number): Promise<void> {
    this.lastCommanded.pan = pan;
    this.lastCommanded.tilt = tilt;
  }
  async zoomAbsolute(zoom: number): Promise<void> {
    this.lastCommanded.zoom = zoom;
  }
  async focusAuto(): Promise<void> {
    this.lastCommanded.autoFocus = true;
  }
  async focusManual(position: number): Promise<void> {
    this.lastCommanded.focus = position;
    this.lastCommanded.autoFocus = false;
  }
  async stop(): Promise<void> {}

  async inquirePosition(): Promise<PositionInquiry> {
    return { ...this.lastCommanded };
  }

  getLastCommanded(): PositionInquiry {
    return { ...this.lastCommanded };
  }
}
