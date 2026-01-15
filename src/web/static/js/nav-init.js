/**
 * Navigation utilities for setting active state
 */

async function hasAnyIndexedData() {
    // Shared lightweight availability check: if there are no indexed sessions/turns, search should be disabled.
    try {
        const response = await fetch('/api/system/stats');
        if (!response.ok) {
            // Treat missing stats as "no data"; treat transient errors as "unknown" (don't disable search).
            return response.status === 404 ? false : true;
        }

        const stats = await response.json();
        const totalSessions = Number(stats.total_sessions || 0);
        const totalTurns = Number(stats.total_turns || 0);
        return totalSessions > 0 || totalTurns > 0;
    } catch (_error) {
        // If we can't check, don't disable search.
        return true;
    }
}

function applySearchAvailability(isAvailable) {
    const disabledSearchMessage =
        'Search is disabled: you have no indexed workspaces yet. Go to /workspaces and extract/index at least one workspace to enable search.';

    const navSearch = document.getElementById('nav-search') || document.querySelector('a.nav-item[href="/advanced_search"]');
    const headerSearch = document.querySelector('a.header-btn[title="Advanced Search"]');

    const targets = [navSearch, headerSearch].filter(Boolean);
    for (const el of targets) {
        if (isAvailable) {
            el.style.opacity = '';
            el.style.cursor = '';
            el.removeAttribute('aria-disabled');
            if (el === headerSearch) {
                el.setAttribute('title', 'Advanced Search');
            } else {
                el.removeAttribute('title');
            }
            continue;
        }

        el.style.opacity = '0.5';
        el.style.cursor = 'not-allowed';
        el.setAttribute('aria-disabled', 'true');
        el.setAttribute('title', disabledSearchMessage);

        if (!el.dataset.disabledClickHandlerAttached) {
            el.addEventListener('click', (e) => {
                if (el.getAttribute('aria-disabled') === 'true') {
                    e.preventDefault();
                    e.stopPropagation();
                    window.location.href = '/browse';
                }
            });
            el.dataset.disabledClickHandlerAttached = 'true';
        }
    }
}

async function fetchAndDisplayVersion() {
    try {
        const response = await fetch('/api/version');
        const data = await response.json();
        const versionElement = document.getElementById('nav-version');
        if (versionElement && data.version) {
            versionElement.textContent = `v${data.version} :: connected`;
        }
    } catch (error) {
        console.error('Failed to fetch version:', error);
        const versionElement = document.getElementById('nav-version');
        if (versionElement) {
            versionElement.textContent = 'v?.?.? :: connected';
        }
    }
}

function normalizePath(pathname) {
    if (!pathname) return '/';

    // Treat any workspace detail route as part of the Workspaces area.
    if (pathname.startsWith('/workspace/')) return '/browse';

    // Normalize trailing slashes (except root).
    if (pathname.length > 1 && pathname.endsWith('/')) {
        return pathname.replace(/\/+$/, '');
    }

    return pathname;
}

async function initializeNavigation() {
    const currentPath = normalizePath(window.location.pathname);

    // Remove active class from all nav items
    document.querySelectorAll('.nav-item').forEach((item) => {
        item.classList.remove('active');
    });

    // Highlight by matching the href path (IDs are not consistently present across pages)
    const navItem = document.querySelector(`a.nav-item[href="${currentPath}"]`);
    if (navItem) {
        navItem.classList.add('active');
    }
    
    // Fetch and display version
    fetchAndDisplayVersion();

    // Ensure search affordances are consistently enabled/disabled across pages.
    const indexedDataAvailable = await hasAnyIndexedData();
    applySearchAvailability(indexedDataAvailable);
}

// Initialize navigation when DOM is ready
document.addEventListener('DOMContentLoaded', initializeNavigation);
