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
        
        // Timeline visualization elements
        this.timelineContainer = document.getElementById('search-timeline-container');
        this.timelineEl = document.getElementById('search-timeline');
        this.timelineRange = document.getElementById('timeline-range');
        this.timelineSessionsCount = document.getElementById('timeline-sessions-count');
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
        this.hideTimeline();
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
        this.hideTimeline();
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
            this.renderResults(payload);
            this.statusLabel.textContent = 'Ready';
        } catch (error) {
            this.showLoading(false);
            this.statusLabel.textContent = 'Error';
            this.renderError(error.message);
        }
    },

    renderResults(payload) {
        const results = payload.results || [];
        const totalCount = payload.total_count || 0;
        const timeline = payload.timeline || null;
        const page = payload.page || this.state.page;
        const pageSize = payload.page_size || this.state.pageSize;
        
        this.resultsEl.innerHTML = '';

        if (!results || results.length === 0) {
            this.showEmptyState(true);
            this.hideTimeline();
            this.updateSummary(0, 0, totalCount, page, pageSize);
            this.pageIndicator.textContent = String(this.state.page);
            this.prevBtn.disabled = this.state.page <= 1;
            this.nextBtn.disabled = true;
            return;
        }

        this.showEmptyState(false);
        this.renderTimeline(timeline, totalCount);
        this.updateSummary(results.length, results.length, totalCount, page, pageSize);
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
            const workspaceFolder = result.workspace_folder || '';
            const turnNumber = result.turn ?? '';
            const timestamp = result.timestamp_iso ? new Date(result.timestamp_iso).toLocaleString() : 'Unknown time';
            const link = workspaceId && sessionId ? `/workspace/${workspaceId}/session/${sessionId}#turn-${turnNumber}` : '';
            
            // Format workspace folder display - show last 2-3 segments for readability
            const folderDisplay = this.formatFolderPath(workspaceFolder);

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
                            ${folderDisplay ? `<span class="flex items-center gap-1" title="${Formatters.escapeHtml(workspaceFolder)}"><span class="opacity-60">📁</span> ${Formatters.escapeHtml(folderDisplay)}</span>` : ''}
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

    updateSummary(pageResultCount, _unused, totalCount, page, pageSize) {
        const disclaimerEl = document.getElementById('results-disclaimer');
        if (totalCount > 0 && pageResultCount > 0) {
            const startIdx = (page - 1) * pageSize + 1;
            const endIdx = startIdx + pageResultCount - 1;
            this.summaryEl.textContent = `Showing ${startIdx}–${endIdx} of ${totalCount} results`;
            if (disclaimerEl) disclaimerEl.classList.remove('hidden');
        } else if (totalCount > 0) {
            this.summaryEl.textContent = `${totalCount} results found`;
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
    },
    
    /**
     * Format workspace folder path for display - shows last meaningful segments
     */
    formatFolderPath(folderPath) {
        if (!folderPath) return '';
        
        // Normalize path separators
        const normalized = folderPath.replace(/\\/g, '/');
        const segments = normalized.split('/').filter(s => s.length > 0);
        
        if (segments.length === 0) return '';
        if (segments.length <= 2) return segments.join('/');
        
        // Show last 2-3 meaningful segments
        return '…/' + segments.slice(-2).join('/');
    },
    
    /**
     * Hide the timeline visualization
     */
    hideTimeline() {
        if (this.timelineContainer) {
            this.timelineContainer.classList.add('hidden');
        }
    },
    
    /**
     * Get heatmap color based on intensity (0-1)
     * Uses a gradient from dark/empty to vibrant cyan/green
     */
    getHeatmapColor(intensity) {
        if (intensity <= 0) return 'rgba(26, 35, 50, 0.6)'; // Empty cell - dark surface
        
        // Color gradient: dark blue -> cyan -> green for intensity
        // Low: #1e3a5f (dark blue), Mid: #0891b2 (cyan), High: #10b981 (emerald)
        const colors = [
            { r: 30, g: 58, b: 95 },    // 0.0 - dark blue
            { r: 8, g: 145, b: 178 },   // 0.5 - cyan
            { r: 16, g: 185, b: 129 }   // 1.0 - emerald green
        ];
        
        let r, g, b;
        if (intensity <= 0.5) {
            const t = intensity * 2;
            r = Math.round(colors[0].r + (colors[1].r - colors[0].r) * t);
            g = Math.round(colors[0].g + (colors[1].g - colors[0].g) * t);
            b = Math.round(colors[0].b + (colors[1].b - colors[0].b) * t);
        } else {
            const t = (intensity - 0.5) * 2;
            r = Math.round(colors[1].r + (colors[2].r - colors[1].r) * t);
            g = Math.round(colors[1].g + (colors[2].g - colors[1].g) * t);
            b = Math.round(colors[1].b + (colors[2].b - colors[1].b) * t);
        }
        
        return `rgb(${r}, ${g}, ${b})`;
    },
    
    /**
     * Render timeline visualization as a canvas-based heatmap strip
     * Uses pre-aggregated timeline data from the API (covers ALL results)
     */
    renderTimeline(timeline, totalCount) {
        if (!this.timelineContainer || !this.timelineEl) {
            return;
        }
        
        // Check if we have valid timeline data from API
        if (!timeline || !timeline.date_counts || Object.keys(timeline.date_counts).length === 0) {
            this.hideTimeline();
            return;
        }
        
        const dateCounts = timeline.date_counts;
        const uniqueSessions = timeline.unique_sessions || 0;
        const uniqueWorkspaces = timeline.unique_workspaces || 0;
        
        const dates = Object.keys(dateCounts).sort();
        if (dates.length === 0) {
            this.hideTimeline();
            return;
        }
        
        // Show timeline
        this.timelineContainer.classList.remove('hidden');
        
        // Update session count info (from ALL results)
        if (this.timelineSessionsCount) {
            const sessionText = uniqueSessions === 1 ? '1 session' : `${uniqueSessions} sessions`;
            const workspaceText = uniqueWorkspaces === 1 ? '1 workspace' : `${uniqueWorkspaces} workspaces`;
            this.timelineSessionsCount.textContent = `${sessionText} • ${workspaceText}`;
        }
        
        // Generate all dates in range for continuous display
        const startDate = new Date(dates[0] + 'T00:00:00Z');
        const endDate = new Date(dates[dates.length - 1] + 'T00:00:00Z');
        const MS_PER_DAY = 24 * 60 * 60 * 1000;
        const daySpan = Math.round((endDate - startDate) / MS_PER_DAY) + 1;
        
        // Build array of all dates in range
        const allDates = [];
        for (let d = new Date(startDate); d <= endDate; d.setUTCDate(d.getUTCDate() + 1)) {
            allDates.push(d.toISOString().split('T')[0]);
        }
        
        // Find max count for scaling
        const maxCount = Math.max(...Object.values(dateCounts), 1);
        
        // Build x-axis labels (smart date labels based on span)
        const xLabels = this.buildTimelineXLabels(allDates, daySpan);
        
        // Render the canvas-based heatmap
        const canvasId = 'search-timeline-canvas';
        this.timelineEl.innerHTML = `
            <div class="w-full">
                <div class="flex gap-0 mb-1 text-[9px] text-terminal-gray font-mono" id="timeline-x-labels">
                    ${xLabels}
                </div>
                <div class="relative w-full" style="height: 48px;">
                    <canvas id="${canvasId}" style="width: 100%; height: 100%; display: block; border-radius: 4px;"></canvas>
                </div>
                <div class="flex items-center justify-center gap-2 mt-2">
                    <span class="text-[10px] text-terminal-gray font-mono">Less</span>
                    <div class="flex gap-0.5">
                        ${[0, 0.25, 0.5, 0.75, 1].map(i => `
                            <div style="width: 14px; height: 10px; background: ${this.getHeatmapColor(i)}; border-radius: 2px;"></div>
                        `).join('')}
                    </div>
                    <span class="text-[10px] text-terminal-gray font-mono">More</span>
                </div>
            </div>
        `;
        
        // Render canvas after DOM is ready
        requestAnimationFrame(() => {
            this.renderTimelineCanvas(canvasId, allDates, dateCounts, maxCount, daySpan);
        });
        
        // Render date range labels
        if (this.timelineRange) {
            const formatDate = (d) => new Date(d + 'T00:00:00Z').toLocaleDateString('en', { 
                month: 'short', 
                day: 'numeric',
                year: daySpan > 180 ? '2-digit' : undefined
            });
            
            if (allDates.length === 1) {
                this.timelineRange.innerHTML = `<span class="mx-auto">${formatDate(allDates[0])}</span>`;
            } else {
                this.timelineRange.innerHTML = `
                    <span>${formatDate(allDates[0])}</span>
                    <span class="text-terminal-gray opacity-60">${allDates.length} day${allDates.length !== 1 ? 's' : ''}</span>
                    <span>${formatDate(allDates[allDates.length - 1])}</span>
                `;
            }
        }
    },
    
    /**
     * Build smart x-axis labels based on date span
     */
    buildTimelineXLabels(allDates, daySpan) {
        const numCols = allDates.length;
        if (numCols === 0) return '';
        
        // Determine how many labels to show (aim for 5-8 labels)
        const labelsCount = Math.min(8, Math.max(3, Math.ceil(numCols / 30)));
        
        // Calculate which indices get labels
        const indices = new Set();
        indices.add(0);
        indices.add(numCols - 1);
        
        if (labelsCount > 2) {
            const step = (numCols - 1) / (labelsCount - 1);
            for (let i = 1; i < labelsCount - 1; i++) {
                indices.add(Math.round(i * step));
            }
        }
        
        const chosen = Array.from(indices).sort((a, b) => a - b);
        
        return allDates.map((dateStr, idx) => {
            let label = '';
            if (chosen.includes(idx)) {
                const d = new Date(dateStr + 'T00:00:00Z');
                if (daySpan <= 14) {
                    // Show day + month for short spans
                    label = d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
                } else if (daySpan <= 90) {
                    // Show month + day for medium spans
                    const month = d.toLocaleDateString('en', { month: 'short' });
                    const day = d.getUTCDate();
                    label = `${month} ${day}`;
                } else if (daySpan <= 365) {
                    // Show month + year for longer spans
                    label = d.toLocaleDateString('en', { month: 'short' }) + " '" + String(d.getUTCFullYear()).slice(-2);
                } else {
                    // Show just year for very long spans
                    label = String(d.getUTCFullYear());
                }
            }
            
            let alignClass = 'text-center';
            if (idx === 0) alignClass = 'text-left';
            else if (idx === numCols - 1) alignClass = 'text-right';
            
            return `<div class="flex-1 whitespace-nowrap overflow-visible ${alignClass}" style="min-width: 0;">${label}</div>`;
        }).join('');
    },
    
    /**
     * Render the canvas-based timeline heatmap
     */
    renderTimelineCanvas(canvasId, allDates, dateCounts, maxCount, daySpan) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        
        const canvasWidth = canvas.clientWidth || canvas.parentElement.clientWidth || 600;
        const canvasHeight = 48;
        
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        
        const ctx = canvas.getContext('2d', { alpha: true });
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        
        const numCols = allDates.length;
        const getX = (i) => Math.floor(i * canvasWidth / numCols);
        
        // Draw cells
        for (let c = 0; c < numCols; c++) {
            const xStart = getX(c);
            const xEnd = getX(c + 1);
            const w = Math.max(1, xEnd - xStart);
            const dateKey = allDates[c];
            const count = dateCounts[dateKey] || 0;
            
            // Check if weekend
            const d = new Date(dateKey + 'T00:00:00Z');
            const isWeekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
            
            // Background for weekends
            if (isWeekend) {
                ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
                ctx.fillRect(xStart, 0, w, canvasHeight);
            }
            
            // Draw value cell
            if (count > 0) {
                const intensity = Math.min(1, Math.log(count + 1) / Math.log(maxCount + 1));
                const color = this.getHeatmapColor(intensity);
                ctx.fillStyle = color;
                ctx.fillRect(xStart, 0, w - (w > 2 ? 1 : 0), canvasHeight);
            } else {
                // Empty cell - subtle grid line
                ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
                ctx.fillRect(xStart, 0, w - (w > 2 ? 1 : 0), canvasHeight);
            }
        }
        
        // Add tooltip handling
        this.setupTimelineTooltip(canvas, allDates, dateCounts, numCols, canvasWidth, daySpan);
    },
    
    /**
     * Setup tooltip for timeline canvas
     */
    setupTimelineTooltip(canvas, allDates, dateCounts, numCols, canvasWidth, daySpan) {
        // Create or get tooltip element
        let tooltip = document.getElementById('timeline-tooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'timeline-tooltip';
            tooltip.className = 'hidden fixed z-[9999] px-2 py-1 bg-surface-dark border border-border-dark text-xs text-white font-mono rounded shadow-lg pointer-events-none';
            document.body.appendChild(tooltip);
        }
        
        const handleMouseMove = (e) => {
            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            
            const colIdx = Math.floor(mx / canvasWidth * numCols);
            
            if (colIdx >= 0 && colIdx < numCols) {
                const dateKey = allDates[colIdx];
                const count = dateCounts[dateKey] || 0;
                
                const d = new Date(dateKey + 'T00:00:00Z');
                const dateLabel = d.toLocaleDateString('en', { 
                    weekday: 'short',
                    month: 'short', 
                    day: 'numeric',
                    year: daySpan > 365 ? 'numeric' : undefined
                });
                
                tooltip.textContent = count > 0 
                    ? `${dateLabel}: ${count} result${count !== 1 ? 's' : ''}`
                    : `${dateLabel}: No results`;
                
                // Position tooltip
                let topPos = e.clientY - 30;
                let leftPos = e.clientX + 10;
                
                if (leftPos + 150 > window.innerWidth) leftPos = e.clientX - 150;
                if (topPos < 0) topPos = e.clientY + 20;
                
                tooltip.style.top = topPos + 'px';
                tooltip.style.left = leftPos + 'px';
                tooltip.classList.remove('hidden');
            } else {
                tooltip.classList.add('hidden');
            }
        };
        
        const handleMouseLeave = () => {
            tooltip.classList.add('hidden');
        };
        
        // Remove old listeners by cloning
        const newCanvas = canvas.cloneNode(true);
        canvas.parentNode.replaceChild(newCanvas, canvas);
        
        newCanvas.addEventListener('mousemove', handleMouseMove);
        newCanvas.addEventListener('mouseleave', handleMouseLeave);
        
        // Redraw after clone
        const canvasHeight = 48;
        const ctx = newCanvas.getContext('2d', { alpha: true });
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        
        const getX = (i) => Math.floor(i * canvasWidth / numCols);
        
        for (let c = 0; c < numCols; c++) {
            const xStart = getX(c);
            const xEnd = getX(c + 1);
            const w = Math.max(1, xEnd - xStart);
            const dateKey = allDates[c];
            const count = dateCounts[dateKey] || 0;
            
            const d = new Date(dateKey + 'T00:00:00Z');
            const isWeekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
            
            if (isWeekend) {
                ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
                ctx.fillRect(xStart, 0, w, canvasHeight);
            }
            
            if (count > 0) {
                const maxCount = Math.max(...Object.values(dateCounts), 1);
                const intensity = Math.min(1, Math.log(count + 1) / Math.log(maxCount + 1));
                const color = this.getHeatmapColor(intensity);
                ctx.fillStyle = color;
                ctx.fillRect(xStart, 0, w - (w > 2 ? 1 : 0), canvasHeight);
            } else {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
                ctx.fillRect(xStart, 0, w - (w > 2 ? 1 : 0), canvasHeight);
            }
        }
    }
};

window.SearchPage = SearchPage;

document.addEventListener('DOMContentLoaded', () => {
    SearchPage.init();
});
