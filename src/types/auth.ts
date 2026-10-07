export interface User {
  id: string;
  name: string;
  username: string;
  role: "admin" | "user";
  status: "active" | "pending";
  permissions: string[];
  createdAt?: string;
}

export type AuthSessionMode = "standard" | "remember";

export interface LoginRequest {
  username: string;
  password: string;
  rememberLogin?: boolean;
}

export interface RegisterRequest {
  name: string;
  username: string;
  password: string;
}
