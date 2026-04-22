import { useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import { IonPage, IonContent, IonInput, IonButton, IonText, IonSpinner } from "@ionic/react";
import Select from "react-select";
import { darkSelectStyles } from "../theme/selectStyles";
import type { Role } from "../types";

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

const roleStyles = darkSelectStyles<RoleOption>();

export function AdminUserManagement(): ReactNode {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Create form
  const [createUsername, setCreateUsername] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createRole, setCreateRole] = useState<Role>("AvVolunteer");
  const [createPending, setCreatePending] = useState(false);
  const [createError, setCreateError] = useState("");

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editUsername, setEditUsername] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editRole, setEditRole] = useState<Role>("AvVolunteer");
  const [editPending, setEditPending] = useState(false);
  const [editError, setEditError] = useState("");

  const [deletePendingId, setDeletePendingId] = useState<string | null>(null);

  const fetchUsers = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch("/admin/users", { credentials: "include" });
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

  const handleCreate = async (): Promise<void> => {
    setCreateError("");
    setCreatePending(true);
    try {
      const response = await fetch("/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username: createUsername, password: createPassword, role: createRole }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setCreateError(data.error ?? "Create failed");
        return;
      }
      setCreateUsername("");
      setCreatePassword("");
      setCreateRole("AvVolunteer");
      void fetchUsers();
    } catch {
      setCreateError("Network error");
    } finally {
      setCreatePending(false);
    }
  };

  const startEdit = (user: UserRecord): void => {
    setEditingId(user.id);
    setEditUsername(user.username);
    setEditPassword("");
    setEditRole(user.role);
    setEditError("");
  };

  const cancelEdit = (): void => {
    setEditingId(null);
    setEditError("");
  };

  const handleEdit = async (): Promise<void> => {
    if (!editingId) return;
    setEditError("");
    setEditPending(true);
    try {
      const body: Record<string, string> = { username: editUsername, role: editRole };
      if (editPassword) body["password"] = editPassword;
      const response = await fetch(`/admin/users/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setEditError(data.error ?? "Update failed");
        return;
      }
      setEditingId(null);
      void fetchUsers();
    } catch {
      setEditError("Network error");
    } finally {
      setEditPending(false);
    }
  };

  const handleDelete = async (userId: string): Promise<void> => {
    setDeletePendingId(userId);
    try {
      const response = await fetch(`/admin/users/${userId}`, { method: "DELETE", credentials: "include" });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setError(data.error ?? "Delete failed");
      }
      void fetchUsers();
    } catch {
      setError("Network error");
    } finally {
      setDeletePendingId(null);
    }
  };

  if (loading) {
    return (
      <IonPage data-testid="admin-users-page">
        <IonContent className="ion-padding ion-text-center">
          <IonSpinner />
        </IonContent>
      </IonPage>
    );
  }

  return (
    <IonPage data-testid="admin-users-page">
      <IonContent className="ion-padding">
        <div className="form-container" style={{ maxWidth: "40rem" }}>
          <h2 className="text-center margin-bottom-spacious">User Management</h2>

          {error && (
            <IonText color="danger">
              <p className="margin-none text-secondary margin-bottom-wide">{error}</p>
            </IonText>
          )}

          {/* Create user form */}
          <div data-testid="create-user-form" className="surface" style={{ padding: "1rem", marginBottom: "1.5rem" }}>
            <h3 className="margin-none margin-bottom-wide">Create User</h3>
            <div className="form-layout">
              <IonInput
                data-testid="create-username"
                label="Username"
                labelPlacement="stacked"
                fill="outline"
                value={createUsername}
                onIonInput={(e) => setCreateUsername(e.detail.value ?? "")}
                clearInput
              />
              <IonInput
                data-testid="create-password"
                label="Password"
                labelPlacement="stacked"
                fill="outline"
                type="password"
                value={createPassword}
                onIonInput={(e) => setCreatePassword(e.detail.value ?? "")}
                clearInput
              />
              <div data-testid="create-role-select">
                <Select<RoleOption>
                  options={ROLE_OPTIONS}
                  value={ROLE_OPTIONS.find((o) => o.value === createRole)}
                  onChange={(option) => setCreateRole(option?.value ?? "AvVolunteer")}
                  styles={roleStyles}
                  isSearchable={false}
                  menuPortalTarget={document.body}
                />
              </div>
              {createError && (
                <IonText color="danger" data-testid="create-user-error">
                  <p className="margin-none text-secondary">{createError}</p>
                </IonText>
              )}
              <IonButton
                data-testid="create-user-submit"
                expand="block"
                disabled={createPending || !createUsername || !createPassword}
                onClick={() => void handleCreate()}
              >
                {createPending ? <IonSpinner name="crescent" /> : "Create User"}
              </IonButton>
            </div>
          </div>

          {/* User list */}
          <div data-testid="user-list">
            {users.map((user) => (
              <div key={user.id} data-testid={`user-row-${user.id}`} className="surface" style={{ padding: "0.75rem", marginBottom: "0.5rem" }}>
                {editingId === user.id ? (
                  <div className="form-layout">
                    <IonInput
                      data-testid="edit-username"
                      label="Username"
                      labelPlacement="stacked"
                      fill="outline"
                      value={editUsername}
                      onIonInput={(e) => setEditUsername(e.detail.value ?? "")}
                      clearInput
                    />
                    <IonInput
                      data-testid="edit-password"
                      label="New Password (leave blank to keep)"
                      labelPlacement="stacked"
                      fill="outline"
                      type="password"
                      value={editPassword}
                      onIonInput={(e) => setEditPassword(e.detail.value ?? "")}
                      clearInput
                    />
                    <div data-testid="edit-role-select">
                      <Select<RoleOption>
                        options={ROLE_OPTIONS}
                        value={ROLE_OPTIONS.find((o) => o.value === editRole)}
                        onChange={(option) => setEditRole(option?.value ?? "AvVolunteer")}
                        styles={roleStyles}
                        isSearchable={false}
                        menuPortalTarget={document.body}
                      />
                    </div>
                    {editError && (
                      <IonText color="danger" data-testid="edit-user-error">
                        <p className="margin-none text-secondary">{editError}</p>
                      </IonText>
                    )}
                    <div className="layout-row gap-standard">
                      <IonButton data-testid="edit-save" size="small" disabled={editPending} onClick={() => void handleEdit()}>
                        {editPending ? <IonSpinner name="crescent" /> : "Save"}
                      </IonButton>
                      <IonButton data-testid="edit-cancel" size="small" fill="outline" onClick={cancelEdit}>
                        Cancel
                      </IonButton>
                    </div>
                  </div>
                ) : (
                  <div className="layout-row gap-standard">
                    <strong>{user.username}</strong>
                    <span className="text-muted text-secondary">({user.role})</span>
                    <span className="fill-remaining" />
                    <IonButton data-testid={`edit-btn-${user.id}`} size="small" fill="clear" onClick={() => startEdit(user)}>
                      Edit
                    </IonButton>
                    <IonButton
                      data-testid={`delete-btn-${user.id}`}
                      size="small"
                      fill="clear"
                      color="danger"
                      disabled={deletePendingId === user.id}
                      onClick={() => void handleDelete(user.id)}
                    >
                      {deletePendingId === user.id ? <IonSpinner name="crescent" /> : "Delete"}
                    </IonButton>
                  </div>
                )}
              </div>
            ))}
            {users.length === 0 && <p className="text-muted text-center">No users found</p>}
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
}
