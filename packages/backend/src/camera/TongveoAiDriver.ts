import type { AiTrackingDriver } from "./CameraControlInterface.js";
import { logger } from "../logger.js";

export class TongveoAiDriver implements AiTrackingDriver {
  private baseUrl: string;
  private cookie: string;
  private credentialId: string;

  constructor(host: string, cookie: string, credentialId: string) {
    this.baseUrl = `http://${host}`;
    this.cookie = cookie;
    this.credentialId = credentialId;
  }

  async setAiState(enabled: boolean, aiTilt: boolean, aiZoom: boolean): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/api/aiControl`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: this.cookie },
        body: JSON.stringify({
          ai_on: enabled ? "1" : "0",
          ai_enable: enabled ? "1" : "0",
          ai_mode: "1",
          ai_auto_zoom: aiZoom ? "1" : "0",
          ai_auto_tilt: aiTilt ? "1" : "0",
        }),
      });
    } catch (err) {
      logger.error("TongveoAiDriver aiControl failed", { context: { error: String(err) } });
      throw err;
    }

    if (enabled) {
      try {
        await fetch(`${this.baseUrl}/api/setPTZCmd`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: this.cookie },
          body: JSON.stringify({ Channel: 0, PtzCmd: 15, param1: 7, param2: 0, ID: this.credentialId }),
        });
      } catch (err) {
        logger.error("TongveoAiDriver setPTZCmd failed", { context: { error: String(err) } });
        throw err;
      }
    }
  }
}
