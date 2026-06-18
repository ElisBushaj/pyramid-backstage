/** Mirrors openapi.yaml User/UserInput/Role. Frontend mirrors in api/types/auth.ts. */
export type Role = "ADMIN" | "MANAGER" | "OPS" | "VIEWER";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  createdAt?: string;
}

export interface UserInput {
  email: string;
  name: string;
  password: string;
  role?: Role;
  isActive?: boolean;
}
