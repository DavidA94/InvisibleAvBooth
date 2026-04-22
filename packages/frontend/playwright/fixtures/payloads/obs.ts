export interface ObsStatePayload {
  connected: boolean;
  streaming: boolean;
  recording: boolean;
  streamTimecode?: string;
  recordingTimecode?: string;
  commandedState: { streaming: boolean; recording: boolean };
}

export function obsStateDefault(overrides?: Partial<ObsStatePayload>): ObsStatePayload {
  return {
    connected: true,
    streaming: false,
    recording: false,
    commandedState: { streaming: false, recording: false },
    ...overrides,
  };
}

export function obsStateLive(overrides?: Partial<ObsStatePayload>): ObsStatePayload {
  return {
    connected: true,
    streaming: true,
    recording: false,
    streamTimecode: "00:05:00",
    commandedState: { streaming: true, recording: false },
    ...overrides,
  };
}
