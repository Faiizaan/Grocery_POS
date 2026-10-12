type Props = {
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: readonly number[];
  disabled?: boolean;
};

export function PaginationBar({
  page,
  pageSize,
  totalCount,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [20, 30],
  disabled = false,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize) || 1);
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, totalCount);

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "center",
        flexWrap: "wrap",
        marginTop: 12,
      }}
    >
      {onPageSizeChange && (
        <label style={{ fontSize: 14 }}>
          Per page{" "}
          <select
            value={pageSize}
            disabled={disabled}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
          >
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      )}
      {totalCount > 0 && (
        <span style={{ fontSize: 14, color: "#666" }}>
          {rangeStart}–{rangeEnd} of {totalCount}
        </span>
      )}
      {totalPages > 1 && (
        <>
          <button
            type="button"
            disabled={disabled || page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Previous
          </button>
          <span style={{ fontSize: 14 }}>
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            disabled={disabled || page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </button>
        </>
      )}
    </div>
  );
}
