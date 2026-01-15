/**
 * ExtractionTips - Display rotating helpful tips during extraction
 * 
 * This is a frontend-only feature that shows engaging tips to users
 * while extraction is running in the background.
 */

const ExtractionTips = {
    // Tips organized by category
    tips: {
        extraction: [
            "🔍 Locating chat logs across coding agents",
            "🚀 Next run will be much faster. Promise!",
            "🧹 Cleaning things up a bit",
            "📦 Turning diverse chats into a universal format",
            "⚡ Indexing for future-proof search",
            "🧠 Looking for static patterns (no mind reading)",
            "📈 Getting things ready for useful insights",
            "🎨 Formatting your dashboards, no art!",
            "💾 Saving everything locally - no cloud stuff",
            "🛡️ Yep, it's still only yours",     
            "🎉 Almost done. Will be ready soon!"
        ]
    },

    // Active tip rotations (can have multiple running)
    activeRotations: new Map(),

    /**
     * Start displaying tips for a specific container
     * @param {string} containerId - ID of the container element
     * @param {string} textId - ID of the text element to update
     * @param {string} category - Category of tips to show (default: 'extraction')
     * @param {number} interval - Milliseconds between tip rotations (default: 2500)
     */
    start(containerId, textId, category = 'extraction', interval = 2500) {
        console.log(`[ExtractionTips] Starting tips for ${containerId}, ${textId}`);
        const container = document.getElementById(containerId);
        const textEl = document.getElementById(textId);
        
        if (!container || !textEl) {
            console.warn(`ExtractionTips: Elements not found - ${containerId}, ${textId}`);
            console.warn(`  container:`, container);
            console.warn(`  textEl:`, textEl);
            return;
        }

        console.log(`[ExtractionTips] Elements found, starting rotation...`);

        // Stop any existing rotation for this container
        this.stop(containerId);

        // Get tips for the category
        const tipList = this.tips[category] || this.tips.extraction;
        
        // Initialize rotation state
        const rotation = {
            index: 0,
            tips: tipList,
            textEl: textEl,
            container: container,
            intervalId: null,
            intervalMs: interval,
            typingTimerId: null,
            typingToken: 0
        };

        // Show container and display first tip
        container.classList.remove('hidden');
        this._showTip(rotation);

        // Start rotation
        rotation.intervalId = setInterval(() => {
            rotation.index = (rotation.index + 1) % rotation.tips.length;
            this._showTip(rotation);
        }, interval);

        // Store rotation state
        this.activeRotations.set(containerId, rotation);
    },

    /**
     * Stop displaying tips for a specific container
     * @param {string} containerId - ID of the container element
     */
    stop(containerId) {
        const rotation = this.activeRotations.get(containerId);
        
        if (rotation) {
            // Clear interval
            if (rotation.intervalId) {
                clearInterval(rotation.intervalId);
            }

            // Cancel any in-flight typing
            rotation.typingToken += 1;
            if (rotation.typingTimerId) {
                clearTimeout(rotation.typingTimerId);
                rotation.typingTimerId = null;
            }
            
            // Hide container
            rotation.container.classList.add('hidden');
            
            // Remove from active rotations
            this.activeRotations.delete(containerId);
        }
    },

    /**
     * Stop all active tip rotations
     */
    stopAll() {
        for (const containerId of this.activeRotations.keys()) {
            this.stop(containerId);
        }
    },

    /**
     * Display a specific tip from the rotation
     * @private
     */
    _showTip(rotation) {
        const tip = rotation.tips[rotation.index];

        // Cancel previous animation, if any
        rotation.typingToken += 1;
        const token = rotation.typingToken;

        if (rotation.typingTimerId) {
            clearTimeout(rotation.typingTimerId);
            rotation.typingTimerId = null;
        }

        // Typewriter effect
        rotation.textEl.style.opacity = '1';
        rotation.textEl.textContent = '';

        const tickMs = 15;
        const maxDurationMs = Math.max(500, rotation.intervalMs);
        const totalTicks = Math.max(1, maxDurationMs / tickMs);
        const charsPerTick = Math.max(1, tip.length / totalTicks);

        let cursor = 0;
        const step = () => {
            if (rotation.typingToken !== token) return;

            cursor = Math.min(tip.length, cursor + charsPerTick);
            rotation.textEl.textContent = tip.slice(0, cursor);

            if (cursor < tip.length) {
                rotation.typingTimerId = setTimeout(step, tickMs);
            } else {
                rotation.typingTimerId = null;
            }
        };

        step();
    },

    /**
     * Add a custom tip category
     * @param {string} category - Category name
     * @param {Array<string>} tips - Array of tip messages
     */
    addCategory(category, tips) {
        this.tips[category] = tips;
    }
};

// Export for use in other modules
window.ExtractionTips = ExtractionTips;
