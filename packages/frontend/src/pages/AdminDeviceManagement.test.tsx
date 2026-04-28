import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { AdminDeviceManagement } from "./AdminDeviceManagement";
import { useStore } from "../store";
import { INITIAL_OBS_STATE } from "../store/obsSlice";
import {
  TEST_ID_ADMIN_DEVICES_PAGE, TEST_ID_DEVICE_LIST, TEST_ID_DEVICE_LIST_ITEM,
  TEST_ID_ADD_DEVICE_BUTTON, TEST_ID_ADD_DEVICE_TYPE_OPTION,
  TEST_ID_DEVICE_DETAIL_EMPTY, TEST_ID_DEVICE_DETAIL_PANEL,
  TEST_ID_DEVICE_FORM_LABEL, TEST_ID_DEVICE_FORM_HOST, TEST_ID_DEVICE_FORM_SAVE,
  TEST_ID_DEVICE_FORM_TEMPLATE_PREVIEW, TEST_ID_DEVICE_LIST_DELETE_BUTTON,
  TEST_ID_CONFIRMATION_CONFIRM_BUTTON, TEST_ID_CONFIRMATION_CANCEL_BUTTON,
} from "../constants/testIds";

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
  {
    id: "d2",
    deviceType: "obs",
    label: "Backup OBS",
    host: "192.168.1.200",
    port: 4455,
    metadata: { streamTitleTemplate: "{Date} – {Title}" },
    features: {},
    enabled: false,
    createdAt: "2026-01-02",
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

function mockListDevices(devices = DEVICES): void {
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => devices });
}

function renderPage(): ReturnType<typeof render> {
  return render(<AdminDeviceManagement />);
}

describe("AdminDeviceManagement", () => {
  it("renders device list from API", async () => {
    mockListDevices();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(`${TEST_ID_DEVICE_LIST_ITEM}-d1`)).toBeInTheDocument();
    });
    expect(screen.getByText("Main OBS")).toBeInTheDocument();
    expect(screen.getByText("Backup OBS")).toBeInTheDocument();
  });

  it("shows device type sublabel", async () => {
    mockListDevices();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(`${TEST_ID_DEVICE_LIST_ITEM}-d1`)).toBeInTheDocument();
    });
    // OBS display name should appear as sublabel
    expect(screen.getByTestId(`${TEST_ID_DEVICE_LIST_ITEM}-d1`)).toHaveTextContent("OBS");
  });

  it("shows disabled indicator for disabled devices", async () => {
    mockListDevices();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(`${TEST_ID_DEVICE_LIST_ITEM}-d2`)).toBeInTheDocument();
    });
    expect(screen.getByTestId(`${TEST_ID_DEVICE_LIST_ITEM}-d2`)).toHaveTextContent("Disabled");
  });

  it("shows empty detail panel initially", async () => {
    mockListDevices();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_DEVICE_DETAIL_EMPTY)).toBeInTheDocument();
    });
    expect(screen.getByText("Select a device or add a new one")).toBeInTheDocument();
  });

  it("clicking a device opens edit form in detail panel", async () => {
    mockListDevices();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(`${TEST_ID_DEVICE_LIST_ITEM}-d1`)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId(`${TEST_ID_DEVICE_LIST_ITEM}-d1`));
    expect(screen.getByText("Edit Main OBS")).toBeInTheDocument();
  });

  it("add device button opens dropdown with device types", async () => {
    mockListDevices();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_ADD_DEVICE_BUTTON)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId(TEST_ID_ADD_DEVICE_BUTTON));
    expect(screen.getByTestId(`${TEST_ID_ADD_DEVICE_TYPE_OPTION}-obs`)).toBeInTheDocument();
  });

  it("selecting OBS from dropdown opens create form", async () => {
    mockListDevices();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_ADD_DEVICE_BUTTON)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId(TEST_ID_ADD_DEVICE_BUTTON));
    fireEvent.click(screen.getByTestId(`${TEST_ID_ADD_DEVICE_TYPE_OPTION}-obs`));
    expect(screen.getByText("New OBS Connection")).toBeInTheDocument();
  });

  it("shows empty state when no devices", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("No devices configured")).toBeInTheDocument();
    });
  });

  it("list delete button opens confirmation modal", async () => {
    mockListDevices();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(`${TEST_ID_DEVICE_LIST_DELETE_BUTTON}-d1`)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId(`${TEST_ID_DEVICE_LIST_DELETE_BUTTON}-d1`));
    expect(screen.getByText(/Are you sure you want to delete "Main OBS"/)).toBeInTheDocument();
  });

  it("confirming list delete calls DELETE API and refreshes", async () => {
    mockListDevices();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(`${TEST_ID_DEVICE_LIST_DELETE_BUTTON}-d1`)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId(`${TEST_ID_DEVICE_LIST_DELETE_BUTTON}-d1`));

    mockFetch.mockResolvedValueOnce({ ok: true });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [DEVICES[1]] });

    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON));
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/admin/devices/d1", expect.objectContaining({ method: "DELETE" }));
    });
  });

  it("create form submits and refreshes list", async () => {
    mockListDevices();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_ADD_DEVICE_BUTTON)).toBeInTheDocument();
    });

    // Open create form
    fireEvent.click(screen.getByTestId(TEST_ID_ADD_DEVICE_BUTTON));
    fireEvent.click(screen.getByTestId(`${TEST_ID_ADD_DEVICE_TYPE_OPTION}-obs`));

    // Fill form
    fireEvent(screen.getByTestId(TEST_ID_DEVICE_FORM_LABEL), new CustomEvent("ionInput", { detail: { value: "New OBS" } }));
    fireEvent(screen.getByTestId(TEST_ID_DEVICE_FORM_HOST), new CustomEvent("ionInput", { detail: { value: "10.0.0.1" } }));

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: "d3" }) });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [...DEVICES, { id: "d3", deviceType: "obs", label: "New OBS", host: "10.0.0.1", port: 4455, metadata: {}, features: {}, enabled: true, createdAt: "2026-01-03" }] });

    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_DEVICE_FORM_SAVE));
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/admin/devices", expect.objectContaining({ method: "POST" }));
    });
  });

  it("edit form submits and refreshes list", async () => {
    mockListDevices();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(`${TEST_ID_DEVICE_LIST_ITEM}-d1`)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId(`${TEST_ID_DEVICE_LIST_ITEM}-d1`));

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => DEVICES[0] });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => DEVICES });

    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_DEVICE_FORM_SAVE));
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/admin/devices/d1", expect.objectContaining({ method: "PUT" }));
    });
  });

  it("template preview shows manifest data", async () => {
    mockListDevices();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(`${TEST_ID_DEVICE_LIST_ITEM}-d1`)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId(`${TEST_ID_DEVICE_LIST_ITEM}-d1`));
    expect(screen.getByTestId(TEST_ID_DEVICE_FORM_TEMPLATE_PREVIEW)).toHaveTextContent("John");
  });
});

