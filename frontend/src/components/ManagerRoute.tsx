import { Navigate } from "react-router-dom";
import { useAuth } from "../store/auth";

export default function ManagerRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const isManager = useAuth((s) => {
    const role = s.user?.role;
    return role === "MANAGER" || role === "ADMIN";
  });

  if (!isManager) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
