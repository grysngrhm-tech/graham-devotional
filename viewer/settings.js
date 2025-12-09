/**
 * GRACE Bible - Settings Module
 * Handles user preferences: theme, font size, Bible version
 */

const GraceSettings = (function() {
    const STORAGE_KEY = 'graham-settings';
    
    // Default settings
    const defaults = {
        darkMode: true,  // Dark mode is default
        fontSize: 'medium',
        bibleVersion: 'NIV',  // NIV is a popular, readable translation
        prefetchEnabled: true  // Smart prefetch for adjacent stories
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
        // Also update localStorage key for app.js compatibility
        localStorage.setItem('graham-theme', theme);
        
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
        const storySettingsBtn = document.getElementById('storySettingsBtn'); // Story page button
        const settingsModal = document.getElementById('settingsModal');
        const settingsClose = document.getElementById('settingsClose');
        const darkModeToggle = document.getElementById('darkModeToggle');
        const fontSizeSelect = document.getElementById('fontSizeSelect');
        const bibleVersionSelect = document.getElementById('bibleVersionSelect');
        const settingsSignOut = document.getElementById('settingsSignOut');
        const prefetchToggle = document.getElementById('prefetchToggle');
        
        if (!settingsModal) return;
        
        // Shared handler to open settings modal
        function openSettingsModal() {
            // Sync UI with current settings
            if (darkModeToggle) darkModeToggle.checked = currentSettings.darkMode;
            if (fontSizeSelect) fontSizeSelect.value = currentSettings.fontSize;
            if (bibleVersionSelect) bibleVersionSelect.value = currentSettings.bibleVersion;
            if (prefetchToggle) prefetchToggle.checked = currentSettings.prefetchEnabled !== false; // Default to true
            
            // Update user email display
            const userEmailEl = document.getElementById('settingsUserEmail');
            if (userEmailEl && window.GraceAuth) {
                const user = window.GraceAuth.getCurrentUser();
                userEmailEl.textContent = user?.email || 'Unknown';
            }
            
            // Show/hide admin section
            const adminSection = document.getElementById('adminSection');
            if (adminSection && window.GraceAuth) {
                adminSection.style.display = window.GraceAuth.isAdmin() ? 'block' : 'none';
            }
            
            // Show/hide account section based on auth
            const accountSection = document.getElementById('accountSection');
            if (accountSection) {
                accountSection.style.display = window.GraceAuth?.isAuthenticated() ? 'block' : 'none';
            }
            
            // Update storage statistics and quota
            updateStorageStats();
            updateStorageQuota();
            
            // Update download estimate
            updateDownloadEstimate();
            
            settingsModal.classList.add('visible');
        }
        
        // Attach click handler to both settings buttons (home page and story page)
        [settingsBtn, storySettingsBtn].forEach(btn => {
            if (btn) btn.addEventListener('click', openSettingsModal);
        });
        
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
        
        // Prefetch toggle (variable already declared at line 111)
        if (prefetchToggle) {
            prefetchToggle.addEventListener('change', () => {
                updateSetting('prefetchEnabled', prefetchToggle.checked);
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
        
        // Setup offline storage controls
        setupOfflineStorage();
        
        // Setup storage limit slider
        setupStorageLimitSlider();
    }
    
    /**
     * Setup offline storage section in settings modal
     */
    function setupOfflineStorage() {
        const clearCacheBtn = document.getElementById('clearCacheBtn');
        const clearLibraryBtn = document.getElementById('clearLibraryBtn');
        const downloadFavoritesBtn = document.getElementById('downloadFavoritesBtn');
        const downloadEntireBibleBtn = document.getElementById('downloadEntireBibleBtn');
        
        // Clear cache button
        if (clearCacheBtn) {
            clearCacheBtn.addEventListener('click', async () => {
                if (!confirm('Clear all cached stories? This will slow down loading until you revisit stories.')) {
                    return;
                }
                
                try {
                    await window.GraceOffline?.clearCache();
                    showStorageToast('Cache cleared');
                    updateStorageStats();
                } catch (err) {
                    console.error('[Settings] Error clearing cache:', err);
                    showStorageToast('Failed to clear cache', true);
                }
            });
        }
        
        // Clear library button
        if (clearLibraryBtn) {
            clearLibraryBtn.addEventListener('click', async () => {
                if (!confirm('Remove all stories from your offline library? You can re-download them later.')) {
                    return;
                }
                
                try {
                    await window.GraceAuth?.clearLibrary();
                    showStorageToast('Library cleared');
                    updateStorageStats();
                } catch (err) {
                    console.error('[Settings] Error clearing library:', err);
                    showStorageToast('Failed to clear library', true);
                }
            });
        }
        
        // Download favorites button
        if (downloadFavoritesBtn) {
            downloadFavoritesBtn.addEventListener('click', async () => {
                downloadFavoritesBtn.disabled = true;
                const btnText = downloadFavoritesBtn.querySelector('span');
                if (btnText) btnText.textContent = 'Downloading...';
                
                try {
                    await downloadAllFavorites();
                    showStorageToast('Favorites downloaded for offline use');
                    updateStorageStats();
                } catch (err) {
                    console.error('[Settings] Error downloading favorites:', err);
                    showStorageToast('Failed to download some favorites', true);
                } finally {
                    downloadFavoritesBtn.disabled = false;
                    if (btnText) btnText.textContent = 'Download Favorites';
                }
            });
        }
        
        // Download entire Bible button
        if (downloadEntireBibleBtn) {
            downloadEntireBibleBtn.addEventListener('click', async () => {
                // Check storage availability first
                const estimate = await window.GraceOffline?.getDownloadEstimate();
                const requiredMB = estimate?.estimatedMB || 550;
                
                const availability = await window.GraceOffline?.checkStorageAvailability(requiredMB);
                
                if (availability && !availability.hasSpace) {
                    const shouldIncrease = confirm(
                        `Not enough storage space.\n\n` +
                        `Required: ${requiredMB} MB\n` +
                        `Available: ${availability.availableMB} MB\n` +
                        `Current limit: ${availability.currentLimitMB} MB\n\n` +
                        `Would you like to increase your storage limit to ${requiredMB + 100} MB?`
                    );
                    
                    if (shouldIncrease) {
                        // Find the next preset that fits
                        const presets = window.GraceOffline.STORAGE_PRESETS;
                        const newLimit = presets.find(p => p >= requiredMB + 50) || presets[presets.length - 1];
                        window.GraceOffline.setStorageLimitMB(newLimit);
                        updateStorageQuota();
                        showStorageToast(`Storage limit increased to ${newLimit} MB`);
                    } else {
                        return;
                    }
                }
                
                if (!confirm(`Download all ${estimate?.stories || 500} stories with images?\n\nThis will use approximately ${requiredMB} MB of storage and may take several minutes.`)) {
                    return;
                }
                
                downloadEntireBibleBtn.disabled = true;
                const progressEl = document.getElementById('downloadProgress');
                const progressFill = document.getElementById('downloadProgressFill');
                const progressText = document.getElementById('downloadProgressText');
                
                if (progressEl) progressEl.style.display = 'block';
                
                try {
                    // Get user's primary image selections to download correct images
                    const userPrimaryImages = window.GraceAuth?.isAuthenticated() 
                        ? await window.GraceAuth.getAllUserPrimaryImages()
                        : new Map();
                    
                    const result = await window.GraceOffline?.downloadEntireBible(
                        ({ current, total, message, phase }) => {
                            if (progressFill) {
                                const percent = total > 0 ? Math.round((current / total) * 100) : 0;
                                progressFill.style.width = `${percent}%`;
                            }
                            if (progressText) {
                                progressText.textContent = message;
                            }
                        },
                        userPrimaryImages
                    );
                    
                    if (result?.success) {
                        showStorageToast(`Downloaded ${result.storiesDownloaded} stories`);
                    } else {
                        showStorageToast('Download completed with some errors', true);
                    }
                    updateStorageStats();
                    updateStorageQuota();
                } catch (err) {
                    console.error('[Settings] Error downloading entire Bible:', err);
                    showStorageToast('Download failed', true);
                } finally {
                    downloadEntireBibleBtn.disabled = false;
                    if (progressEl) {
                        setTimeout(() => {
                            progressEl.style.display = 'none';
                            if (progressFill) progressFill.style.width = '0%';
                        }, 2000);
                    }
                }
            });
        }
    }
    
    /**
     * Update download size estimate
     */
    async function updateDownloadEstimate() {
        const estimateEl = document.getElementById('downloadSizeEstimate');
        if (!estimateEl || !window.GraceOffline) return;
        
        try {
            const estimate = await window.GraceOffline.getDownloadEstimate();
            estimateEl.textContent = `~${estimate.estimatedMB} MB`;
        } catch (err) {
            estimateEl.textContent = '~625 MB';
        }
    }
    
    /**
     * Update storage statistics display
     */
    async function updateStorageStats() {
        const cacheStatsEl = document.getElementById('cacheStats');
        const libraryStatsEl = document.getElementById('libraryStats');
        const librarySection = document.getElementById('libraryStorageSection');
        const signinPrompt = document.getElementById('librarySigninPrompt');
        const downloadFavoritesBtn = document.getElementById('downloadFavoritesBtn');
        
        // Cache stats (always shown)
        if (cacheStatsEl && window.GraceOffline) {
            const cacheStats = await window.GraceOffline.getCacheStats();
            // Handle both old format (nested elements) and new format (direct text)
            const countEl = cacheStatsEl.querySelector('.storage-count');
            if (countEl) {
                countEl.textContent = `${cacheStats.count} stories`;
            } else {
                // New compact format: just show count and size inline
                cacheStatsEl.textContent = `${cacheStats.count} stories · ${window.GraceOffline.formatBytes(cacheStats.sizeEstimate)}`;
            }
        }
        
        // Library stats (logged in users only)
        const isAuthenticated = window.GraceAuth?.isAuthenticated();
        
        if (librarySection) {
            librarySection.style.display = isAuthenticated ? 'flex' : 'none';
        }
        if (signinPrompt) {
            signinPrompt.style.display = isAuthenticated ? 'none' : 'block';
        }
        if (downloadFavoritesBtn) {
            // Show download favorites only for logged in users
            downloadFavoritesBtn.style.display = isAuthenticated ? 'flex' : 'none';
        }
        
        if (libraryStatsEl && window.GraceOffline && isAuthenticated) {
            const libraryStats = await window.GraceOffline.getLibraryStats();
            // Handle both old format (nested elements) and new format (direct text)
            const countEl = libraryStatsEl.querySelector('.storage-count');
            if (countEl) {
                countEl.textContent = `${libraryStats.count} stories`;
            } else {
                libraryStatsEl.textContent = `${libraryStats.count} stories · ${window.GraceOffline.formatBytes(libraryStats.sizeEstimate)}`;
            }
        }
    }
    
    /**
     * Update storage quota display with app-specific limit slider
     */
    async function updateStorageQuota() {
        const quotaBar = document.getElementById('storageQuotaBar');
        const quotaText = document.getElementById('storageQuotaText');
        const quotaSection = document.getElementById('storageQuotaSection');
        const storageSlider = document.getElementById('storageLimitSlider');
        const sliderValue = document.getElementById('storageLimitValue');
        
        if (!quotaSection || !window.GraceOffline) return;
        
        try {
            // Get app storage usage (not device storage)
            const usage = await window.GraceOffline.getAppStorageUsage();
            const limitMB = window.GraceOffline.getStorageLimitMB();
            const usedMB = Math.round(usage.totalBytes / (1024 * 1024));
            const percentUsed = limitMB > 0 ? Math.round((usedMB / limitMB) * 100) : 0;
            
            // Update progress bar
            if (quotaBar) {
                quotaBar.style.width = `${Math.min(percentUsed, 100)}%`;
                // Color code based on usage
                if (percentUsed > 90) {
                    quotaBar.style.backgroundColor = 'var(--color-error, #ef4444)';
                } else if (percentUsed > 70) {
                    quotaBar.style.backgroundColor = 'var(--color-warning, #f59e0b)';
                } else {
                    quotaBar.style.backgroundColor = 'var(--color-accent, #d4af37)';
                }
            }
            
            if (quotaText) {
                quotaText.textContent = `${usedMB} MB / ${limitMB} MB used`;
            }
            
            // Update slider
            if (storageSlider) {
                const presets = window.GraceOffline.STORAGE_PRESETS;
                const sliderIndex = presets.indexOf(limitMB);
                storageSlider.max = presets.length - 1;
                storageSlider.value = sliderIndex >= 0 ? sliderIndex : 2; // Default to 150MB (index 2)
            }
            
            if (sliderValue) {
                sliderValue.textContent = `${limitMB} MB`;
            }
            
            quotaSection.style.display = 'block';
        } catch (err) {
            console.warn('[Settings] Could not get storage quota:', err);
            quotaSection.style.display = 'none';
        }
    }
    
    /**
     * Setup storage limit slider
     */
    function setupStorageLimitSlider() {
        const slider = document.getElementById('storageLimitSlider');
        const valueDisplay = document.getElementById('storageLimitValue');
        
        if (!slider || !window.GraceOffline) return;
        
        const presets = window.GraceOffline.STORAGE_PRESETS;
        
        slider.addEventListener('input', () => {
            const presetIndex = parseInt(slider.value, 10);
            const limitMB = presets[presetIndex] || 150;
            
            if (valueDisplay) {
                valueDisplay.textContent = `${limitMB} MB`;
            }
        });
        
        slider.addEventListener('change', async () => {
            const presetIndex = parseInt(slider.value, 10);
            const limitMB = presets[presetIndex] || 150;
            
            window.GraceOffline.setStorageLimitMB(limitMB);
            
            // Check if current usage exceeds new limit
            const usage = await window.GraceOffline.getAppStorageUsage();
            const usedMB = Math.round(usage.totalBytes / (1024 * 1024));
            
            if (usedMB > limitMB * 0.9) {
                // Warn user and offer to clean up
                const shouldCleanup = confirm(
                    `Current usage (${usedMB} MB) exceeds 90% of new limit (${limitMB} MB).\n\nClear cached stories to free up space?`
                );
                
                if (shouldCleanup) {
                    await window.GraceOffline.smartCleanup((usedMB - limitMB * 0.7) * 1024 * 1024);
                    showStorageToast('Cache cleared to fit new storage limit');
                }
            }
            
            // Refresh display
            updateStorageQuota();
            updateStorageStats();
        });
    }
    
    /**
     * Download all favorited stories to library
     */
    async function downloadAllFavorites() {
        if (!window.GraceAuth?.isAuthenticated()) return;
        
        const favorites = await window.GraceAuth.getUserFavorites();
        const supabase = window.supabaseClient;
        
        if (!favorites.length) {
            showStorageToast('No favorites to download');
            return;
        }
        
        // Fetch full story data for each favorite
        let downloaded = 0;
        for (const spreadCode of favorites) {
            try {
                // Skip if already in library
                if (window.GraceAuth.isInLibrary(spreadCode)) {
                    downloaded++;
                    continue;
                }
                
                // Fetch story data
                const { data: story } = await supabase
                    .from('grahams_devotional_spreads')
                    .select('*')
                    .eq('spread_code', spreadCode)
                    .single();
                
                if (story) {
                    await window.GraceAuth.addToLibrary(spreadCode, story);
                    downloaded++;
                }
            } catch (err) {
                console.error(`[Settings] Failed to download ${spreadCode}:`, err);
            }
        }
        
        console.log(`[Settings] Downloaded ${downloaded}/${favorites.length} favorites to library`);
    }
    
    /**
     * Show a toast notification for storage actions
     */
    function showStorageToast(message, isError = false) {
        // Use app.js toast if available, otherwise console
        if (typeof showToast === 'function') {
            showToast(message, isError);
        } else {
            console[isError ? 'error' : 'log']('[Settings]', message);
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
        getAllSettings,
        updateStorageStats
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

