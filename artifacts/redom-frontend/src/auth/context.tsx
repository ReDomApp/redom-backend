import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

import { authService } from "./service";
import {
  clearStoredSession,
  getStoredSession,
  storeSession,
} from "./storage";

import type {
  AuthSession,
  AuthState,
  LoginInput,
  RegisterInput,
} from "./types";

interface AuthContextValue extends AuthState {
  login(input: LoginInput): Promise<void>;
  register(input: RegisterInput): Promise<void>;
  logout(): Promise<void>;
  refresh(): Promise<void>;
}

const AuthContext =
  createContext<AuthContextValue | null>(null);

export function AuthProvider({
  children,
}: PropsWithChildren) {
  const [state, setState] =
    useState<AuthState>({
      status: "loading",
      session: null,
    });

  const refresh = useCallback(async () => {
    const stored =
      await getStoredSession();

    if (!stored) {
      setState({
        status: "unauthenticated",
        session: null,
      });

      return;
    }

    setState({
      status: "authenticated",
      session: stored,
    });

    try {
      const response =
        await authService.me();

      const session: AuthSession =
        response.session ?? {
          user: response.user,
          accessToken:
            stored.accessToken,
          expiresAt:
            stored.expiresAt,
        };

      await storeSession(session);

      setState({
        status: "authenticated",
        session,
      });
    } catch {
      await clearStoredSession();

      setState({
        status: "unauthenticated",
        session: null,
      });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (input: LoginInput) => {
      const response =
        await authService.login(input);

      if (!response.session) {
        throw new Error(
          "Authentication completed without a session.",
        );
      }

      await storeSession(
        response.session,
      );

      setState({
        status: "authenticated",
        session: response.session,
      });
    },
    [],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      const response =
        await authService.register(input);

      if (!response.session) {
        return;
      }

      await storeSession(
        response.session,
      );

      setState({
        status: "authenticated",
        session: response.session,
      });
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      await clearStoredSession();

      setState({
        status: "unauthenticated",
        session: null,
      });
    }
  }, []);

  const value =
    useMemo<AuthContextValue>(
      () => ({
        ...state,
        login,
        register,
        logout,
        refresh,
      }),
      [
        state,
        login,
        register,
        logout,
        refresh,
      ],
    );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const context =
    useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuthContext must be used inside AuthProvider.",
    );
  }

  return context;
}