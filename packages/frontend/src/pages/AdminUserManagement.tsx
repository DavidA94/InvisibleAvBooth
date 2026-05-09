import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { ReactNode } from "react";
import { IonPage, IonContent, IonInput, IonButton, IonText, IonSpinner, IonPopover } from "@ionic/react";
import { addOutline } from "ionicons/icons";
import { IonIcon } from "@ionic/react";
import Select from "react-select";
import { darkSelectStyles } from "../theme/selectStyles";
import { useAuth } from "../hooks/useAuth";
import { ConfirmationModal } from "../components/ConfirmationModal";
import type { Role } from "../types";
import {
  TEST_ID_ADMIN_USERS_PAGE,
  TEST_ID_USER_LIST,
  TEST_ID_USER_LIST_ITEM,
  TEST_ID_ADD_USER_BUTTON,
  TEST_ID_USER_DETAIL_PANEL,
  TEST_ID_USER_DETAIL_EMPTY,
  TEST_ID_USER_LIST_DELETE_BUTTON,
  TEST_ID_USER_FORM_USERNAME,
  TEST_ID_USER_FORM_PASSWORD,
  TEST_ID_USER_FORM_ROLE_SELECT,
  TEST_ID_USER_FORM_SAVE,
  TEST_ID_USER_FORM_DELETE,
  TEST_ID_USER_FORM_ERROR,
} from "../constants/testIds";

interface UserRecord {
  id: string;
  username: string;
  role: Role;
  requiresPasswordChange: boolean;
  createdAt: string;
}

interface RoleOption {
  value: Role;
  label: string;
}

const ROLE_OPTIONS: RoleOption[] = [
  { value: "ADMIN", label: "Admin" },
  { value: "AvPowerUser", label: "AV Power User" },
  { value: "AvVolunteer", label: "AV Volunteer" },
];

const ROLE_DISPLAY: Record<string, string> = {
  ADMIN: "Admin",
  AvPowerUser: "AV Power User",
  AvVolunteer: "AV Volunteer",
};

const ROLE_ORDER: Record<string, number> = { ADMIN: 0, AvPowerUser: 1, AvVolunteer: 2 };

const roleStyles = darkSelectStyles<RoleOption>();

interface PanelState {
  mode: "empty" | "create" | "edit";
  userId?: string;
}

interface DirtyCheck {
  isDirty: () => boolean;
}

interface UserFormState {
  username: string;
  password: string;
  role: Role;
}

function buildInitialState(user: UserRecord | null): UserFormState {
  if (user) {
    return { username: user.username, password: "", role: user.role };
  }
  return { username: "", password: "", role: "AvVolunteer" };
}

function isFormDirty(current: UserFormState, initial: UserFormState, isEdit: boolean): boolean {
  if (current.username !== initial.username) return true;
  if (current.role !== initial.role) return true;
  if (!isEdit && current.password !== initial.password) return true;
  if (isEdit && current.password !== "") return true;
  return false;
}

// ── UserForm (inline, not a separate file — single user type) ──────────────

interface UserFormProps {
  user: UserRecord | null;
  isSelf: boolean;
  onSaved: () => void;
  onDeleted: () => void;
  registerDirtyCheck: (check: DirtyCheck) => void;
}

