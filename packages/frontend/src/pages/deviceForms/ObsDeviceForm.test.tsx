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
  TEST_ID_CONFIRMATION_CONFIRM_BUTTON,
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
