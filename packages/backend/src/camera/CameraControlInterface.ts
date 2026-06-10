import type { PositionInquiry } from "@invisible-av-booth/shared";

export interface CameraControlInterface {
  panTiltSpeed(panSpeed: number, tiltSpeed: number): Promise<void>;
  panTiltAbsolute(pan: number, tilt: number): Promise<void>;
  zoomAbsolute(zoom: number): Promise<void>;
  focusAuto(): Promise<void>;
  focusManual(position: number): Promise<void>;
  stop(): Promise<void>;
  inquirePosition(): Promise<PositionInquiry>;
  connect(): Promise<boolean>;
  disconnect(): void;
  isConnected(): boolean;
}

export interface AiTrackingDriver {
  setAiState(enabled: boolean, aiTilt: boolean, aiZoom: boolean): Promise<void>;
}
