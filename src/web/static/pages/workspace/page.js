/**
 * Workspace Page Controller - Main orchestrator for the workspace detail page
 * Uses modular components: Sessions, Turns, Modals, etc.
 */

const WorkspacePage = {
    // State
    workspaceId: '',
    workspaceAgents: [],
    workspaceStatus: null,
    dashboardStats: null,
    
    // Current view
    currentView: 'dashboard',  // 'dashboard' or 'session'

    /**
     * Initialize the workspace page
     */
    init() {
        // Parse URL: /workspace/{workspace_id}
        const pathParts = window.location.pathname.split('/');
        this.workspaceId = pathParts[2];
        
        // Hide the single agent badge
        const agentBadge = document.getElementById('agent-badge');
        if (agentBadge) agentBadge.classList.add('hidden');
        
        // Update content height on load and resize
        this.updateContentHeight();
        window.addEventListener('resize', () => this.updateContentHeight());
        
        // Initialize workspace selector
        this.initWorkspaceSelector();
        
        // Initialize history state management
        this.initHistoryHandling();
        
        // Restore view state from URL on page load
        this.restoreViewFromUrl();
        
        this.loadWorkspaceStatus();
    },

    /**
     * Initialize history handling for back/forward buttons
     */
    initHistoryHandling() {
        window.addEventListener('popstate', (e) => {
            this.restoreViewFromUrl();
        });
    },

    /**
     * Build URL for current state
     */
    buildCurrentUrl() {
        let url = `/workspace/${this.workspaceId}`;
        if (this.currentView === 'session' && Sessions.currentId) {
            url += `/session/${Sessions.currentId}`;
        }
        return url;
    },

    /**
     * Update browser history when view changes
     */
    updateHistory() {
        const url = this.buildCurrentUrl();
        window.history.pushState(
            { 
                view: this.currentView, 
                sessionId: Sessions.currentId,
                workspaceId: this.workspaceId
            },
            '',
            url
        );
    },

    /**
     * Restore view state from URL
     */
    restoreViewFromUrl() {
        const pathParts = window.location.pathname.split('/');
        const view = pathParts[3]; // 'session' or undefined
        const sessionId = pathParts[4]; // session ID or undefined
        
        if (view === 'session' && sessionId) {
            // Restore session view
            Sessions.currentId = sessionId;
            this.selectSession(sessionId, true); // true = skipHistory (we're already in history)
        } else {
            // Restore dashboard view
            this.showDashboard(true); // true = skipHistory
        }
    },

    /**
     * Initialize workspace selector dropdown
     */
    initWorkspaceSelector() {
        const trigger = document.getElementById('workspace-selector-trigger');
        const dropdown = document.getElementById('workspace-dropdown');
        
        if (!trigger || !dropdown) return;
        
        // Track highlighted index for keyboard navigation
        this.highlightedWorkspaceIndex = -1;
        
        // Toggle dropdown on click
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = dropdown.classList.contains('open');
            
            if (isOpen) {
                this.closeWorkspaceSelector();
            } else {
                this.openWorkspaceSelector();
            }
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            const isOpen = dropdown.classList.contains('open');
            if (isOpen && !trigger.contains(e.target) && !dropdown.contains(e.target)) {
                this.closeWorkspaceSelector();
            }
        });
        
        // Close dropdown on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && dropdown.classList.contains('open')) {
                this.closeWorkspaceSelector();
            }
        });
        
        // Handle search input
        dropdown.addEventListener('input', (e) => {
            if (e.target.id === 'workspace-search-input') {
                this.filterWorkspaceSelector(e.target.value);
            }
        });
        
        // Keyboard navigation in search box
        dropdown.addEventListener('keydown', (e) => {
            if (e.target.id === 'workspace-search-input') {
                this.handleWorkspaceSelectorKeyboard(e);
            }
        });
        
        // Prevent dropdown clicks from closing it
        dropdown.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    },

    /**
     * Handle keyboard navigation in workspace selector
     */
    handleWorkspaceSelectorKeyboard(e) {
        const items = document.querySelectorAll('.workspace-dropdown-item');
        if (items.length === 0) return;
        
        const maxIndex = items.length - 1;
        
        switch(e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.highlightedWorkspaceIndex = Math.min(this.highlightedWorkspaceIndex + 1, maxIndex);
                this.updateWorkspaceHighlight(items);
                break;
                
            case 'ArrowUp':
                e.preventDefault();
                this.highlightedWorkspaceIndex = Math.max(this.highlightedWorkspaceIndex - 1, 0);
                this.updateWorkspaceHighlight(items);
                break;
                
            case 'Tab':
                e.preventDefault();
                if (e.shiftKey) {
                    // Shift+Tab goes up
                    this.highlightedWorkspaceIndex = Math.max(this.highlightedWorkspaceIndex - 1, 0);
                } else {
                    // Tab goes down
                    this.highlightedWorkspaceIndex = Math.min(this.highlightedWorkspaceIndex + 1, maxIndex);
                }
                this.updateWorkspaceHighlight(items);
                break;
                
            case 'Enter':
                e.preventDefault();
                if (this.highlightedWorkspaceIndex >= 0 && this.highlightedWorkspaceIndex < items.length) {
                    const item = items[this.highlightedWorkspaceIndex];
                    const workspaceId = item.dataset.workspaceId;
                    if (workspaceId && workspaceId !== this.workspaceId) {
                        window.location.href = `/workspace/${workspaceId}`;
                    }
                }
                break;
        }
    },

    /**
     * Update visual highlight for keyboard navigation
     */
    updateWorkspaceHighlight(items) {
        // Remove all highlights
        items.forEach(item => item.classList.remove('highlighted'));
        
        // Add highlight to current item
        if (this.highlightedWorkspaceIndex >= 0 && this.highlightedWorkspaceIndex < items.length) {
            const item = items[this.highlightedWorkspaceIndex];
            item.classList.add('highlighted');
            
            // Scroll into view if needed
            item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    },

    /**
     * Open workspace selector and load workspaces
     */
    async openWorkspaceSelector() {
        const trigger = document.getElementById('workspace-selector-trigger');
        const dropdown = document.getElementById('workspace-dropdown');
        
        if (!trigger || !dropdown) return;
        
        trigger.classList.add('open');
        dropdown.classList.add('open');
        
        // Load workspaces if not already loaded
        await this.loadWorkspacesForSelector();
    },

    /**
     * Close workspace selector
     */
    closeWorkspaceSelector() {
        const trigger = document.getElementById('workspace-selector-trigger');
        const dropdown = document.getElementById('workspace-dropdown');
        
        if (trigger) trigger.classList.remove('open');
        if (dropdown) dropdown.classList.remove('open');
    },

    /**
     * Load all workspaces for the selector dropdown
     */
    async loadWorkspacesForSelector() {
        const dropdown = document.getElementById('workspace-dropdown');
        if (!dropdown) return;
        
        try {
            dropdown.innerHTML = '<div class="workspace-dropdown-loading">Loading workspaces...</div>';
            
            const response = await fetch('/api/browse/workspaces?page=1&page_size=500');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            const workspaces = data.workspaces || [];
            
            if (workspaces.length === 0) {
                dropdown.innerHTML = '<div class="workspace-dropdown-empty">No workspaces found</div>';
                return;
            }
            
            // Store workspaces for filtering
            this.allWorkspaces = workspaces;
            
            // Render with search box
            this.renderWorkspaceDropdown(workspaces);
            
            // Focus search input
            const searchInput = document.getElementById('workspace-search-input');
            if (searchInput) {
                setTimeout(() => searchInput.focus(), 100);
            }
        } catch (error) {
            console.error('Failed to load workspaces:', error);
            dropdown.innerHTML = '<div class="workspace-dropdown-empty">Failed to load workspaces</div>';
        }
    },

    /**
     * Render workspace dropdown with search and items
     */
    renderWorkspaceDropdown(workspaces) {
        const dropdown = document.getElementById('workspace-dropdown');
        if (!dropdown) return;
        
        const searchBox = `
            <div class="workspace-dropdown-search">
                <input type="text" 
                       id="workspace-search-input" 
                       placeholder="Search workspaces..." 
                       autocomplete="off">
            </div>
        `;
        
        const itemsHtml = workspaces.map(ws => this.renderWorkspaceItem(ws)).join('');
        const itemsContainer = `<div class="workspace-dropdown-items">${itemsHtml}</div>`;
        
        dropdown.innerHTML = searchBox + itemsContainer;
        
        // Attach click handlers
        dropdown.querySelectorAll('.workspace-dropdown-item').forEach(item => {
            item.addEventListener('click', () => {
                const workspaceId = item.dataset.workspaceId;
                if (workspaceId && workspaceId !== this.workspaceId) {
                    window.location.href = `/workspace/${workspaceId}`;
                }
            });
        });
    },

    /**
     * Filter workspaces in the dropdown
     */
    filterWorkspaceSelector(searchTerm) {
        if (!this.allWorkspaces) return;
        
        const term = searchTerm.toLowerCase().trim();
        
        // Reset highlighted index when filtering
        this.highlightedWorkspaceIndex = -1;
        
        if (!term) {
            // Show all workspaces
            this.renderWorkspaceDropdown(this.allWorkspaces);
            return;
        }
        
        // Filter workspaces by name or agent
        const filtered = this.allWorkspaces.filter(ws => {
            const workspaceId = ws.workspace_id || ws.id;
            const workspaceName = (ws.workspace_name || workspaceId).toLowerCase();
            const agents = (ws.agents || []).map(a => a.toLowerCase());
            
            return workspaceName.includes(term) || agents.some(agent => agent.includes(term));
        });
        
        if (filtered.length === 0) {
            const dropdown = document.getElementById('workspace-dropdown');
            const searchBox = dropdown.querySelector('.workspace-dropdown-search');
            const emptyMessage = '<div class="workspace-dropdown-empty">No matching workspaces</div>';
            dropdown.innerHTML = searchBox.outerHTML + emptyMessage;
        } else {
            this.renderWorkspaceDropdown(filtered);
        }
        
        // Restore search value
        const searchInput = document.getElementById('workspace-search-input');
        if (searchInput) {
            searchInput.value = searchTerm;
            searchInput.focus();
        }
    },

    /**
     * Render a single workspace item in the dropdown
     */
    renderWorkspaceItem(workspace) {
        const workspaceId = workspace.workspace_id || workspace.id;
        const workspaceName = workspace.workspace_name || workspaceId;
        const agents = workspace.agents || [];
        const isActive = workspaceId === this.workspaceId;
        
        // Render agent icons
        const agentIcons = agents.map(agent => {
            const info = AgentInfo.get(agent);
            return `<img src="${info.logo}" 
                         alt="${info.name}" 
                         title="${info.name}"
                         class="w-4 h-4 object-contain" 
                         onerror="this.src='/static/img/agent-logo.svg'">`;
        }).join('');
        
        return `
            <div class="workspace-dropdown-item ${isActive ? 'active' : ''}" 
                 data-workspace-id="${workspaceId}"
                 title="${workspaceName}">
                <span class="workspace-dropdown-name font-mono">${workspaceName}</span>
                <div class="workspace-dropdown-agents">
                    ${agentIcons}
                </div>
            </div>
        `;
    },

    /**
     * Update the main content height based on visible headers
     */
    updateContentHeight() {
        const header = document.querySelector('header');
        const breadcrumb = document.querySelector('header')?.nextElementSibling;
        const extractionStatus = document.getElementById('extraction-status');
        const syncWarningBar = document.getElementById('sync-warning-bar');
        
        let headerHeight = 0;
        if (header) headerHeight += header.offsetHeight;
        if (breadcrumb) headerHeight += breadcrumb.offsetHeight;
        if (extractionStatus && !extractionStatus.classList.contains('hidden')) {
            headerHeight += extractionStatus.offsetHeight;
        }
        if (syncWarningBar && !syncWarningBar.classList.contains('hidden')) {
            headerHeight += syncWarningBar.offsetHeight;
        }
        
        document.documentElement.style.setProperty('--header-height', `${headerHeight}px`);
    },

    /**
     * Load workspace status and trigger extraction if needed
     */
    async loadWorkspaceStatus() {
        this.showLoading('Checking workspace status...');
        
        try {
            const response = await fetch(`/api/browse/workspace/${this.workspaceId}/status`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            this.workspaceStatus = await response.json();
            this.workspaceAgents = this.workspaceStatus.agents || [];
            
            // Update workspace name
            const workspaceDisplayName = this.workspaceStatus.workspace_name || this.workspaceId;
            document.getElementById('workspace-name').textContent = workspaceDisplayName;

            // Also update the workspace name shown in the left nav (workspace-scoped section)
            const navWorkspaceName = document.getElementById('nav-workspace-name');
            if (navWorkspaceName) navWorkspaceName.textContent = workspaceDisplayName;
            
            this.updateAgentsBadges();
            
            if (this.workspaceStatus.is_extracted) {
                this.updateStatusBadge();
                await this.loadSessions();
                await this.loadDashboard();
                this.showMainContent();
                // Only switch to the dashboard if we're not already viewing a session.
                // When restoring from a deep link the currentView may be 'session',
                // so avoid overriding it and avoid pushing a new history entry.
                if (this.currentView !== 'session') {
                    this.showDashboard(true);
                }
                
                // Check if source has newer data
                if (this.workspaceStatus.source_available) {
                    this.checkSyncStatus();
                }
            } else {
                await this.extractWorkspace();
            }
            
        } catch (error) {
            console.error('Failed to load workspace status:', error);
            this.showExtractionStatus('error', 'Failed to Load', error.message, [
                { label: 'Retry', onclick: 'WorkspacePage.loadWorkspaceStatus()' },
                { label: 'Back to Browse', onclick: 'window.location.href="/browse"', secondary: true }
            ]);
        }
    },

    /**
     * Check if workspace source has new data since last extraction
     */
    async checkSyncStatus() {
        try {
            const response = await fetch(`/api/browse/workspace/${this.workspaceId}/sync-status`);
            if (!response.ok) return;
            
            const syncStatus = await response.json();
            
            if (syncStatus.needs_sync) {
                this.showSyncWarning(syncStatus);
            } else {
                this.hideSyncWarning();
            }
        } catch (error) {
            console.error('Failed to check sync status:', error);
        }
    },

    /**
     * Show the sync warning bar
     */
    showSyncWarning(syncStatus) {
        const bar = document.getElementById('sync-warning-bar');
        const message = document.getElementById('sync-warning-message');
        
        let parts = [];
        if (syncStatus.new_sessions > 0) {
            parts.push(`${syncStatus.new_sessions} new session${syncStatus.new_sessions > 1 ? 's' : ''}`);
        }
        if (syncStatus.new_turns > 0) {
            parts.push(`~${syncStatus.new_turns} new turn${syncStatus.new_turns > 1 ? 's' : ''}`);
        }
        
        message.textContent = parts.length > 0 
            ? `Found ${parts.join(' and ')} in your workspace`
            : syncStatus.message;
        
        bar.classList.remove('hidden');
        this.updateContentHeight();
    },

    /**
     * Hide the sync warning bar
     */
    hideSyncWarning() {
        document.getElementById('sync-warning-bar').classList.add('hidden');
        this.updateContentHeight();
    },

    /**
     * Sync workspace - extract new data
     */
    async syncWorkspace() {
        this.hideSyncWarning();
        await this.startStreamingExtraction(false, true);
    },

    /**
     * Update the agents badges in the header
     */
    updateAgentsBadges() {
        const container = document.getElementById('agents-container');
        if (!container) return;
        
        container.innerHTML = this.workspaceAgents.map(agent => AgentInfo.renderBadge(agent)).join(' ');
    },

    /**
     * Extract workspace
     */
    async extractWorkspace(deleteExisting = false, syncOnly = false) {
        await this.startStreamingExtraction(deleteExisting, syncOnly);
    },

    /**
     * Start streaming extraction with modal
     */
    async startStreamingExtraction(deleteExisting = false, sync = false) {
        Modals.showExtraction();
        
        try {
            const params = new URLSearchParams();
            if (deleteExisting) params.append('deleteExisting', 'true');
            if (sync) params.append('sync', 'true');
            const queryString = params.toString();
            const url = `/api/browse/workspace/${this.workspaceId}/extract-stream${queryString ? '?' + queryString : ''}`;
            
            const response = await fetch(url, { method: 'POST' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const result = await response.json();
            
            if (!result.streaming) {
                Modals.appendExtractionLog(`✓ ${result.message || 'Workspace already extracted'}`, 'success');
                Modals.setExtractionState('completed');
                return;
            }
            
            SSEHandler.streamExtraction(result.run_id, {
                onComplete: () => this.closeExtractionModal(),
                onFailed: () => {},
                onError: () => {},
                onConnectionError: () => {}
            });
            
        } catch (error) {
            console.error('Failed to start extraction:', error);
            Modals.appendExtractionLog('Error: Failed to start extraction - ' + error.message, 'error');
            Modals.setExtractionState('failed');
        }
    },

    /**
     * Close extraction modal and load workspace data
     */
    async closeExtractionModal() {
        Modals.closeExtraction();
        this.showLoading('Loading workspace data...');
        
        try {
            const statusResponse = await fetch(`/api/browse/workspace/${this.workspaceId}/status`);
            if (statusResponse.ok) {
                this.workspaceStatus = await statusResponse.json();
                this.workspaceAgents = this.workspaceStatus.agents || [];
                this.updateAgentsBadges();
            }
            
            await this.loadSessions();
            await this.loadDashboard();
            this.updateStatusBadge();
            this.showMainContent();
            this.showDashboard();
        } catch (error) {
            console.error('Failed to load workspace after extraction:', error);
            this.showExtractionStatus('error', 'Failed to Load', error.message, [
                { label: 'Retry', onclick: 'WorkspacePage.loadWorkspaceStatus()' },
                { label: 'Back to Browse', onclick: 'window.location.href="/browse"', secondary: true }
            ]);
        }
    },

    /**
     * Refresh extraction
     */
    async refreshExtraction() {
        await this.extractWorkspace(false, true);
    },

    /**
     * Load sessions
     */
    async loadSessions() {
        try {
            const agents = await Sessions.load(this.workspaceId);
            this.workspaceAgents = agents.length > 0 ? agents : this.workspaceAgents;
            this.renderSessions();
        } catch (error) {
            console.error('Failed to load sessions:', error);
        }
    },

    /**
     * Render sessions list
     */
    renderSessions() {
        const filtered = Sessions.filter(Sessions.searchTerm);
        const container = document.getElementById('sessions-list');
        Sessions.render(container, filtered);
    },

    /**
     * Filter sessions by search term
     */
    filterSessions(searchTerm) {
        const filtered = Sessions.filter(searchTerm);
        const container = document.getElementById('sessions-list');
        Sessions.render(container, filtered);
    },

    /**
     * Clear session search
     */
    clearSessionSearch() {
        const filtered = Sessions.clearSearch();
        const container = document.getElementById('sessions-list');
        Sessions.render(container, filtered);
    },

    /**
     * Select a session
     */
    async selectSession(sessionId, skipHistory = false) {
        // Update active state
        document.querySelectorAll('.session-item').forEach(el => {
            el.classList.toggle('active', el.dataset.sessionId === sessionId);
        });
        
        Sessions.currentId = sessionId;
        Turns.clearSearch();
        
        this.showSessionView(skipHistory);
        
        // Reset scroll
        const mainContent = document.querySelector('.flex-1.overflow-y-auto');
        if (mainContent) mainContent.scrollTop = 0;
        
        // Find session info
        const session = Sessions.getById(sessionId);
        document.getElementById('current-session-title').textContent = 
            session?.session_name || sessionId.substring(0, 12);
        document.getElementById('current-session-subtitle').textContent = 
            session?.first_timestamp ? new Date(session.first_timestamp).toLocaleString() : '';
        
        Sessions.renderStats(session);
        
        // Load turns
        try {
            await Turns.load(sessionId);
            this.renderTurns();
        } catch (error) {
            console.error('Failed to load turns:', error);
            document.getElementById('turns-container').innerHTML = `
                <div class="text-center text-red-500">Failed to load turns: ${error.message}</div>
            `;
        }
    },

    /**
     * Render turns
     */
    renderTurns() {
        const filtered = Turns.filter(Turns.searchTerm);
        const container = document.getElementById('turns-container');
        Turns.render(container, filtered);
    },

    /**
     * Filter turns
     */
    filterTurns(searchTerm) {
        const filtered = Turns.filter(searchTerm);
        const container = document.getElementById('turns-container');
        Turns.render(container, filtered);
    },

    /**
     * Clear turn search
     */
    clearTurnSearch() {
        const filtered = Turns.clearSearch();
        const container = document.getElementById('turns-container');
        Turns.render(container, filtered);
    },

    /**
     * Load dashboard
     */
    async loadDashboard() {
        try {
            await this.loadDeclarativeDashboard('extraction');
        } catch (error) {
            console.error('Failed to load dashboard:', error);
            // Display error state
            const container = document.getElementById('extraction-tab-content');
            if (container) {
                container.innerHTML = '<div class="text-center py-12"><p class="text-terminal-gray font-mono">Failed to load dashboard. Please refresh the page.</p></div>';
            }
        }
    },

    /**
     * Load declarative dashboard
     */
    async loadDeclarativeDashboard(dashboardId) {
        const containerId = 'extraction-tab-content';
        
        // Wait for DashboardRenderer to be ready (if not already loaded)
        if (!window.DashboardRenderer) {
            await new Promise((resolve) => {
                if (window.DashboardRenderer) {
                    resolve();
                } else {
                    window.addEventListener('DashboardRendererReady', resolve, { once: true });
                }
            });
        }
        
        await window.DashboardRenderer.renderDeclarativeDashboard(containerId, this.workspaceId, dashboardId);
    },

    /**
     * Show dashboard view
     */
    showDashboard(skipHistory = false) {
        this.currentView = 'dashboard';
        document.getElementById('dashboard-view').classList.remove('hidden');
        document.getElementById('session-view').classList.add('hidden');
        
        document.getElementById('dashboard-link').classList.add('active');
        document.querySelectorAll('.session-item').forEach(el => el.classList.remove('active'));
        
        if (!skipHistory) {
            this.updateHistory();
        }
    },

    /**
     * Show session view
     */
    showSessionView(skipHistory = false) {
        this.currentView = 'session';
        document.getElementById('dashboard-view').classList.add('hidden');
        document.getElementById('session-view').classList.remove('hidden');
        
        document.getElementById('dashboard-link').classList.remove('active');
        
        if (!skipHistory) {
            this.updateHistory();
        }
    },

    /**
     * Update status badge
     */
    updateStatusBadge() {
        // Status updates handled by extraction flow
    },

    /**
     * Update action bars
     */
    updateActionBars() {
        setTimeout(() => this.updateContentHeight(), 0);
    },

    /**
     * Show extraction status panel
     */
    showExtractionStatus(type, title, subtitle, actions = []) {
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('main-content').classList.add('hidden');
        document.getElementById('extraction-status').classList.remove('hidden');
        
        const icons = { error: '❌', success: '✅', info: 'ℹ️', loading: '⏳' };
        
        document.getElementById('status-icon').textContent = icons[type] || '❓';
        document.getElementById('status-title').textContent = title;
        document.getElementById('status-subtitle').textContent = subtitle;
        
        const actionsEl = document.getElementById('status-actions');
        actionsEl.innerHTML = actions.map(action => `
            <button onclick="${action.onclick}" 
                    class="px-4 py-2 ${action.secondary ? 'bg-surface-dark text-white hover:bg-border-dark' : 'bg-primary text-white hover:bg-primary-dark'} rounded text-sm font-mono">
                ${action.label}
            </button>
        `).join('');
    },

    /**
     * Show loading state
     */
    showLoading(message = 'Loading...') {
        document.getElementById('loading').classList.remove('hidden');
        document.getElementById('main-content').classList.add('hidden');
        document.getElementById('extraction-status').classList.add('hidden');
        document.getElementById('loading-message').textContent = message;
    },

    /**
     * Show main content
     */
    showMainContent() {
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('main-content').classList.remove('hidden');
        document.getElementById('extraction-status').classList.add('hidden');
        this.updateContentHeight();
    }
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => WorkspacePage.init());

// Global functions for onclick handlers (backward compatibility)
window.selectSession = (id) => WorkspacePage.selectSession(id);
window.filterSessions = (term) => WorkspacePage.filterSessions(term);
window.clearSessionSearch = () => WorkspacePage.clearSessionSearch();
window.filterTurns = (term) => WorkspacePage.filterTurns(term);
window.clearTurnSearch = () => WorkspacePage.clearTurnSearch();
window.showDashboard = () => WorkspacePage.showDashboard();
window.refreshExtraction = () => WorkspacePage.refreshExtraction();
window.syncWorkspace = () => WorkspacePage.syncWorkspace();
window.closeExtractionModal = () => WorkspacePage.closeExtractionModal();

// Toggle functions for backward compatibility
window.toggleFilesList = (id) => Turns.toggleFilesList(id);
window.toggleCodeEdits = (id) => Turns.toggleCodeEdits(id);
window.toggleToolsList = (id, e) => Turns.toggleToolsList(id, e);

// Export for use in other modules
window.WorkspacePage = WorkspacePage;
