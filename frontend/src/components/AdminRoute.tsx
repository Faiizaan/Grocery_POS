import { Navigate } from "react-router-dom";
import { useAuth } from "../store/auth";

export default function AdminRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const isAdmin = useAuth((s) => s.user?.role === "ADMIN");

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
