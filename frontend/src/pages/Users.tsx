import { FormEvent, useState } from "react";
import { StatusLine } from "../components/StatusLine";
import { useCreateUserMutation, useUsersQuery } from "../hooks/queries";
import { ApiError } from "../lib/apiJson";
import type { Role } from "../store/auth";

export default function Users() {
  const { data: users = [], isLoading, error: loadError } = useUsersQuery();
  const createUser = useCreateUserMutation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("CASHIER");
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const listError =
    loadError instanceof ApiError
      ? loadError.message
      : loadError
        ? "Failed to load users"
        : null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccess(null);

    try {
      const data = await createUser.mutateAsync({ email, password, role });
      setSuccess(`Created ${data.email}`);
      setEmail("");
      setPassword("");
      setRole("CASHIER");
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "Failed to create user"
      );
    }
  };

  return (
    <div className="users-page">
      <h2>Users</h2>
      <p className="muted">Create staff accounts (ADMIN only).</p>

      <form className="users-form card" onSubmit={onSubmit}>
        <h3>Add user</h3>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
        </label>
        <label>
          Role
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="CASHIER">Cashier</option>
            <option value="MANAGER">Manager</option>
            <option value="ADMIN">Admin</option>
          </select>
        </label>
        {formError && <StatusLine variant="error">{formError}</StatusLine>}
        {success && <StatusLine variant="success">{success}</StatusLine>}
        <button type="submit" disabled={createUser.isPending}>
          {createUser.isPending ? "Creating…" : "Create user"}
        </button>
      </form>

      <div className="card" style={{ marginTop: 24 }}>
        <h3>All users</h3>
        {listError && <StatusLine variant="error">{listError}</StatusLine>}
        {isLoading && <p>Loading…</p>}
        {!isLoading && !users.length && !listError && (
          <p className="muted">No users found.</p>
        )}
        {!isLoading && users.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td>{u.role}</td>
                  <td>{new Date(u.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
