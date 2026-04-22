export interface AuthLoginResponse {
  user: {
    user: { id: string; username: string; role: string };
    requiresPasswordChange?: boolean;
  };
}

export function authLoginSuccess(overrides?: Partial<AuthLoginResponse["user"]["user"]>): AuthLoginResponse {
  return {
    user: {
      user: { id: "u1", username: "admin", role: "ADMIN", ...overrides },
    },
  };
}

export function authLoginRequiresPasswordChange(overrides?: Partial<AuthLoginResponse["user"]["user"]>): AuthLoginResponse {
  return {
    user: {
      user: { id: "u1", username: "admin", role: "ADMIN", ...overrides },
      requiresPasswordChange: true,
    },
  };
}

export function authLoginFailure(): { message: string } {
  return { message: "Invalid credentials" };
}
