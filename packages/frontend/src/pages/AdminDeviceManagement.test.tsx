import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { AdminDeviceManagement } from "./AdminDeviceManagement";
import { useStore } from "../store";
import { INITIAL_OBS_STATE } from "../store/obsSlice";
import { TEST_ID_CREATE_DEVICE_HOST, TEST_ID_CREATE_DEVICE_LABEL, TEST_ID_CREATE_DEVICE_SUBMIT, TEST_ID_CREATE_TEMPLATE_PREVIEW, TEST_ID_DEVICE_LIST, TEST_ID_EDIT_DEVICE_LABEL, TEST_ID_EDIT_DEVICE_SAVE, TEST_ID_EDIT_TEMPLATE_PREVIEW } from "../constants/testIds";

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
    await waitFor(() => expect(screen.getByTestId(TEST_ID_DEVICE_LIST)).toBeInTheDocument());

    const labelInput = screen.getByTestId(TEST_ID_CREATE_DEVICE_LABEL);
    const hostInput = screen.getByTestId(TEST_ID_CREATE_DEVICE_HOST);
    fireEvent(labelInput, new CustomEvent("ionInput", { detail: { value: "Backup OBS" } }));
    fireEvent(hostInput, new CustomEvent("ionInput", { detail: { value: "192.168.1.200" } }));

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: "d2" }) });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [...DEVICES, { id: "d2", label: "Backup OBS" }] });

    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_CREATE_DEVICE_SUBMIT));
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/admin/devices", expect.objectContaining({ method: "POST" }));
    });
  });

  it("stream title template shows live preview", async () => {
    mockListDevices();
    renderPage();
    await waitFor(() => expect(screen.getByTestId(TEST_ID_CREATE_TEMPLATE_PREVIEW)).toBeInTheDocument());

    // Default template with store manifest { speaker: "John", title: "Grace" }
    expect(screen.getByTestId(TEST_ID_CREATE_TEMPLATE_PREVIEW)).toHaveTextContent("John");
  });

  it("edit device opens form and saves", async () => {
    mockListDevices();
    renderPage();
    await waitFor(() => expect(screen.getByTestId("edit-device-button-d1")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("edit-device-button-d1"));
    expect(screen.getByTestId(TEST_ID_EDIT_DEVICE_LABEL)).toBeInTheDocument();

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => DEVICES[0] });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => DEVICES });

    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_EDIT_DEVICE_SAVE));
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/admin/devices/d1", expect.objectContaining({ method: "PUT" }));
    });
  });

  it("edit shows template preview", async () => {
    mockListDevices();
    renderPage();
    await waitFor(() => expect(screen.getByTestId("edit-device-button-d1")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("edit-device-button-d1"));
    expect(screen.getByTestId(TEST_ID_EDIT_TEMPLATE_PREVIEW)).toHaveTextContent("John");
  });

  it("delete device calls API and refreshes", async () => {
    mockListDevices();
    renderPage();
    await waitFor(() => expect(screen.getByTestId("delete-device-button-d1")).toBeInTheDocument());

    mockFetch.mockResolvedValueOnce({ ok: true });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] });

    await act(async () => {
      fireEvent.click(screen.getByTestId("delete-device-button-d1"));
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/admin/devices/d1", expect.objectContaining({ method: "DELETE" }));
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
