// Mirrors ops-core/src/types/api/auth.ts (openapi User/UserInput/Role).
export type Role = 'ADMIN' | 'MANAGER' | 'OPS' | 'VIEWER' | 'PARTNER'

export interface User {
  id: string
  email: string
  name: string
  role: Role
  isActive: boolean
  createdAt?: string
}

export interface UserInput {
  email: string
  name: string
  password: string
  role?: Role
  isActive?: boolean
}
