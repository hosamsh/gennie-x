/**
 * Heatmap renderer
 * Canvas-based heatmap for performance with responsive sizing
 */

import { hexToRgb, escapeHtml, formatNumber, debounce } from './utils.js';

// Heatmap state registry
export const heatmapRegistry = {};

/**
 * Build categorical x-axis header HTML (for model names, etc.)
 */
export function buildCategoricalXHeader(xLabels) {
    const numCols = xLabels.length;
    if (!numCols) return '';

    return xLabels.map((x, idx) => {
        // Truncate long labels
        const displayLabel = String(x).length > 12 ? String(x).slice(0, 10) + '…' : String(x);
        
        let alignClass = 'text-center';
        if (idx === 0) alignClass = 'text-left';
        else if (idx === xLabels.length - 1) alignClass = 'text-right pr-[2px]';

        return `
        <div class="flex-1 text-[9px] text-terminal-gray font-mono whitespace-nowrap overflow-hidden ${alignClass}" 
             style="min-width: 0; position: relative;" 
             title="${escapeHtml(x)}">
            ${escapeHtml(displayLabel)}
        </div>
    `;
    }).join('');
}

/**
 * Build heatmap x-axis header HTML (for date-based axes)
 */
export function buildHeatmapXHeader(xLabels, isDateAxis = true) {
    const numCols = xLabels.length;
    if (!numCols) return '';

    // For non-date axes, use categorical header
    if (!isDateAxis) {
        return buildCategoricalXHeader(xLabels);
    }

    const toDate = s => new Date(s + 'T00:00:00Z');
    const dates = xLabels.map(toDate);
    const first = dates[0];
    const last = dates[dates.length - 1];
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const spanDays = Math.max(1, Math.round((last - first) / MS_PER_DAY));

    let unit;
    if (spanDays <= 14) unit = 'day';
    else if (spanDays <= 90) unit = 'week';
    else if (spanDays <= 720) unit = 'month';
    else unit = 'year';

    const labelsCount = Math.min(8, Math.max(3, Math.round(Math.sqrt(numCols))));
    const indices = new Set();
    if (labelsCount <= 1) indices.add(0);
    else {
        const step = (numCols - 1) / (labelsCount - 1);
        for (let i = 0; i < labelsCount; i++) {
            indices.add(Math.round(i * step));
        }
    }
    indices.add(0);
    indices.add(numCols - 1);

    const chosen = Array.from(indices).sort((a, b) => a - b);

    return xLabels.map((x, idx) => {
        let label = '';
        if (chosen.includes(idx)) {
            const d = dates[idx];
            if (unit === 'month') {
                label = d.toLocaleString('en', { month: 'short' }) + " '" + String(d.getFullYear()).slice(-2);
            } else if (unit === 'year') {
                label = String(d.getFullYear());
            } else {
                const monthName = d.toLocaleString('en', { month: 'short' });
                const day = String(d.getDate()).padStart(2, '0');
                const yearShort = String(d.getFullYear()).slice(-2);
                label = `${monthName} ${day} '${yearShort}`;
            }
        }

        let alignClass = 'text-center';
        if (idx === 0) alignClass = 'text-left';
        else if (idx === xLabels.length - 1) alignClass = 'text-right pr-[2px]';

        return `
        <div class="flex-1 text-[9px] text-terminal-gray font-mono whitespace-nowrap overflow-visible ${alignClass}" 
             style="min-width: 0; position: relative;" 
             title="${escapeHtml(x)}">
            ${escapeHtml(label)}
        </div>
    `;
    }).join('');
}

/**
 * Render heatmap card HTML
 */
