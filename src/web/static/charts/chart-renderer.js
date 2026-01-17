/**
 * Chart.js based chart renderer
 * Handles: bar, line, pie, doughnut, scatter, horizontal_bar, area charts
 */

import { defaultPalette, formatNumber, formatChartLabel, escapeHtml } from './utils.js';
import { ensureScriptLoaded } from './script-loader.js';

const CHART_JS_SRC = 'https://cdn.jsdelivr.net/npm/chart.js';

/**
 * Render Chart.js chart card HTML
 */
export function renderChartCard(chartConfig, chartData, dashboardId) {
    const widthClass = chartConfig.width === 'full' ? 'md:col-span-2' : '';
    const chartType = chartConfig.chart_type || 'bar';
    const chartId = `chart-${dashboardId}-${chartConfig.id}`;
    const options = chartConfig.options || {};
    
    // Calculate canvas height based on chart type or explicit height option
    let canvasHeight = options.height || 300;
    if (!options.height) {
        if (chartType === 'horizontal_bar' && Array.isArray(chartData)) {
            canvasHeight = Math.max(200, Math.min(400, chartData.length * 35));
        } else if (chartType === 'pie' || chartType === 'doughnut') {
            canvasHeight = 300;
        } else if (chartType === 'scatter') {
            canvasHeight = 360;
        } else if (chartType === 'bar') {
            canvasHeight = 350;
        }
    }
    
    // Support auto-height to fill container (useful when paired with tall sibling)
    const heightStyle = options.auto_height 
        ? 'min-height: 300px; height: 100%;'
        : `height: ${canvasHeight}px;`;
    
    // Add h-full class when auto_height is enabled for flex container stretching
    const cardClass = options.auto_height ? 'dashboard-card h-full' : 'dashboard-card';
    
    return `
        <div class="${cardClass} ${widthClass}">
            <div class="card-header mb-4">
                <div class="flex-1">
                    <h3 class="card-title">
                        <span class="material-symbols-outlined">show_chart</span>
                        ${escapeHtml(chartConfig.title)}
                    </h3>
                    ${chartConfig.description ? `<p class="text-xs text-terminal-gray mt-1 font-mono">${escapeHtml(chartConfig.description)}</p>` : ''}
                </div>
            </div>
            <div style="position: relative; ${heightStyle} flex: 1;">
                <canvas id="${chartId}"></canvas>
            </div>
        </div>
    `;
}

/**
 * Initialize Chart.js charts from config and data
 */
export async function initializeCharts(chartsConfig, chartsData, dashboardId, dashboardCharts) {
    try {
        await ensureScriptLoaded(CHART_JS_SRC, 'Chart');
    } catch (error) {
        console.error('Chart.js failed to load:', error);
        return;
    }

    // Destroy any existing charts for this dashboard
    Object.keys(dashboardCharts).forEach(key => {
        if (key.startsWith(dashboardId)) {
            const instance = dashboardCharts[key];
            if (instance && typeof instance.destroy === 'function') {
                instance.destroy();
            }
            delete dashboardCharts[key];
        }
    });
    
    chartsConfig.forEach(chartConfig => {
        const chartType = chartConfig.chart_type || 'bar';
        
        // Skip non-chart types (handled elsewhere)
        if (chartType === 'quotes' || chartType === 'table' || chartType === 'heatmap' || chartType === 'word_cloud' || chartType === 'none') {
            return;
        }
        
        const chartId = `chart-${dashboardId}-${chartConfig.id}`;
        const canvas = document.getElementById(chartId);
        
        if (!canvas) {
            return;
        }
        
        const data = chartsData[chartConfig.id];
        if (!data || (Array.isArray(data) && data.length === 0)) {
            return;
        }
        
        const ctx = canvas.getContext('2d');
        const chart = createChart(ctx, chartConfig, data);
        
        if (chart) {
            dashboardCharts[`${dashboardId}-${chartConfig.id}`] = chart;
        }
    });
}

/**
 * Create a Chart.js chart based on config
 */
