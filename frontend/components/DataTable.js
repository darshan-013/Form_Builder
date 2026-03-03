import { useState, useMemo } from 'react';

/**
 * Reusable DataTable Component
 * Features:
 * - Sorting
 * - Searching
 * - Pagination
 * - White theme styling
 * - Responsive design
 */
export default function DataTable({ data = [], columns = [], pageSize = 10 }) {
    const [searchQuery, setSearchQuery] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
    const [currentPage, setCurrentPage] = useState(1);

    // Filter data based on search
    const filteredData = useMemo(() => {
        if (!searchQuery.trim()) return data;

        return data.filter((row) =>
            columns.some((col) => {
                const value = row[col.key];
                if (value === null || value === undefined) return false;
                return String(value).toLowerCase().includes(searchQuery.toLowerCase());
            })
        );
    }, [data, searchQuery, columns]);

    // Sort data
    const sortedData = useMemo(() => {
        if (!sortConfig.key) return filteredData;

        const sorted = [...filteredData].sort((a, b) => {
            const aValue = a[sortConfig.key];
            const bValue = b[sortConfig.key];

            if (aValue === null || aValue === undefined) return 1;
            if (bValue === null || bValue === undefined) return -1;

            // Handle different types
            if (typeof aValue === 'number' && typeof bValue === 'number') {
                return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
            }

            // String comparison
            const aStr = String(aValue).toLowerCase();
            const bStr = String(bValue).toLowerCase();

            if (aStr < bStr) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aStr > bStr) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return sorted;
    }, [filteredData, sortConfig]);

    // Pagination
    const totalPages = Math.ceil(sortedData.length / pageSize);
    const paginatedData = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return sortedData.slice(start, start + pageSize);
    }, [sortedData, currentPage, pageSize]);

    // Handle sort
    const handleSort = (key) => {
        setSortConfig((prev) => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
        }));
    };

    // Handle page change
    const goToPage = (page) => {
        if (page >= 1 && page <= totalPages) {
            setCurrentPage(page);
        }
    };

    // Reset to page 1 when search/filter changes
    useMemo(() => {
        setCurrentPage(1);
    }, [searchQuery]);

    if (!data || data.length === 0) {
        return (
            <div className="datatable-empty">
                <div className="empty-state-icon">📊</div>
                <h3>No submissions yet</h3>
                <p>Submissions will appear here once users fill out the form</p>
            </div>
        );
    }

    return (
        <div className="datatable-container">
            {/* Search Bar */}
            <div className="datatable-controls">
                <div className="datatable-search">
                    <input
                        type="text"
                        className="form-input"
                        placeholder="Search..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <span className="search-icon">🔍</span>
                </div>
                <div className="datatable-info">
                    Showing {paginatedData.length} of {filteredData.length} {filteredData.length === 1 ? 'entry' : 'entries'}
                </div>
            </div>

            {/* Table */}
            <div className="datatable-wrapper">
                <table className="datatable">
                    <thead>
                        <tr>
                            {columns.map((col) => (
                                <th
                                    key={col.key}
                                    className={col.sortable !== false ? 'sortable' : ''}
                                    onClick={() => col.sortable !== false && handleSort(col.key)}
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
                        {paginatedData.map((row, idx) => (
                            <tr key={idx}>
                                {columns.map((col) => (
                                    <td key={col.key}>
                                        {col.render
                                            ? col.render(row[col.key], row)
                                            : row[col.key] ?? '—'}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="datatable-pagination">
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => goToPage(currentPage - 1)}
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
                                    onClick={() => goToPage(page)}
                                >
                                    {page}
                                </button>
                            );
                        })}
                    </div>

                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => goToPage(currentPage + 1)}
                        disabled={currentPage === totalPages}
                    >
                        Next ›
                    </button>
                </div>
            )}
        </div>
    );
}