export function renderHeatmap(chartConfig, chartData, dashboardId) {
    if (!Array.isArray(chartData) || chartData.length === 0) {
        return '';
    }

    const widthClass = chartConfig.width === 'full' ? 'md:col-span-2' : '';
    const options = chartConfig.options || {};
    const chartId = `heatmap-${dashboardId}-${chartConfig.id}`;

    const xField = chartConfig.x_field || 'x';
    const yField = chartConfig.y_field || 'y';
    const valueField = chartConfig.value_field || 'value';

    const points = chartData
        .filter(d => d && d[xField] !== null && d[xField] !== undefined && d[yField] !== null && d[yField] !== undefined)
        .map(d => ({
            x: d[xField],
            y: d[yField],
            v: Number(d[valueField] ?? d.value ?? 0)
        }))
        .filter(p => Number.isFinite(p.v));

    if (points.length === 0) return '';

    const uniq = (arr) => Array.from(new Set(arr));
    let xLabels = uniq(points.map(p => String(p.x)));
    
    // Check if all x values are numeric (e.g., hours 0-23)
    const xAllNumeric = xLabels.every(l => /^\d+$/.test(l));
    if (xAllNumeric) {
        // Sort numerically
        xLabels.sort((a, b) => Number(a) - Number(b));
    } else {
        // Alphabetical sort for non-numeric
        xLabels.sort();
    }

    const isDateAxis = xLabels.length > 0 && xLabels.every(l => /^\d{4}-\d{1,2}-\d{1,2}$/.test(l));

    const yRaw = uniq(points.map(p => p.y));
    const allNumeric = yRaw.every(v => Number.isFinite(Number(v)));
    const yLabels = allNumeric
        ? yRaw.map(v => Number(v)).sort((a, b) => a - b).map(v => String(v))
        : yRaw.map(v => String(v)).sort();

    const valueMap = new Map();
    for (const p of points) {
        valueMap.set(`${String(p.x)}||${String(p.y)}`, p.v);
    }

    // Store state for responsive rendering
    heatmapRegistry[chartId] = {
        xLabels,
        yLabels,
        valueMap,
        options,
        allNumeric,
        chartConfig,
        isDateAxis
    };

    return `
        <div class="dashboard-card ${widthClass}">
            <div class="card-header mb-4">
                <div class="flex-1">
                    <h3 class="card-title">
                        <span class="material-symbols-outlined">grid_on</span>
                        ${escapeHtml(chartConfig.title)}
                    </h3>
                    ${chartConfig.description ? `<p class="text-xs text-terminal-gray mt-1 font-mono">${escapeHtml(chartConfig.description)}</p>` : ''}
                </div>
            </div>

            <div id="${chartId}" class="w-full js-responsive-heatmap relative">
                <!-- Content injected via renderResponsiveHeatmap -->
            </div>
            
            <!-- Shared tooltip for this chart -->
            <div id="${chartId}-tooltip" class="hidden fixed z-[9999] px-2 py-1 bg-surface-dark border border-border-dark text-xs text-white font-mono rounded shadow-lg pointer-events-none transition-opacity duration-75"></div>
        </div>
    `;
}

/**
 * Renders a specific heatmap using HTML5 Canvas
 */