function UserForm({ user, isSelf, onSaved, onDeleted, registerDirtyCheck }: UserFormProps): ReactNode {
  const isEdit = user !== null;
  const initialState = useMemo(() => buildInitialState(user), [user]);

  const [form, setForm] = useState<UserFormState>(initialState);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);

  const formRef = useRef(form);
  formRef.current = form;
  const initialRef = useRef(initialState);
  initialRef.current = initialState;

  useEffect(() => {
    registerDirtyCheck({ isDirty: () => isFormDirty(formRef.current, initialRef.current, isEdit) });
  }, [registerDirtyCheck, isEdit]);

  useEffect(() => {
    setForm(initialState);
    setError("");
  }, [initialState]);

  const updateField = useCallback(<K extends keyof UserFormState>(key: K, value: UserFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = async (): Promise<void> => {
    setError("");
    setPending(true);
    try {
      const body: Record<string, string> = { username: form.username, role: form.role };
      if (isEdit) {
        if (form.password) body["password"] = form.password;
      } else {
        body["password"] = form.password;
      }

      const url = isEdit ? `/api/admin/users/${user.id}` : "/api/admin/users";
      const method = isEdit ? "PUT" : "POST";
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setError(data.error ?? "Save failed");
        return;
      }
      onSaved();
    } catch {
      setError("Network error");
    } finally {
      setPending(false);
    }
  };

  const handleDelete = async (): Promise<void> => {
    if (!user) return;
    setDeletePending(true);
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE", credentials: "include" });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setError(data.error ?? "Delete failed");
        setDeleteConfirmOpen(false);
        return;
      }
      setDeleteConfirmOpen(false);
      onDeleted();
    } catch {
      setError("Network error");
    } finally {
      setDeletePending(false);
    }
  };

  const canSave = isEdit ? !!form.username : !!form.username && !!form.password;

  return (
    <div className="form-layout">
      <h3 className="margin-none margin-bottom-wide">{isEdit ? `Edit ${user.username}` : "New User"}</h3>

      <IonInput
        data-testid={TEST_ID_USER_FORM_USERNAME}
        label="Username"
        labelPlacement="stacked"
        fill="outline"
        value={form.username}
        onIonInput={(e) => updateField("username", e.detail.value ?? "")}
        clearInput
      />
      <IonInput
        data-testid={TEST_ID_USER_FORM_PASSWORD}
        label={isEdit ? "New Password (leave blank to keep)" : "Password"}
        labelPlacement="stacked"
        fill="outline"
        type="password"
        value={form.password}
        onIonInput={(e) => updateField("password", e.detail.value ?? "")}
        clearInput
      />
      <div data-testid={TEST_ID_USER_FORM_ROLE_SELECT} className="position-relative">
        <Select<RoleOption>
          options={ROLE_OPTIONS}
          value={ROLE_OPTIONS.find((o) => o.value === form.role) ?? null}
          onChange={(option) => updateField("role", option?.value ?? "AvVolunteer")}
          styles={roleStyles}
          isSearchable={false}
          isDisabled={isEdit && isSelf}
          menuPortalTarget={document.body}
        />
        {isEdit && isSelf && <div className="text-muted text-caption margin-top-tight">You cannot change your own role</div>}
      </div>

      {error && (
        <IonText color="danger" data-testid={TEST_ID_USER_FORM_ERROR}>
          <p className="margin-none text-secondary">{error}</p>
        </IonText>
      )}

      <div className="layout-row gap-standard">
        <IonButton data-testid={TEST_ID_USER_FORM_SAVE} disabled={pending || !canSave} onClick={() => void handleSave()}>
          {pending ? <IonSpinner name="crescent" /> : "Save"}
        </IonButton>
        {isEdit && (
          <>
            {isSelf ? (
              <>
                <span id={`delete-self-form-${user.id}`}>
                  <IonButton data-testid={TEST_ID_USER_FORM_DELETE} fill="outline" color="medium" disabled>
                    Delete
                  </IonButton>
                </span>
                <IonPopover trigger={`delete-self-form-${user.id}`} triggerAction="hover" side="top">
                  <div className="popover-content">You cannot delete your own account</div>
                </IonPopover>
              </>
            ) : (
              <IonButton
                data-testid={TEST_ID_USER_FORM_DELETE}
                fill="outline"
                color="danger"
                disabled={deletePending}
                onClick={() => setDeleteConfirmOpen(true)}
              >
                {deletePending ? <IonSpinner name="crescent" /> : "Delete"}
              </IonButton>
            )}
          </>
        )}
      </div>

      <ConfirmationModal
        isOpen={deleteConfirmOpen}
        title="Delete User"
        body={`Are you sure you want to delete "${user?.username ?? ""}"? This cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        confirmVariant="danger"
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export function AdminUserManagement(): ReactNode {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [panel, setPanel] = useState<PanelState>({ mode: "empty" });

  // Unsaved changes guard
  const dirtyCheckRef = useRef<DirtyCheck>({ isDirty: () => false });
  const [pendingNavigation, setPendingNavigation] = useState<PanelState | null>(null);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<UserRecord | null>(null);

  const registerDirtyCheck = useCallback((check: DirtyCheck) => {
    dirtyCheckRef.current = check;
  }, []);

  const navigatePanel = useCallback((next: PanelState): void => {
    if (dirtyCheckRef.current.isDirty()) {
      setPendingNavigation(next);
    } else {
      setPanel(next);
      dirtyCheckRef.current = { isDirty: () => false };
    }
  }, []);

  const confirmNavigation = useCallback((): void => {
    if (pendingNavigation) {
      setPanel(pendingNavigation);
      setPendingNavigation(null);
      dirtyCheckRef.current = { isDirty: () => false };
    }
  }, [pendingNavigation]);

  const cancelNavigation = useCallback((): void => {
    setPendingNavigation(null);
  }, []);

  const fetchUsers = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch("/api/admin/users", { credentials: "include" });
      if (response.ok) {
        setUsers((await response.json()) as UserRecord[]);
      }
    } catch {
      setError("Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  const handleSaved = useCallback((): void => {
    dirtyCheckRef.current = { isDirty: () => false };
    setPanel({ mode: "empty" });
    void fetchUsers();
  }, [fetchUsers]);

  const handleDeleted = useCallback((): void => {
    dirtyCheckRef.current = { isDirty: () => false };
    setPanel({ mode: "empty" });
    void fetchUsers();
  }, [fetchUsers]);

  const handleListDelete = async (user: UserRecord): Promise<void> => {
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE", credentials: "include" });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setError(data.error ?? "Delete failed");
      }
      if (panel.mode === "edit" && panel.userId === user.id) {
        dirtyCheckRef.current = { isDirty: () => false };
        setPanel({ mode: "empty" });
      }
      void fetchUsers();
    } catch {
      setError("Network error");
    } finally {
      setDeleteConfirmUser(null);
    }
  };

  const handleSelectUser = (user: UserRecord): void => {
    navigatePanel({ mode: "edit", userId: user.id });
  };

  const sortedUsers = [...users].sort((a, b) => {
    const roleCompare = (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99);
    if (roleCompare !== 0) return roleCompare;
    return a.username.localeCompare(b.username);
  });

  const selectedUser = panel.mode === "edit" ? (users.find((u) => u.id === panel.userId) ?? null) : null;

  if (loading) {
    return (
      <IonPage data-testid={TEST_ID_ADMIN_USERS_PAGE}>
        <IonContent className="ion-padding ion-text-center">
          <IonSpinner />
        </IonContent>
      </IonPage>
    );
  }

  return (
    <IonPage data-testid={TEST_ID_ADMIN_USERS_PAGE}>
      <IonContent className="ion-padding">
        <h2 className="admin-page-title">User Management</h2>

        {error && <p className="text-danger text-secondary text-center margin-bottom-wide">{error}</p>}

        <div className="device-management-layout">
          {/* Left panel — user list */}
          <div className="device-management-list-panel">
            <IonButton data-testid={TEST_ID_ADD_USER_BUTTON} expand="block" className="add-connection-button" onClick={() => navigatePanel({ mode: "create" })}>
              <IonIcon icon={addOutline} slot="start" />
              Add User
            </IonButton>

            <div data-testid={TEST_ID_USER_LIST} className="device-list-scroll">
              {sortedUsers.map((user) => {
                const isSelf = user.id === currentUser.id;
                return (
                  <div
                    key={user.id}
                    data-testid={`${TEST_ID_USER_LIST_ITEM}-${user.id}`}
                    className={`device-list-item surface ${panel.mode === "edit" && panel.userId === user.id ? "device-list-item-selected" : ""}`}
                    onClick={() => handleSelectUser(user)}
                    onKeyDown={(e) => e.key === "Enter" && handleSelectUser(user)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="fill-remaining">
                      <div className="text-bold">{user.username}</div>
                      <div className="text-muted text-caption">{ROLE_DISPLAY[user.role] ?? user.role}</div>
                    </div>
                    {isSelf ? (
                      <>
                        <span id={`delete-self-list-${user.id}`} onClick={(e) => e.stopPropagation()}>
                          <IonButton data-testid={`${TEST_ID_USER_LIST_DELETE_BUTTON}-${user.id}`} size="small" fill="clear" color="medium" disabled>
                            Delete
                          </IonButton>
                        </span>
                        <IonPopover trigger={`delete-self-list-${user.id}`} triggerAction="hover" side="top">
                          <div className="popover-content">You cannot delete your own account</div>
                        </IonPopover>
                      </>
                    ) : (
                      <IonButton
                        data-testid={`${TEST_ID_USER_LIST_DELETE_BUTTON}-${user.id}`}
                        size="small"
                        fill="clear"
                        color="danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirmUser(user);
                        }}
                      >
                        Delete
                      </IonButton>
                    )}
                  </div>
                );
              })}
              {users.length === 0 && <p className="text-muted text-center">No users found</p>}
            </div>
          </div>

          {/* Right panel — form */}
          <div data-testid={TEST_ID_USER_DETAIL_PANEL} className="device-management-detail-panel surface">
            {panel.mode === "empty" && (
              <div data-testid={TEST_ID_USER_DETAIL_EMPTY} className="layout-centered full-height">
                <p className="text-muted">Select a user or add a new one</p>
              </div>
            )}
            {panel.mode === "create" && (
              <UserForm key="create" user={null} isSelf={false} onSaved={handleSaved} onDeleted={handleDeleted} registerDirtyCheck={registerDirtyCheck} />
            )}
            {panel.mode === "edit" && selectedUser && (
              <UserForm
                key={`edit-${selectedUser.id}`}
                user={selectedUser}
                isSelf={selectedUser.id === currentUser.id}
                onSaved={handleSaved}
                onDeleted={handleDeleted}
                registerDirtyCheck={registerDirtyCheck}
              />
            )}
          </div>
        </div>

        {/* Unsaved changes confirmation */}
        <ConfirmationModal
          isOpen={pendingNavigation !== null}
          title="Unsaved Changes"
          body="You have unsaved changes. Are you sure you want to leave?"
          confirmLabel="Discard"
          cancelLabel="Stay"
          confirmVariant="danger"
          onConfirm={confirmNavigation}
          onCancel={cancelNavigation}
        />

        {/* List delete confirmation */}
        <ConfirmationModal
          isOpen={deleteConfirmUser !== null}
          title="Delete User"
          body={`Are you sure you want to delete "${deleteConfirmUser?.username ?? ""}"? This cannot be undone.`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          confirmVariant="danger"
          onConfirm={() => deleteConfirmUser && void handleListDelete(deleteConfirmUser)}
          onCancel={() => setDeleteConfirmUser(null)}
        />
      </IonContent>
    </IonPage>
  );
}
