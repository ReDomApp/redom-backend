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
  AuthResult,
  AuthSession,
  AuthState,
  AuthUser,
  LoginInput,
  RegisterInput,
} from "./types";

interface AuthContextValue
  extends AuthState {
  login(
    input: LoginInput,
  ): Promise<AuthResult>;

  register(
    input: RegisterInput,
  ): Promise<AuthResult>;

  logout(): Promise<void>;

  refresh(): Promise<void>;
}

const AuthContext =
  createContext<AuthContextValue | null>(
    null,
  );

export function AuthProvider({
  children,
}: PropsWithChildren) {
  const [state, setState] =
    useState<AuthState>({
      status: "loading",
      user: null,
      session: null,
    });

  const refresh = useCallback(
    async () => {
      const stored =
        await getStoredSession();

      if (!stored) {
        setState({
          status: "unauthenticated",
          user: null,
          session: null,
        });

        return;
      }

      try {
        const response =
          await authService.refreshSession(
            {
              refreshToken:
                stored.refreshToken,
            },
          );

        if (
          !response.success ||
          !response.session ||
          !response.user
        ) {
          throw new Error(
            "Session refresh returned an invalid response.",
          );
        }

        await storeSession(
          response.session,
        );

        setState({
          status: "authenticated",
          user: response.user,
          session: response.session,
        });
      } catch {
        await clearStoredSession();

        setState({
          status: "unauthenticated",
          user: null,
          session: null,
        });
      }
    },
    [],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (
      input: LoginInput,
    ): Promise<AuthResult> => {
      const response =
        await authService.login(
          input,
        );

      if (
        !response.success ||
        !response.user ||
        !response.session
      ) {
        throw new Error(
          response.message ||
            "Authentication did not return a valid session.",
        );
      }

      await storeSession(
        response.session,
      );

      setState({
        status: "authenticated",
        user: response.user,
        session: response.session,
      });

      return response;
    },
    [],
  );

  const register = useCallback(
    async (
      input: RegisterInput,
    ): Promise<AuthResult> => {
      const response =
        await authService.register(
          input,
        );

      if (
        response.session &&
        response.user
      ) {
        await storeSession(
          response.session,
        );

        setState({
          status: "authenticated",
          user: response.user,
          session: response.session,
        });
      }

      return response;
    },
    [],
  );

  const logout = useCallback(
    async () => {
      try {
        await authService.logout();
      } finally {
        await clearStoredSession();

        setState({
          status: "unauthenticated",
          user: null,
          session: null,
        });
      }
    },
    [],
  );

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
    <AuthContext.Provider
      value={value}
    >
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