/**
 * Shared utility functions for dashboard charts
 */

// Default color palette for charts
export const defaultPalette = [
    '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', 
    '#6366f1', '#14b8a6', '#f43f5e', '#22c55e', '#a855f7',
    '#0ea5e9', '#eab308', '#ef4444', '#84cc16', '#06b6d4'
];

/**
 * Debounce function
 */
export function debounce(fn, wait) {
    let t = null;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), wait);
    };
}

/**
 * Convert hex color to RGB object
 */
export function hexToRgb(hex) {
    const h = String(hex).replace('#', '').trim();
    if (h.length === 3) {
        const r = parseInt(h[0] + h[0], 16);
        const g = parseInt(h[1] + h[1], 16);
        const b = parseInt(h[2] + h[2], 16);
        return { r, g, b };
    }
    if (h.length === 6) {
        const r = parseInt(h.slice(0, 2), 16);
        const g = parseInt(h.slice(2, 4), 16);
        const b = parseInt(h.slice(4, 6), 16);
        return { r, g, b };
    }
    return { r: 59, g: 130, b: 246 }; // Default blue
}

/**
 * Escape HTML entities
 */
export function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Format number with commas
 */
export function formatNumber(num) {
    if (num === null || num === undefined) return '0';
    return Number(num).toLocaleString();
}

/**
 * Format a metric value based on format type
 */
export function formatMetricValue(value, format) {
    if (value === null || value === undefined) {
        return '-';
    }
    
    switch (format) {
        case 'number':
            return formatNumber(value);
        case 'percent':
            return `${value}%`;
        case 'datetime':
            // Standard single-line format: "1/12/2026, 2:02:47 PM"
            if (!value) return '-';
            try {
                return new Date(value).toLocaleString();
            } catch {
                return value;
            }
        case 'datetime:split':
            // Split format: date on first line, time on second line (smaller)
            if (!value) return '-';
            try {
                const date = new Date(value);
                const dateStr = date.toLocaleDateString();
                const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
                return `<span style="display: flex; flex-direction: column; gap: 0.25rem;"><span>${dateStr}</span><span class="text-sm text-terminal-gray">${timeStr}</span></span>`;
            } catch {
                return value;
            }
        case 'datetime:compact':
            // Compact format: "Jan 12, 2:02 PM"
            if (!value) return '-';
            try {
                const date = new Date(value);
                const month = date.toLocaleDateString('en-US', { month: 'short' });
                const day = date.getDate();
                const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
                return `${month} ${day}, ${time}`;
            } catch {
                return value;
            }
        case 'text':
        default:
            return String(value);
    }
}

/**
 * Format datetime string for display
 * @param {string} dateStr - ISO datetime string
 * @returns {string} Formatted date like "Jan 6, 2026 9:42 PM"
 */
export function formatDateTime(dateStr) {
    if (!dateStr) return '-';
    
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr; // Invalid date, return as-is
        
        const now = new Date();
        const diffMs = now - date;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        // If within last 7 days, show relative time
        if (diffDays === 0) {
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            if (diffHours === 0) {
                const diffMins = Math.floor(diffMs / (1000 * 60));
                if (diffMins < 1) return 'Just now';
                if (diffMins === 1) return '1 minute ago';
                return `${diffMins} minutes ago`;
            }
            if (diffHours === 1) return '1 hour ago';
            return `${diffHours} hours ago`;
        }
        
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        
        // Otherwise show formatted date
        const options = {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        };
        return date.toLocaleString('en-US', options);
    } catch (e) {
        return dateStr; // Return original on error
    }
}

/**
 * Check if a value looks like a datetime string
 * @param {*} value - Value to check
 * @returns {boolean} True if it looks like a datetime
 */
export function isDateTime(value) {
    if (typeof value !== 'string') return false;
    // Check for ISO datetime pattern (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)
    return /^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}/.test(value);
}

/**
 * Format chart label (remove underscores and optionally truncate)
 */
export function formatChartLabel(value, truncate = true, customLabels = null) {
    if (!value) return '-';
    
    // Use custom label if available
    if (customLabels && typeof customLabels === 'object' && customLabels[value]) {
        if (customLabels[value].label) {
            return customLabels[value].label;
        }
    }
    
    if (typeof value !== 'string') return String(value);
    
    // Replace underscores with spaces for readability (only if no custom label)
    let formatted = value.replace(/_/g, ' ');
    
    // Optionally truncate long values
    if (truncate && formatted.length > 25) {
        return formatted.substring(0, 22) + '...';
    }
    return formatted;
}

/**
 * Get color class for a color name
 */
export function getColorClass(color) {
    const colorMap = {
        'green': 'text-terminal-green',
        'red': 'text-error',
        'blue': 'text-primary',
        'purple': 'text-purple-400',
        'yellow': 'text-warning',
        'gray': 'text-terminal-gray',
    };
    return colorMap[color] || 'text-white';
}

/**
 * Get icon name for Material Symbols
 */
export function getIcon(iconName) {
    // Map common icon names to Material Symbols icon names
    const iconMap = {
        'chat': 'chat_bubble',
        'message': 'edit_note',
        'plus': 'add_circle',
        'minus': 'remove_circle',
        'file-code': 'code_blocks',
        'robot': 'smart_toy',
        'hash': 'tag',
        'tag': 'label',
        'clipboard': 'content_paste',
        'check-circle': 'check_circle',
        'cpu': 'memory',
        'clock': 'schedule',
        'code': 'code',
        'sessions': 'chat_bubble',
        'turns': 'sync_alt',
        'lines': 'add_circle',
        'tokens': 'token',
    };
    return iconMap[iconName] || iconName || 'info';
}
