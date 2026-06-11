import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ObsDeviceForm } from "./ObsDeviceForm";
import type { DeviceRecord, DirtyCheck } from "./deviceTypeRegistry";
import {
  TEST_ID_DEVICE_FORM_LABEL,
  TEST_ID_DEVICE_FORM_HOST,
  TEST_ID_DEVICE_FORM_PASSWORD,
  TEST_ID_DEVICE_FORM_ENABLED,
  TEST_ID_DEVICE_FORM_SAVE,
  TEST_ID_DEVICE_FORM_DELETE,
  TEST_ID_DEVICE_FORM_ERROR,
  TEST_ID_DEVICE_FORM_NDI_OUTPUT_NAME,
  TEST_ID_CONFIRMATION_CONFIRM_BUTTON,
  TEST_ID_CONFIRMATION_CANCEL_BUTTON,
} from "../../constants/testIds";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const DEVICE: DeviceRecord = {
  id: "d1",
  deviceType: "obs",
  label: "Main OBS",
  host: "192.168.1.100",
  port: 4455,
  metadata: { streamTitleTemplate: "{Date} – {Speaker}" },
  features: {},
  enabled: true,
  createdAt: "2026-01-01",
};

const noop = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

function renderCreate(overrides?: { onSaved?: () => void; registerDirtyCheck?: (c: DirtyCheck) => void }): void {
  render(<ObsDeviceForm device={null} onSaved={overrides?.onSaved ?? noop} onDeleted={noop} registerDirtyCheck={overrides?.registerDirtyCheck ?? noop} />);
}

function renderEdit(overrides?: { onSaved?: () => void; onDeleted?: () => void; registerDirtyCheck?: (c: DirtyCheck) => void }): void {
  render(
    <ObsDeviceForm
      device={DEVICE}
      onSaved={overrides?.onSaved ?? noop}
      onDeleted={overrides?.onDeleted ?? noop}
      registerDirtyCheck={overrides?.registerDirtyCheck ?? noop}
    />,
  );
}

describe("ObsDeviceForm — create mode", () => {
  it("renders create form with default values", () => {
    renderCreate();
    expect(screen.getByText("New OBS Connection")).toBeInTheDocument();
    expect(screen.getByTestId(TEST_ID_DEVICE_FORM_SAVE)).toBeInTheDocument();
    expect(screen.queryByTestId(TEST_ID_DEVICE_FORM_DELETE)).not.toBeInTheDocument();
    expect(screen.queryByTestId(TEST_ID_DEVICE_FORM_ENABLED)).not.toBeInTheDocument();
  });

  it("save is disabled when label and host are empty", () => {
    renderCreate();
    const saveButton = screen.getByTestId(TEST_ID_DEVICE_FORM_SAVE) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
  });

  it("submits POST request on save", async () => {
    const onSaved = vi.fn();
    renderCreate({ onSaved });

    fireEvent(screen.getByTestId(TEST_ID_DEVICE_FORM_LABEL), new CustomEvent("ionInput", { detail: { value: "Test OBS" } }));
    fireEvent(screen.getByTestId(TEST_ID_DEVICE_FORM_HOST), new CustomEvent("ionInput", { detail: { value: "10.0.0.1" } }));

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: "d2" }) });

    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_DEVICE_FORM_SAVE));
    });

    expect(mockFetch).toHaveBeenCalledWith("/api/admin/devices", expect.objectContaining({ method: "POST" }));
    expect(onSaved).toHaveBeenCalled();
  });

  it("renders NDI Output Name field with placeholder", () => {
    renderCreate();
    const ndiField = screen.getByTestId(TEST_ID_DEVICE_FORM_NDI_OUTPUT_NAME);
    expect(ndiField).toBeInTheDocument();
    expect(ndiField).toHaveAttribute("placeholder", "OBS-MACHINE (OBS)");
  });

  it("includes ndiOutputName in metadata on save", async () => {
    const onSaved = vi.fn();
    renderCreate({ onSaved });

    fireEvent(screen.getByTestId(TEST_ID_DEVICE_FORM_LABEL), new CustomEvent("ionInput", { detail: { value: "OBS" } }));
    fireEvent(screen.getByTestId(TEST_ID_DEVICE_FORM_HOST), new CustomEvent("ionInput", { detail: { value: "10.0.0.1" } }));
    fireEvent(screen.getByTestId(TEST_ID_DEVICE_FORM_NDI_OUTPUT_NAME), new CustomEvent("ionInput", { detail: { value: "MY-PC (OBS)" } }));

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: "d3" }) });

    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_DEVICE_FORM_SAVE));
    });

    const call = mockFetch.mock.calls[0]!;
    const body = JSON.parse(call[1].body as string);
    expect(body.metadata).toEqual({ ndiOutputName: "MY-PC (OBS)" });
  });

  it("shows error on failed create", async () => {
    renderCreate();

    fireEvent(screen.getByTestId(TEST_ID_DEVICE_FORM_LABEL), new CustomEvent("ionInput", { detail: { value: "Test" } }));
    fireEvent(screen.getByTestId(TEST_ID_DEVICE_FORM_HOST), new CustomEvent("ionInput", { detail: { value: "host" } }));

    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Duplicate label" }) });

    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_DEVICE_FORM_SAVE));
    });

    expect(screen.getByTestId(TEST_ID_DEVICE_FORM_ERROR)).toHaveTextContent("Duplicate label");
  });
});

