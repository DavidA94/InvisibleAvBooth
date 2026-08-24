import type { ReactNode } from "react";
import type { GridCell } from "../types";
import { useStore } from "../store";
import { ObsWidget } from "./obs/ObsWidget";
import { LowerThirdWidget } from "./lower-thirds/LowerThirdWidget";
import { ObsPreviewWidget } from "./obs-preview/ObsPreviewWidget";
import { CameraWidget } from "./camera/CameraWidget";

/**
 * Maps widget IDs to their React component.
 *
 * To add a new widget type:
 * 1. Add an entry to WIDGET_TYPE_REGISTRY in packages/shared/src/widgetTypeRegistry.ts
 * 2. Add the component mapping here
 */
function ObsPreviewWidgetWrapper(): ReactNode {
  const ndiConfigured = useStore((s) => s.obsPreviewNdiConfigured);
  return <ObsPreviewWidget enabled={true} ndiConfigured={ndiConfigured} />;
}

function CameraWidgetWrapper(): ReactNode {
  return <CameraWidget />;
}

const WIDGET_COMPONENTS: Record<string, () => ReactNode> = {
  obs: ObsWidget,
  "lower-thirds": LowerThirdWidget,
  "obs-preview": ObsPreviewWidgetWrapper,
  camera: CameraWidgetWrapper,
};

/** Renders the appropriate widget component for a grid cell, or a placeholder for unknown types. */
export function renderWidget(cell: GridCell): ReactNode {
  const Component = WIDGET_COMPONENTS[cell.widgetId];
  if (Component) return <Component />;

  // Fallback placeholder for unknown widget types
  return (
    <div data-testid={`widget-${cell.widgetId}`} className="surface layout-centered full-height">
      {cell.title}
    </div>
  );
}
