/**
 * Data table renderer
 * Handles table display with percentages, custom columns, and sortable headers
 * 
 * Sorting options (in chart options):
 *   - sort_key: field to sort by (default: first numeric column or 'count')
 *   - sort_direction: 'desc' (default) or 'asc'
 *   - sort_toggle: true to show interactive sort toggle control
 *   - sort_labels: { desc: 'Highest First', asc: 'Lowest First' } custom labels
 */

import { escapeHtml, formatNumber, formatDateTime, isDateTime, formatChartLabel } from './utils.js';

// Store sort state per table for interactive toggling
const tableSortState = new Map();

/**
 * Get or initialize sort state for a table
 */
function getSortState(tableId, options) {
    if (!tableSortState.has(tableId)) {
        tableSortState.set(tableId, {
            key: options.sort_key || null,
            direction: options.sort_direction || 'desc'
        });
    }
    return tableSortState.get(tableId);
}

/**
 * Sort data by key and direction
 */
function sortData(data, sortKey, direction) {
    if (!sortKey) return data;
    
    return [...data].sort((a, b) => {
        const aVal = a[sortKey];
        const bVal = b[sortKey];
        
        // Handle nulls
        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return 1;
        if (bVal == null) return -1;
        
        // Numeric comparison
        if (typeof aVal === 'number' && typeof bVal === 'number') {
            return direction === 'desc' ? bVal - aVal : aVal - bVal;
        }
        
        // String comparison
        const strA = String(aVal).toLowerCase();
        const strB = String(bVal).toLowerCase();
        const cmp = strA.localeCompare(strB);
        return direction === 'desc' ? -cmp : cmp;
    });
}

/**
 * Render sort toggle control
 */
function renderSortToggle(tableId, sortState, sortLabels) {
    const descLabel = sortLabels?.desc || 'Highest First';
    const ascLabel = sortLabels?.asc || 'Lowest First';
    const currentLabel = sortState.direction === 'desc' ? descLabel : ascLabel;
    const triangleIcon = sortState.direction === 'desc' ? 'arrow_drop_down' : 'arrow_drop_up';
    
    return `
        <button class="table-sort-toggle flex items-center gap-1 text-xs text-terminal-cyan hover:text-cyan-300 transition-colors font-mono px-2 py-1 rounded hover:bg-surface-dark/50"
                data-table-id="${escapeHtml(tableId)}"
                title="Click to toggle sort order">
            <span class="material-symbols-outlined text-base">${triangleIcon}</span>
            <span class="sort-label">${escapeHtml(currentLabel)}</span>
        </button>
    `;
}

/**
 * Render data table with percentages
 */