describe("ObsDeviceForm — edit mode", () => {
  it("renders edit form with device values", () => {
    renderEdit();
    expect(screen.getByText("Edit Main OBS")).toBeInTheDocument();
    expect(screen.getByTestId(TEST_ID_DEVICE_FORM_ENABLED)).toBeInTheDocument();
    expect(screen.getByTestId(TEST_ID_DEVICE_FORM_DELETE)).toBeInTheDocument();
  });

  it("submits PUT request on save", async () => {
    const onSaved = vi.fn();
    renderEdit({ onSaved });

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => DEVICE });

    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_DEVICE_FORM_SAVE));
    });

    expect(mockFetch).toHaveBeenCalledWith("/api/admin/devices/d1", expect.objectContaining({ method: "PUT" }));
    expect(onSaved).toHaveBeenCalled();
  });

  it("delete button opens confirmation modal", () => {
    renderEdit();
    fireEvent.click(screen.getByTestId(TEST_ID_DEVICE_FORM_DELETE));
    expect(screen.getByText(/Are you sure you want to delete "Main OBS"/)).toBeInTheDocument();
  });

  it("confirming delete calls DELETE API", async () => {
    const onDeleted = vi.fn();
    renderEdit({ onDeleted });

    fireEvent.click(screen.getByTestId(TEST_ID_DEVICE_FORM_DELETE));
    mockFetch.mockResolvedValueOnce({ ok: true });

    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON));
    });

    expect(mockFetch).toHaveBeenCalledWith("/api/admin/devices/d1", expect.objectContaining({ method: "DELETE" }));
    expect(onDeleted).toHaveBeenCalled();
  });
});

describe("ObsDeviceForm — dirty check", () => {
  it("reports not dirty when no changes made", () => {
    let dirtyCheck: DirtyCheck = { isDirty: () => false };
    renderEdit({
      registerDirtyCheck: (c) => {
        dirtyCheck = c;
      },
    });
    expect(dirtyCheck.isDirty()).toBe(false);
  });

  it("reports dirty when label changes", () => {
    let dirtyCheck: DirtyCheck = { isDirty: () => false };
    renderEdit({
      registerDirtyCheck: (c) => {
        dirtyCheck = c;
      },
    });

    fireEvent(screen.getByTestId(TEST_ID_DEVICE_FORM_LABEL), new CustomEvent("ionInput", { detail: { value: "Changed" } }));
    expect(dirtyCheck.isDirty()).toBe(true);
  });

  it("reports not dirty when value reverts to original (a→b→a)", () => {
    let dirtyCheck: DirtyCheck = { isDirty: () => false };
    renderEdit({
      registerDirtyCheck: (c) => {
        dirtyCheck = c;
      },
    });

    fireEvent(screen.getByTestId(TEST_ID_DEVICE_FORM_LABEL), new CustomEvent("ionInput", { detail: { value: "Changed" } }));
    expect(dirtyCheck.isDirty()).toBe(true);

    fireEvent(screen.getByTestId(TEST_ID_DEVICE_FORM_LABEL), new CustomEvent("ionInput", { detail: { value: "Main OBS" } }));
    expect(dirtyCheck.isDirty()).toBe(false);
  });

  it("reports dirty when password is entered in edit mode", () => {
    let dirtyCheck: DirtyCheck = { isDirty: () => false };
    renderEdit({
      registerDirtyCheck: (c) => {
        dirtyCheck = c;
      },
    });

    fireEvent(screen.getByTestId(TEST_ID_DEVICE_FORM_PASSWORD), new CustomEvent("ionInput", { detail: { value: "newpass" } }));
    expect(dirtyCheck.isDirty()).toBe(true);
  });

  it("reports not dirty when password is cleared back to empty in edit mode", () => {
    let dirtyCheck: DirtyCheck = { isDirty: () => false };
    renderEdit({
      registerDirtyCheck: (c) => {
        dirtyCheck = c;
      },
    });

    fireEvent(screen.getByTestId(TEST_ID_DEVICE_FORM_PASSWORD), new CustomEvent("ionInput", { detail: { value: "newpass" } }));
    fireEvent(screen.getByTestId(TEST_ID_DEVICE_FORM_PASSWORD), new CustomEvent("ionInput", { detail: { value: "" } }));
    expect(dirtyCheck.isDirty()).toBe(false);
  });
});

