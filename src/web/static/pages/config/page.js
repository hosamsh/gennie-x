const ConfigPage = {
    state: {
        configSections: {},
        currentSection: null,
        isDirty: {},
        isValidating: false,
        fullConfigYaml: '',
        validateTimeout: null,
    },

    cacheDom() {
        this.editor = document.getElementById('yaml-editor');
        this.saveBtn = document.getElementById('save-btn');
        this.reloadBtn = document.getElementById('reload-btn');
        this.validateBtn = document.getElementById('validate-btn');
        this.backupsBtn = document.getElementById('backups-btn');
        this.viewFullBtn = document.getElementById('view-full-btn');
        this.autoBackupCheckbox = document.getElementById('auto-backup');
        this.statusMessage = document.getElementById('status-message');
        this.sectionValidationIndicator = document.getElementById('section-validation-indicator');
        this.sectionStatus = document.getElementById('section-status');
        this.editorStatus = document.getElementById('editor-status');
        this.editorSectionName = document.getElementById('editor-section-name');
        this.sectionTabs = document.getElementById('section-tabs');
        this.backupsModal = document.getElementById('backups-modal');
        this.closeBackupsBtn = document.getElementById('close-backups');
        this.backupsList = document.getElementById('backups-list');
    },

    init() {
        this.cacheDom();
        this.bindEvents();
        this.loadConfig();
        this.loadConfigInfo();

        // Warn on unsaved changes
        window.addEventListener('beforeunload', (e) => {
            const hasAnyDirty = Object.values(this.state.isDirty).some((dirty) => dirty);
            if (hasAnyDirty) {
                e.preventDefault();
                e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
            }
        });
    },

    bindEvents() {
        if (!this.editor) return;

        this.editor.addEventListener('input', () => {
            if (this.state.currentSection) {
                this.state.isDirty[this.state.currentSection] = true;
                this.state.configSections[this.state.currentSection] = this.editor.value;
                this.updateEditorStatus();
                this.debounceValidate();
            }
        });

        this.editor.addEventListener('keydown', (e) => {
            // Tab key for indentation
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = this.editor.selectionStart;
                const end = this.editor.selectionEnd;
                this.editor.value = this.editor.value.substring(0, start) + '  ' + this.editor.value.substring(end);
                this.editor.selectionStart = this.editor.selectionEnd = start + 2;
            }
            // Ctrl+S for save
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                this.saveConfig();
            }
            // Ctrl+R for reload
            if (e.ctrlKey && e.key === 'r') {
                e.preventDefault();
                this.loadConfig();
            }
            // Ctrl+K for validate
            if (e.ctrlKey && e.key === 'k') {
                e.preventDefault();
                this.validateSection(this.state.currentSection);
            }
        });

        if (this.saveBtn) this.saveBtn.addEventListener('click', () => this.saveConfig());
        if (this.reloadBtn) this.reloadBtn.addEventListener('click', () => this.loadConfig());
        if (this.validateBtn) this.validateBtn.addEventListener('click', () => this.validateSection(this.state.currentSection));
        if (this.backupsBtn) this.backupsBtn.addEventListener('click', () => this.showBackups());
        if (this.viewFullBtn) this.viewFullBtn.addEventListener('click', () => this.showFullConfig());
        if (this.closeBackupsBtn && this.backupsModal) {
            this.closeBackupsBtn.addEventListener('click', () => this.backupsModal.classList.add('hidden'));
        }
    },

    async loadConfig() {
        try {
            this.showStatus('Loading configuration...', 'info');
            const response = await fetch('/api/config/raw');
            const data = await response.json();

            if (!data.success) {
                throw new Error('Failed to load configuration');
            }

            this.state.fullConfigYaml = data.yaml;
            this.parseSections(data.yaml);
            this.state.isDirty = {};
            this.updateEditorStatus();
            this.showStatus('Configuration loaded successfully', 'success');
            this.loadConfigInfo();
        } catch (error) {
            this.showStatus(`Error loading configuration: ${error.message}`, 'error');
            console.error('Load error:', error);
        }
    },

    parseSections(yamlText) {
        const sections = {};
        const lines = yamlText.split('\n');
        let currentSectionName = null;
        let currentSectionLines = [];
        let inSection = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Check if this is a top-level key (no leading spaces and has a colon)
            if (line.match(/^[a-zA-Z_][a-zA-Z0-9_]*:/) && !line.startsWith(' ') && !line.startsWith('\t')) {
                // Save previous section if exists
                if (currentSectionName) {
                    sections[currentSectionName] = currentSectionLines.join('\n');
                }

                // Start new section
                currentSectionName = line.split(':')[0].trim();
                currentSectionLines = [line];
                inSection = true;
            } else if (inSection) {
                // Add line to current section
                currentSectionLines.push(line);
            }
        }

        // Save last section
        if (currentSectionName) {
            sections[currentSectionName] = currentSectionLines.join('\n');
        }

        this.state.configSections = sections;
        this.renderSectionTabs();

        // Select first section by default
        const firstSection = Object.keys(sections)[0];
        if (firstSection) {
            this.selectSection(firstSection);
        }
    },

    renderSectionTabs() {
        const sectionNames = Object.keys(this.state.configSections);

        if (!this.sectionTabs) return;

        if (sectionNames.length === 0) {
            this.sectionTabs.innerHTML = '<div class="text-sm text-terminal-gray">No sections found</div>';
            return;
        }

        this.sectionTabs.innerHTML = sectionNames
            .map((name) => {
                const dirtyIndicator = this.state.isDirty[name]
                    ? '<span class="w-1.5 h-1.5 bg-yellow-500 rounded-full"></span>'
                    : '';
                return `
                    <button 
                        onclick="selectSection('${name}')" 
                        class="section-tab px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2"
                        data-section="${name}"
                    >
                        <span>${name}</span>
                        ${dirtyIndicator}
                    </button>
                `;
            })
            .join('');

        this.updateSectionTabStyles();
        const infoSections = document.getElementById('info-sections');
        if (infoSections) infoSections.textContent = sectionNames.length;
    },

    selectSection(sectionName) {
        if (!this.state.configSections[sectionName]) return;

        this.state.currentSection = sectionName;
        if (this.editor) {
            this.editor.value = this.state.configSections[sectionName];
            this.editor.disabled = false;
        }
        if (this.editorSectionName) this.editorSectionName.textContent = sectionName;

        this.updateSectionTabStyles();
        this.updateEditorStatus();
        this.validateSection(sectionName);
    },

    updateSectionTabStyles() {
        document.querySelectorAll('.section-tab').forEach((tab) => {
            const sectionName = tab.dataset.section;
            if (sectionName === this.state.currentSection) {
                tab.className =
                    'section-tab px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 bg-primary text-white';
            } else if (this.state.isDirty[sectionName]) {
                tab.className =
                    'section-tab px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 bg-yellow-500/20 border border-yellow-500 text-yellow-500 hover:bg-yellow-500/30';
            } else {
                tab.className =
                    'section-tab px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 bg-surface-dark hover:bg-border-dark border border-border-dark text-terminal-gray';
            }
        });
    },

    async saveConfig() {
        try {
            this.showStatus('Saving all changes...', 'info');
            if (this.saveBtn) this.saveBtn.disabled = true;

            // Reconstruct full YAML from sections
            const fullYaml = Object.keys(this.state.configSections)
                .map((name) => this.state.configSections[name])
                .join('\n\n');

            const response = await fetch('/api/config/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    yaml_content: fullYaml,
                    create_backup: !!(this.autoBackupCheckbox && this.autoBackupCheckbox.checked),
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || 'Failed to save configuration');
            }

            this.state.fullConfigYaml = fullYaml;
            this.state.isDirty = {};
            this.renderSectionTabs();
            this.updateEditorStatus();
            this.showStatus('All changes saved successfully', 'success');
            this.loadConfigInfo();
        } catch (error) {
            this.showStatus(`Error saving configuration: ${error.message}`, 'error');
            console.error('Save error:', error);
        } finally {
            if (this.saveBtn) this.saveBtn.disabled = false;
        }
    },

    debounceValidate() {
        if (this.state.validateTimeout) {
            clearTimeout(this.state.validateTimeout);
        }
        this.state.validateTimeout = setTimeout(() => this.validateSection(this.state.currentSection), 500);
    },

    async validateSection(sectionName) {
        if (!sectionName || this.state.isValidating) return;
        this.state.isValidating = true;

        try {
            const sectionContent = this.state.configSections[sectionName];
            const response = await fetch('/api/config/validate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ yaml_content: sectionContent }),
            });

            const data = await response.json();

            if (data.valid) {
                if (this.sectionValidationIndicator) {
                    this.sectionValidationIndicator.className = 'w-2 h-2 rounded-full bg-terminal-green';
                }
                if (this.editorStatus) this.editorStatus.textContent = 'Valid YAML';
                if (this.sectionStatus) this.sectionStatus.textContent = `Section '${sectionName}' is valid`;
            } else {
                if (this.sectionValidationIndicator) {
                    this.sectionValidationIndicator.className = 'w-2 h-2 rounded-full bg-red-500';
                }
                if (this.editorStatus) this.editorStatus.textContent = 'Invalid YAML';
                if (this.sectionStatus) this.sectionStatus.textContent = `Error: ${data.error}`;
            }
        } catch (error) {
            if (this.sectionValidationIndicator) {
                this.sectionValidationIndicator.className = 'w-2 h-2 rounded-full bg-yellow-500';
            }
            if (this.editorStatus) this.editorStatus.textContent = 'Validation error';
            if (this.sectionStatus) this.sectionStatus.textContent = 'Validation failed';
            console.error('Validation error:', error);
        } finally {
            this.state.isValidating = false;
        }
    },

    showFullConfig() {
        const fullYaml = Object.keys(this.state.configSections)
            .map((name) => this.state.configSections[name])
            .join('\n\n');

        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4';
        modal.innerHTML = `
                <div class="bg-surface-dark border border-border-dark rounded-lg max-w-6xl w-full h-[90vh] flex flex-col">
                    <div class="flex items-center justify-between p-4 border-b border-border-dark flex-shrink-0">
                        <h2 class="text-xl font-bold">Full Configuration (Read-Only)</h2>
                        <button onclick="this.closest('.fixed').remove()" class="text-terminal-gray hover:text-white transition-colors">
                            <span class="material-symbols-outlined">close</span>
                        </button>
                    </div>
                    <div class="flex-1 overflow-auto min-h-0">
                        <textarea 
                            readonly 
                            class="w-full h-full p-4 bg-background-dark text-white font-mono text-sm resize-none focus:outline-none"
                        >${fullYaml}</textarea>
                    </div>
                    <div class="p-4 border-t border-border-dark flex justify-between items-center flex-shrink-0">
                        <p class="text-sm text-terminal-gray">This is a read-only view of all sections combined</p>
                        <button onclick="navigator.clipboard.writeText(this.parentElement.parentElement.querySelector('textarea').value); this.textContent = 'Copied!'; setTimeout(() => this.innerHTML = '<span class=\\'material-symbols-outlined text-sm\\'>content_copy</span> Copy All', 2000)" 
                                class="px-3 py-1.5 bg-primary hover:bg-primary-dark rounded text-sm transition-colors flex items-center gap-2">
                            <span class="material-symbols-outlined text-sm">content_copy</span>
                            Copy All
                        </button>
                    </div>
                </div>
            `;
        document.body.appendChild(modal);
    },

    async loadConfigInfo() {
        try {
            const response = await fetch('/api/config/info');
            const data = await response.json();

            if (data.success && data.info.exists) {
                const info = data.info;
                const infoPath = document.getElementById('info-path');
                const infoSize = document.getElementById('info-size');
                const infoModified = document.getElementById('info-modified');
                const infoBackups = document.getElementById('info-backups');

                if (infoPath) infoPath.textContent = info.path;
                if (infoSize) infoSize.textContent = this.formatBytes(info.size);
                if (infoModified) infoModified.textContent = new Date(info.modified).toLocaleString();
                if (infoBackups) infoBackups.textContent = info.backup_count;
            }
        } catch (error) {
            console.error('Error loading config info:', error);
        }
    },

    async showBackups() {
        if (!this.backupsModal || !this.backupsList) return;

        this.backupsModal.classList.remove('hidden');
        this.backupsList.innerHTML = '<p class="text-terminal-gray text-center py-8">Loading backups...</p>';

        try {
            const response = await fetch('/api/config/backups');
            const data = await response.json();

            if (!data.success || data.backups.length === 0) {
                this.backupsList.innerHTML = '<p class="text-terminal-gray text-center py-8">No backups available</p>';
                return;
            }

            this.backupsList.innerHTML = data.backups
                .map(
                    (backup) => `
                    <div class="bg-background-dark border border-border-dark rounded-lg p-4 flex items-center justify-between hover:border-primary transition-colors">
                        <div>
                            <p class="font-medium font-mono text-sm">${backup.filename}</p>
                            <p class="text-xs text-terminal-gray mt-1">
                                ${new Date(backup.created).toLocaleString()} • ${this.formatBytes(backup.size)}
                            </p>
                        </div>
                        <button onclick="restoreBackup('${backup.filename}')" 
                                class="px-3 py-1.5 bg-primary hover:bg-primary-dark rounded text-sm transition-colors">
                            Restore
                        </button>
                    </div>
                `,
                )
                .join('');
        } catch (error) {
            this.backupsList.innerHTML = '<p class="text-red-500 text-center py-8">Error loading backups</p>';
            console.error('Error loading backups:', error);
        }
    },

    async restoreBackup(filename) {
        if (!confirm(`Are you sure you want to restore from ${filename}? Current configuration will be backed up.`)) {
            return;
        }

        try {
            this.showStatus('Restoring backup...', 'info');
            const response = await fetch('/api/config/restore', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ backup_filename: filename }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || 'Failed to restore backup');
            }

            if (this.backupsModal) this.backupsModal.classList.add('hidden');
            await this.loadConfig();
            this.showStatus('Backup restored successfully', 'success');
        } catch (error) {
            this.showStatus(`Error restoring backup: ${error.message}`, 'error');
            console.error('Restore error:', error);
        }
    },

    updateEditorStatus() {
        const hasAnyDirty = Object.values(this.state.isDirty).some((dirty) => dirty);
        if (this.saveBtn) {
            if (hasAnyDirty) {
                this.saveBtn.classList.add('ring-2', 'ring-yellow-500');
            } else {
                this.saveBtn.classList.remove('ring-2', 'ring-yellow-500');
            }
        }

        if (this.editorStatus && this.state.currentSection && this.state.isDirty[this.state.currentSection]) {
            this.editorStatus.textContent = 'Modified';
        }
    },

    showStatus(message, type) {
        if (!this.statusMessage) return;

        const colors = {
            success: 'bg-green-500/20 border-green-500 text-green-500',
            error: 'bg-red-500/20 border-red-500 text-red-500',
            info: 'bg-blue-500/20 border-blue-500 text-blue-500',
        };

        this.statusMessage.className = `mb-4 p-4 rounded-lg border ${colors[type]}`;
        this.statusMessage.textContent = message;
        this.statusMessage.classList.remove('hidden');

        setTimeout(() => {
            if (this.statusMessage) this.statusMessage.classList.add('hidden');
        }, type === 'error' ? 5000 : 3000);
    },

    formatBytes(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    },
};

window.ConfigPage = ConfigPage;
window.selectSection = (sectionName) => ConfigPage.selectSection(sectionName);
window.restoreBackup = (filename) => ConfigPage.restoreBackup(filename);

document.addEventListener('DOMContentLoaded', () => {
    ConfigPage.init();
});
