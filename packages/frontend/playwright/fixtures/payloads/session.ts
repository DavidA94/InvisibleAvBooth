export interface SessionManifestPayload {
  manifest: {
    speaker?: string;
    title?: string;
    scripture?: { bookId: number; chapter: number; verse: number; verseEnd?: number };
    titleTemplateId?: string;
    descriptionTemplateId?: string;
  };
  interpolatedStreamTitle: string;
  interpolatedDescription: string;
  manifestReady: boolean;
}

export function sessionManifestDefault(overrides?: Partial<SessionManifestPayload>): SessionManifestPayload {
  return {
    manifest: {},
    interpolatedStreamTitle: "",
    interpolatedDescription: "",
    manifestReady: false,
    ...overrides,
  };
}

export function sessionManifestFilled(overrides?: Partial<SessionManifestPayload>): SessionManifestPayload {
  return {
    manifest: { speaker: "John Smith", title: "Grace", titleTemplateId: "t1" },
    interpolatedStreamTitle: `${new Date().toISOString().slice(0, 10)} – John Smith – Grace`,
    interpolatedDescription: "",
    manifestReady: true,
    ...overrides,
  };
}

export interface DashboardLayoutPayload {
  grids: Record<
    string,
    Array<{
      widgetId: string;
      title: string;
      col: number;
      row: number;
      colSpan: number;
      rowSpan: number;
      roleMinimum: string;
    }>
  >;
}

export function dashboardLayoutDefault(): DashboardLayoutPayload {
  const cells = [{ widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 3, rowSpan: 2, roleMinimum: "AvVolunteer" }];
  return {
    grids: {
      "large-landscape": cells,
      "large-portrait": cells,
      "small-landscape": cells,
      "small-portrait": cells,
    },
  };
}

export function dashboardListDefault(): Array<{ slug: string; name: string; description: string }> {
  return [{ slug: "default", name: "Main Dashboard", description: "Primary control dashboard" }];
}
