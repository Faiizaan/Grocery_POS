import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../store/auth";
import { apiFetch } from "../lib/api";

export default function ProtectedRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = useAuth((s) => s.token);
  const user = useAuth((s) => s.user);
  const setAuth = useAuth((s) => s.setAuth);
  const logout = useAuth((s) => s.logout);
  const [checking, setChecking] = useState(!!token);

  useEffect(() => {
    if (!token) {
      setChecking(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/auth/me");
        if (!res.ok) throw new Error("session invalid");
        const me = await res.json();
        if (!cancelled) setAuth(token, me);
      } catch {
        if (!cancelled) logout();
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, setAuth, logout]);

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (checking || !user) {
    return <div className="login-page">Loading session…</div>;
  }

  return <>{children}</>;
}
