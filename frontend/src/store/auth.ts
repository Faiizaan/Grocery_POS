import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Role = "CASHIER" | "MANAGER" | "ADMIN";

export type AuthUser = {
  id: number;
  email: string;
  role: Role;
};

type AuthState = {
  token: string | null;
  user: AuthUser | null;
  setAuth: (token: string, user: AuthUser) => void;
  logout: () => void;
  isManager: () => boolean;
};

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
      isManager: () => {
        const role = get().user?.role;
        return role === "MANAGER" || role === "ADMIN";
      },
    }),
    { name: "pos-auth" }
  )
);
