import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "../../test/ionicMocks";
import { CameraAdminPanel } from "./CameraAdminPanel";

vi.mock("react-select", () => ({
  default: ({ options, onChange, value, placeholder }: Record<string, unknown>) => {
    const opts = options as Array<{ value: string; label: string }>;
    return (
      <select
        data-testid="camera-model-select"
        aria-label={placeholder as string}
        value={(value as { value: string } | null)?.value ?? ""}
        onChange={(e) => {
          const opt = opts.find((o) => o.value === e.target.value);
          if (opt) (onChange as (o: { value: string; label: string }) => void)(opt);
        }}
      >
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CameraAdminPanel", () => {
  it("model selection shows AI config when not generic", () => {
    render(<CameraAdminPanel initialModel="tongveo-nvs20a-4kn" />);
    expect(screen.getByTestId("ai-config-section")).toBeInTheDocument();
  });

  it("model selection hides AI config for generic", () => {
    render(<CameraAdminPanel initialModel="generic" />);
    expect(screen.queryByTestId("ai-config-section")).not.toBeInTheDocument();
  });

  it("VISCA toggle shows host/port fields when enabled", () => {
    render(<CameraAdminPanel initialViscaEnabled={true} />);
    expect(screen.getByTestId("visca-fields")).toBeInTheDocument();
  });

  it("VISCA toggle hides host/port fields when disabled", () => {
    render(<CameraAdminPanel initialViscaEnabled={false} />);
    expect(screen.queryByTestId("visca-fields")).not.toBeInTheDocument();
    expect(screen.getByTestId("no-visca-note")).toBeInTheDocument();
  });

  it("feature toggles are rendered", () => {
    render(<CameraAdminPanel />);
    expect(screen.getByTestId("feature-pan")).toBeInTheDocument();
    expect(screen.getByTestId("feature-tilt")).toBeInTheDocument();
    expect(screen.getByTestId("feature-zoom")).toBeInTheDocument();
    expect(screen.getByTestId("feature-focus")).toBeInTheDocument();
  });

  it("AI feature toggles only shown for non-generic model", () => {
    const { unmount } = render(<CameraAdminPanel initialModel="generic" />);
    expect(screen.queryByTestId("feature-ai-tracking")).not.toBeInTheDocument();
    unmount();

    render(<CameraAdminPanel initialModel="tongveo-nvs20a-4kn" />);
    expect(screen.getByTestId("feature-ai-tracking")).toBeInTheDocument();
  });

  it("changing model dropdown updates AI section visibility", () => {
    render(<CameraAdminPanel initialModel="generic" />);
    expect(screen.queryByTestId("ai-config-section")).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId("camera-model-select"), { target: { value: "tongveo-nvs20a-4kn" } });
    expect(screen.getByTestId("ai-config-section")).toBeInTheDocument();
  });
});
