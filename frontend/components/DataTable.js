import { useMemo } from 'react';
import Button from './ui/Button';
import Spinner from './ui/Spinner';
import Card from './ui/Card';

/**
 * Reusable DataTable Component
 * Modernized with UI primitives and glassmorphism.
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
            <div className="py-20 text-center border-2 border-dashed border-gray-100 dark:border-white/5 rounded-2xl">
                <div className="text-5xl mb-4 opacity-20">📊</div>
                <h3 className="text-lg font-medium">No results found</h3>
                <p className="text-gray-500">Try adjusting your filters or search query</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center text-xs text-gray-500 px-1">
                <p>
                    Showing <span className="font-medium text-gray-900 dark:text-white">{Math.min(data.length, (currentPage - 1) * pageSize + 1)}</span> 
                    - <span className="font-medium text-gray-900 dark:text-white">{Math.min(data.length, currentPage * pageSize)}</span> 
                    of <span className="font-medium text-gray-900 dark:text-white">{data.length}</span> entries
                </p>
            </div>

            <Card className="overflow-hidden border-white/10">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-white/5 bg-white/5">
                                {onToggleSelection && (
                                    <th className="p-4 w-10">
                                        <input
                                            type="checkbox"
                                            className="w-4 h-4 rounded border-white/10 bg-white/5 text-primary focus:ring-primary/50 cursor-pointer"
                                            checked={isAllSelected}
                                            onChange={handleSelectAll}
                                        />
                                    </th>
                                )}
                                {columns.map((col) => (
                                    <th
                                        key={col.key}
                                        className={`p-4 text-xs font-bold uppercase tracking-wider text-gray-400 ${col.sortable !== false ? 'cursor-pointer hover:bg-white/5 transition-colors' : ''}`}
                                        onClick={() => col.sortable !== false && onSort && onSort(col.key)}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span>{col.label}</span>
                                            {col.sortable !== false && (
                                                <span className="text-gray-600">
                                                    {sortConfig.key === col.key
                                                        ? sortConfig.direction === 'asc' ? '↑' : '↓'
                                                        : '↕'}
                                                </span>
                                            )}
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {paginatedData.map((row, idx) => {
                                const isSelected = selectedIds.has(row.id);
                                return (
                                    <tr 
                                        key={row.id || idx} 
                                        className={`group transition-colors ${isSelected ? 'bg-primary/5' : 'hover:bg-white/[0.02]'}`}
                                    >
                                        {onToggleSelection && (
                                            <td className="p-4">
                                                <input
                                                    type="checkbox"
                                                    className="w-4 h-4 rounded border-white/10 bg-white/5 text-primary focus:ring-primary/50 cursor-pointer"
                                                    checked={isSelected}
                                                    onChange={() => onToggleSelection([row.id], !isSelected)}
                                                />
                                            </td>
                                        )}
                                        {columns.map((col) => (
                                            <td key={col.key} className="p-4 text-sm text-gray-700 dark:text-gray-300">
                                                {col.render
                                                    ? col.render(row[col.key], row)
                                                    : row[col.key] ?? <span className="opacity-20">—</span>}
                                            </td>
                                        ))}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between px-1 pt-2">
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onPageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                    >
                        ‹ Previous
                    </Button>

                    <div className="flex items-center gap-1">
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
                                <Button
                                    key={page}
                                    variant={currentPage === page ? 'primary' : 'secondary'}
                                    size="sm"
                                    className="w-9 h-9 p-0 flex items-center justify-center"
                                    onClick={() => onPageChange(page)}
                                >
                                    {page}
                                </Button>
                            );
                        })}
                    </div>

                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onPageChange(currentPage + 1)}
                        disabled={currentPage === totalPages}
                    >
                        Next ›
                    </Button>
                </div>
            )}
        </div>
    );
}
