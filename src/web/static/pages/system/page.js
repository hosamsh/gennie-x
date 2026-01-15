/**
 * System Overview Dashboard
 * 
 * Renders the system-wide dashboard using the declarative dashboard system.
 */

// ==================== Initialization ====================

document.addEventListener('DOMContentLoaded', () => {
    loadSystemOverview();
});

// Navigate to search page with query (default options: hybrid, all roles)
function navigateToSearch(query) {
    const params = new URLSearchParams({
        q: query,
        mode: 'hybrid',
        role: 'all'
    });
    window.location.href = `/advanced_search?${params.toString()}`;
}

async function loadSystemOverview() {
    showLoading();
    
    try {
        const hasData = await hasAnyIndexedData();
        if (!hasData) {
            showEmptyState();
            return;
        }
        
        await renderDashboard();
    } catch (error) {
        console.error('Failed to load system overview:', error);
        showError(error.message);
    }
}

async function hasAnyIndexedData() {
    // Prefer a lightweight stats endpoint to decide if the system has any indexed content.
    // When there is no DB / no extracted workspaces yet, this should return 404.
    const response = await fetch('/api/system/stats');
    if (!response.ok) {
        if (response.status === 404) {
            return false;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const stats = await response.json();

    const totalSessions = Number(stats.total_sessions || 0);
    const totalTurns = Number(stats.total_turns || 0);

    // Treat a zeroed system as "not indexed".
    return totalSessions > 0 || totalTurns > 0;
}

// ==================== View State Management ====================

function showLoading() {
    document.getElementById('loading').classList.remove('hidden');
    document.getElementById('error').classList.add('hidden');
    document.getElementById('empty-state').classList.add('hidden');
    document.getElementById('dashboard-content').classList.add('hidden');
}

function showError(message) {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('error').classList.remove('hidden');
    document.getElementById('error-message').textContent = message || 'Failed to load system overview';
    document.getElementById('empty-state').classList.add('hidden');
    document.getElementById('dashboard-content').classList.add('hidden');
}

function showEmptyState() {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('error').classList.add('hidden');
    document.getElementById('empty-state').classList.remove('hidden');
    document.getElementById('dashboard-content').classList.add('hidden');
    
    // Disable and hide search box when no data
    const searchContainer = document.getElementById('quick-search-container');
    const searchInput = document.getElementById('quick-search-input');
    const searchBtn = document.getElementById('quick-search-btn');
    if (searchContainer) searchContainer.style.display = 'none';
    if (searchInput) searchInput.disabled = true;
    if (searchBtn) searchBtn.disabled = true;

    // Leave nav highlighting + search enable/disable to the shared nav init.
}

function showDashboard() {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('error').classList.add('hidden');
    document.getElementById('empty-state').classList.add('hidden');
    document.getElementById('dashboard-content').classList.remove('hidden');
    
    // Enable and show search box when data exists
    const searchContainer = document.getElementById('quick-search-container');
    const searchInput = document.getElementById('quick-search-input');
    const searchBtn = document.getElementById('quick-search-btn');
    if (searchContainer) searchContainer.style.display = 'block';
    if (searchInput) searchInput.disabled = false;
    if (searchBtn) searchBtn.disabled = false;

    // Leave nav highlighting + search enable/disable to the shared nav init.
}

// ==================== Dashboard Rendering ====================

async function renderDashboard() {
    showDashboard();
    
    // Use the declarative dashboard renderer (consistent with workspace page)
    // The declarative endpoint returns is_available which handles has_data logic
    if (window.DashboardRenderer) {
        const result = await window.DashboardRenderer.renderDeclarativeDashboard(
            'system-dashboard-content',
            'system',  // Use 'system' to trigger system-level endpoint
            'system_extraction'   // Dashboard ID
        );
        // If dashboard reports no data available, show empty state
        if (result && result.is_available === false) {
            showEmptyState();
            return;
        }
    } else {
        console.error('DashboardRenderer not loaded');
    }
}
