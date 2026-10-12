import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./store/auth";

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const isManager = useAuth((s) => s.isManager());
  const isAdmin = useAuth((s) => s.user?.role === "ADMIN");

  const isInvoicePage =
    location.pathname.startsWith("/sales/") &&
    !location.pathname.endsWith("/list") &&
    !location.pathname.endsWith("/summary");

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="app-shell">
      {!isInvoicePage && (
        <>
          <div className="app-header">
            <span className="app-user">
              Signed in as <strong>{user?.email}</strong> ({user?.role})
            </span>
            <button type="button" onClick={handleLogout}>
              Sign out
            </button>
          </div>

          <nav className="app-nav">
            <Link to="/">Checkout</Link>
            <Link to="/cash-session">Cash Session</Link>
            <Link to="/sales/list">Sales List</Link>
            {isAdmin && <Link to="/users">Users</Link>}
            {isManager && (
              <>
                <Link to="/register">Add Product</Link>
                <Link to="/products">Products</Link>
                <Link to="/categories">Categories</Link>
                <Link to="/purchase">New Purchase</Link>
                <Link to="/purchases">Purchases</Link>
                <Link to="/purchase-order">Purchase Order</Link>
                <Link to="/reports/category">Category Report</Link>
                <Link to="/inventory">Inventory</Link>
                <Link to="/inventory-log">Inventory Log</Link>
                <Link to="/suppliers">Suppliers</Link>
                <Link to="/sales/summary">Sales Summary</Link>
              </>
            )}
          </nav>
        </>
      )}

      <Outlet />
    </div>
  );
}
