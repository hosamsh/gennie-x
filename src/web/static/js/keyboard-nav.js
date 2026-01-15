/**
 * Keyboard Navigation - Dev-friendly keyboard shortcuts for power users
 * Ctrl/Cmd+K: Command palette
 * j/k: Next/prev message
 * /: Focus search
 * g s: Go to sessions
 * g t: Go to transcript top
 * ?: Show keyboard hints
 */

const KeyboardNav = {
    // State
    enabled: true,
    currentTurnIndex: -1,
    pendingPrefix: null,
    prefixTimeout: null,
    
    // Command definitions
    commands: [
        { id: 'search', name: 'Search turns', icon: 'search', shortcut: '/', action: () => KeyboardNav.focusSearch() },
        { id: 'sessions', name: 'Go to sessions', icon: 'list', shortcut: 'g s', action: () => KeyboardNav.goToSessions() },
        { id: 'transcript-top', name: 'Go to top', icon: 'vertical_align_top', shortcut: 'g t', action: () => KeyboardNav.goToTranscriptTop() },
        { id: 'dashboard', name: 'Show dashboard', icon: 'analytics', shortcut: 'g d', action: () => KeyboardNav.showDashboard() },
        { id: 'next-turn', name: 'Next message', icon: 'arrow_downward', shortcut: 'j', action: () => KeyboardNav.nextTurn() },
        { id: 'prev-turn', name: 'Previous message', icon: 'arrow_upward', shortcut: 'k', action: () => KeyboardNav.prevTurn() },
        { id: 'collapse-all', name: 'Collapse all', icon: 'unfold_less', shortcut: '[', action: () => KeyboardNav.collapseAll() },
        { id: 'expand-all', name: 'Expand all', icon: 'unfold_more', shortcut: ']', action: () => KeyboardNav.expandAll() },
        { id: 'help', name: 'Show keyboard shortcuts', icon: 'help', shortcut: '?', action: () => KeyboardNav.showHelp() },
    ],

    /**
     * Initialize keyboard navigation
     */
    init() {
        document.addEventListener('keydown', (e) => this.handleKeydown(e));
        this.createCommandPalette();
        this.createHintToast();
    },

    /**
     * Handle keydown events
     */
    handleKeydown(e) {
        if (!this.enabled) return;
        
        // Ignore if in input/textarea (unless Escape)
        const target = e.target;
        const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
        
        // Command palette: Ctrl/Cmd + K
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            this.toggleCommandPalette();
            return;
        }
        
        // Escape: close palette or clear search
        if (e.key === 'Escape') {
            if (this.isPaletteOpen()) {
                this.closeCommandPalette();
                return;
            }
            if (isInput) {
                target.blur();
                return;
            }
        }
        
        // If command palette is open, handle navigation
        if (this.isPaletteOpen()) {
            this.handlePaletteKeydown(e);
            return;
        }
        
        // Don't process shortcuts if in input
        if (isInput) return;
        
        // Handle prefix sequences (g + key)
        if (this.pendingPrefix) {
            clearTimeout(this.prefixTimeout);
            const combo = this.pendingPrefix + ' ' + e.key;
            this.pendingPrefix = null;
            
            const command = this.commands.find(c => c.shortcut === combo);
            if (command) {
                e.preventDefault();
                command.action();
                return;
            }
        }
        
        // Start prefix sequence
        if (e.key === 'g') {
            this.pendingPrefix = 'g';
            this.prefixTimeout = setTimeout(() => {
                this.pendingPrefix = null;
            }, 500);
            return;
        }
        
        // Single key shortcuts
        const command = this.commands.find(c => c.shortcut === e.key && !c.shortcut.includes(' '));
        if (command) {
            e.preventDefault();
            command.action();
        }
    },

    /**
     * Create the command palette DOM
     */
    createCommandPalette() {
        const palette = document.createElement('div');
        palette.id = 'command-palette-overlay';
        palette.className = 'command-palette-overlay hidden';
        palette.innerHTML = `
            <div class="command-palette" onclick="event.stopPropagation()">
                <div class="command-palette-input-wrapper">
                    <span class="material-symbols-outlined">search</span>
                    <input type="text" class="command-palette-input" placeholder="Type a command..." id="command-palette-input">
                </div>
                <div class="command-palette-results" id="command-palette-results"></div>
                <div class="command-palette-footer">
                    <span>↑↓ navigate</span>
                    <span>↵ select</span>
                    <span>esc close</span>
                </div>
            </div>
        `;
        
        palette.addEventListener('click', () => this.closeCommandPalette());
        document.body.appendChild(palette);
        
        const input = document.getElementById('command-palette-input');
        input.addEventListener('input', () => this.filterCommands(input.value));
    },

    /**
     * Create the keyboard hint toast
     */
    createHintToast() {
        const toast = document.createElement('div');
        toast.id = 'keyboard-hint-toast';
        toast.className = 'keyboard-hint';
        toast.innerHTML = 'Press <kbd>?</kbd> for keyboard shortcuts';
        document.body.appendChild(toast);
        
        // Show briefly on first load
        setTimeout(() => this.showHintBriefly(), 2000);
    },

    /**
     * Show hint toast briefly
     */
    showHintBriefly() {
        const toast = document.getElementById('keyboard-hint-toast');
        if (!toast) return;
        
        toast.classList.add('visible');
        setTimeout(() => toast.classList.remove('visible'), 3000);
    },

    /**
     * Toggle command palette
     */
    toggleCommandPalette() {
        if (this.isPaletteOpen()) {
            this.closeCommandPalette();
        } else {
            this.openCommandPalette();
        }
    },

    /**
     * Open command palette
     */
    openCommandPalette() {
        const overlay = document.getElementById('command-palette-overlay');
        const input = document.getElementById('command-palette-input');
        
        overlay.classList.remove('hidden');
        input.value = '';
        input.focus();
        this.filterCommands('');
        this.selectedIndex = 0;
    },

    /**
     * Close command palette
     */
    closeCommandPalette() {
        document.getElementById('command-palette-overlay').classList.add('hidden');
    },

    /**
     * Check if palette is open
     */
    isPaletteOpen() {
        const overlay = document.getElementById('command-palette-overlay');
        return overlay && !overlay.classList.contains('hidden');
    },

    /**
     * Filter commands based on search
     */
    filterCommands(query) {
        const results = document.getElementById('command-palette-results');
        const lowerQuery = query.toLowerCase();
        
        const filtered = this.commands.filter(c => 
            c.name.toLowerCase().includes(lowerQuery) ||
            c.id.includes(lowerQuery)
        );
        
        results.innerHTML = filtered.map((cmd, i) => `
            <div class="command-palette-item ${i === 0 ? 'selected' : ''}" 
                 data-index="${i}"
                 onclick="KeyboardNav.executeCommand('${cmd.id}')">
                <span class="material-symbols-outlined">${cmd.icon}</span>
                <span class="command-name">${cmd.name}</span>
                <span class="command-shortcut">
                    ${cmd.shortcut.split(' ').map(k => `<kbd>${k}</kbd>`).join('')}
                </span>
            </div>
        `).join('');
        
        this.filteredCommands = filtered;
        this.selectedIndex = 0;
    },

    /**
     * Handle keyboard navigation in palette
     */
    handlePaletteKeydown(e) {
        const items = document.querySelectorAll('.command-palette-item');
        
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.selectedIndex = Math.min(this.selectedIndex + 1, items.length - 1);
            this.updateSelection(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
            this.updateSelection(items);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (this.filteredCommands && this.filteredCommands[this.selectedIndex]) {
                this.executeCommand(this.filteredCommands[this.selectedIndex].id);
            }
        }
    },

    /**
     * Update selection in palette
     */
    updateSelection(items) {
        items.forEach((item, i) => {
            item.classList.toggle('selected', i === this.selectedIndex);
        });
        items[this.selectedIndex]?.scrollIntoView({ block: 'nearest' });
    },

    /**
     * Execute a command by ID
     */
    executeCommand(id) {
        this.closeCommandPalette();
        const command = this.commands.find(c => c.id === id);
        if (command) {
            command.action();
        }
    },

    // ===== Action implementations =====

    /**
     * Focus the turn search input
     */
    focusSearch() {
        const input = document.getElementById('turn-search') || document.getElementById('session-search');
        if (input) {
            input.focus();
            input.select();
        }
    },

    /**
     * Navigate to sessions panel
     */
    goToSessions() {
        const sessionsList = document.getElementById('sessions-list');
        if (sessionsList) {
            sessionsList.scrollIntoView({ behavior: 'smooth' });
            // Focus first session
            const firstSession = sessionsList.querySelector('.session-item');
            if (firstSession) firstSession.focus();
        }
    },

    /**
     * Go to top of transcript
     */
    goToTranscriptTop() {
        // Use the main scroll container we assigned the ID to
        const container = document.getElementById('main-scroll-container') || document.getElementById('turns-container');
        if (container) {
            container.scrollTo({ top: 0, behavior: 'smooth' });
            this.currentTurnIndex = 0;
            this.highlightCurrentTurn();
        }
    },

    /**
     * Collapse all turn groups
     */
    collapseAll() {
        if (window.Turns && typeof window.Turns.toggleAllGroups === 'function') {
            window.Turns.toggleAllGroups(true);
        }
    },

    /**
     * Expand all turn groups
     */
    expandAll() {
        if (window.Turns && typeof window.Turns.toggleAllGroups === 'function') {
            window.Turns.toggleAllGroups(false);
        }
    },

    /**
     * Show dashboard view
     */
    showDashboard() {
        if (typeof window.showDashboard === 'function') {
            window.showDashboard();
        }
    },

    /**
     * Navigate to next turn
     */
    nextTurn() {
        const turns = document.querySelectorAll('.turn-bubble');
        if (turns.length === 0) return;
        
        this.currentTurnIndex = Math.min(this.currentTurnIndex + 1, turns.length - 1);
        this.scrollToCurrentTurn(turns);
    },

    /**
     * Navigate to previous turn
     */
    prevTurn() {
        const turns = document.querySelectorAll('.turn-bubble');
        if (turns.length === 0) return;
        
        this.currentTurnIndex = Math.max(this.currentTurnIndex - 1, 0);
        this.scrollToCurrentTurn(turns);
    },

    /**
     * Scroll to and highlight current turn
     */
    scrollToCurrentTurn(turns) {
        if (this.currentTurnIndex < 0 || this.currentTurnIndex >= turns.length) return;
        
        const turn = turns[this.currentTurnIndex];
        turn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        this.highlightCurrentTurn();
    },

    /**
     * Highlight the current turn temporarily
     */
    highlightCurrentTurn() {
        // Remove existing highlights
        document.querySelectorAll('.turn-bubble.keyboard-focus').forEach(el => {
            el.classList.remove('keyboard-focus');
        });
        
        const turns = document.querySelectorAll('.turn-bubble');
        if (turns[this.currentTurnIndex]) {
            turns[this.currentTurnIndex].classList.add('keyboard-focus');
            
            // Remove after a delay
            setTimeout(() => {
                turns[this.currentTurnIndex]?.classList.remove('keyboard-focus');
            }, 2000);
        }
    },

    /**
     * Show keyboard shortcuts help
     */
    showHelp() {
        this.openCommandPalette();
    }
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    KeyboardNav.init();
});

// Export for use in other modules
window.KeyboardNav = KeyboardNav;
