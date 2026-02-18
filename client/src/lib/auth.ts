const ACCESS_TOKEN_KEY = "accessToken";
const REFRESH_TOKEN_KEY = "refreshToken";
const TOKEN_EXPIRY_KEY = "tokenExpiry";

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}

export interface AuthResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setTokens(accessToken: string, refreshToken: string, expiresIn: number): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  const expiry = Date.now() + expiresIn * 1000;
  localStorage.setItem(TOKEN_EXPIRY_KEY, expiry.toString());
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXPIRY_KEY);
}

export function isTokenExpiringSoon(): boolean {
  const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
  if (!expiry) return true;
  const expiryTime = parseInt(expiry, 10);
  const bufferTime = 60 * 1000;
  return Date.now() > expiryTime - bufferTime;
}

export async function refreshAccessToken(): Promise<AuthResponse | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  try {
    const response = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      clearTokens();
      return null;
    }

    const data: AuthResponse = await response.json();
    setTokens(data.accessToken, data.refreshToken, data.expiresIn);
    return data;
  } catch {
    clearTokens();
    return null;
  }
}

export async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  if (isTokenExpiringSoon()) {
    await refreshAccessToken();
  }

  const makeRequest = async () => {
    const token = getAccessToken();
    const headers = new Headers(options.headers);
    
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    return fetch(url, { ...options, headers });
  };

  let res = await makeRequest();

  if (res.status === 401 && getAccessToken()) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await makeRequest();
    } else {
      clearTokens();
      window.location.href = "/";
    }
  }

  return res;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Login failed");
  }

  const data: AuthResponse = await response.json();
  setTokens(data.accessToken, data.refreshToken, data.expiresIn);
  return data;
}

export async function register(
  username: string,
  email: string,
  password: string,
  firstName?: string,
  lastName?: string
): Promise<AuthResponse> {
  const response = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, email, password, firstName, lastName }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Registration failed");
  }

  const data: AuthResponse = await response.json();
  setTokens(data.accessToken, data.refreshToken, data.expiresIn);
  return data;
}

function xhrPost(url: string, body: object): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.onload = () => {
      try {
        resolve({ status: xhr.status, data: JSON.parse(xhr.responseText) });
      } catch {
        reject(new Error(`Invalid response: ${xhr.responseText}`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during Google login"));
    xhr.ontimeout = () => reject(new Error("Request timed out"));
    xhr.timeout = 15000;
    xhr.send(JSON.stringify(body));
  });
}

export async function googleLogin(credential: string): Promise<AuthResponse> {
  let lastError: Error | null = null;

  try {
    const response = await fetch("/api/auth/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Google login failed");
    }

    const data: AuthResponse = await response.json();
    setTokens(data.accessToken, data.refreshToken, data.expiresIn);
    return data;
  } catch (err: any) {
    lastError = err instanceof Error ? err : new Error(String(err));
    const isNetworkError = lastError.message === "Load failed" ||
      lastError.message === "Failed to fetch" ||
      lastError.message.includes("NetworkError") ||
      lastError.message.includes("network");

    if (!isNetworkError) {
      throw lastError;
    }
  }

  try {
    const result = await xhrPost("/api/auth/google", { credential });
    if (result.status !== 200) {
      throw new Error(result.data?.message || "Google login failed");
    }
    const data: AuthResponse = result.data;
    setTokens(data.accessToken, data.refreshToken, data.expiresIn);
    return data;
  } catch (err: any) {
    throw err instanceof Error ? err : new Error(String(err));
  }
}

export async function logout(): Promise<void> {
  const token = getAccessToken();
  
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch {
  }
  
  clearTokens();
}
