import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { AdminDeviceManagement } from "./AdminDeviceManagement";
import { useStore } from "../store";
import { INITIAL_OBS_STATE } from "../store/obsSlice";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const DEVICES = [
  {
    id: "d1",
    deviceType: "obs",
    label: "Main OBS",
    host: "192.168.1.100",
    port: 4455,
    metadata: { streamTitleTemplate: "{Date} – {Speaker}" },
    features: {},
    enabled: true,
    createdAt: "2026-01-01",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  useStore.setState({
    user: { id: "u1", username: "admin", role: "ADMIN" },
    obsState: INITIAL_OBS_STATE,
    obsPending: false,
    manifest: { speaker: "John", title: "Grace" },
    interpolatedStreamTitle: "",
    notifications: [],
  });
});

function mockListDevices(): void {
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => DEVICES });
}

function renderPage(): ReturnType<typeof render> {
  return render(<AdminDeviceManagement />);
}

describe("AdminDeviceManagement", () => {
  it("renders device list from API", async () => {
    mockListDevices();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("device-row-d1")).toBeInTheDocument();
    });
    expect(screen.getByText("Main OBS")).toBeInTheDocument();
  });

  it("create device form submits and refreshes list", async () => {
    mockListDevices();
    renderPage();
    await waitFor(() => expect(screen.getByTestId("device-list")).toBeInTheDocument());

    const labelInput = screen.getByTestId("create-device-label");
    const hostInput = screen.getByTestId("create-device-host");
    fireEvent(labelInput, new CustomEvent("ionInput", { detail: { value: "Backup OBS" } }));
    fireEvent(hostInput, new CustomEvent("ionInput", { detail: { value: "192.168.1.200" } }));

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: "d2" }) });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [...DEVICES, { id: "d2", label: "Backup OBS" }] });

    await act(async () => {
      fireEvent.click(screen.getByTestId("create-device-submit"));
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/admin/devices", expect.objectContaining({ method: "POST" }));
    });
  });

  it("stream title template shows live preview", async () => {
    mockListDevices();
    renderPage();
    await waitFor(() => expect(screen.getByTestId("create-template-preview")).toBeInTheDocument());

    // Default template with store manifest { speaker: "John", title: "Grace" }
    expect(screen.getByTestId("create-template-preview")).toHaveTextContent("John");
  });

  it("edit device opens form and saves", async () => {
    mockListDevices();
    renderPage();
    await waitFor(() => expect(screen.getByTestId("edit-device-btn-d1")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("edit-device-btn-d1"));
    expect(screen.getByTestId("edit-device-label")).toBeInTheDocument();

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => DEVICES[0] });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => DEVICES });

    await act(async () => {
      fireEvent.click(screen.getByTestId("edit-device-save"));
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/admin/devices/d1", expect.objectContaining({ method: "PUT" }));
    });
  });

  it("edit shows template preview", async () => {
    mockListDevices();
    renderPage();
    await waitFor(() => expect(screen.getByTestId("edit-device-btn-d1")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("edit-device-btn-d1"));
    expect(screen.getByTestId("edit-template-preview")).toHaveTextContent("John");
  });

  it("delete device calls API and refreshes", async () => {
    mockListDevices();
    renderPage();
    await waitFor(() => expect(screen.getByTestId("delete-device-btn-d1")).toBeInTheDocument());

    mockFetch.mockResolvedValueOnce({ ok: true });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] });

    await act(async () => {
      fireEvent.click(screen.getByTestId("delete-device-btn-d1"));
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/admin/devices/d1", expect.objectContaining({ method: "DELETE" }));
    });
  });

  it("shows empty state when no devices", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("No devices configured")).toBeInTheDocument();
    });
  });
});
