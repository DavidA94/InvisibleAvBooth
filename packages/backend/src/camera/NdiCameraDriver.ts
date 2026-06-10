import type { PositionInquiry } from "@invisible-av-booth/shared";
import type { CameraControlInterface } from "./CameraControlInterface.js";
import { getNdiModule } from "./ndiLoader.js";
import { logger } from "../logger.js";

export class NdiCameraDriver implements CameraControlInterface {
  private sourceName: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private receiver: any = null;
  private connected = false;
  private lastCommanded: PositionInquiry = { pan: 0, tilt: 0, zoom: 0, focus: 0.5, autoFocus: true };

  constructor(sourceName: string) {
    this.sourceName = sourceName;
  }

  async connect(): Promise<boolean> {
    const ndi = getNdiModule();
    if (!ndi) return false;
    try {
      const sources = await ndi.find({ showLocalSources: true });
      const source = sources.find((s: { name: string }) => s.name === this.sourceName);
      if (!source) {
        logger.warn(`NDI source "${this.sourceName}" not found`);
        return false;
      }
      this.receiver = await ndi.receive({ source, colorFormat: ndi.COLOR_FORMAT_FASTEST });
      this.connected = true;
      return true;
    } catch (err) {
      logger.error(`NDI connect failed for "${this.sourceName}"`, { context: { error: String(err) } });
      return false;
    }
  }

  disconnect(): void {
    this.receiver = null;
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async panTiltSpeed(panSpeed: number, tiltSpeed: number): Promise<void> {
    if (!this.receiver) return;
    try {
      await this.receiver.ptz_pan_tilt_speed(panSpeed, tiltSpeed);
    } catch {
      // ignore
    }
  }

  async panTiltAbsolute(pan: number, tilt: number): Promise<void> {
    if (!this.receiver) return;
    try {
      await this.receiver.ptz_pan_tilt(pan, tilt);
      this.lastCommanded.pan = pan;
      this.lastCommanded.tilt = tilt;
    } catch {
      // ignore
    }
  }

  async zoomAbsolute(zoom: number): Promise<void> {
    if (!this.receiver) return;
    try {
      await this.receiver.ptz_zoom(zoom);
      this.lastCommanded.zoom = zoom;
    } catch {
      // ignore
    }
  }

  async focusAuto(): Promise<void> {
    if (!this.receiver) return;
    try {
      await this.receiver.ptz_focus_auto();
      this.lastCommanded.autoFocus = true;
    } catch {
      // ignore
    }
  }

  async focusManual(position: number): Promise<void> {
    if (!this.receiver) return;
    try {
      await this.receiver.ptz_focus(position);
      this.lastCommanded.focus = position;
      this.lastCommanded.autoFocus = false;
    } catch {
      // ignore
    }
  }

  async stop(): Promise<void> {
    if (!this.receiver) return;
    try {
      await this.receiver.ptz_pan_tilt_speed(0, 0);
    } catch {
      // ignore
    }
  }

  async inquirePosition(): Promise<PositionInquiry> {
    return { ...this.lastCommanded };
  }

  getLastCommanded(): PositionInquiry {
    return { ...this.lastCommanded };
  }
}