export function createChart(ctx, chartConfig, data) {
    const chartType = chartConfig.chart_type || 'bar';
    const colors = chartConfig.colors || {};
    const options = chartConfig.options || {};
    const customLabels = chartConfig.labels || null;
    
    // Timeline/multi-dataset data (but not stacked_bar which handles its own datasets)
    if (chartConfig.datasets && Array.isArray(chartConfig.datasets) && chartConfig.datasets.length > 0 && chartType !== 'stacked_bar') {
        const chartMode = chartType === 'stacked_bar_timeline' ? 'bar' : 'line';
        return createTimelineChart(ctx, chartConfig, data, chartMode);
    }

    if (!Array.isArray(data)) {
        return null;
    }
    
    // Filter out null values if configured
    let chartData = data;
    if (options.exclude_null) {
        chartData = chartData.filter(d => d.value !== null && d.value !== 'null' && d.value !== '');
    }
    
    // Limit items if configured, optionally grouping remainder as "others"
    const maxItems = options.max_items || 15;
    if (chartData.length > maxItems && options.group_others) {
        const valueField = chartConfig.value_field || 'count';
        const labelField = chartConfig.label_field || 'value';
        const topItems = chartData.slice(0, maxItems);
        const remainder = chartData.slice(maxItems);
        const othersSum = remainder.reduce((sum, d) => sum + (d[valueField] || d.count || 0), 0);
        if (othersSum > 0) {
            const othersItem = { [labelField]: 'others', [valueField]: othersSum, value: 'others', count: othersSum };
            chartData = [...topItems, othersItem];
        } else {
            chartData = topItems;
        }
    } else {
        chartData = chartData.slice(0, maxItems);
    }
    
    if (chartData.length === 0) {
        return null;
    }
    
    // Get labels and values
    const labelField = chartConfig.label_field || 'value';
    const valueField = chartConfig.value_field || 'count';
    
    const labels = chartData.map(d => formatChartLabel(d[labelField] || d.value, true, customLabels));
    const values = chartData.map(d => d[valueField] || d.count || 0);
    
    // Get colors for each value
    const chartColors = chartData.map((d, i) => {
        const val = String(d[labelField] || d.value).toLowerCase();
        return colors[val] || colors[d[labelField] || d.value] || defaultPalette[i % defaultPalette.length];
    });
    
    // Calculate total for percentages
    const total = values.reduce((sum, v) => sum + v, 0);
    
    let config;
    
    switch (chartType) {
        case 'scatter': {
            const xField = chartConfig.x_field || 'x';
            const yField = chartConfig.y_field || 'y';
            const labelField = chartConfig.label_field || 'label';

            const points = chartData
                .map((d, i) => {
                    const x = Number(d[xField]);
                    const y = Number(d[yField]);
                    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
                    const lbl = d[labelField] ?? d.value ?? `pt-${i}`;
                    return { x, y, _label: String(lbl) };
                })
                .filter(Boolean);

            if (points.length === 0) return null;

            const pointColors = points.map((p, i) => {
                const key = String(p._label).toLowerCase();
                return colors[key] || colors[p._label] || defaultPalette[i % defaultPalette.length];
            });

            config = {
                type: 'scatter',
                data: {
                    datasets: [{
                        label: chartConfig.title || 'Scatter',
                        data: points,
                        pointBackgroundColor: pointColors,
                        pointBorderColor: pointColors,
                        pointRadius: options.point_radius || 5,
                        pointHoverRadius: options.point_hover_radius || 7,
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: '#0a1628',
                            titleColor: '#67e8f9',
                            bodyColor: '#fff',
                            borderColor: '#22d3ee',
                            borderWidth: 1,
                            callbacks: {
                                label: (context) => {
                                    const raw = context.raw || {};
                                    const lbl = raw._label ? `${raw._label}: ` : '';
                                    return `${lbl}x=${formatNumber(raw.x)}, y=${formatNumber(raw.y)}`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: { 
                            beginAtZero: true,
                            ticks: { color: '#67e8f9' },
                            grid: { color: 'rgba(34, 211, 238, 0.15)' }
                        },
                        y: { 
                            beginAtZero: true,
                            ticks: { color: '#67e8f9' },
                            grid: { color: 'rgba(34, 211, 238, 0.15)' }
                        }
                    }
                }
            };
            break;
        }
        
        case 'area':
            // Area chart for categorical data - show as stacked horizontal bar
            config = {
                type: 'bar',
                data: {
                    labels: ['Distribution'],
                    datasets: chartData.map((item, i) => ({
                        label: labels[i],
                        data: [values[i]],
                        backgroundColor: chartColors[i],
                    }))
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    indexAxis: 'y',
                    plugins: {
                        legend: { 
                            position: 'bottom',
                            display: true,
                            labels: {
                                color: '#67e8f9',
                                padding: 12,
                                font: { family: 'Space Grotesk', size: 11 }
                            }
                        },
                        tooltip: {
                            backgroundColor: '#0a1628',
                            titleColor: '#67e8f9',
                            bodyColor: '#fff',
                            borderColor: '#22d3ee',
                            borderWidth: 1,
                            callbacks: {
                                label: (context) => {
                                    const value = context.parsed.x;
                                    const pct = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                                    return options.show_percentages 
                                        ? `${context.dataset.label}: ${value} (${pct}%)`
                                        : `${context.dataset.label}: ${value}`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: { 
                            stacked: true,
                            beginAtZero: true,
                            ticks: { color: '#67e8f9' },
                            grid: { color: 'rgba(34, 211, 238, 0.15)' }
                        },
                        y: { 
                            stacked: true,
                            display: false
                        }
                    }
                }
            };
            break;

        case 'stacked_bar': {
            // Stacked vertical bar chart: categories on X, stacked segments on Y
            // Data format: [{value: 'Model A', succeeded: 50, failed: 10}, ...]
            // Configure datasets in chart config: datasets: [{field: 'succeeded', label: 'Succeeded', color: '#22c55e'}, ...]
            const stackDatasets = chartConfig.datasets || [
                { field: 'succeeded', label: 'Succeeded', color: '#22c55e' },
                { field: 'failed', label: 'Failed', color: '#ef4444' }
            ];
            
            const stackLabels = chartData.map(d => formatChartLabel(d[labelField] || d.value, true, customLabels));
            const datasets = stackDatasets.map(ds => ({
                label: ds.label,
                data: chartData.map(d => d[ds.field] || 0),
                backgroundColor: ds.color,
                borderColor: ds.color,
                borderWidth: 1
            }));

            config = {
                type: 'bar',
                data: {
                    labels: stackLabels,
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            display: true,
                            labels: {
                                color: '#67e8f9',
                                padding: 12,
                                font: { family: 'Space Grotesk', size: 11 }
                            }
                        },
                        tooltip: {
                            backgroundColor: '#0a1628',
                            titleColor: '#67e8f9',
                            bodyColor: '#fff',
                            borderColor: '#22d3ee',
                            borderWidth: 1,
                            callbacks: {
                                label: (context) => {
                                    const value = context.parsed.y;
                                    return `${context.dataset.label}: ${formatNumber(value)}`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            stacked: true,
                            ticks: { 
                                color: '#67e8f9',
                                maxRotation: 45,
                                minRotation: 0
                            },
                            grid: { display: false }
                        },
                        y: {
                            stacked: true,
                            beginAtZero: true,
                            ticks: { color: '#67e8f9' },
                            grid: { color: 'rgba(34, 211, 238, 0.15)' }
                        }
                    }
                }
            };
            break;
        }

        case 'pie':
        case 'doughnut':
            config = {
                type: chartType,
                data: {
                    labels: labels,
                    datasets: [{
                        data: values,
                        backgroundColor: chartColors,
                        borderColor: 'rgba(19, 91, 236, 0.2)',
                        borderWidth: 2,
                        hoverBorderColor: '#22d3ee',
                        hoverBorderWidth: 3
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: options.cutout || (chartType === 'doughnut' ? '50%' : 0),
                    plugins: {
                        legend: { 
                            position: options.legend_position || 'bottom',
                            labels: {
                                color: '#67e8f9',
                                padding: 12,
                                font: { family: 'Space Grotesk', size: 11 }
                            }
                        },
                        tooltip: {
                            backgroundColor: '#0a1628',
                            titleColor: '#67e8f9',
                            bodyColor: '#fff',
                            borderColor: '#22d3ee',
                            borderWidth: 1,
                            callbacks: {
                                label: (context) => {
                                    const label = context.label || '';
                                    const value = context.parsed;
                                    const pct = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                                    return options.show_percentages 
                                        ? `${label}: ${value} (${pct}%)`
                                        : `${label}: ${value}`;
                                }
                            }
                        }
                    }
                }
            };
            break;
            
        case 'horizontal_bar':
            // If percentage_scale is true, treat values as percentages (0-100) and show x-axis as 0-100%
            const isPercentageScale = options.percentage_scale === true;
            // If integer_scale is true, only show whole numbers on x-axis (useful for counts)
            const isIntegerScale = options.integer_scale === true;
            const displayValues = isPercentageScale ? values : values;
            
            config = {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: isPercentageScale ? 'Rate' : 'Count',
                        data: displayValues,
                        backgroundColor: chartColors,
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    indexAxis: 'y',
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: '#0a1628',
                            titleColor: '#67e8f9',
                            bodyColor: '#fff',
                            borderColor: '#22d3ee',
                            borderWidth: 1,
                            callbacks: {
                                label: (context) => {
                                    const value = context.parsed.x;
                                    if (isPercentageScale) {
                                        return `${value.toFixed(1)}%`;
                                    }
                                    const pct = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                                    return options.show_percentages 
                                        ? `Count: ${value} (${pct}%)`
                                        : `Count: ${value}`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: { 
                            beginAtZero: true,
                            max: isPercentageScale ? 100 : undefined,
                            ticks: { 
                                color: '#67e8f9',
                                callback: isPercentageScale ? (value) => `${value}%` : undefined,
                                precision: isIntegerScale ? 0 : undefined,
                                stepSize: isIntegerScale ? 1 : undefined
                            },
                            grid: { color: 'rgba(34, 211, 238, 0.15)' }
                        },
                        y: {
                            barPercentage: 0.7,
                            categoryPercentage: 0.8,
                            ticks: { color: '#67e8f9' },
                            grid: { display: false }
                        }
                    }
                }
            };
            break;
            
        case 'bar':
        default:
            config = {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Count',
                        data: values,
                        backgroundColor: chartColors,
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: '#0a1628',
                            titleColor: '#67e8f9',
                            bodyColor: '#fff',
                            borderColor: '#22d3ee',
                            borderWidth: 1
                        }
                    },
                    scales: {
                        x: {
                            barPercentage: 0.6,
                            categoryPercentage: 0.7,
                            ticks: { color: '#67e8f9' },
                            grid: { display: false }
                        },
                        y: { 
                            beginAtZero: true,
                            ticks: { color: '#67e8f9' },
                            grid: { color: 'rgba(34, 211, 238, 0.15)' }
                        }
                    }
                }
            };
            break;
    }
    
    return new Chart(ctx, config);
}

/**
 * Create a timeline/line chart with multiple datasets
 */
function createTimelineChart(ctx, chartConfig, data, chartMode = 'line') {
    if (!Array.isArray(data) || data.length === 0) {
        return null;
    }
    
    const xField = chartConfig.x_field || 'date';
    const datasets = chartConfig.datasets || [];
    const options = chartConfig.options || {};
    const isStacked = chartMode === 'bar' && chartConfig.stacked !== false;
    const isPercentageMode = options.percentage_mode === true;
    const yMax = options.y_max || null;

    const points = data
        .filter(d => d && d[xField] !== null && d[xField] !== undefined && String(d[xField]).trim() !== '')
        .map(d => {
            const raw = String(d[xField]);
            const normalized = raw.includes(' ') && !raw.includes('T') ? raw.replace(' ', 'T') : raw;
            const dateObj = new Date(normalized);
            return { raw, normalized, dateObj, row: d };
        })
        .filter(p => !isNaN(p.dateObj.getTime()));

    if (points.length === 0) {
        return null;
    }

    points.sort((a, b) => a.dateObj - b.dateObj);

    const first = points[0].dateObj;
    const last = points[points.length - 1].dateObj;
    const diffMs = Math.abs(last - first);
    const diffHours = diffMs / (1000 * 60 * 60);
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    const diffWeeks = diffDays / 7;
    const diffMonths = diffDays / 30;

    let timeUnit = 'day';
    if (diffHours <= 24) timeUnit = 'hour';
    else if (diffDays <= 14) timeUnit = 'day';
    else if (diffWeeks <= 12) timeUnit = 'week';
    else if (diffMonths <= 24) timeUnit = 'month';
    else timeUnit = 'year';

    const bucketMap = new Map();

    const toIsoDate = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    const bucketKeyAndSort = (dateObj) => {
        switch (timeUnit) {
            case 'hour': {
                const ymd = toIsoDate(dateObj);
                const hh = String(dateObj.getHours()).padStart(2, '0');
                const key = `${ymd} ${hh}:00`;
                const sortKey = `${ymd}T${hh}:00:00`;
                return { key, sortKey };
            }
            case 'week': {
                const d = new Date(dateObj);
                const day = d.getDay();
                const diffToMonday = (day + 6) % 7;
                d.setDate(d.getDate() - diffToMonday);
                const key = `Week of ${toIsoDate(d)}`;
                const sortKey = `${toIsoDate(d)}T00:00:00`;
                return { key, sortKey };
            }
            case 'month': {
                const y = dateObj.getFullYear();
                const m = String(dateObj.getMonth() + 1).padStart(2, '0');
                const key = `${y}-${m}`;
                const sortKey = `${y}-${m}-01T00:00:00`;
                return { key, sortKey };
            }
            case 'year': {
                const y = dateObj.getFullYear();
                const key = String(y);
                const sortKey = `${y}-01-01T00:00:00`;
                return { key, sortKey };
            }
            case 'day':
            default: {
                const key = toIsoDate(dateObj);
                const sortKey = `${key}T00:00:00`;
                return { key, sortKey };
            }
        }
    };

    for (const p of points) {
        const { key, sortKey } = bucketKeyAndSort(p.dateObj);
        if (!bucketMap.has(key)) {
            const init = { label: key, sortKey, _count: 0 };
            for (const ds of datasets) {
                init[ds.field] = 0;
            }
            bucketMap.set(key, init);
        }
        const bucket = bucketMap.get(key);
        bucket._count += 1;
        for (const ds of datasets) {
            const v = p.row?.[ds.field];
            const n = typeof v === 'number' ? v : Number(v);
            bucket[ds.field] += Number.isFinite(n) ? n : 0;
        }
    }

    // For percentage mode, compute averages and then normalize to 100%
    if (isPercentageMode) {
        for (const bucket of bucketMap.values()) {
            const count = bucket._count || 1;
            
            // First compute raw averages
            let total = 0;
            for (const ds of datasets) {
                bucket[ds.field] = bucket[ds.field] / count;
                total += bucket[ds.field];
            }
            
            // Normalize so they sum to exactly 100% (handles rounding drift)
            if (total > 0) {
                const scale = 100 / total;
                for (const ds of datasets) {
                    bucket[ds.field] = Math.round(bucket[ds.field] * scale * 10) / 10;
                }
            }
        }
    }

    const buckets = Array.from(bucketMap.values()).sort((a, b) => String(a.sortKey).localeCompare(String(b.sortKey)));
    const labels = buckets.map(b => b.label);

    return new Chart(ctx, {
        type: chartMode,
        data: {
            labels,
            datasets: datasets.map(ds => ({
                label: ds.label,
                data: buckets.map(b => b[ds.field] || 0),
                borderColor: ds.color,
                backgroundColor: chartMode === 'bar' ? ds.color : (ds.fill ? `${ds.color}20` : 'transparent'),
                fill: chartMode === 'line' ? ds.fill : false,
                tension: chartMode === 'line' ? 0.3 : 0,
                pointRadius: chartMode === 'line' ? (labels.length > 30 ? 0 : 3) : 0,
                pointHoverRadius: chartMode === 'line' ? 5 : 0,
                borderWidth: chartMode === 'bar' ? 0 : 2,
                borderRadius: chartMode === 'bar' ? 2 : 0,
                stack: chartMode === 'bar' ? 'stack0' : undefined,
            }))
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { 
                mode: 'index', 
                intersect: false 
            },
            plugins: {
                legend: { 
                    display: true,
                    position: 'top',
                    labels: {
                        color: '#67e8f9',
                        usePointStyle: true,
                        padding: 15,
                        font: {
                            family: 'Space Grotesk',
                            size: 11
                        }
                    }
                },
                tooltip: {
                    backgroundColor: '#0a1628',
                    titleColor: '#67e8f9',
                    bodyColor: '#fff',
                    borderColor: '#22d3ee',
                    borderWidth: 1,
                    callbacks: isPercentageMode ? {
                        label: function(context) {
                            const value = context.parsed.y;
                            return `${context.dataset.label}: ${value}%`;
                        }
                    } : {}
                }
            },
            scales: {
                y: { 
                    beginAtZero: true,
                    stacked: isStacked,
                    max: yMax,
                    ticks: { 
                        color: '#67e8f9',
                        callback: function(value) {
                            return isPercentageMode ? value + '%' : value;
                        }
                    },
                    grid: { color: 'rgba(34, 211, 238, 0.15)' }
                },
                x: {
                    stacked: isStacked,
                    ticks: {
                        color: '#67e8f9',
                        maxTicksLimit: timeUnit === 'hour' ? 24 : timeUnit === 'day' ? 30 : timeUnit === 'week' ? 12 : timeUnit === 'month' ? 12 : 10,
                        callback: function(value) {
                            const label = this.getLabelForValue(value);
                            if (timeUnit === 'hour') {
                                const parts = String(label).split(' ');
                                return parts[1] || label;
                            }
                            return label;
                        }
                    },
                    grid: { display: false }
                }
            }
        }
    });
}
