/**
 * Turns - Turn rendering and filtering
 */

const Turns = {
    list: [],
    searchTerm: '',
    areAllCollapsed: false,
    collapsedTextMaxHeightClass: 'max-h-64',

    /**
     * Strip assistant-only injected metadata lines like:
     * [cursor metadata: bubble_id=...]
     * [(agent name) metadata: ...]
     */
    _stripAssistantMetadata(text) {
        if (!text) return '';

        // Fast-path: avoid split/join when there's clearly nothing to do
        if (text.indexOf('metadata:') === -1 && text.indexOf('metadata :') === -1) {
            return text;
        }

        const lines = text.split('\n');
        const kept = [];

        for (const line of lines) {
            const trimmed = line.trim();

            // Match a whole-line bracketed metadata tag.
            // Examples:
            //   [cursor metadata: bubble_id=...]
            //   [(agent name) metadata: ...]
            if (/^\[\s*[^\]]*\bmetadata\s*:\s*[^\]]*\]\s*$/i.test(trimmed)) {
                continue;
            }

            kept.push(line);
        }

        return kept.join('\n');
    },

    /**
     * Load turns for a session
     */
    async load(sessionId) {
        const response = await fetch(`/api/browse/session/${sessionId}/turns`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        this.list = data.turns || [];
        return this.list;
    },

    /**
     * Filter turns by search term
     */
    filter(searchTerm) {
        this.searchTerm = (searchTerm || '').toLowerCase().trim();
        
        // Show/hide clear button
        const clearBtn = document.getElementById('turn-search-clear');
        if (clearBtn) {
            clearBtn.classList.toggle('hidden', !this.searchTerm);
        }
        
        if (this.list.length === 0) return [];
        
        // Filter turns
        const filtered = this.list.filter(turn => {
            if (!this.searchTerm) return true;

            let displayText = (turn.original_text || turn.text || '');
            if (turn.role !== 'user') {
                displayText = this._stripAssistantMetadata(displayText);
            }

            displayText = displayText.toLowerCase();
            return displayText.includes(this.searchTerm);
        });
        
        // Update count
        const countEl = document.getElementById('turn-count');
        if (countEl) {
            countEl.textContent = this.searchTerm 
                ? `${filtered.length}/${this.list.length} turns` 
                : `${this.list.length} turns`;
        }
        
        return filtered;
    },

    /**
     * Clear search
     */
    clearSearch() {
        this.searchTerm = '';
        const searchInput = document.getElementById('turn-search');
        if (searchInput) searchInput.value = '';
        
        const clearBtn = document.getElementById('turn-search-clear');
        if (clearBtn) clearBtn.classList.add('hidden');
        
        if (this.list.length > 0) {
            return this.filter('');
        }
        return [];
    },

    /**
     * Render turns list
     */
    render(container, turns) {
        if (!container) return;
        
        if (turns.length === 0) {
            container.innerHTML = `
                <div class="text-center text-terminal-gray py-8 font-mono">
                    ${this.searchTerm ? 'No matching turns' : 'No turns'}
                </div>
            `;
            return;
        }

        // If search is active, show flat list without groupings/dots
        if (this.searchTerm) {
            container.innerHTML = turns.map(turn => this._renderTurn(turn)).join('<div class="h-4"></div>');
            this._applyTurnTextClamps(container);
            return;
        }

        // Group turns into combined exchanges (User + following Assistant turns)
        const groups = [];
        let currentGroup = null;

        turns.forEach(turn => {
            if (turn.role === 'user') {
                if (currentGroup) groups.push(currentGroup);
                currentGroup = {
                    id: `exchange-${turn.turn}`,
                    userTurn: turn,
                    assistantTurns: []
                };
            } else {
                if (currentGroup) {
                    currentGroup.assistantTurns.push(turn);
                } else {
                    // Orphan assistant turn (e.g. start of chat or filtered context)
                    groups.push({
                        id: `exchange-${turn.turn}`,
                        userTurn: null,
                        assistantTurns: [turn]
                    });
                }
            }
        });
        if (currentGroup) groups.push(currentGroup);
        
        // Render groups
        const groupsHtml = groups.map(group => this._renderGroup(group)).join('');

        // Global toggle control (Two circles aligned with the timeline)
        // No text, positioned at the top left, aligned with group dots
        const toggleHtml = `
            <div class="turn-group flex gap-4 mb-2 relative">
                <div class="flex flex-col items-center cursor-pointer group p-1 -m-1" onclick="Turns.toggleAllGroups()" title="${this.areAllCollapsed ? 'Expand all' : 'Collapse all'}">
                    <div class="flex gap-1 items-center">
                         <div class="w-1.5 h-1.5 rounded-full bg-terminal-gray/50 group-hover:bg-primary transition-all duration-300"></div>
                         <div class="w-1.5 h-1.5 rounded-full bg-terminal-gray/50 group-hover:bg-primary transition-all duration-300"></div>
                    </div>
                </div>
            </div>
        `;

        container.innerHTML = toggleHtml + groupsHtml;

        // Clamp long turn bodies and show an expander only when needed
        this._applyTurnTextClamps(container);

        // If a turn hash is present, scroll to and highlight it
        this._scrollToHash(container);
    },

    /**
     * Render a group of turns (User + Assistant)
     */
    _renderGroup(group) {
        const content = [];
        if (group.userTurn) content.push(this._renderTurn(group.userTurn));
        group.assistantTurns.forEach(t => content.push(this._renderTurn(t)));
        
        // Add spacing between bubbles within the group
        const joinedContent = content.join('<div class="h-4"></div>'); 

        // Summaries
        const userText = group.userTurn 
            ? (group.userTurn.original_text || group.userTurn.text || '')
            : '';
        const userSummary = userText ? (userText.slice(0, 80).replace(/\n/g, ' ') + (userText.length > 80 ? '...' : '')) : 'User message';

        let assistantSummary = '';
        if (group.assistantTurns.length > 0) {
             const t = group.assistantTurns.find(turn => {
                 let txt = turn.original_text || turn.text || '';
                 txt = this._stripAssistantMetadata(txt).trim();
                 return txt.length > 0;
             }) || group.assistantTurns[0];

             let txt = t.original_text || t.text || '';
             txt = this._stripAssistantMetadata(txt);
             if (!txt.trim()) {
                 if (t.tools && t.tools.length > 0) txt = `[Used tool: ${t.tools[0]}]`;
                 else if (t.files && t.files.length > 0) txt = `[ Referenced files ]`;
                 else txt = 'Assistant message';
             }
             
             assistantSummary = txt.slice(0, 80).replace(/\n/g, ' ') + (txt.length > 80 ? '...' : '');
        }

        return `
        <div class="turn-group flex gap-4 mb-8 relative" id="${group.id}">
            <!-- Connection Line / Collapse Trigger -->
            <div class="flex flex-col items-center pt-5 pb-5 cursor-pointer group/line" onclick="Turns.toggleGroup('${group.id}')" title="Collapse/Expand turn group">
                <div class="w-2 h-2 rounded-full bg-terminal-gray/30 group-hover/line:bg-primary transition-colors"></div>
                ${group.assistantTurns.length > 0 ? `
                    <div class="w-0.5 flex-grow bg-terminal-gray/10 group-hover/line:bg-primary/50 transition-colors my-1 mb-1 rounded-full"></div>
                    <div class="w-2 h-2 rounded-full bg-terminal-gray/30 group-hover/line:bg-primary transition-colors"></div>
                ` : `
                    <div class="w-0.5 flex-grow bg-terminal-gray/10 group-hover/line:bg-primary/50 transition-colors my-1 mb-1 rounded-full"></div>
                `}
            </div>

            <!-- Expanded Content -->
            <div class="flex-1 min-w-0 group-content transition-all duration-300" id="${group.id}-content">
                ${joinedContent}
            </div>

            <!-- Collapsed State (Hidden by default) -->
            <div class="hidden flex-1 flex flex-col justify-between py-4 px-4 bg-surface-dark/30 border border-border-dark rounded-lg cursor-pointer hover:bg-surface-dark transition-colors gap-6" 
                 id="${group.id}-collapsed"
                 onclick="Turns.toggleGroup('${group.id}')">
                 
                 ${group.userTurn ? `
                 <div class="flex items-center gap-3">
                     <span class="text-lg leading-none">👤</span>
                     <span class="text-terminal-gray font-mono text-sm truncate opacity-80">${Formatters.escapeHtml(userSummary)}</span>
                 </div>
                 ` : ''}

                 ${assistantSummary ? `
                 <div class="flex items-center gap-3">
                     <span class="text-lg leading-none">🤖</span>
                     <span class="text-terminal-gray font-mono text-sm truncate opacity-80">${Formatters.escapeHtml(assistantSummary)}</span>
                 </div>
                 ` : ''}
            </div>
        </div>
        `;
    },

    /**
     * Toggle group collapse state
     */
    toggleGroup(groupId) {
        const content = document.getElementById(`${groupId}-content`);
        const collapsed = document.getElementById(`${groupId}-collapsed`);
        const groupEl = document.getElementById(groupId);
        
        if (!content || !collapsed) return;

        if (content.classList.contains('hidden')) {
            // Expand
            content.classList.remove('hidden');
            collapsed.classList.add('hidden');
        } else {
            // Collapse
            content.classList.add('hidden');
            collapsed.classList.remove('hidden');
        }
    },

    _scrollToHash(container) {
        if (!window.location.hash) return;
        const targetId = window.location.hash.substring(1);
        if (!targetId.startsWith('turn-')) return;

        requestAnimationFrame(() => {
            const el = document.getElementById(targetId);
            if (el) {
                // 1. Ensure the parent group is expanded
                const group = el.closest('.turn-group');
                if (group) {
                    const content = group.querySelector('.group-content');
                    if (content && content.classList.contains('hidden')) {
                        this.toggleGroup(group.id);
                    }
                }

                // 2. Ensure the turn text itself is expanded if it was clamped
                this.expandTurn(targetId);
                
                // 3. Scroll into view
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.classList.add('highlight-turn');
                setTimeout(() => el.classList.remove('highlight-turn'), 3000);
            }
        });
    },

    /**
     * Clamp long turn bodies and show an expander only when needed
     */
    _applyTurnTextClamps(container) {
        // Check once layout is likely stable.
        const checkClamps = () => {
            const wrappers = container.querySelectorAll('[data-turn-text-wrapper]');
            wrappers.forEach(wrapper => {
                const content = wrapper.querySelector('[data-turn-text-content]');
                const expander = wrapper.querySelector('[data-turn-text-expander]');
                if (!content || !expander) return;

                // Reset and measure
                wrapper.classList.remove(this.collapsedTextMaxHeightClass, 'overflow-hidden');
                expander.classList.add('hidden');

                const fullHeight = content.scrollHeight;
                
                // If it exceeds our threshold (~256px), apply the clamp
                if (fullHeight > 260) {
                    wrapper.classList.add(this.collapsedTextMaxHeightClass, 'overflow-hidden');
                    expander.classList.remove('hidden');
                }
            });
        };

        // Run immediately and after a short delay to catch layout shifts
        checkClamps();
        setTimeout(checkClamps, 100);
        
        // Also re-check if user resizes window
        if (!this._resizeHandlerAttached) {
            window.addEventListener('resize', () => {
                const currentContainer = document.getElementById('turns-container');
                if (currentContainer) this._applyTurnTextClamps(currentContainer);
            });
            this._resizeHandlerAttached = true;
        }
    },

    expandTurn(turnAnchorId, event) {
        if (event) event.stopPropagation();
        const bubble = document.getElementById(turnAnchorId);
        if (!bubble) return;

        const wrapper = bubble.querySelector('[data-turn-text-wrapper]');
        const expander = bubble.querySelector('[data-turn-text-expander]');
        if (!wrapper || !expander) return;

        wrapper.classList.remove(this.collapsedTextMaxHeightClass, 'overflow-hidden');
        expander.classList.add('hidden');
    },

    /**
     * Copy link to specific turn
     */
    copyTurnLink(turnId, btn) {
        const url = `${window.location.origin}${window.location.pathname}#turn-${turnId}`;
        navigator.clipboard.writeText(url).then(() => {
            this._showCopyFeedback(btn);
        });
    },

    /**
     * Copy turn text content
     */
    copyTurnText(turnId, btn) {
        const turn = this.list.find(t => t.turn === turnId);
        if (!turn) return;
        
        let text = turn.original_text || turn.text || '';
        if (turn.role !== 'user') {
            text = this._stripAssistantMetadata(text);
        }
        
        navigator.clipboard.writeText(text).then(() => {
             this._showCopyFeedback(btn);
        });
    },

    _showCopyFeedback(btn) {
        const span = btn.querySelector('span');
        const originalText = span.textContent;
        span.textContent = 'check';
        span.classList.add('text-terminal-green');
        setTimeout(() => {
            span.textContent = originalText;
            span.classList.remove('text-terminal-green');
        }, 1500);
    },

    /**
     * Render a single turn
     */
    _renderTurn(turn) {
        const isUser = turn.role === 'user';
        const bgColor = isUser ? 'bg-primary/10 border-primary/30' : 'bg-surface-dark border-border-dark';
        const alignment = isUser ? 'turn-user' : 'turn-assistant';
        const roleLabel = isUser ? 'You' : 'Assistant';
        const roleIcon = isUser ? '👤' : '🤖';
        const turnAnchorId = `turn-${turn.turn}`;
        const fadeFrom = isUser ? 'from-background-dark' : 'from-surface-dark';
        
        let displayText = turn.original_text || turn.text || '';
        if (!isUser) {
            displayText = this._stripAssistantMetadata(displayText);
        }
        const footerHtml = this._renderTurnFooter(turn, isUser);
        
        return `
            <div id="${turnAnchorId}" class="turn-bubble ${alignment} ${bgColor} border rounded-lg p-4 scroll-mt-6" data-turn-id="${turn.turn}">
                <div class="flex items-center gap-2 mb-2">
                    <span>${roleIcon}</span>
                    <span class="font-medium text-sm text-white">${roleLabel}</span>
                    <a href="#${turnAnchorId}" class="text-xs text-terminal-gray font-mono hover:text-white" title="Link to this turn">Turn ${turn.turn}</a>
                    
                    <button onclick="Turns.copyTurnLink(${turn.turn}, this)" class="text-terminal-gray hover:text-white transition-colors p-1 rounded hover:bg-white/5" title="Copy link to turn">
                        <span class="material-symbols-outlined text-[16px]">link</span>
                    </button>
                    <button onclick="Turns.copyTurnText(${turn.turn}, this)" class="text-terminal-gray hover:text-white transition-colors p-1 rounded hover:bg-white/5" title="Copy turn text">
                        <span class="material-symbols-outlined text-[16px]">content_copy</span>
                    </button>
                </div>
                <div class="relative" data-turn-text-wrapper>
                    <div class="text-sm text-white markdown-content" data-turn-text-content>${Formatters.renderMarkdown(displayText, this.searchTerm)}</div>
                    <div class="absolute inset-x-0 bottom-0 h-32 flex items-end justify-center bg-gradient-to-t ${fadeFrom} via-${isUser ? 'background-dark' : 'surface-dark'}/90 to-transparent rounded-b-lg pb-4" 
                         data-turn-text-expander>
                        <button onclick="Turns.expandTurn('${turnAnchorId}', event)" class="flex items-center gap-2 px-4 py-1.5 bg-surface-dark border border-primary/30 rounded-full text-xs font-medium text-primary hover:bg-primary/10 hover:text-white hover:border-primary/50 transition-all shadow-lg backdrop-blur-md group cursor-pointer z-10">
                             <span>Show more</span>
                             <span class="material-symbols-outlined text-sm group-hover:translate-y-0.5 transition-transform">expand_more</span>
                        </button>
                    </div>
                </div>
                ${turn.files && turn.files.length > 0 ? this._renderFilesList(turn) : ''}
                ${!isUser && turn.tools && turn.tools.length > 0 ? this._renderToolsList(turn) : ''}
                ${!isUser ? this._renderCodeEdits(turn) : ''}
                ${footerHtml}
            </div>
        `;
    },

    /**
     * Render turn footer with metrics
     */
    _renderTurnFooter(turn, isUser) {
        const parts = [];
        
        // Timestamp
        if (turn.timestamp_iso) {
            const date = new Date(turn.timestamp_iso);
            parts.push(`<span class="text-xs text-terminal-gray font-mono">${date.toLocaleTimeString()}</span>`);
        }
        
        // Visible tokens
        if (turn.total_visible_tokens) {
            parts.push(`<span class="text-xs text-terminal-gray font-mono">👁️ ${Formatters.number(turn.total_visible_tokens)} tokens</span>`);
        }
        
        // For assistant turns
        if (!isUser) {
            // Model used
            if (turn.model_id) {
                parts.push(`<span class="text-xs text-primary font-mono">🤖 ${turn.model_id}</span>`);
            }
            
            // File changes
            if (turn.total_lines_added > 0 || turn.total_lines_removed > 0) {
                const changes = [];
                if (turn.total_lines_added > 0) changes.push(`<span class="text-terminal-green">+${turn.total_lines_added}</span>`);
                if (turn.total_lines_removed > 0) changes.push(`<span class="text-error">-${turn.total_lines_removed}</span>`);
                parts.push(`<span class="text-xs font-mono">${changes.join(' ')}</span>`);
            }
        }
        
        if (parts.length === 0) return '';
        
        return `
            <div class="mt-3 pt-2 border-t border-border-dark flex flex-wrap gap-2">
                ${parts.join('<span class="text-border-dark">•</span>')}
            </div>
        `;
    },

    /**
     * Render files list for a turn
     */
    _renderFilesList(turn) {
        if (!turn.files || turn.files.length === 0) return '';
        
        const filesId = `files-${turn.turn}`;
        
        if (turn.files.length <= 3) {
            const displayFiles = turn.files.map(f => Formatters.escapeHtml(f.split('/').pop())).join(', ');
            return `
                <div class="mt-2 text-xs text-terminal-gray font-mono">
                    📎 ${turn.files.length} file(s): ${displayFiles}
                </div>
            `;
        }
        
        const allFiles = turn.files.map(f => `
            <div class="py-0.5">📄 ${Formatters.escapeHtml(f.split('/').pop())}</div>
        `).join('');
        
        return `
            <div class="mt-2 text-xs">
                <div class="cursor-pointer hover:bg-surface-dark rounded px-2 py-1 -mx-2 text-terminal-gray flex items-center gap-1" onclick="Turns.toggleFilesList('${filesId}')">
                    <span id="${filesId}-arrow" class="material-symbols-outlined text-[1rem] transition-transform">chevron_right</span>
                    <span>📎 ${turn.files.length} files</span>
                </div>
                <div id="${filesId}-content" class="mt-1 ml-6 text-terminal-gray font-mono" style="display: none;">
                    ${allFiles}
                </div>
            </div>
        `;
    },

    /**
     * Render tools list for a turn
     */
    _renderToolsList(turn) {
        if (!turn.tools || turn.tools.length === 0) return '';

        const toolsId = `tools-${turn.turn}`;

        if (turn.tools.length <= 3) {
            const displayTools = turn.tools.join(', ');
            return `
                <div class="mt-2 text-xs text-purple-400 font-mono">
                    🔧 ${turn.tools.length} tool(s): ${displayTools}
                </div>
            `;
        }

        const allTools = turn.tools.map(t => `
            <div class="py-0.5">🔧 ${Formatters.escapeHtml(t)}</div>
        `).join('');

        return `
            <div class="mt-2 text-xs">
                <div class="cursor-pointer hover:bg-surface-dark rounded px-2 py-1 -mx-2 text-purple-400 flex items-center gap-1" onclick="Turns.toggleToolsList('${toolsId}')">
                    <span id="${toolsId}-arrow" class="material-symbols-outlined text-[1rem] transition-transform">chevron_right</span>
                    <span>🔧 ${turn.tools.length} tools</span>
                </div>
                <div id="${toolsId}-content" class="mt-1 ml-6 text-purple-400 font-mono" style="display: none;">
                    ${allTools}
                </div>
            </div>
        `;
    },

    /**
     * Render code edits for a turn
     */
    _renderCodeEdits(turn) {
        if (!turn.code_edits || turn.code_edits.length === 0) {
            if (turn.lines_added > 0 || turn.lines_removed > 0 || turn.files_edited > 0) {
                return `
                    <div class="mt-2 p-2 bg-background-dark rounded text-xs">
                        <div class="font-medium text-white mb-1 font-mono">📝 Code Changes</div>
                        <div class="flex gap-3 font-mono">
                            ${turn.files_edited > 0 ? `<span class="text-terminal-gray">📁 ${turn.files_edited} file(s)</span>` : ''}
                            ${turn.lines_added > 0 ? `<span class="text-terminal-green">+${turn.lines_added} lines</span>` : ''}
                            ${turn.lines_removed > 0 ? `<span class="text-error">-${turn.lines_removed} lines</span>` : ''}
                        </div>
                    </div>
                `;
            }
            return '';
        }
        
        const edits = turn.code_edits;
        const totalAdded = edits.reduce((sum, e) => sum + (e.lines_added || 0), 0);
        const totalRemoved = edits.reduce((sum, e) => sum + (e.lines_removed || 0), 0);
        const editsId = `edits-${turn.turn}`;
        
        const fileList = edits.map(edit => {
            const fileName = edit.file_path ? edit.file_path.split(/[/\\]/).pop() : 'Unknown file';
            const lang = edit.language || '';
            const added = edit.lines_added || 0;
            const removed = edit.lines_removed || 0;
            
            let changeText = '';
            if (added > 0 || removed > 0) {
                const parts = [];
                if (added > 0) parts.push(`<span class="text-terminal-green">+${added}</span>`);
                if (removed > 0) parts.push(`<span class="text-error">-${removed}</span>`);
                changeText = parts.join(' ');
            }
            
            return `
                <div class="flex items-center justify-between py-1">
                    <div class="flex items-center gap-2 truncate">
                        <span class="text-terminal-gray">📄</span>
                        <span class="truncate text-white font-mono" title="${Formatters.escapeHtml(edit.file_path)}">${Formatters.escapeHtml(fileName)}</span>
                        ${lang ? `<span class="text-purple-400 text-xs font-mono">${lang}</span>` : ''}
                    </div>
                    <div class="text-xs whitespace-nowrap ml-2 font-mono">${changeText}</div>
                </div>
            `;
        }).join('');
        
        return `
            <div class="mt-2 p-2 bg-background-dark rounded text-xs">
                <div class="flex items-center justify-between cursor-pointer hover:bg-surface-dark px-2 py-1 rounded -mx-2 mb-1" onclick="Turns.toggleCodeEdits('${editsId}')">
                    <span class="font-medium text-white flex items-center gap-1 font-mono">
                        <span id="${editsId}-arrow" class="inline-block transition-transform text-terminal-gray" style="font-size: 10px;">▼</span>
                        <span>📝 Code Changes (${edits.length} file${edits.length !== 1 ? 's' : ''})</span>
                    </span>
                    <span class="text-terminal-gray font-mono">
                        ${totalAdded > 0 ? `<span class="text-terminal-green">+${totalAdded}</span>` : ''}
                        ${totalRemoved > 0 ? `<span class="text-error ml-1">-${totalRemoved}</span>` : ''}
                    </span>
                </div>
                <div id="${editsId}-content" class="divide-y divide-border-dark mt-1">
                    ${fileList}
                </div>
            </div>
        `;
    },

    /**
     * Toggle files list visibility
     */
    toggleFilesList(filesId) {
        const content = document.getElementById(`${filesId}-content`);
        const arrow = document.getElementById(`${filesId}-arrow`);
        
        if (content.style.display === 'none') {
            content.style.display = '';
            arrow.style.transform = 'rotate(90deg)';
        } else {
            content.style.display = 'none';
            arrow.style.transform = 'rotate(0deg)';
        }
    },

    /**
     * Toggle code edits visibility
     */
    toggleCodeEdits(editsId) {
        const content = document.getElementById(`${editsId}-content`);
        const arrow = document.getElementById(`${editsId}-arrow`);
        
        if (content.style.display === 'none') {
            content.style.display = '';
            arrow.style.transform = 'rotate(0deg)'; // Arrow points down when expanded (from initial right)
        } else {
            content.style.display = 'none';
            arrow.style.transform = 'rotate(-90deg)'; // Arrow points right when collapsed
        }
    },

    /**
     * Toggle tools list visibility
     */
    toggleToolsList(toolsId) {
        const content = document.getElementById(`${toolsId}-content`);
        const arrow = document.getElementById(`${toolsId}-arrow`);
        
        if (content.style.display === 'none') {
            content.style.display = '';
            arrow.style.transform = 'rotate(90deg)';
        } else {
            content.style.display = 'none';
            arrow.style.transform = 'rotate(0deg)';
        }
    },

    /**
     * Toggle group collapse state
     */
    toggleGroup(groupId) {
        const content = document.getElementById(`${groupId}-content`);
        const collapsed = document.getElementById(`${groupId}-collapsed`);
        const groupEl = document.getElementById(groupId);
        
        if (!content || !collapsed) return;

        if (content.classList.contains('hidden')) {
            // Expand
            content.classList.remove('hidden');
            collapsed.classList.add('hidden');
        } else {
            // Collapse
            content.classList.add('hidden');
            collapsed.classList.remove('hidden');
        }
    },

    /**
     * Toggle all groups
     * @param {boolean} [forceCollapse] - Optional boolean to force state (true=collapse, false=expand)
     */
    toggleAllGroups(forceCollapse) {
        if (typeof forceCollapse === 'boolean') {
            this.areAllCollapsed = forceCollapse;
        } else {
            this.areAllCollapsed = !this.areAllCollapsed;
        }
        
        // Label update removed since text is gone
        
        const groups = document.querySelectorAll('.turn-group');
        groups.forEach(group => {
            const content = document.getElementById(`${group.id}-content`);
            const collapsed = document.getElementById(`${group.id}-collapsed`);
            if (!content || !collapsed) return;

            if (this.areAllCollapsed) {
                // Collapse
                content.classList.add('hidden');
                collapsed.classList.remove('hidden');
            } else {
                // Expand
                content.classList.remove('hidden');
                collapsed.classList.add('hidden');
            }
        });
    }
};

// Export for use in other modules
window.Turns = Turns;
