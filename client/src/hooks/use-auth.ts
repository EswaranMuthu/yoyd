import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import {
  AuthUser,
  AuthResponse,
  getAccessToken,
  fetchWithAuth,
  login as authLogin,
  register as authRegister,
  googleLogin as authGoogleLogin,
  logout as authLogout,
  clearTokens,
  refreshAccessToken,
  isTokenExpiringSoon,
} from "@/lib/auth";

async function fetchUser(): Promise<AuthUser | null> {
  const token = getAccessToken();
  if (!token) return null;

  if (isTokenExpiringSoon()) {
    const refreshed = await refreshAccessToken();
    if (!refreshed) return null;
    return refreshed.user;
  }

  const response = await fetchWithAuth("/api/auth/user");

  if (response.status === 401) {
    clearTokens();
    return null;
  }

  if (!response.ok) {
    throw new Error(`${response.status}: ${response.statusText}`);
  }

  return response.json();
}

export function useAuth() {
  const queryClient = useQueryClient();
  
  const { data: user, isLoading, refetch } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/user"],
    queryFn: fetchUser,
    retry: false,
    staleTime: 1000 * 60 * 4,
  });

  useEffect(() => {
    if (!user && !isLoading) return;
    
    const interval = setInterval(async () => {
      if (isTokenExpiringSoon() && getAccessToken()) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          queryClient.setQueryData(["/api/auth/user"], refreshed.user);
        } else {
          queryClient.setQueryData(["/api/auth/user"], null);
        }
      }
    }, 60 * 1000);

    return () => clearInterval(interval);
  }, [user, isLoading, queryClient]);

  const loginMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      return authLogin(email, password);
    },
    onSuccess: (data: AuthResponse) => {
      queryClient.setQueryData(["/api/auth/user"], data.user);
    },
  });

  const registerMutation = useMutation({
    mutationFn: async ({
      username,
      email,
      password,
      firstName,
      lastName,
    }: {
      username: string;
      email: string;
      password: string;
      firstName?: string;
      lastName?: string;
    }) => {
      return authRegister(username, email, password, firstName, lastName);
    },
    onSuccess: (data: AuthResponse) => {
      queryClient.setQueryData(["/api/auth/user"], data.user);
    },
  });

  const googleLoginMutation = useMutation({
    mutationFn: async ({ credential }: { credential: string }) => {
      return authGoogleLogin(credential);
    },
    onSuccess: (data: AuthResponse) => {
      queryClient.setQueryData(["/api/auth/user"], data.user);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: authLogout,
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/user"], null);
      queryClient.clear();
    },
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login: loginMutation.mutateAsync,
    isLoggingIn: loginMutation.isPending,
    loginError: loginMutation.error,
    register: registerMutation.mutateAsync,
    isRegistering: registerMutation.isPending,
    registerError: registerMutation.error,
    googleLogin: googleLoginMutation.mutateAsync,
    isGoogleLoggingIn: googleLoginMutation.isPending,
    googleLoginError: googleLoginMutation.error,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
    refetchUser: refetch,
  };
}
