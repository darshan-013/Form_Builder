export default function PaginationControls({
    page = 0,
    size = 10,
    totalElements = 0,
    totalPages = 0,
    loading = false,
    onPageChange,
    onSizeChange,
    pageSizeOptions = [10, 20, 50],
}) {
    const safeTotalPages = totalPages || 0;
    const currentPage = Math.min(page, Math.max(safeTotalPages - 1, 0));
    const from = totalElements === 0 ? 0 : currentPage * size + 1;
    const to = totalElements === 0 ? 0 : Math.min((currentPage + 1) * size, totalElements);

    return (
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Showing {from}-{to} of {totalElements}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Rows:</label>
                <select
                    className="form-input"
                    value={size}
                    onChange={(e) => onSizeChange?.(Number(e.target.value))}
                    style={{ width: 84, padding: '6px 8px', fontSize: 12 }}
                    disabled={loading}
                >
                    {pageSizeOptions.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                    ))}
                </select>
                <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => onPageChange?.(Math.max(currentPage - 1, 0))}
                    disabled={loading || currentPage <= 0}
                >
                    Prev
                </button>
                <span style={{ minWidth: 68, textAlign: 'center', fontSize: 12 }}>
                    Page {safeTotalPages === 0 ? 0 : currentPage + 1}/{safeTotalPages}
                </span>
                <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => onPageChange?.(currentPage + 1)}
                    disabled={loading || safeTotalPages === 0 || currentPage + 1 >= safeTotalPages}
                >
                    Next
                </button>
            </div>
        </div>
    );
}