export function renderResponsiveHeatmap(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const state = heatmapRegistry[containerId];
    if (!state) return;

    const { xLabels, yLabels, valueMap, options, allNumeric, isDateAxis } = state;
    const tooltip = document.getElementById(`${containerId}-tooltip`);
    
    const containerWidth = container.clientWidth || 800;
    
    // Adjust Y_LABEL_WIDTH based on whether it's categorical (longer labels)
    const Y_LABEL_WIDTH = isDateAxis ? 24 : Math.min(120, Math.max(60, containerWidth * 0.15));
    const GAP_WIDTH = 4;
    // Allow row_height from options, default 20 for better readability
    const ROW_HEIGHT = options.row_height || 20;
    
    const availableWidthForGrid = Math.max(100, containerWidth - Y_LABEL_WIDTH - GAP_WIDTH);
    // For categorical x-axis, use larger minimum box width for readability
    const MIN_BOX_WIDTH = isDateAxis ? 2.5 : 40;
    const maxCols = Math.floor(availableWidthForGrid / MIN_BOX_WIDTH);
    
    const totalCols = xLabels.length;
    let visibleXLabels = xLabels;
    if (totalCols > maxCols) {
        visibleXLabels = xLabels.slice(totalCols - maxCols);
    }
    const numCols = visibleXLabels.length;
    
    const xHeaderHtml = buildHeatmapXHeader(visibleXLabels, isDateAxis);
    const maxV = Math.max(...Array.from(valueMap.values()), 0);
    const baseColor = options.color || '#3b82f6';
    const cRgb = hexToRgb(baseColor);
    
    // Only calculate weekend highlighting for date axes
    const isWeekendCol = isDateAxis ? visibleXLabels.map(x => {
        if (typeof x === 'string') {
            try {
                const d = new Date(x);
                if (!isNaN(d.getTime())) {
                    const day = d.getUTCDay();
                    return (day === 0 || day === 6);
                }
            } catch (e) { return false; }
        }
        return false;
    }) : visibleXLabels.map(() => false);

    const totalGridHeight = yLabels.length * ROW_HEIGHT;
    
    // Format y-labels: handle JSON arrays, truncate long strings
    const formatYLabel = (y) => {
        let label = String(y);
        // Parse JSON arrays and format nicely
        if (label.startsWith('[') && label.endsWith(']')) {
            try {
                const parsed = JSON.parse(label);
                if (Array.isArray(parsed)) {
                    label = parsed.join(', ');
                }
            } catch (e) {
                // Keep original if not valid JSON
            }
        }
        // Truncate long labels
        const maxLen = isDateAxis ? 6 : 15;
        if (label.length > maxLen) {
            label = label.slice(0, maxLen - 1) + '…';
        }
        return label;
    };
    
    const yLabelsHtml = yLabels.map(y => {
        const yLabel = allNumeric ? String(y).padStart(2, '0') : formatYLabel(y);
        return `<div style="height: ${ROW_HEIGHT}px; line-height: ${ROW_HEIGHT}px;" class="text-[10px] text-terminal-gray font-mono text-right leading-none truncate" title="${escapeHtml(String(y))}">${escapeHtml(yLabel)}</div>`;
    }).join('');

    container.innerHTML = `
        <div class="w-full">
            <div class="flex items-end gap-1 mb-2">
                <div style="width: ${Y_LABEL_WIDTH}px;" class="flex-shrink-0"></div>
                <div class="flex gap-0 flex-1 overflow-hidden" style="width: ${availableWidthForGrid}px;">${xHeaderHtml}</div>
            </div>
            <div class="flex items-start gap-1">
                <div class="flex flex-col flex-shrink-0 overflow-hidden" style="width: ${Y_LABEL_WIDTH}px;">
                    ${yLabelsHtml}
                </div>
                <div class="relative flex-1" style="height: ${totalGridHeight}px;">
                    <canvas id="${containerId}-canvas" style="width: 100%; height: 100%; display: block;"></canvas>
                </div>
            </div>
        </div>
    `;

    const canvas = document.getElementById(`${containerId}-canvas`);
    if (!canvas) return;

    const canvasWidth = canvas.clientWidth;
    const canvasHeight = totalGridHeight;
    
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    
    const ctx = canvas.getContext('2d', { alpha: true });
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    const getX = (i) => Math.floor(i * canvasWidth / numCols);
    
    for (let c = 0; c < numCols; c++) {
        const xStart = getX(c);
        const xEnd = getX(c + 1);
        const w = xEnd - xStart;
        const xLabel = visibleXLabels[c];
        const isWeekend = isWeekendCol[c];

        if (isWeekend) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
            ctx.fillRect(xStart, 0, w, canvasHeight);
        } else {
             ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
             ctx.fillRect(xStart, 0, w, canvasHeight);
        }

        for (let r = 0; r < yLabels.length; r++) {
            const yLabel = yLabels[r];
            const v = valueMap.get(`${xLabel}||${yLabel}`) ?? 0;
            
            if (v > 0) {
                const ratio = Math.min(1, v / maxV);
                const minA = options.min_alpha ?? 0.10;
                const maxA = options.max_alpha ?? 0.90;
                const a = minA + (maxA - minA) * ratio;
                
                ctx.fillStyle = `rgba(${cRgb.r}, ${cRgb.g}, ${cRgb.b}, ${a})`;
                ctx.fillRect(xStart, r * ROW_HEIGHT, w, ROW_HEIGHT - 1);
                
                if (w > 2) { 
                   ctx.clearRect(xEnd - 1, r * ROW_HEIGHT, 1, ROW_HEIGHT - 1);
                }
            } else {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
                ctx.fillRect(xStart, (r + 1) * ROW_HEIGHT - 1, w, 1);
                if (w > 3) {
                    ctx.fillRect(xEnd - 1, r * ROW_HEIGHT, 1, ROW_HEIGHT);
                }
            }
        }
    }

    // Clone and redraw to remove old event listeners
    const oldCanvas = canvas.cloneNode(true);
    canvas.parentNode.replaceChild(oldCanvas, canvas);
    const newCanvas = oldCanvas;
    
    const newCtx = newCanvas.getContext('2d', { alpha: true });
    newCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    
    // Redraw
    for (let c = 0; c < numCols; c++) {
        const xStart = getX(c);
        const xEnd = getX(c + 1);
        const w = xEnd - xStart;
        const xLabel = visibleXLabels[c];
        const isWeekend = isWeekendCol[c];

        if (isWeekend) {
            newCtx.fillStyle = 'rgba(0, 0, 0, 0.25)';
            newCtx.fillRect(xStart, 0, w, canvasHeight);
        } else {
             newCtx.fillStyle = 'rgba(255, 255, 255, 0.02)';
             newCtx.fillRect(xStart, 0, w, canvasHeight);
        }

        for (let r = 0; r < yLabels.length; r++) {
            const yVal = yLabels[r];
            const v = valueMap.get(`${xLabel}||${yVal}`) ?? 0;
            
            if (v > 0) {
                const ratio = Math.min(1, v / maxV);
                const minA = options.min_alpha ?? 0.10;
                const maxA = options.max_alpha ?? 0.90;
                const a = minA + (maxA - minA) * ratio;
                newCtx.fillStyle = `rgba(${cRgb.r}, ${cRgb.g}, ${cRgb.b}, ${a})`;
                newCtx.fillRect(xStart, r * ROW_HEIGHT, w, ROW_HEIGHT - 1);
                if (w > 2) newCtx.clearRect(xEnd - 1, r * ROW_HEIGHT, 1, ROW_HEIGHT - 1);
            } else {
                newCtx.fillStyle = 'rgba(255, 255, 255, 0.05)';
                newCtx.fillRect(xStart, (r + 1) * ROW_HEIGHT - 1, w, 1);
                if (w > 3) newCtx.fillRect(xEnd - 1, r * ROW_HEIGHT, 1, ROW_HEIGHT);
            }
        }
    }
    
    const valueSuffix = options.value_suffix || '';
    
    const formatTitle = (x, y, v) => {
        const formattedValue = valueSuffix ? `${formatNumber(v)}${valueSuffix}` : formatNumber(v);
        
        if (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)) {
            try {
                const [yNum, mNum, dNum] = x.split('-').map(Number);
                const startDate = new Date(yNum, mNum - 1, dNum);
                const endDate = new Date(startDate);
                endDate.setDate(startDate.getDate() + 7);
                
                const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                const startM = months[startDate.getMonth()];
                const endM = months[endDate.getMonth()];
                const yy = String(startDate.getFullYear()).slice(-2);
                
                let rangeStr = "";
                if (startDate.getMonth() === endDate.getMonth() && startDate.getFullYear() === endDate.getFullYear()) {
                     rangeStr = `${startDate.getDate()}-${endDate.getDate()} ${startM} '${yy}`;
                } else if (startDate.getFullYear() === endDate.getFullYear()) {
                     rangeStr = `${startDate.getDate()} ${startM} - ${endDate.getDate()} ${endM} '${yy}`;
                } else {
                     const endYY = String(endDate.getFullYear()).slice(-2);
                     rangeStr = `${startDate.getDate()} ${startM} '${yy} - ${endDate.getDate()} ${endM} '${endYY}`;
                }
                return `${rangeStr}: ${formattedValue}`;
            } catch (e) {
                // Fallthrough
            }
        }
        
        const yStr = allNumeric ? String(y).padStart(2, '0') : String(y);
        return `${x} · ${yStr}: ${formattedValue}`;
    };

    const handleMouseMove = (e) => {
        const rect = newCanvas.getBoundingClientRect();
        if (e.clientX < rect.left || e.clientX > rect.right || 
            e.clientY < rect.top || e.clientY > rect.bottom) {
            tooltip.classList.add('hidden');
            return;
        }

        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        
        const colIdx = Math.floor(mx / canvasWidth * numCols);
        const rowIdx = Math.floor(my / ROW_HEIGHT);
        
        if (colIdx >= 0 && colIdx < numCols && rowIdx >= 0 && rowIdx < yLabels.length) {
            const xVal = visibleXLabels[colIdx];
            const yVal = yLabels[rowIdx];
            const val = valueMap.get(`${xVal}||${yVal}`) ?? 0;
            
            tooltip.textContent = formatTitle(xVal, yVal, val);
            
            let topPos = e.clientY + 15;
            let leftPos = e.clientX + 15;
            
            if (leftPos + 150 > window.innerWidth) leftPos = e.clientX - 150;
            if (topPos + 30 > window.innerHeight) topPos = e.clientY - 30;

            tooltip.style.top = topPos + 'px';
            tooltip.style.left = leftPos + 'px';
            tooltip.style.transform = 'none';
            
            tooltip.classList.remove('hidden');
        } else {
            tooltip.classList.add('hidden');
        }
    };
    
    const handleMouseLeave = () => {
        tooltip.classList.add('hidden');
    };

    if (!newCanvas.classList.contains('interactive-attached')) {
        newCanvas.addEventListener('mousemove', handleMouseMove);
        newCanvas.addEventListener('mouseleave', handleMouseLeave);
        newCanvas.classList.add('interactive-attached');
    }
}

/**
 * Initialize / Update all heatmaps on screen
 */
export function initializeHeatmaps() {
    document.querySelectorAll('.js-responsive-heatmap').forEach(el => {
        renderResponsiveHeatmap(el.id);
    });
}
