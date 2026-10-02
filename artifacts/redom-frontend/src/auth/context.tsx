import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { authService } from "./service";
import { clearStoredSession, getStoredSession, storeSession } from "./storage";
import { rememberDeviceAccount } from "./deviceAccounts";
import type { AuthResult, AuthState, LoginInput, RegisterInput, VerifyLoginDeviceInput, VerifyLoginTwoFactorInput, AuthSession, AuthUser } from "./types";

interface AuthContextValue extends AuthState {
  login(input: LoginInput): Promise<AuthResult>;
  verifyLoginDevice(input: VerifyLoginDeviceInput): Promise<AuthResult>;
  verifyLoginTwoFactor(input: VerifyLoginTwoFactorInput): Promise<AuthResult>;
  register(input: RegisterInput): Promise<AuthResult>;
  adoptSession(user: AuthUser, session: AuthSession): Promise<void>;
  switchDeviceAccount(userId: string): Promise<void>;
  prepareForAccountLogin(): Promise<void>;
  logout(): Promise<void>;
  refresh(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const unauthenticatedState: AuthState = { status: "unauthenticated", user: null, session: null };

export function AuthProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AuthState>({ status: "loading", user: null, session: null });

  const activate = useCallback(async (user: AuthUser, session: AuthSession) => {
    await storeSession(session);
    await rememberDeviceAccount(user, session);
    setState({ status: "authenticated", user, session });
  }, []);

  const refresh = useCallback(async () => {
    const stored = await getStoredSession();
    if (!stored) { setState(unauthenticatedState); return; }
    try {
      const response = await authService.refreshSession({ refreshToken: stored.refreshToken });
      if (!response.success || !response.session || !response.user) throw new Error("Session refresh returned an invalid response.");
      await activate(response.user, response.session);
    } catch {
      await clearStoredSession();
      setState(unauthenticatedState);
    }
  }, [activate]);

  useEffect(() => { void refresh(); }, [refresh]);

  const login = useCallback(async (input: LoginInput): Promise<AuthResult> => {
    const response = await authService.login(input);
    if (response.requiresVerification || response.requiresTwoFactor) return response;
    if (!response.success || !response.user || !response.session) throw new Error(response.message || "Authentication did not return a valid session.");
    await activate(response.user, response.session);
    return response;
  }, [activate]);

  const verifyLoginDevice = useCallback(async (input: VerifyLoginDeviceInput): Promise<AuthResult> => {
    const response = await authService.verifyLoginDevice(input);
    if (response.requiresTwoFactor) return response;
    if (!response.success || !response.user || !response.session) throw new Error(response.message || "Device verification did not return a valid session.");
    await activate(response.user, response.session);
    return response;
  }, [activate]);

  const verifyLoginTwoFactor = useCallback(async (input: VerifyLoginTwoFactorInput): Promise<AuthResult> => {
    const response = await authService.verifyLoginTwoFactor(input);
    if (!response.success || !response.user || !response.session) throw new Error(response.message || "Two-factor verification did not return a valid session.");
    await activate(response.user, response.session);
    return response;
  }, [activate]);

  const register = useCallback(async (input: RegisterInput): Promise<AuthResult> => {
    const response = await authService.register(input);
    if (response.session && response.user) await activate(response.user, response.session);
    return response;
  }, [activate]);

  const adoptSession = useCallback(async (user: AuthUser, session: AuthSession) => {
    await activate(user, session);
  }, [activate]);

  const switchDeviceAccount = useCallback(async (_userId: string) => {
    // Account switching returns to the server-authoritative recognized-account
    // entry layer. A saved refresh token is never treated as proof of identity.
    await clearStoredSession();
    setState(unauthenticatedState);
  }, []);

  const prepareForAccountLogin = useCallback(async () => {
    await clearStoredSession();
    setState(unauthenticatedState);
  }, []);

  const logout = useCallback(async () => {
    const currentUserId = state.user?.id;
    try { await authService.logout(); } finally {
      await clearStoredSession();
      setState(unauthenticatedState);
    }
  }, [state.user?.id]);

  const value = useMemo<AuthContextValue>(() => ({ ...state, login, verifyLoginDevice, verifyLoginTwoFactor, register, adoptSession, switchDeviceAccount, prepareForAccountLogin, logout, refresh }), [state, login, verifyLoginDevice, verifyLoginTwoFactor, register, adoptSession, switchDeviceAccount, logout, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() { const context = useContext(AuthContext); if (!context) throw new Error("useAuthContext must be used inside AuthProvider."); return context; }