describe("ObsDeviceForm — error paths", () => {
  it("shows network error when save fetch throws", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network down"));
    renderCreate();

    fireEvent(screen.getByTestId(TEST_ID_DEVICE_FORM_LABEL), new CustomEvent("ionInput", { detail: { value: "New" } }));
    fireEvent(screen.getByTestId(TEST_ID_DEVICE_FORM_HOST), new CustomEvent("ionInput", { detail: { value: "10.0.0.1" } }));
    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_DEVICE_FORM_SAVE));
    });

    expect(screen.getByTestId(TEST_ID_DEVICE_FORM_ERROR)).toHaveTextContent("Network error");
  });

  it("shows API error when delete returns non-ok", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Device in use" }) });
    renderEdit();

    fireEvent.click(screen.getByTestId(TEST_ID_DEVICE_FORM_DELETE));
    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON));
    });

    expect(screen.getByTestId(TEST_ID_DEVICE_FORM_ERROR)).toHaveTextContent("Device in use");
  });

  it("shows default Delete failed when response has no error field", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    renderEdit();

    fireEvent.click(screen.getByTestId(TEST_ID_DEVICE_FORM_DELETE));
    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON));
    });

    expect(screen.getByTestId(TEST_ID_DEVICE_FORM_ERROR)).toHaveTextContent("Delete failed");
  });

  it("shows network error when delete fetch throws", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network down"));
    renderEdit();

    fireEvent.click(screen.getByTestId(TEST_ID_DEVICE_FORM_DELETE));
    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON));
    });

    expect(screen.getByTestId(TEST_ID_DEVICE_FORM_ERROR)).toHaveTextContent("Network error");
  });

  it("shows default Save failed when POST response has no error field", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    renderCreate();

    fireEvent(screen.getByTestId(TEST_ID_DEVICE_FORM_LABEL), new CustomEvent("ionInput", { detail: { value: "New" } }));
    fireEvent(screen.getByTestId(TEST_ID_DEVICE_FORM_HOST), new CustomEvent("ionInput", { detail: { value: "10.0.0.1" } }));
    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_DEVICE_FORM_SAVE));
    });

    expect(screen.getByTestId(TEST_ID_DEVICE_FORM_ERROR)).toHaveTextContent("Save failed");
  });

  it("cancel delete closes the confirmation modal without calling DELETE", () => {
    renderEdit();

    fireEvent.click(screen.getByTestId(TEST_ID_DEVICE_FORM_DELETE));
    expect(screen.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON)).toBeInTheDocument();

    const cancelBtn = screen.getByTestId(TEST_ID_CONFIRMATION_CANCEL_BUTTON);
    fireEvent.click(cancelBtn);

    expect(screen.queryByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON)).not.toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("toggling enabled checkbox marks form dirty", () => {
    let dirtyCheck: DirtyCheck = { isDirty: () => false };
    renderEdit({
      registerDirtyCheck: (c) => {
        dirtyCheck = c;
      },
    });

    fireEvent(screen.getByTestId(TEST_ID_DEVICE_FORM_ENABLED), new CustomEvent("ionChange", { detail: { checked: false } }));
    expect(dirtyCheck.isDirty()).toBe(true);
  });

  it("port field preserves previous port when input empty", () => {
    let dirtyCheck: DirtyCheck = { isDirty: () => false };
    renderEdit({
      registerDirtyCheck: (c) => {
        dirtyCheck = c;
      },
    });

    // Fire ionInput with undefined value → handler fallback to DEFAULT_PORT
    fireEvent(screen.getByTestId("device-form-port"), new CustomEvent("ionInput", { detail: { value: undefined } }));
    // Port was "4455" (from device), handler now set it to DEFAULT_PORT (also "4455") — not dirty
    expect(dirtyCheck.isDirty()).toBe(false);
  });
});