export function renderDataTable(chartConfig, chartData, dashboardId) {
    if (!Array.isArray(chartData) || chartData.length === 0) {
        return '';
    }
    
    const widthClass = chartConfig.width === 'full' ? 'md:col-span-2' : '';
    const options = chartConfig.options || {};
    const maxItems = chartConfig.max_items || options.max_items || 15;
    const showPercentages = options.show_percentages !== false;
    const tableId = `table-${dashboardId}-${chartConfig.id}`;

    // If table has explicit columns, render as a custom table
    if (chartConfig.columns && Array.isArray(chartConfig.columns) && chartConfig.columns.length > 0) {
        const columns = chartConfig.columns;

        const isNumericField = (field) => {
            return ['count', 'sessions', 'turns', 'times_changed', 'total_lines_added', 
                    'total_lines_removed', 'total_changes', 'total_code_loc', 'session_count', 
                    'turn_count', 'loc_per_turn', 'total_loc_added', 
                    'code_turns', 'total_count'].includes(field);
        };

        // Determine default sort key if not specified (first numeric column)
        let defaultSortKey = options.sort_key;
        if (!defaultSortKey) {
            const numericCol = columns.find(col => isNumericField(col.field));
            defaultSortKey = numericCol?.field || null;
        }
        
        // Get or init sort state
        const sortState = getSortState(tableId, { 
            sort_key: defaultSortKey, 
            sort_direction: options.sort_direction || 'desc' 
        });
        
        // Sort and limit data
        let processedData = sortData(chartData, sortState.key, sortState.direction);
        const items = processedData.slice(0, maxItems);

        const headers = columns.map(col => {
            const alignClass = isNumericField(col.field) ? 'text-right' : 'text-left';
            return `<th class="px-4 py-3 ${alignClass} text-xs font-semibold text-terminal-gray uppercase tracking-wider font-mono border-b-2 border-border-dark">${escapeHtml(col.title)}</th>`;
        }).join('');

        const rows = items.map(item => {
            const cells = columns.map(col => {
                const value = item[col.field];
                const isNumeric = isNumericField(col.field);
                const alignClass = isNumeric ? 'text-right' : 'text-left';
                
                if (typeof value === 'number') {
                    return `<td class="px-4 py-4 ${alignClass} text-terminal-gray font-mono">${formatNumber(value)}</td>`;
                }
                if (isDateTime(value)) {
                    const formattedDate = formatDateTime(value);
                    return `<td class="px-4 py-4 ${alignClass} text-terminal-gray font-mono">${escapeHtml(formattedDate)}</td>`;
                }
                const displayValue = value !== null && value !== undefined ? String(value) : '-';
                return `<td class="px-4 py-4 ${alignClass} text-terminal-gray font-mono">${escapeHtml(displayValue)}</td>`;
            }).join('');
            return `<tr class="hover:bg-surface-dark/50 transition-colors">${cells}</tr>`;
        }).join('');

        // Render sort toggle if enabled
        const sortToggleHtml = options.sort_toggle 
            ? renderSortToggle(tableId, sortState, options.sort_labels)
            : '';

        return `
            <div class="dashboard-card ${widthClass}" data-table-id="${escapeHtml(tableId)}">
                <div class="card-header mb-4">
                    <div class="flex-1">
                        <h3 class="card-title">
                            <span class="material-symbols-outlined">table_chart</span>
                            ${escapeHtml(chartConfig.title)}
                        </h3>
                        ${chartConfig.description ? `<p class="text-xs text-terminal-gray mt-1 font-mono">${escapeHtml(chartConfig.description)}</p>` : ''}
                    </div>
                    ${sortToggleHtml}
                </div>
                <div class="overflow-x-auto">
                    <table class="min-w-full">
                        <thead>
                            <tr>${headers}</tr>
                        </thead>
                        <tbody class="divide-y divide-border-dark">
                            ${rows}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }
    
    // Simple value/count table
    let data = chartData;
    if (options.exclude_null) {
        data = data.filter(d => d.value !== null && d.value !== 'null' && d.value !== '');
    }
    data = data.slice(0, maxItems);
    
    const total = data.reduce((sum, d) => sum + (d.count || 0), 0);
    
    const tableRows = data.map(item => {
        const label = formatChartLabel(item.value, false);
        const count = item.count || 0;
        const pct = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
        
        return `
            <tr class="border-b border-border-dark hover:bg-surface-dark/50">
                <td class="py-2 px-3 text-sm text-white font-mono">${escapeHtml(label)}</td>
                <td class="py-2 px-3 text-sm text-terminal-gray text-right font-mono">${formatNumber(count)}</td>
                ${showPercentages ? `<td class="py-2 px-3 text-sm text-terminal-gray text-right font-mono">${pct}%</td>` : ''}
            </tr>
        `;
    }).join('');
    
    return `
        <div class="dashboard-card ${widthClass}">
            <div class="card-header mb-4">
                <div class="flex-1">
                    <h3 class="card-title">
                        <span class="material-symbols-outlined">table_chart</span>
                        ${escapeHtml(chartConfig.title)}
                    </h3>
                    ${chartConfig.description ? `<p class="text-xs text-terminal-gray mt-1 font-mono">${escapeHtml(chartConfig.description)}</p>` : ''}
                </div>
            </div>
            <div class="overflow-x-auto">
                <table class="min-w-full">
                    <thead class="border-b border-border-dark">
                        <tr>
                            <th class="py-2 px-3 text-left text-xs font-medium text-terminal-gray uppercase tracking-wider font-mono">Value</th>
                            <th class="py-2 px-3 text-right text-xs font-medium text-terminal-gray uppercase tracking-wider font-mono">Count</th>
                            ${showPercentages ? '<th class="py-2 px-3 text-right text-xs font-medium text-terminal-gray uppercase tracking-wider font-mono">%</th>' : ''}
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

/**
 * Toggle sort direction for a table
 * Returns true if state changed (caller should re-render)
 */
export function toggleTableSort(tableId) {
    const state = tableSortState.get(tableId);
    if (!state) return false;
    
    state.direction = state.direction === 'desc' ? 'asc' : 'desc';
    return true;
}

