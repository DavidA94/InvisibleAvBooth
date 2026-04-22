export interface SessionManifestPayload {
  manifest: {
    speaker?: string;
    title?: string;
    scripture?: { bookId: number; chapter: number; verse: number; verseEnd?: number };
  };
  interpolatedStreamTitle: string;
}

export function sessionManifestDefault(overrides?: Partial<SessionManifestPayload>): SessionManifestPayload {
  return {
    manifest: {},
    interpolatedStreamTitle: "",
    ...overrides,
  };
}

export function sessionManifestFilled(overrides?: Partial<SessionManifestPayload>): SessionManifestPayload {
  return {
    manifest: { speaker: "John Smith", title: "Grace" },
    interpolatedStreamTitle: `${new Date().toISOString().slice(0, 10)} – John Smith – Grace`,
    ...overrides,
  };
}

export interface DashboardLayoutPayload {
  version: 1;
  cells: Array<{
    widgetId: string;
    title: string;
    col: number;
    row: number;
    colSpan: number;
    rowSpan: number;
    roleMinimum: string;
  }>;
}

export function dashboardLayoutDefault(): DashboardLayoutPayload {
  return {
    version: 1,
    cells: [{ widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 2, rowSpan: 2, roleMinimum: "AvVolunteer" }],
  };
}

export function dashboardListDefault(): Array<{ id: string; name: string; description: string }> {
  return [{ id: "default", name: "Main Dashboard", description: "Primary control dashboard" }];
}
