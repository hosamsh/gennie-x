const SearchPage = {
    state: {
        query: '',
        mode: 'hybrid',
        role: 'all',
        strict: false,
        minScore: '',
        page: 1,
        pageSize: 20
    },

    availability: {
        checked: false,
        hasIndexedData: true,
    },

    async init() {
        this.cacheDom();
        this.bindControls();
        this.loadFromUrl();
        this.updateButtons();
        this.updateSummary(0, 0);

        await this.ensureIndexedDataAvailability();
        if (!this.availability.hasIndexedData) {
            return;
        }
        
        // Auto-execute search if query is present in URL
        if (this.state.query.trim()) {
            this.runSearch();
        } else {
            this.showEmptyState(true);
        }
    },

    cacheDom() {
        this.queryInput = document.getElementById('search-query');
        this.clearButton = document.getElementById('search-clear');
        this.statusLabel = document.getElementById('search-status');
        this.resultsEl = document.getElementById('search-results');
        this.emptyEl = document.getElementById('search-empty');
        this.loadingEl = document.getElementById('search-loading');
        this.loadingHintEl = document.getElementById('search-loading-hint');
        this.summaryEl = document.getElementById('results-summary');
        this.pageIndicator = document.getElementById('page-indicator');
        this.prevBtn = document.getElementById('page-prev');
        this.nextBtn = document.getElementById('page-next');
        this.minScoreInput = document.getElementById('search-min-score');
        this.strictInput = document.getElementById('search-strict');
        this.pageSizeSelect = document.getElementById('search-page-size');
        this.modeButtons = Array.from(document.querySelectorAll('.search-mode-btn'));
        this.roleButtons = Array.from(document.querySelectorAll('.search-role-btn'));

        this.controlsCard = document.getElementById('search-controls');
        this.resultsBar = document.getElementById('search-results-bar');
        this.unavailableEl = document.getElementById('search-unavailable');
        this.runBtn = document.getElementById('search-run-btn');
        this.resetBtn = document.getElementById('search-reset-btn');
    },

    startLoadingHint() {
        if (!this.loadingHintEl) {
            return;
        }

        this.stopLoadingHint();

        const messages = [
            'First load can be a bit slow after a reload…',
            'Loading models and indexes — next time is faster (cached).'
        ];

        const state = {
            stopped: false,
            messageIndex: 0,
            charIndex: 0,
            deleting: false,
            timeoutId: null,
        };

        this._loadingHintState = state;
        this.loadingHintEl.textContent = '';

        const tick = () => {
            if (state.stopped) {
                return;
            }

            const message = messages[state.messageIndex];

            if (!state.deleting) {
                state.charIndex = Math.min(state.charIndex + 1, message.length);
                this.loadingHintEl.textContent = message.slice(0, state.charIndex);

                if (state.charIndex >= message.length) {
                    state.deleting = true;
                    state.timeoutId = window.setTimeout(tick, 1200);
                    return;
                }

                state.timeoutId = window.setTimeout(tick, 35);
                return;
            }

            state.charIndex = Math.max(state.charIndex - 1, 0);
            this.loadingHintEl.textContent = message.slice(0, state.charIndex);

            if (state.charIndex <= 0) {
                state.deleting = false;
                state.messageIndex = (state.messageIndex + 1) % messages.length;
                state.timeoutId = window.setTimeout(tick, 300);
                return;
            }

            state.timeoutId = window.setTimeout(tick, 22);
        };

        tick();
    },

    stopLoadingHint() {
        const state = this._loadingHintState;
        if (!state) {
            if (this.loadingHintEl) {
                this.loadingHintEl.textContent = '';
            }
            return;
        }

        state.stopped = true;
        if (state.timeoutId) {
            window.clearTimeout(state.timeoutId);
        }
        this._loadingHintState = null;

        if (this.loadingHintEl) {
            this.loadingHintEl.textContent = '';
        }
    },

    async ensureIndexedDataAvailability() {
        if (this.availability.checked) {
            return;
        }

        const hasData = await this.hasAnyIndexedData();
        this.availability.checked = true;
        this.availability.hasIndexedData = hasData;

        if (!hasData) {
            this.showUnavailableState();
        } else {
            this.showAvailableState();
        }
    },

    async hasAnyIndexedData() {
        // Lightweight availability check: if there are no indexed sessions/turns, search should be disabled.
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
        return totalSessions > 0 || totalTurns > 0;
    },

    showUnavailableState() {
        if (this.unavailableEl) this.unavailableEl.classList.remove('hidden');
        if (this.controlsCard) this.controlsCard.classList.add('hidden');
        if (this.resultsBar) this.resultsBar.classList.add('hidden');

        this.resultsEl.innerHTML = '';
        this.showLoading(false);
        this.showEmptyState(false);
        this.updateSummary(0, 0);

        this.statusLabel.textContent = 'Unavailable';
        this.pageIndicator.textContent = '1';
        this.prevBtn.disabled = true;
        this.nextBtn.disabled = true;

        // Leave nav highlighting + search enable/disable to the shared nav init.
    },

    showAvailableState() {
        if (this.unavailableEl) this.unavailableEl.classList.add('hidden');
        if (this.controlsCard) this.controlsCard.classList.remove('hidden');
        if (this.resultsBar) this.resultsBar.classList.remove('hidden');

        // Leave nav highlighting + search enable/disable to the shared nav init.
    },

    bindControls() {
        this.modeButtons.forEach((btn) => {
            btn.addEventListener('click', () => {
                this.state.mode = btn.dataset.mode;
                this.state.page = 1;
                this.updateButtons();
            });
        });

        this.roleButtons.forEach((btn) => {
            btn.addEventListener('click', () => {
                this.state.role = btn.dataset.role;
                this.state.page = 1;
                this.updateButtons();
            });
        });

        this.queryInput.addEventListener('input', () => {
            this.state.query = this.queryInput.value;
            this.clearButton.classList.toggle('hidden', !this.state.query.trim());
        });

        this.minScoreInput.addEventListener('input', () => {
            this.state.minScore = this.minScoreInput.value;
        });

        this.strictInput.addEventListener('change', () => {
            this.state.strict = this.strictInput.checked;
        });

        this.pageSizeSelect.addEventListener('change', () => {
            this.state.pageSize = parseInt(this.pageSizeSelect.value, 10);
            this.state.page = 1;
        });
    },

    loadFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const query = params.get('q') || '';
        const mode = params.get('mode') || 'hybrid';
        const role = params.get('role') || 'all';
        const strict = params.get('strict') === '1';
        const minScore = params.get('min_score') || '';
        const page = parseInt(params.get('page') || '1', 10);
        const pageSize = parseInt(params.get('page_size') || '20', 10);

        this.state.query = query;
        this.state.mode = mode;
        this.state.role = role;
        this.state.strict = strict;
        this.state.minScore = minScore;
        this.state.page = Number.isNaN(page) ? 1 : page;
        this.state.pageSize = Number.isNaN(pageSize) ? 20 : pageSize;

        this.queryInput.value = query;
        this.strictInput.checked = strict;
        this.minScoreInput.value = minScore;
        this.pageSizeSelect.value = String(this.state.pageSize);
        this.clearButton.classList.toggle('hidden', !query.trim());
    },

    syncUrl() {
        const params = new URLSearchParams();
        if (this.state.query.trim()) params.set('q', this.state.query.trim());
        params.set('mode', this.state.mode);
        params.set('role', this.state.role);
        params.set('page', String(this.state.page));
        params.set('page_size', String(this.state.pageSize));
        if (this.state.strict) params.set('strict', '1');
        if (this.state.minScore) params.set('min_score', this.state.minScore);
        const url = `${window.location.pathname}?${params.toString()}`;
        window.history.replaceState({}, '', url);
    },

    updateButtons() {
        const baseClasses = ['px-3', 'py-1.5', 'rounded-full', 'border', 'text-xs', 'font-mono', 'transition-colors'];
        const activeClasses = ['bg-primary', 'text-white', 'border-primary'];
        const inactiveClasses = ['bg-surface-dark', 'text-terminal-gray', 'border-border-dark', 'hover:border-primary', 'hover:text-white'];

        const applyClasses = (buttons, activeValue, key) => {
            buttons.forEach((btn) => {
                btn.classList.remove(...activeClasses, ...inactiveClasses);
                btn.classList.add(...baseClasses);
                if (btn.dataset[key] === activeValue) {
                    btn.classList.add(...activeClasses);
                } else {
                    btn.classList.add(...inactiveClasses);
                }
            });
        };

        applyClasses(this.modeButtons, this.state.mode, 'mode');
        applyClasses(this.roleButtons, this.state.role, 'role');
    },

    clearQuery() {
        this.queryInput.value = '';
        this.state.query = '';
        this.clearButton.classList.add('hidden');
        this.resultsEl.innerHTML = '';
        this.showEmptyState(true);
        this.updateSummary(0, 0);
        this.pageIndicator.textContent = '1';
        this.prevBtn.disabled = true;
        this.nextBtn.disabled = true;
        this.statusLabel.textContent = 'Idle';
        this.syncUrl();
    },

    resetFilters() {
        this.state.mode = 'hybrid';
        this.state.role = 'all';
        this.state.strict = false;
        this.state.minScore = '';
        this.state.page = 1;
        this.state.pageSize = 20;
        this.strictInput.checked = false;
        this.minScoreInput.value = '';
        this.pageSizeSelect.value = '20';
        this.updateButtons();
    },

    async runSearch() {
        await this.ensureIndexedDataAvailability();
        if (!this.availability.hasIndexedData) {
            return;
        }

        const query = this.queryInput.value.trim();
        this.state.query = query;
        this.state.page = 1;
        if (!query) {
            this.clearQuery();
            return;
        }
        await this.fetchResults();
    },

    async fetchResults() {
        await this.ensureIndexedDataAvailability();
        if (!this.availability.hasIndexedData) {
            return;
        }

        if (!this.state.query.trim()) {
            return;
        }

        this.statusLabel.textContent = 'Searching...';
        this.summaryEl.textContent = 'Searching...';
        this.resultsEl.innerHTML = '';
        this.showEmptyState(false);
        this.showLoading(true);

        const params = new URLSearchParams({
            q: this.state.query.trim(),
            mode: this.state.mode,
            page: String(this.state.page),
            page_size: String(this.state.pageSize)
        });

        if (this.state.role === 'user') params.set('user_only', 'true');
        if (this.state.role === 'assistant') params.set('assistant_only', 'true');
        if (this.state.strict) params.set('strict', 'true');
        if (this.state.minScore) params.set('min_score', this.state.minScore);

        this.syncUrl();

        try {
            const response = await fetch(`/api/search?${params.toString()}`);
            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload.detail || 'Search failed');
            }

            this.showLoading(false);
            this.renderResults(payload.results || [], payload.total_count || 0);
            this.statusLabel.textContent = 'Ready';
        } catch (error) {
            this.showLoading(false);
            this.statusLabel.textContent = 'Error';
            this.renderError(error.message);
        }
    },

    renderResults(results, totalCount) {
        this.resultsEl.innerHTML = '';

        if (!results || results.length === 0) {
            this.showEmptyState(true);
            this.updateSummary(0, totalCount || 0);
            this.pageIndicator.textContent = String(this.state.page);
            this.prevBtn.disabled = this.state.page <= 1;
            this.nextBtn.disabled = true;
            return;
        }

        this.showEmptyState(false);
        this.updateSummary(results.length, totalCount);
        this.pageIndicator.textContent = String(this.state.page);
        this.prevBtn.disabled = this.state.page <= 1;
        this.nextBtn.disabled = this.state.page * this.state.pageSize >= totalCount;

        const searchTerm = this.state.query.trim();
        const cards = results.map((result) => {
            const role = result.role || 'unknown';
            const roleLabel = role === 'user' ? 'USER' : (role === 'assistant' ? 'ASSISTANT' : 'UNKNOWN');
            const score = typeof result.score === 'number' ? result.score.toFixed(3) : '0.000';
            const text = (result.original_text || '').replace(/\n/g, ' ').trim();
            const snippet = text.length > 220 ? `${text.slice(0, 220)}...` : text;
            const escapedSnippet = Formatters.highlightText(Formatters.escapeHtml(snippet), searchTerm);
            const sessionId = result.session_id || '';
            const workspaceId = result.workspace_id || '';
            const workspaceName = result.workspace_name || workspaceId;
            const turnNumber = result.turn ?? '';
            const timestamp = result.timestamp_iso ? new Date(result.timestamp_iso).toLocaleString() : 'Unknown time';
            const link = workspaceId && sessionId ? `/workspace/${workspaceId}/session/${sessionId}#turn-${turnNumber}` : '';

            return `
                <div class="dashboard-card">
                    <div class="flex flex-col gap-3">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-3">
                                <span class="text-xs font-mono px-2 py-0.5 rounded-full border border-border-dark text-terminal-gray">${roleLabel}</span>
                                <span class="text-xs font-mono text-terminal-gray">SCORE ${score}</span>
                            </div>
                            ${link ? `<a href="${link}" class="text-xs font-mono text-primary hover:text-white">OPEN TURN</a>` : ''}
                        </div>
                        <div class="text-sm text-white leading-relaxed">${escapedSnippet || '<span class="text-terminal-gray">No text</span>'}</div>
                        <div class="flex flex-wrap gap-4 text-xs text-terminal-gray font-mono">
                            <span>WORKSPACE ${Formatters.escapeHtml(workspaceName)}</span>
                            <span>SESSION ${Formatters.escapeHtml(sessionId.substring(0, 12))}</span>
                            <span>TURN ${turnNumber}</span>
                            <span>${timestamp}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        this.resultsEl.innerHTML = cards;
    },

    renderError(message) {
        this.resultsEl.innerHTML = `
            <div class="dashboard-card border border-border-dark">
                <div class="text-terminal-gray font-mono text-sm">Search error: ${Formatters.escapeHtml(message)}</div>
                <div class="text-terminal-gray text-xs font-mono mt-2">Run the CLI reindex if needed: python run_cli.py --reindex --run-dir data/web</div>
            </div>
        `;
    },

    updateSummary(count, total) {
        const disclaimerEl = document.getElementById('results-disclaimer');
        if (total) {
            this.summaryEl.textContent = `Showing ${count} of ${total} results`;
            if (disclaimerEl) disclaimerEl.classList.remove('hidden');
        } else if (count) {
            this.summaryEl.textContent = `Showing ${count} results`;
            if (disclaimerEl) disclaimerEl.classList.remove('hidden');
        } else {
            this.summaryEl.textContent = 'No results';
            if (disclaimerEl) disclaimerEl.classList.add('hidden');
        }
    },

    showEmptyState(show) {
        this.emptyEl.classList.toggle('hidden', !show);
    },

    showLoading(show) {
        this.loadingEl.classList.toggle('hidden', !show);

        if (show) {
            this.startLoadingHint();
        } else {
            this.stopLoadingHint();
        }
    },

    async nextPage() {
        this.state.page += 1;
        await this.fetchResults();
    },

    async prevPage() {
        if (this.state.page <= 1) return;
        this.state.page -= 1;
        await this.fetchResults();
    }
};

window.SearchPage = SearchPage;

document.addEventListener('DOMContentLoaded', () => {
    SearchPage.init();
});
