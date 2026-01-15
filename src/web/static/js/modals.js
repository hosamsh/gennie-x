/**
 * Modals - Modal management for extraction
 */

const Modals = {
    /**
     * Show the extraction modal
     */
    showExtraction() {
        const modal = document.getElementById('extraction-modal');
        modal.classList.remove('hidden');
        
        // Clear previous output
        document.getElementById('extraction-output-lines').innerHTML = '';
        document.getElementById('extraction-terminal-cursor').classList.remove('hidden');
        
        // Reset modal state
        this.setExtractionState('running');
        
        // Update status badge
        const statusEl = document.getElementById('extraction-run-status');
        statusEl.textContent = 'Starting...';
        statusEl.className = 'px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-700';
        
        // Start extraction tips
        if (window.ExtractionTips) {            
            ExtractionTips.start('extraction-tips-container', 'extraction-tip-text', 'extraction', 4500);
        }
    },

    /**
     * Close the extraction modal
     */
    closeExtraction() {
        document.getElementById('extraction-modal').classList.add('hidden');
        
        // Stop extraction tips
        if (window.ExtractionTips) {
            ExtractionTips.stop('extraction-tips-container');
        }
    },

    /**
     * Set extraction modal footer state
     */
    setExtractionState(state) {
        ['running', 'completed', 'failed'].forEach(s => {
            document.getElementById(`extraction-modal-${s}`).classList.add('hidden');
        });
        document.getElementById(`extraction-modal-${state}`).classList.remove('hidden');
        
        if (state !== 'running') {
            document.getElementById('extraction-terminal-cursor').classList.add('hidden');
            
            // Stop tips when extraction finishes
            if (window.ExtractionTips) {
                ExtractionTips.stop('extraction-tips-container');
            }
        }
    },

    /**
     * Append a log line to the extraction terminal
     */
    appendExtractionLog(message, type = '') {
        const outputLines = document.getElementById('extraction-output-lines');
        const line = document.createElement('div');
        line.className = 'log-line' + (type ? ' ' + type : '');
        line.textContent = message;
        outputLines.appendChild(line);
        
        const terminal = document.getElementById('extraction-terminal-output');
        terminal.scrollTop = terminal.scrollHeight;
    },

    /**
     * Detect log message type for styling
     */
    detectLogType(message) {
        const msg = message.toLowerCase();
        if (msg.includes('error') || msg.includes('failed')) return 'error';
        if (msg.includes('success') || msg.includes('completed') || msg.includes('✓') || msg.includes('✅')) return 'success';
        if (msg.includes('===') || msg.includes('---') || msg.startsWith('=')) return 'banner';
        if (msg.startsWith('[') || msg.includes('starting') || msg.includes('processing') || 
            msg.includes('📂') || msg.includes('🔍') || msg.includes('📊') || msg.includes('📈')) return 'info';
        return '';
    }
};

// Export for use in other modules
window.Modals = Modals;
