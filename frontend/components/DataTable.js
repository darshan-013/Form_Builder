import { useMemo } from 'react';

/**
 * Reusable DataTable Component
 * Simplified to be a controlled component for search/sort/filter.
 */
export default function DataTable({
    data = [],
    columns = [],
    pageSize = 10,
    currentPage = 1,
    onPageChange,
    sortConfig = { key: null, direction: 'asc' },
    onSort,
    selectedIds = new Set(),
    onToggleSelection,
}) {
    // Pagination
    const totalPages = Math.ceil(data.length / pageSize);
    const paginatedData = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return data.slice(start, start + pageSize);
    }, [data, currentPage, pageSize]);

    // Selection helpers
    const isAllSelected = paginatedData.length > 0 && paginatedData.every(row => selectedIds.has(row.id));

    const handleSelectAll = (e) => {
        if (!onToggleSelection) return;
        const ids = paginatedData.map(row => row.id);
        onToggleSelection(ids, e.target.checked);
    };

    if (!data || data.length === 0) {
        return (
            <div className="datatable-empty">
                <div className="empty-state-icon">📊</div>
                <h3>No results found</h3>
                <p>Try adjusting your filters or search query</p>
            </div>
        );
    }

    return (
        <div className="datatable-container">
            <div className="datatable-info">
                Showing {Math.min(data.length, (currentPage - 1) * pageSize + 1)}-{Math.min(data.length, currentPage * pageSize)} of {data.length} entries
            </div>

            {/* Table */}
            <div className="datatable-wrapper">
                <table className="datatable">
                    <thead>
                        <tr>
                            {onToggleSelection && (
                                <th style={{ width: '40px' }}>
                                    <input
                                        type="checkbox"
                                        className="datatable-checkbox"
                                        checked={isAllSelected}
                                        onChange={handleSelectAll}
                                    />
                                </th>
                            )}
                            {columns.map((col) => (
                                <th
                                    key={col.key}
                                    className={col.sortable !== false ? 'sortable' : ''}
                                    onClick={() => col.sortable !== false && onSort && onSort(col.key)}
                                >
                                    <div className="th-content">
                                        <span>{col.label}</span>
                                        {col.sortable !== false && (
                                            <span className="sort-icon">
                                                {sortConfig.key === col.key
                                                    ? sortConfig.direction === 'asc'
                                                        ? '↑'
                                                        : '↓'
                                                    : '↕'}
                                            </span>
                                        )}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedData.map((row, idx) => {
                            const isSelected = selectedIds.has(row.id);
                            return (
                                <tr key={row.id || idx} 
                                    className={`animate-fade-in stagger-item ${isSelected ? 'row-selected' : ''}`}
                                    style={{ animationDelay: `${idx * 0.05}s` }}
                                >
                                    {onToggleSelection && (
                                        <td>
                                            <input
                                                type="checkbox"
                                                className="datatable-checkbox"
                                                checked={isSelected}
                                                onChange={() => onToggleSelection([row.id], !isSelected)}
                                            />
                                        </td>
                                    )}
                                    {columns.map((col) => (
                                        <td key={col.key}>
                                            {col.render
                                                ? col.render(row[col.key], row)
                                                : row[col.key] ?? '—'}
                                        </td>
                                    ))}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="datatable-pagination">
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => onPageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                    >
                        ‹ Previous
                    </button>

                    <div className="pagination-pages">
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            let page;
                            if (totalPages <= 5) {
                                page = i + 1;
                            } else if (currentPage <= 3) {
                                page = i + 1;
                            } else if (currentPage >= totalPages - 2) {
                                page = totalPages - 4 + i;
                            } else {
                                page = currentPage - 2 + i;
                            }

                            return (
                                <button
                                    key={page}
                                    className={`btn btn-sm ${currentPage === page ? 'btn-primary' : 'btn-secondary'}`}
                                    onClick={() => onPageChange(page)}
                                >
                                    {page}
                                </button>
                            );
                        })}
                    </div>

                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => onPageChange(currentPage + 1)}
                        disabled={currentPage === totalPages}
                    >
                        Next ›
                    </button>
                </div>
            )}
        </div>
    );
}