describe("AdminDeviceManagement — unsaved changes guard", () => {
  it("warns when navigating away with unsaved changes", async () => {
    mockListDevices();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(`${TEST_ID_DEVICE_LIST_ITEM}-d1`)).toBeInTheDocument();
    });

    // Open edit for d1
    fireEvent.click(screen.getByTestId(`${TEST_ID_DEVICE_LIST_ITEM}-d1`));

    // Make a change
    fireEvent(screen.getByTestId(TEST_ID_DEVICE_FORM_LABEL), new CustomEvent("ionInput", { detail: { value: "Changed" } }));

    // Try to navigate to d2
    fireEvent.click(screen.getByTestId(`${TEST_ID_DEVICE_LIST_ITEM}-d2`));

    // Should show confirmation modal
    expect(screen.getByText("Unsaved Changes")).toBeInTheDocument();
  });

  it("discarding changes navigates to new device", async () => {
    mockListDevices();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(`${TEST_ID_DEVICE_LIST_ITEM}-d1`)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId(`${TEST_ID_DEVICE_LIST_ITEM}-d1`));
    fireEvent(screen.getByTestId(TEST_ID_DEVICE_FORM_LABEL), new CustomEvent("ionInput", { detail: { value: "Changed" } }));
    fireEvent.click(screen.getByTestId(`${TEST_ID_DEVICE_LIST_ITEM}-d2`));

    // Confirm discard
    fireEvent.click(screen.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON));
    expect(screen.getByText("Edit Backup OBS")).toBeInTheDocument();
  });

  it("staying keeps the current form", async () => {
    mockListDevices();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(`${TEST_ID_DEVICE_LIST_ITEM}-d1`)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId(`${TEST_ID_DEVICE_LIST_ITEM}-d1`));
    fireEvent(screen.getByTestId(TEST_ID_DEVICE_FORM_LABEL), new CustomEvent("ionInput", { detail: { value: "Changed" } }));
    fireEvent.click(screen.getByTestId(`${TEST_ID_DEVICE_LIST_ITEM}-d2`));

    // Cancel — stay on current form
    fireEvent.click(screen.getByTestId(TEST_ID_CONFIRMATION_CANCEL_BUTTON));
    expect(screen.getByText("Edit Main OBS")).toBeInTheDocument();
  });

  it("no warning when value reverts to original (a→b→a)", async () => {
    mockListDevices();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(`${TEST_ID_DEVICE_LIST_ITEM}-d1`)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId(`${TEST_ID_DEVICE_LIST_ITEM}-d1`));
    fireEvent(screen.getByTestId(TEST_ID_DEVICE_FORM_LABEL), new CustomEvent("ionInput", { detail: { value: "Changed" } }));
    fireEvent(screen.getByTestId(TEST_ID_DEVICE_FORM_LABEL), new CustomEvent("ionInput", { detail: { value: "Main OBS" } }));

    // Navigate to d2 — should NOT show confirmation
    fireEvent.click(screen.getByTestId(`${TEST_ID_DEVICE_LIST_ITEM}-d2`));
    expect(screen.queryByText("Unsaved Changes")).not.toBeInTheDocument();
    expect(screen.getByText("Edit Backup OBS")).toBeInTheDocument();
  });
});
