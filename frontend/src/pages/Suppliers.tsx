import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { StatusLine } from "../components/StatusLine";
import {
  useCreateSupplierMutation,
  useSuppliersQuery,
} from "../hooks/queries";
import { ApiError } from "../lib/apiJson";

const PAGE_SIZE_OPTIONS = [20, 30] as const;

export default function Suppliers() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(30);
  const { data, isLoading } = useSuppliersQuery(page, pageSize);
  const rows = data?.rows ?? [];
  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize) || 1);

  const createSupplier = useCreateSupplierMutation();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError("Supplier name must be at least 2 characters.");
      return;
    }
    try {
      await createSupplier.mutateAsync({
        name: trimmed,
        phone: phone.trim() || undefined,
      });
      setName("");
      setPhone("");
      setSuccess(`Supplier "${trimmed}" added.`);
      setPage(1);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to create supplier."
      );
    }
  };

  const rangeStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, totalCount);

  return (
    <div>
      <h2>Suppliers</h2>
      <p style={{ color: "#666", marginTop: -6 }}>
        Manage supplier records used on purchases and purchase orders.
      </p>

      <form
        onSubmit={submit}
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 16,
          alignItems: "flex-end",
        }}
      >
        <label>
          <div style={{ fontSize: 12, color: "#666" }}>Name *</div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Supplier name"
            required
          />
        </label>
        <label>
          <div style={{ fontSize: 12, color: "#666" }}>Phone</div>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Optional"
          />
        </label>
        <button type="submit" className="btn" disabled={createSupplier.isPending}>
          {createSupplier.isPending ? "Saving…" : "Add supplier"}
        </button>
      </form>

      {error && <StatusLine variant="error">{error}</StatusLine>}
      {success && <StatusLine variant="success">{success}</StatusLine>}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <label>
          Per page{" "}
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <span style={{ fontSize: 14, color: "#666" }}>
          {totalCount === 0
            ? "No suppliers"
            : `Showing ${rangeStart}–${rangeEnd} of ${totalCount}`}
        </span>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Phone</th>
            <th>Created</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id}>
              <td className="mono">{s.id}</td>
              <td>
                <Link to={`/suppliers/${s.id}`}>{s.name}</Link>
              </td>
              <td>{s.phone || "—"}</td>
              <td>{new Date(s.createdAt).toLocaleString()}</td>
              <td>
                <Link to={`/suppliers/${s.id}`} className="btn btn-outline">
                  View products
                </Link>
              </td>
            </tr>
          ))}
          {rows.length === 0 && !isLoading && (
            <tr>
              <td colSpan={5} style={{ textAlign: "center", color: "#777" }}>
                No suppliers yet
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {totalPages > 1 && (
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button
            type="button"
            disabled={page <= 1 || isLoading}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>
          <span style={{ alignSelf: "center" }}>
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages || isLoading}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
