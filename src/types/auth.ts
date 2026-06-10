export interface User {
  id: string;
  name: string;
  username: string;
  role: "admin" | "user";
  status: "active" | "pending";
  permissions: string[];
  createdAt?: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  name: string;
  username: string;
  password: string;
}
