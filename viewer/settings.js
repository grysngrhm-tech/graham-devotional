/**
 * GRACE Bible - Settings Module
 * Handles user preferences: theme, font size, Bible version
 */

const GraceSettings = (function() {
    const STORAGE_KEY = 'grace-settings';
    
    // Default settings
    const defaults = {
        darkMode: true,  // Dark mode is default
        fontSize: 'medium',
        bibleVersion: 'NIV'  // NIV is a popular, readable translation
    };
    
    let currentSettings = { ...defaults };
    
    /**
     * Load settings from localStorage
     */
    function loadSettings() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                currentSettings = { ...defaults, ...parsed };
            } else {
                // Migrate old theme setting if exists
                const oldTheme = localStorage.getItem('grace-theme');
                if (oldTheme) {
                    currentSettings.darkMode = oldTheme === 'dark';
                }
            }
        } catch (err) {
            console.warn('[Settings] Error loading settings:', err);
            currentSettings = { ...defaults };
        }
        return currentSettings;
    }
    
    /**
     * Save settings to localStorage
     */
    function saveSettings() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(currentSettings));
        } catch (err) {
            console.warn('[Settings] Error saving settings:', err);
        }
    }
    
    /**
     * Apply current settings to the DOM
     */
    function applySettings() {
        // Apply dark mode using data-theme attribute (matches existing CSS)
        const theme = currentSettings.darkMode ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', theme);
        // Also update legacy localStorage key for compatibility
        localStorage.setItem('grace-theme', theme);
        
        // Apply font size
        document.documentElement.style.setProperty('--font-size-scale', getFontScale(currentSettings.fontSize));
        document.body.dataset.fontSize = currentSettings.fontSize;
        
        // Store Bible version for use in app.js
        window.graceBibleVersion = currentSettings.bibleVersion;
    }
    
    /**
     * Get font scale multiplier
     */
    function getFontScale(size) {
        switch (size) {
            case 'small': return '0.875';
            case 'large': return '1.125';
            default: return '1';
        }
    }
    
    /**
     * Update a specific setting
     */
    function updateSetting(key, value) {
        currentSettings[key] = value;
        saveSettings();
        applySettings();
    }
    
    /**
     * Get current setting value
     */
    function getSetting(key) {
        return currentSettings[key];
    }
    
    /**
     * Get all settings
     */
    function getAllSettings() {
        return { ...currentSettings };
    }
    
    /**
     * Initialize settings modal functionality
     */
    function setupSettingsModal() {
        const settingsBtn = document.getElementById('settingsBtn');
        const settingsModal = document.getElementById('settingsModal');
        const settingsClose = document.getElementById('settingsClose');
        const darkModeToggle = document.getElementById('darkModeToggle');
        const fontSizeSelect = document.getElementById('fontSizeSelect');
        const bibleVersionSelect = document.getElementById('bibleVersionSelect');
        const settingsSignOut = document.getElementById('settingsSignOut');
        
        if (!settingsModal) return;
        
        // Open modal
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
                // Sync UI with current settings
                if (darkModeToggle) darkModeToggle.checked = currentSettings.darkMode;
                if (fontSizeSelect) fontSizeSelect.value = currentSettings.fontSize;
                if (bibleVersionSelect) bibleVersionSelect.value = currentSettings.bibleVersion;
                
                settingsModal.classList.add('visible');
            });
        }
        
        // Close modal
        if (settingsClose) {
            settingsClose.addEventListener('click', () => {
                settingsModal.classList.remove('visible');
            });
        }
        
        // Close on backdrop click
        settingsModal.addEventListener('click', (e) => {
            if (e.target === settingsModal) {
                settingsModal.classList.remove('visible');
            }
        });
        
        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && settingsModal.classList.contains('visible')) {
                settingsModal.classList.remove('visible');
            }
        });
        
        // Dark mode toggle
        if (darkModeToggle) {
            darkModeToggle.addEventListener('change', () => {
                updateSetting('darkMode', darkModeToggle.checked);
            });
        }
        
        // Font size select
        if (fontSizeSelect) {
            fontSizeSelect.addEventListener('change', () => {
                updateSetting('fontSize', fontSizeSelect.value);
            });
        }
        
        // Bible version select
        if (bibleVersionSelect) {
            bibleVersionSelect.addEventListener('change', () => {
                updateSetting('bibleVersion', bibleVersionSelect.value);
            });
        }
        
        // Sign out button
        if (settingsSignOut) {
            settingsSignOut.addEventListener('click', async () => {
                settingsModal.classList.remove('visible');
                if (window.GraceAuth) {
                    await window.GraceAuth.signOut();
                }
            });
        }
    }
    
    /**
     * Initialize settings
     */
    function init() {
        loadSettings();
        applySettings();
        setupSettingsModal();
        console.log('[Settings] Initialized with:', currentSettings);
    }
    
    // Public API
    return {
        init,
        loadSettings,
        saveSettings,
        applySettings,
        updateSetting,
        getSetting,
        getAllSettings
    };
})();

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', GraceSettings.init);
} else {
    GraceSettings.init();
}

// Export for use in other modules
window.GraceSettings = GraceSettings;

