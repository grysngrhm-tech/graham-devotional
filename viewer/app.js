/**
 * The GRACE Bible - Web Viewer App
 * ============================================================================
 * The Graham Reimagined Art & Canon Experience Bible
 * Static web application for browsing Biblical stories from Supabase
 * ============================================================================
 */

// Initialize Supabase client (also exposed on window for auth.js)
const supabase = window.supabase.createClient(
    window.SUPABASE_CONFIG.url,
    window.SUPABASE_CONFIG.anonKey
);
window.supabaseClient = supabase;

// Global state
let allStories = [];
let filteredStories = [];
let currentStoryIndex = 0;

// User data state (loaded when authenticated)
let userFavorites = new Set();
let userReadStories = new Set();
let userLibrary = new Set();
let userPrimaryImages = new Map(); // spread_code -> image_slot (1-4)

/**
 * Get the primary image URL for a story
 * Shared logic used by home page cards AND download feature
 * Priority: user's selection > global default > first option
 * @param {Object} story - Story object with image_url fields
 * @param {Map} [primaryImagesMap] - Optional map of spread_code -> slot (defaults to userPrimaryImages)
 * @returns {string|null} Image URL or null
 */
function getPrimaryImageUrl(story, userPrimarySlot = null) {
    if (!story) return null;
    
    // Priority 1: User's personal selection (slot number 1-4)
    if (userPrimarySlot) {
        const userImageUrl = story[`image_url_${userPrimarySlot}`];
        if (userImageUrl) return userImageUrl;
    }
    
    // Priority 2: Global default (now stored as slot number)
    const globalSlot = story.primary_slot || 1;
    return story[`image_url_${globalSlot}`] || story.image_url_1 || null;
}

/**
 * Transform a Supabase storage URL to use image transformation for thumbnails
 * Converts /object/ URLs to /render/image/ URLs with resize parameters
 * Maintains 3:4 aspect ratio (portrait) for story illustrations
 * @param {string} imageUrl - Original Supabase storage URL
 * @param {number} width - Target width (default 400)
 * @param {number} quality - JPEG quality 1-100 (default 80)
 * @returns {string|null} Transformed URL or original if not transformable
 */
function getThumbnailUrl(imageUrl, width = 400, quality = 80) {
    if (!imageUrl) return null;
    
    // Only transform Supabase storage URLs
    if (!imageUrl.includes('supabase.co/storage/v1/object/')) {
        return imageUrl;
    }
    
    // Transform: /storage/v1/object/public/... -> /storage/v1/render/image/public/...
    const thumbnailUrl = imageUrl.replace(
        '/storage/v1/object/',
        '/storage/v1/render/image/'
    );
    
    // Calculate height to maintain 3:4 aspect ratio (width:height = 3:4)
    const height = Math.round(width * 4 / 3);
    
    // Add transformation parameters with explicit dimensions and resize mode
    const separator = thumbnailUrl.includes('?') ? '&' : '?';
    return `${thumbnailUrl}${separator}width=${width}&height=${height}&resize=contain&quality=${quality}`;
}

// Filter state
let currentFilters = {
    testament: 'all',
    book: 'all',
    grouping: 'all',
    status: 'all',
    search: '',
    userFilter: 'all' // all, favorites, unread, read
};

// ============================================================================
// Admin Curation Mode
// ============================================================================

let curationMode = {
    active: false,
    filter: 'all', // all, no-default, pending, regenerating
    stories: [], // Filtered list of stories to curate
    currentIndex: 0
};

/**
 * Initialize curation mode if detected in URL hash
 */
function checkCurationMode() {
    const hash = window.location.hash;
    const match = hash.match(/#curation=(\w+)/);
    if (match && window.GraceAuth?.isAdmin()) {
        const filter = match[1];
        console.log('[GRACE] Curation mode activated with filter:', filter);
        startCurationMode(filter);
        return true;
    }
    return false;
}

/**
 * Start curation mode with specified filter
 */
async function startCurationMode(filter = 'all') {
    if (!window.GraceAuth?.isAdmin()) {
        console.warn('[GRACE] Curation mode requires admin privileges');
        return;
    }
    
    curationMode.active = true;
    curationMode.filter = filter;
    curationMode.currentIndex = 0;
    
    // Load stories based on filter
    await loadCurationStories(filter);
    
    // If we have stories to curate, navigate to the first one
    if (curationMode.stories.length > 0) {
        const firstStory = curationMode.stories[0];
        window.GraceRouter?.navigateToStory(firstStory.spread_code);
    } else {
        showToast('No stories found for curation with this filter');
        curationMode.active = false;
    }
}

/**
 * Load stories for curation based on filter
 * Fetches image_abstract for simplified curation view
 */
async function loadCurationStories(filter) {
    try {
        // Only support 'no-default' filter for streamlined curation
        const query = supabase
            .from('grahams_devotional_spreads')
            .select('spread_code, title, image_abstract, primary_slot, image_url_1, image_url_2, image_url_3, image_url_4, status_image, book, testament, kjv_passage_ref')
            .or('primary_slot.is.null,primary_slot.eq.1') // Stories with default slot 1 (may need curation)
            .order('spread_code'); // Chronological order
        
        const { data, error } = await query;
        if (error) throw error;
        
        curationMode.stories = sortStoriesChronologically(data || []);
        console.log('[GRACE] Curation stories loaded:', curationMode.stories.length);
        
    } catch (err) {
        console.error('[GRACE] Error loading curation stories:', err);
        curationMode.stories = [];
    }
}

/**
 * Navigate to the next story in curation mode
 */
function curationNext() {
    if (!curationMode.active || curationMode.stories.length === 0) return;
    
    curationMode.currentIndex++;
    if (curationMode.currentIndex >= curationMode.stories.length) {
        showToast('Curation complete! Reviewed all stories.');
        exitCurationMode();
        return;
    }
    
    const nextStory = curationMode.stories[curationMode.currentIndex];
    window.GraceRouter?.navigateToStory(nextStory.spread_code);
}

/**
 * Navigate to the previous story in curation mode
 */
function curationPrevious() {
    if (!curationMode.active || curationMode.stories.length === 0) return;
    
    if (curationMode.currentIndex > 0) {
        curationMode.currentIndex--;
        const prevStory = curationMode.stories[curationMode.currentIndex];
        window.GraceRouter?.navigateToStory(prevStory.spread_code);
    }
}

/**
 * Exit curation mode
 */
function exitCurationMode() {
    curationMode.active = false;
    curationMode.stories = [];
    curationMode.currentIndex = 0;
    
    // Update UI
    const curationBar = document.getElementById('curationBar');
    if (curationBar) curationBar.remove();
    
    // Clear hash
    history.replaceState(null, '', window.location.pathname);
    
    // Go home
    window.GraceRouter?.navigateHome();
}

/**
 * Render full curation view (replaces story page content in curation mode)
 * Shows images on left, abstract summary on right
 */
function renderCurationView(story) {
    if (!curationMode.active) return;
    
    const container = document.getElementById('bookStory');
    if (!container) return;
    
    const total = curationMode.stories.length;
    const current = curationMode.currentIndex + 1;
    
    // Parse image_abstract JSON to extract key fields for curation
    let sceneInfo = {
        title: '',
        focalSymbol: '',
        visualApproach: '',
        prompt: ''
    };
    
    if (story.image_abstract) {
        try {
            // Try to parse as JSON array
            let abstractData = story.image_abstract;
            
            // Handle if it's a string that needs parsing
            if (typeof abstractData === 'string') {
                // Remove markdown code fence if present
                abstractData = abstractData.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
                abstractData = JSON.parse(abstractData);
            }
            
            // Find variant_index 1 (or first item)
            const variant = Array.isArray(abstractData) 
                ? abstractData.find(v => v.variant_index === 1) || abstractData[0]
                : abstractData;
            
            if (variant) {
                sceneInfo.title = variant.title || '';
                sceneInfo.focalSymbol = variant.focal_symbol || '';
                sceneInfo.visualApproach = variant.visual_approach || '';
                // prompt might be in different places depending on the data structure
                sceneInfo.prompt = variant.prompt || variant.image_prompt || '';
            }
        } catch (e) {
            console.warn('[Curation] Could not parse image_abstract as JSON:', e);
            // If parsing fails, just use the raw text
            sceneInfo.visualApproach = story.image_abstract;
        }
    }
    
    // Check if story has NO images at all
    const hasNoImages = !story.image_url_1 && !story.image_url_2 && 
                        !story.image_url_3 && !story.image_url_4;
    
    // Build image section HTML based on whether images exist
    let imagesSection;
    
    if (hasNoImages) {
        // Show "Generate All Images" button for empty stories
        imagesSection = `
            <div class="curation-no-images-placeholder">
                <div class="no-images-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                        <circle cx="8.5" cy="8.5" r="1.5"/>
                        <polyline points="21 15 16 10 5 21"/>
                    </svg>
                </div>
                <h3>No Images Generated</h3>
                <p>This story doesn't have any images yet. Generate all 4 image variations to begin curation.</p>
                <button class="curation-generate-all" onclick="generateAllImages()" id="generateAllBtn">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                    Generate All 4 Images
                </button>
                <div class="generate-estimate">Estimated time: ~90 seconds</div>
            </div>
        `;
    } else {
        // Normal image cards for stories with images
        const globalPrimarySlot = story.primary_slot || 1;
        const imageCards = [1, 2, 3, 4].map(slot => {
            const imageUrl = story[`image_url_${slot}`];
            const thumbnailUrl = getThumbnailUrl(imageUrl);
            const isCurrentDefault = slot === globalPrimarySlot && imageUrl;
            return `
                <div class="curation-image-card ${isCurrentDefault ? 'is-default' : ''}" data-slot="${slot}">
                    <div class="curation-image-wrapper">
                        ${thumbnailUrl 
                            ? `<img src="${thumbnailUrl}" alt="Option ${slot}" loading="lazy">`
                            : `<div class="curation-no-image">No Image</div>`
                        }
                        ${isCurrentDefault ? '<div class="curation-default-badge">Current Default</div>' : ''}
                    </div>
                    <div class="curation-image-actions">
                        <button class="curation-set-default" onclick="setGlobalDefaultBySlot(${slot})" ${!imageUrl ? 'disabled' : ''}>
                            Set as Default
                        </button>
                        <button class="curation-regenerate" onclick="triggerRegenerateSlot(${slot})" title="Regenerate this slot (Shift+${slot})">
                            Regenerate
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        
        imagesSection = imageCards;
    }
    
    container.innerHTML = `
        <div class="curation-view">
            <!-- Curation Header -->
            <div class="curation-header">
                <div class="curation-progress">
                    <span class="curation-count">${current} / ${total}</span>
                    <div class="curation-progress-bar">
                        <div class="curation-progress-fill" style="width: ${(current / total) * 100}%"></div>
                    </div>
                    <span class="curation-remaining">${total - current} remaining</span>
                </div>
                <div class="curation-nav-actions">
                    <button class="curation-btn" onclick="curationPrevious()" ${curationMode.currentIndex === 0 ? 'disabled' : ''} title="Previous (←)">
                        ← Back
                    </button>
                    <button class="curation-btn primary" onclick="curationNext()" title="Next (→)">
                        ${curationMode.currentIndex === total - 1 ? 'Finish' : 'Next →'}
                    </button>
                    <button class="curation-btn exit" onclick="exitCurationMode()" title="Exit curation (Esc)">
                        Exit
                    </button>
                </div>
            </div>
            
            <!-- Main Curation Content -->
            <div class="curation-content">
                <!-- Left: Image Grid or Generate Placeholder -->
                <div class="curation-images ${hasNoImages ? 'empty-state' : ''}">
                    ${imagesSection}
                </div>
                
                <!-- Right: Story Info & Scene Details -->
                <div class="curation-info">
                    <h2 class="curation-title">${story.title || 'Untitled Story'}</h2>
                    <div class="curation-ref">${story.kjv_passage_ref || story.spread_code}</div>
                    
                    <div class="curation-scene-details">
                        ${sceneInfo.title ? `
                            <div class="scene-field">
                                <label>Image Title</label>
                                <p class="scene-value title-value">${sceneInfo.title}</p>
                            </div>
                        ` : ''}
                        
                        ${sceneInfo.focalSymbol ? `
                            <div class="scene-field">
                                <label>Focal Symbol</label>
                                <p class="scene-value focal-value">${sceneInfo.focalSymbol}</p>
                            </div>
                        ` : ''}
                        
                        ${sceneInfo.visualApproach ? `
                            <div class="scene-field">
                                <label>Visual Approach</label>
                                <p class="scene-value approach-value">${sceneInfo.visualApproach}</p>
                            </div>
                        ` : ''}
                        
                        ${sceneInfo.prompt ? `
                            <div class="scene-field">
                                <label>Image Prompt</label>
                                <p class="scene-value prompt-value">${sceneInfo.prompt}</p>
                            </div>
                        ` : ''}
                        
                        ${!sceneInfo.title && !sceneInfo.focalSymbol && !sceneInfo.visualApproach ? `
                            <div class="scene-field">
                                <label>No Scene Data</label>
                                <p class="scene-value">This story doesn't have parsed scene information yet.</p>
                            </div>
                        ` : ''}
                    </div>
                    
                    <div class="curation-keyboard-help">
                        <h4>Shortcuts</h4>
                        ${hasNoImages 
                            ? '<div class="shortcut-row"><kbd>G</kbd> Generate all images</div>'
                            : '<div class="shortcut-row"><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><kbd>4</kbd> Set slot as default</div>'
                        }
                        ${!hasNoImages ? '<div class="shortcut-row"><kbd>Shift</kbd>+<kbd>1-4</kbd> Regenerate slot</div>' : ''}
                        <div class="shortcut-row"><kbd>←</kbd><kbd>→</kbd> Navigate stories</div>
                        <div class="shortcut-row"><kbd>Esc</kbd> Exit curation</div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Store current story for keyboard shortcuts
    window._currentStory = story;
}

/**
 * Legacy function - kept for compatibility but now uses renderCurationView
 */
function renderCurationBar(story) {
    // In the new design, the curation bar is built into renderCurationView
    // This function is kept for any legacy calls but does nothing
}

/**
 * Handle curation keyboard shortcuts
 */
function handleCurationKeyboard(e) {
    if (!curationMode.active) return;
    
    // Don't interfere with input fields
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    
    switch (e.key) {
        case 'ArrowRight':
            e.preventDefault();
            curationNext();
            break;
        case 'ArrowLeft':
            e.preventDefault();
            curationPrevious();
            break;
        case '1':
        case '2':
        case '3':
        case '4':
            e.preventDefault();
            const slot = parseInt(e.key);
            if (e.shiftKey) {
                // Shift+1-4: Regenerate that slot
                triggerRegenerateSlot(slot);
            } else {
                // 1-4: Set as default
                setGlobalDefaultBySlot(slot);
            }
            break;
        case 'g':
        case 'G':
            e.preventDefault();
            // Generate all images for empty stories
            generateAllImages();
            break;
        case 'Escape':
            e.preventDefault();
            exitCurationMode();
            break;
    }
}

/**
 * Trigger image regeneration for a specific slot
 * Uses the existing regeneration system (triggerRegeneration function)
 */
async function triggerRegenerateSlot(slot) {
    const story = window._currentStory;
    if (!story || !window.GraceAuth?.isAdmin()) {
        showToast('Admin access required', true);
        return;
    }
    
    // Use the existing regeneration function which handles the modal and polling
    await triggerRegeneration(slot);
}

/**
 * Generate all 4 images for a story with no images
 * Calls the n8n webhook and auto-assigns all 4 generated images to slots 1-4
 */
async function generateAllImages() {
    const story = window._currentStory;
    if (!story || !window.GraceAuth?.isAdmin()) {
        showToast('Admin access required', true);
        return;
    }
    
    // Check if story really has no images
    const hasNoImages = !story.image_url_1 && !story.image_url_2 && 
                        !story.image_url_3 && !story.image_url_4;
    if (!hasNoImages) {
        showToast('This story already has images');
        return;
    }
    
    const spreadCode = story.spread_code;
    
    // Disable button and show loading state
    const btn = document.getElementById('generateAllBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `
            <svg class="spinning" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
            </svg>
            Generating... (~90s)
        `;
    }
    
    try {
        // Get webhook URL from config
        const webhookUrl = window.N8N_CONFIG?.webhookUrl;
        if (!webhookUrl) {
            throw new Error('n8n webhook URL not configured');
        }
        
        console.log('[Graham] Triggering generate-all:', { spreadCode, webhookUrl });
        
        // Trigger the n8n workflow (slot 1 is arbitrary - we'll use all 4 results)
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                spread_code: spreadCode,
                slot: 1  // n8n generates 4 images regardless of slot
            })
        });
        
        if (!response.ok) {
            throw new Error(`Webhook failed: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (!result.request_id) {
            throw new Error('No request_id returned from webhook');
        }
        
        // Start polling with auto-assign mode
        await pollForGenerateAll(result.request_id, spreadCode);
        
    } catch (err) {
        console.error('[Graham] Error generating all images:', err);
        showToast('Failed to start image generation', true);
        
        // Reset button
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
                Generate All 4 Images
            `;
        }
    }
}

/**
 * Poll for generate-all results and auto-assign all 4 images
 */
async function pollForGenerateAll(requestId, spreadCode) {
    let pollCount = 0;
    const maxPolls = 100; // 5 minutes at 3 second intervals
    
    console.log('[Graham] Starting generate-all polling for request:', requestId);
    
    const poll = async () => {
        pollCount++;
        
        if (pollCount > maxPolls) {
            showToast('Generation timed out', true);
            resetGenerateButton();
            return;
        }
        
        try {
            const { data, error } = await supabase
                .from('regeneration_requests')
                .select('status, option_urls')
                .eq('id', requestId)
                .single();
            
            if (error) throw error;
            
            console.log('[Graham] Generate-all poll #' + pollCount + ' status:', data?.status);
            
            if (data.status === 'ready' && data.option_urls?.length >= 4) {
                // Auto-assign all 4 images to slots
                await autoAssignAllImages(spreadCode, data.option_urls);
            } else if (data.status === 'cancelled' || data.status === 'error') {
                showToast('Image generation failed', true);
                resetGenerateButton();
            } else {
                // Continue polling
                setTimeout(poll, 3000);
            }
            
        } catch (err) {
            console.error('[Graham] Error polling generate-all status:', err);
            // Continue polling on error
            setTimeout(poll, 3000);
        }
    };
    
    // Start polling
    setTimeout(poll, 3000);
}

/**
 * Auto-assign all 4 generated images to slots 1-4
 */
async function autoAssignAllImages(spreadCode, optionUrls) {
    console.log('[Graham] Auto-assigning 4 images to story:', spreadCode);
    
    try {
        // Update the database with all 4 images and set slot 1 as default
        const { error } = await supabase
            .from('grahams_devotional_spreads')
            .update({
                image_url_1: optionUrls[0],
                image_url_2: optionUrls[1],
                image_url_3: optionUrls[2],
                image_url_4: optionUrls[3],
                primary_slot: 1, // Default to slot 1 for newly generated images
                status_image: 'done'
            })
            .eq('spread_code', spreadCode);
        
        if (error) throw error;
        
        // Update the local story object
        const story = window._currentStory;
        if (story && story.spread_code === spreadCode) {
            story.image_url_1 = optionUrls[0];
            story.image_url_2 = optionUrls[1];
            story.image_url_3 = optionUrls[2];
            story.image_url_4 = optionUrls[3];
            story.primary_slot = 1;
            story.status_image = 'done';
        }
        
        showToast('All 4 images generated! Select a default.');
        
        // Refresh the curation view to show the new images
        if (curationMode.active && story) {
            renderCurationView(story);
        }
        
    } catch (err) {
        console.error('[Graham] Error auto-assigning images:', err);
        showToast('Failed to save generated images', true);
        resetGenerateButton();
    }
}

/**
 * Reset the generate all button to initial state
 */
function resetGenerateButton() {
    const btn = document.getElementById('generateAllBtn');
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            Generate All 4 Images
        `;
    }
}

/**
 * Set global default image by slot number (for curation keyboard shortcut)
 */
async function setGlobalDefaultBySlot(slot) {
    const story = window._currentStory;
    if (!story || !window.GraceAuth?.isAdmin()) return;
    
    const imageUrl = story[`image_url_${slot}`];
    if (!imageUrl) {
        showToast(`No image in slot ${slot}`);
        return;
    }
    
    try {
        // Now stores slot number instead of URL - can never become orphaned!
        const { error } = await supabase
            .from('grahams_devotional_spreads')
            .update({ primary_slot: slot })
            .eq('spread_code', story.spread_code);
        
        if (error) throw error;
        
        // Update local story object
        story.primary_slot = slot;
        
        // In curation mode, auto-advance to next story after brief feedback
        if (curationMode.active) {
            showToast(`Default set! Moving to next...`);
            // Brief delay so user sees the feedback
            setTimeout(() => {
                curationNext();
            }, 500);
        } else {
            showToast(`Set slot ${slot} as default`);
            // Re-render images to show the update
            renderImages(story);
        }
        
    } catch (err) {
        console.error('[GRACE] Error setting global default:', err);
        showToast('Failed to set default', true);
    }
}

// Add curation keyboard listener
document.addEventListener('keydown', handleCurationKeyboard);

// ============================================================================
// Theme Management
// ============================================================================

// Theme is now managed by settings.js
// Initialize theme immediately to prevent flash (before settings.js loads)
(function() {
    try {
        const stored = localStorage.getItem('grace-settings');
        if (stored) {
            const settings = JSON.parse(stored);
            document.documentElement.setAttribute('data-theme', settings.darkMode !== false ? 'dark' : 'light');
        } else {
            // Check legacy key or default to dark
            const oldTheme = localStorage.getItem('grace-theme');
            document.documentElement.setAttribute('data-theme', oldTheme || 'dark');
        }
    } catch (e) {
        document.documentElement.setAttribute('data-theme', 'dark');
    }
})();

// Biblical book order (canonical Protestant order)
const BIBLE_BOOK_ORDER = [
    // Old Testament
    'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy',
    'Joshua', 'Judges', 'Ruth', '1 Samuel', '2 Samuel', '1 Kings', '2 Kings',
    '1 Chronicles', '2 Chronicles', 'Ezra', 'Nehemiah', 'Esther',
    'Job', 'Psalms', 'Proverbs', 'Ecclesiastes', 'Song of Solomon',
    'Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel',
    'Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah', 'Micah', 'Nahum',
    'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi',
    // New Testament
    'Matthew', 'Mark', 'Luke', 'John', 'Acts',
    'Romans', '1 Corinthians', '2 Corinthians', 'Galatians', 'Ephesians',
    'Philippians', 'Colossians', '1 Thessalonians', '2 Thessalonians',
    '1 Timothy', '2 Timothy', 'Titus', 'Philemon', 'Hebrews',
    'James', '1 Peter', '2 Peter', '1 John', '2 John', '3 John', 'Jude',
    'Revelation'
];

// Create a lookup map for fast ordering
const BOOK_ORDER_MAP = BIBLE_BOOK_ORDER.reduce((map, book, index) => {
    map[book] = index;
    return map;
}, {});

// Define the order of spread_code prefixes (maps to chronological Bible order)
// Note: GSP is a single prefix for all Gospels (Matthew, Mark, Luke, John) 
// and the GSP-### numbers are already in chronological Jesus-life order
const SPREAD_PREFIX_ORDER = [
    // Torah
    'GEN', 'EXO', 'LEV', 'NUM', 'DEU',
    // History
    'JOS', 'JDG', 'RUT', '1SA', '2SA', '1KI', '2KI', '1CH', '2CH', 'EZR', 'NEH', 'EST',
    // Poetry
    'JOB', 'PSA', 'PRO', 'ECC', 'SNG',
    // Prophets
    'ISA', 'JER', 'LAM', 'EZK', 'DAN', 'HOS', 'JOE', 'AMO', 'OBA', 'JON', 'MIC', 'NAH', 'HAB', 'ZEP', 'HAG', 'ZEC', 'MAL',
    // Gospels (single chronological sequence)
    'GSP',
    // Acts
    'ACT',
    // Epistles
    'ROM', '1CO', '2CO', 'GAL', 'EPH', 'PHP', 'COL', '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB', 'JAS', '1PE', '2PE', '1JO', '2JO', '3JO', 'JUD',
    // Revelation
    'REV'
];

// Create a lookup map for prefix ordering
const PREFIX_ORDER_MAP = SPREAD_PREFIX_ORDER.reduce((map, prefix, index) => {
    map[prefix] = index;
    return map;
}, {});

// Book Groupings for filter options
const BOOK_GROUPINGS = {
    'Torah': ['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy'],
    'History': ['Joshua', 'Judges', 'Ruth', '1 Samuel', '2 Samuel', '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles', 'Ezra', 'Nehemiah', 'Esther'],
    'Poetry': ['Job', 'Psalms', 'Proverbs', 'Ecclesiastes', 'Song of Solomon'],
    'Prophets': ['Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi'],
    'Gospels': ['Matthew', 'Mark', 'Luke', 'John'],
    'Acts': ['Acts'],
    'Epistles': ['Romans', '1 Corinthians', '2 Corinthians', 'Galatians', 'Ephesians', 'Philippians', 'Colossians', '1 Thessalonians', '2 Thessalonians', '1 Timothy', '2 Timothy', 'Titus', 'Philemon', 'Hebrews', 'James', '1 Peter', '2 Peter', '1 John', '2 John', '3 John', 'Jude'],
    'Revelation': ['Revelation']
};

// Create reverse lookup for book -> grouping
const BOOK_TO_GROUPING = {};
Object.entries(BOOK_GROUPINGS).forEach(([grouping, books]) => {
    books.forEach(book => {
        BOOK_TO_GROUPING[book] = grouping;
    });
});

// Group descriptions for display
const GROUPING_DESCRIPTIONS = {
    'Torah': 'The Five Books of Moses',
    'History': 'Historical Narratives',
    'Poetry': 'Wisdom & Poetry',
    'Prophets': 'The Prophetic Books',
    'Gospels': 'The Life of Jesus — In Chronological Order',
    'Acts': 'The Early Church',
    'Epistles': 'Letters to the Churches',
    'Revelation': 'Apocalyptic Vision'
};

// Sort stories in chronological order using spread_code
// The spread_code (e.g., "GSP-042") encodes chronological order:
// - The prefix (GSP) determines the section order
// - The numeric suffix (042) determines order within the section
// This is especially important for Gospels (GSP-*) which interleave
// Matthew, Mark, Luke, and John in Jesus's life order
function sortStoriesChronologically(stories) {
    return stories.sort((a, b) => {
        // Parse spread_code into prefix and number
        const [prefixA, numStrA] = a.spread_code.split('-');
        const [prefixB, numStrB] = b.spread_code.split('-');
        
        // Get prefix order (unknown prefixes go to end)
        const orderA = PREFIX_ORDER_MAP[prefixA] ?? 999;
        const orderB = PREFIX_ORDER_MAP[prefixB] ?? 999;
        
        if (orderA !== orderB) {
            return orderA - orderB;
        }
        
        // Same prefix - sort by numeric suffix
        const numA = parseInt(numStrA, 10) || 0;
        const numB = parseInt(numStrB, 10) || 0;
        
        return numA - numB;
    });
}

// ============================================================================
// Initialization - Single Page App with Router
// ============================================================================

// View elements
let homeView = null;
let storyView = null;
let currentView = null;
let navigationInProgress = false; // Prevents race conditions during navigation
let currentNavigationId = 0; // Track which navigation is current

document.addEventListener('DOMContentLoaded', () => {
    // Theme is now handled by settings.js
    
    // Register service worker for PWA
    registerServiceWorker();
    
    // Set up smooth image loading
    setupImageFadeIn();
    
    // Get view containers
    homeView = document.getElementById('homeView');
    storyView = document.getElementById('storyView');
    
    // Initialize offline detection and listen for changes
    if (window.GraceOffline) {
        window.GraceOffline.onOfflineChange(async (offline) => {
            // Update offline story codes for filtering
            if (offline) {
                window.offlineStoryCodes = await window.GraceOffline.getAllOfflineStoryCodes();
            } else {
                window.offlineStoryCodes = null;
            }
            // Re-apply filters to show/hide stories based on offline availability
            if (currentView === 'home' && typeof applyFilters === 'function') {
                applyFilters();
            }
        });
        
        // Load offline codes if currently offline
        if (window.GraceOffline.isOffline()) {
            window.GraceOffline.getAllOfflineStoryCodes().then(codes => {
                window.offlineStoryCodes = codes;
            });
        }
    }
    
    // Initialize the router
    if (window.GraceRouter) {
        window.GraceRouter.init();
        window.GraceRouter.onRouteChange(handleRouteChange);
        
        // Check for curation mode first (admin only)
        // Defer curation check until auth is ready
        const tryCheckCuration = async () => {
            if (window.GraceAuth) {
                await window.GraceAuth.initAuth();
                if (checkCurationMode()) {
                    return; // Curation mode handles navigation
                }
            }
            // Handle initial route if not in curation mode
            const route = window.GraceRouter.getCurrentRoute();
            handleRouteChange(route, null);
        };
        
        tryCheckCuration();
    } else {
        // Fallback if router not loaded - show home
        console.warn('[GRACE] Router not loaded, defaulting to home view');
        initIndexPage();
    }
});

/**
 * Handle route changes - show/hide appropriate views
 */
async function handleRouteChange(newRoute, previousRoute) {
    console.log('[GRACE] Route change:', previousRoute?.type, '->', newRoute.type);
    
    // Generate unique ID for this navigation to detect stale requests
    const thisNavigationId = ++currentNavigationId;
    
    // If navigation already in progress, let the new one take over
    // (previous navigation will detect it's stale via navigationId)
    navigationInProgress = true;
    
    // Stop any audio playback when changing routes
    if (previousRoute && previousRoute.type !== newRoute.type) {
        stopAudioPlayback();
    }
    
    try {
        if (newRoute.type === 'story') {
            await showStoryView(newRoute.storyId, thisNavigationId);
        } else {
            await showHomeView();
        }
    } finally {
        // Only clear lock if this is still the current navigation
        if (thisNavigationId === currentNavigationId) {
            navigationInProgress = false;
        }
    }
}

/**
 * Show the home view (story grid)
 */
async function showHomeView() {
    if (currentView === 'home') {
        return; // Already showing home
    }
    
    // Clean up story page state when leaving
    if (storyAuthUnsubscribe) {
        storyAuthUnsubscribe();
        storyAuthUnsubscribe = null;
    }
    showingGrid = false;
    
    // Hide story view, show home view
    if (storyView) storyView.style.display = 'none';
    if (homeView) homeView.style.display = 'block';
    
    // Remove story-page class from body
    document.body.classList.remove('story-page');
    
    const wasOnStory = currentView === 'story';
    currentView = 'home';
    
    // Initialize home page if not already done
    if (!allStories.length) {
        await initIndexPage();
    } else if (wasOnStory || sessionStorage.getItem('grace-user-data-changed')) {
        // Always refresh user data when coming from story page
        // This ensures favorites, read status, and primary images are up to date
        sessionStorage.removeItem('grace-user-data-changed');
        await loadUserData(true);
    }
    
    // Update page title
    document.title = 'The Graham Bible';
    
    // Reset Open Graph tags to defaults
    updateOpenGraphTags(null);
    
    // Scroll to top
    window.scrollTo(0, 0);
}

/**
 * Show the story loading skeleton immediately
 * Prevents flash of old content while new story loads
 */
function showStoryLoadingSkeleton() {
    const container = document.getElementById('bookStory');
    const template = document.getElementById('storySkeletonTemplate');
    
    if (container && template) {
        container.innerHTML = '';
        const skeleton = template.content.cloneNode(true);
        container.appendChild(skeleton);
    }
}

/**
 * Show the story view
 * @param {string} storyId - The story spread_code
 * @param {number} navigationId - ID to detect stale navigation requests
 */
async function showStoryView(storyId, navigationId) {
    // Hide home view, show story view
    if (homeView) homeView.style.display = 'none';
    if (storyView) storyView.style.display = 'block';
    
    // Add story-page class to body for styling
    document.body.classList.add('story-page');
    
    currentView = 'story';
    
    // IMMEDIATELY show loading skeleton to prevent flash of old content
    showStoryLoadingSkeleton();
    
    // Reset image grid state for clean story view (fixes bug where grid stays expanded)
    showingGrid = false;
    
    // Clean up previous auth listener to prevent accumulation
    if (storyAuthUnsubscribe) {
        storyAuthUnsubscribe();
        storyAuthUnsubscribe = null;
    }
    
    // Initialize and load the story (pass navigationId to detect stale loads)
    await initStoryPage(storyId, navigationId);
    
    // Scroll to top
    window.scrollTo(0, 0);
}

/**
 * Stop audio playback if running
 */
function stopAudioPlayback() {
    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
    // Reset audio state
    isAudioPlaying = false;
    const stickyBar = document.getElementById('audioStickyBar');
    if (stickyBar) stickyBar.classList.remove('visible');
}

// Handle bfcache (back-forward cache)
window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
        console.log('[GRACE] Page restored from bfcache');
        // Just refresh the current view state
        const route = window.GraceRouter?.getCurrentRoute();
        if (route) {
            handleRouteChange(route, null);
        }
    }
});

// Add 'loaded' class to images for fade-in effect
function setupImageFadeIn() {
    // Handle existing images
    document.querySelectorAll('img').forEach(img => {
        if (img.complete) {
            img.classList.add('loaded');
        } else {
            img.addEventListener('load', () => img.classList.add('loaded'));
        }
    });
    
    // Use MutationObserver for dynamically added images
    const observer = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1) { // Element node
                    const images = node.tagName === 'IMG' ? [node] : node.querySelectorAll?.('img') || [];
                    images.forEach(img => {
                        if (img.complete) {
                            img.classList.add('loaded');
                        } else {
                            img.addEventListener('load', () => img.classList.add('loaded'));
                        }
                    });
                }
            });
        });
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
}

// Register service worker for PWA functionality
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then((registration) => {
                console.log('[PWA] Service Worker registered:', registration.scope);
                
                // Check for updates
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    console.log('[PWA] New service worker installing...');
                    
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            // New version available
                            console.log('[PWA] New version available!');
                            showUpdateNotification(registration);
                        }
                    });
                });
                
                // Check for updates periodically (every hour)
                setInterval(() => {
                    registration.update();
                }, 60 * 60 * 1000);
            })
            .catch((error) => {
                console.log('[PWA] Service Worker registration failed:', error);
            });
        
        // Handle controller change (when update is applied)
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            console.log('[PWA] New service worker activated');
        });
    }
}

// Show update notification toast
function showUpdateNotification(registration) {
    // Create toast element if it doesn't exist
    let toast = document.getElementById('pwa-update-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'pwa-update-toast';
        toast.innerHTML = `
            <div class="pwa-toast-content">
                <span class="pwa-toast-message">A new version is available!</span>
                <button class="pwa-toast-btn" id="pwa-refresh-btn">Refresh</button>
                <button class="pwa-toast-close" id="pwa-close-btn">×</button>
            </div>
        `;
        document.body.appendChild(toast);
        
        // Add styles dynamically
        const style = document.createElement('style');
        style.textContent = `
            #pwa-update-toast {
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%) translateY(100px);
                background: #1A1A1A;
                color: #F5F5F5;
                padding: 12px 16px;
                border-radius: 12px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
                z-index: 10000;
                opacity: 0;
                transition: all 0.3s ease;
                border: 1px solid rgba(201, 162, 39, 0.3);
            }
            #pwa-update-toast.visible {
                transform: translateX(-50%) translateY(0);
                opacity: 1;
            }
            .pwa-toast-content {
                display: flex;
                align-items: center;
                gap: 12px;
            }
            .pwa-toast-message {
                font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                font-size: 0.875rem;
            }
            .pwa-toast-btn {
                background: #C9A227;
                color: #1A1A1A;
                border: none;
                padding: 6px 12px;
                border-radius: 6px;
                font-size: 0.8125rem;
                font-weight: 600;
                cursor: pointer;
                transition: background 0.2s;
            }
            .pwa-toast-btn:hover {
                background: #D4AF37;
            }
            .pwa-toast-close {
                background: none;
                border: none;
                color: #888;
                font-size: 1.25rem;
                cursor: pointer;
                padding: 0 4px;
                line-height: 1;
            }
            .pwa-toast-close:hover {
                color: #FFF;
            }
        `;
        document.head.appendChild(style);
    }
    
    // Show toast
    setTimeout(() => toast.classList.add('visible'), 100);
    
    // Handle refresh button
    document.getElementById('pwa-refresh-btn').addEventListener('click', () => {
        if (registration.waiting) {
            registration.waiting.postMessage('skipWaiting');
        }
        window.location.reload();
    });
    
    // Handle close button
    document.getElementById('pwa-close-btn').addEventListener('click', () => {
        toast.classList.remove('visible');
    });
}

// ============================================================================
// PWA Install Prompt
// ============================================================================

let deferredInstallPrompt = null;

function setupInstallPrompt() {
    // Platform detection
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isAndroid = /Android/.test(navigator.userAgent);
    const isMobile = isIOS || isAndroid;
    
    // Check if already installed as PWA
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                         window.navigator.standalone === true;
    
    // Check if dismissed recently (7 days)
    const dismissedTime = localStorage.getItem('pwa-install-dismissed');
    const DISMISS_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days
    const wasDismissedRecently = dismissedTime && 
                                  (Date.now() - parseInt(dismissedTime)) < DISMISS_DURATION;
    
    console.log('[PWA] Install prompt check:', { isIOS, isAndroid, isStandalone, wasDismissedRecently });
    
    // Don't show if already installed or dismissed recently
    if (isStandalone || wasDismissedRecently) {
        console.log('[PWA] Skipping install prompt');
        return;
    }
    
    // Only show on mobile devices
    if (!isMobile) {
        console.log('[PWA] Not a mobile device, skipping install prompt');
        return;
    }
    
    // For Android: Capture the beforeinstallprompt event
    if (isAndroid) {
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredInstallPrompt = e;
            console.log('[PWA] Install prompt captured');
            showInstallBanner(false);
        });
    }
    
    // For iOS: Show after user engagement (scroll or time)
    if (isIOS) {
        let hasEngaged = false;
        
        const showIOSPrompt = () => {
            if (!hasEngaged) {
                hasEngaged = true;
                showInstallBanner(true);
            }
        };
        
        // Show after scrolling
        window.addEventListener('scroll', () => {
            if (window.scrollY > 100) {
                showIOSPrompt();
            }
        }, { once: true });
        
        // Or show after 30 seconds
        setTimeout(showIOSPrompt, 30000);
    }
}

function showInstallBanner(isIOS) {
    // Don't show if banner already exists
    if (document.getElementById('pwa-install-banner')) return;
    
    const banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    banner.className = 'install-banner';
    
    if (isIOS) {
        banner.innerHTML = `
            <div class="install-banner-content">
                <div class="install-banner-icon">📖</div>
                <div class="install-banner-text">
                    <strong>Install GRACE Bible</strong>
                    <span class="install-banner-subtitle">Add to your home screen</span>
                </div>
                <button class="install-banner-btn" id="install-show-steps">How to Install</button>
                <button class="install-banner-close" id="install-dismiss">×</button>
            </div>
            <div class="install-ios-steps" id="ios-steps">
                <div class="ios-step">
                    <span class="ios-step-num">1</span>
                    <span>Tap the <strong>Share</strong> button</span>
                    <span class="ios-share-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                            <polyline points="16 6 12 2 8 6"/>
                            <line x1="12" y1="2" x2="12" y2="15"/>
                        </svg>
                    </span>
                </div>
                <div class="ios-step">
                    <span class="ios-step-num">2</span>
                    <span>Scroll down and tap <strong>"Add to Home Screen"</strong></span>
                </div>
                <div class="ios-step">
                    <span class="ios-step-num">3</span>
                    <span>Tap <strong>"Add"</strong> in the top right</span>
                </div>
            </div>
        `;
    } else {
        // Android
        banner.innerHTML = `
            <div class="install-banner-content">
                <div class="install-banner-icon">📖</div>
                <div class="install-banner-text">
                    <strong>Install GRACE Bible</strong>
                    <span class="install-banner-subtitle">Add to your home screen</span>
                </div>
                <button class="install-banner-btn" id="install-btn">Install</button>
                <button class="install-banner-close" id="install-dismiss">×</button>
            </div>
        `;
    }
    
    document.body.appendChild(banner);
    
    // Animate in
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            banner.classList.add('visible');
        });
    });
    
    // Handle iOS steps toggle
    if (isIOS) {
        const showStepsBtn = document.getElementById('install-show-steps');
        const stepsDiv = document.getElementById('ios-steps');
        
        showStepsBtn.addEventListener('click', () => {
            stepsDiv.classList.toggle('visible');
            showStepsBtn.textContent = stepsDiv.classList.contains('visible') ? 'Hide Steps' : 'How to Install';
        });
    } else {
        // Handle Android install button
        const installBtn = document.getElementById('install-btn');
        installBtn.addEventListener('click', async () => {
            if (deferredInstallPrompt) {
                deferredInstallPrompt.prompt();
                const result = await deferredInstallPrompt.userChoice;
                console.log('[PWA] Install prompt result:', result.outcome);
                
                if (result.outcome === 'accepted') {
                    banner.classList.remove('visible');
                    setTimeout(() => banner.remove(), 300);
                }
                
                deferredInstallPrompt = null;
            }
        });
    }
    
    // Handle dismiss
    document.getElementById('install-dismiss').addEventListener('click', () => {
        localStorage.setItem('pwa-install-dismissed', Date.now().toString());
        banner.classList.remove('visible');
        setTimeout(() => banner.remove(), 300);
    });
}

// Initialize install prompt after page load
if (document.readyState === 'complete') {
    setupInstallPrompt();
} else {
    window.addEventListener('load', setupInstallPrompt);
}

// ============================================================================
// Index Page
// ============================================================================

async function initIndexPage() {
    showSkeletonCards(12);
    
    // Detect platform and update keyboard shortcut display
    updateKeyboardShortcutDisplay();
    
    // Initialize authentication
    if (window.GraceAuth) {
        await window.GraceAuth.initAuth();
        window.GraceAuth.setupAuthModal();
        
        // Listen for auth state changes
        window.GraceAuth.onAuthStateChange(handleAuthStateChange);
        
        // Explicitly update auth UI after init to ensure filter toggles are visible
        // This handles cases where the page is navigated to (not loaded fresh)
        if (window.GraceAuth.isAuthenticated()) {
            const userFilter = document.getElementById('userFilter');
            if (userFilter) {
                userFilter.style.display = 'flex';
            }
        }
    }
    
    // Load stories from Supabase (with fallback to static JSON)
    await loadAllStories();
    
    // Load user data if authenticated (always refresh to catch changes from story page)
    await loadUserData();
    
    // Check if we need to refresh due to changes on story page
    if (sessionStorage.getItem('grace-user-data-changed')) {
        sessionStorage.removeItem('grace-user-data-changed');
        console.log('[GRACE] User data changed on story page, data refreshed');
    }
    
    populateBookDropdown();
    setupFilters();
    setupUserFilters();
    setupKeyboardShortcuts();
    setupBreadcrumbClicks();
    applyFilters();
    updateStats();
    
    // Restore scroll position if returning from story page
    restoreScrollPosition();
    
    // Save scroll position when clicking on story cards
    setupScrollMemory();
}

// Save scroll position when navigating to story
function setupScrollMemory() {
    document.addEventListener('click', (e) => {
        const storyCard = e.target.closest('.story-card');
        if (storyCard) {
            sessionStorage.setItem('indexScrollY', window.scrollY.toString());
        }
    });
}

// ============================================================================
// User Data & Auth Integration
// ============================================================================

/**
 * Load user favorites and read stories when authenticated
 * Uses parallel queries for ~50% faster loading
 * @param {boolean} rerender - Whether to re-render stories after loading (for home page)
 */
async function loadUserData(rerender = false) {
    if (!window.GraceAuth?.isAuthenticated()) {
        userFavorites = new Set();
        userReadStories = new Set();
        userLibrary = new Set();
        userPrimaryImages = new Map();
        return;
    }
    
    try {
        // Load all user data in parallel (4 queries at once)
        const data = await window.GraceAuth.getAllUserDataParallel();
        
        userFavorites = new Set(data.favorites);
        userReadStories = new Set(data.readStories);
        userLibrary = new Set(data.library);
        userPrimaryImages = data.primaryImages;
        
        // Re-render stories if on home page and requested
        if (rerender && document.getElementById('storiesGrid')) {
            applyFilters();
        }
    } catch (err) {
        console.error('[GRACE] Error loading user data:', err);
    }
}

/**
 * Handle auth state changes
 */
async function handleAuthStateChange(state) {
    console.log('[GRACE] Auth state changed:', state.isAuthenticated);
    
    if (state.isAuthenticated) {
        await loadUserData();
    } else {
        userFavorites = new Set();
        userReadStories = new Set();
        userLibrary = new Set();
        userPrimaryImages = new Map();
        // Reset user filter
        currentFilters.userFilter = 'all';
        const userFilterBtns = document.querySelectorAll('#userFilter .segment');
        userFilterBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.value === 'all');
        });
    }
    
    // Re-render stories with updated state
    applyFilters();
}

/**
 * Setup user filter controls (favorites, read/unread)
 */
function setupUserFilters() {
    const userFilterBtns = document.querySelectorAll('#userFilter .segment');
    
    userFilterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            userFilterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilters.userFilter = btn.dataset.value;
            applyFilters();
        });
    });
}

// Restore scroll position when returning to index
function restoreScrollPosition() {
    const savedY = sessionStorage.getItem('indexScrollY');
    if (savedY) {
        // Wait for content to render, then scroll
        requestAnimationFrame(() => {
            window.scrollTo(0, parseInt(savedY));
            // Clear after restoring so refresh starts at top
            sessionStorage.removeItem('indexScrollY');
        });
    }
}

// Detect platform and show appropriate keyboard shortcut
function updateKeyboardShortcutDisplay() {
    const shortcut = document.querySelector('.search-shortcut');
    if (!shortcut) return;
    
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0 ||
                  navigator.userAgent.toUpperCase().indexOf('MAC') >= 0;
    
    shortcut.textContent = isMac ? '⌘K' : 'Ctrl+K';
}

function showSkeletonCards(count) {
    const grid = document.getElementById('storiesGrid');
    const template = document.getElementById('skeletonTemplate');
    if (!template || !grid) return;
    
    grid.innerHTML = '';
    for (let i = 0; i < count; i++) {
        const skeleton = template.content.cloneNode(true);
        grid.appendChild(skeleton);
    }
}

async function loadAllStories() {
    let loadedFromCache = false;
    let loadedFromStaticJson = false;
    let needsBackgroundRefresh = true;
    
    // STEP 1: Try loading from IndexedDB cache first (instant, has full data)
    try {
        const cached = await window.GraceOffline?.getStoryList();
        if (cached?.stories?.length > 0) {
            allStories = sortStoriesChronologically(cached.stories);
            filteredStories = [...allStories];
            loadedFromCache = true;
            needsBackgroundRefresh = !cached.isFresh; // Only refresh if stale (>5 min)
            console.log('[GRACE] Stories loaded from cache:', allStories.length, cached.isFresh ? '(fresh)' : '(stale, will refresh)');
        }
    } catch (cacheErr) {
        console.warn('[GRACE] Cache read failed:', cacheErr);
    }
    
    // STEP 2: If no cache, try static JSON first (instant from service worker, has images!)
    // This provides fast first-load for new users before Supabase responds
    if (!loadedFromCache) {
        try {
            const response = await fetch('data/all-spreads.json?v=3'); // v3 uses slot-based primary
            if (response.ok) {
                const json = await response.json();
                if (json.spreads && json.spreads.length > 0) {
                    // Map static data to match Supabase schema
                    // Now includes primary_slot and all image URLs
                    allStories = sortStoriesChronologically(json.spreads.map(s => ({
                        spread_code: s.spread_code,
                        title: s.title,
                        kjv_passage_ref: s.kjv_key_verse_ref || `${s.book} ${s.start_chapter}:${s.start_verse}`,
                        status_text: 'done',
                        status_image: s.image_url_1 ? 'done' : 'pending',
                        primary_slot: s.primary_slot || 1,
                        image_url_1: s.image_url_1 || null,
                        image_url_2: s.image_url_2 || null,
                        image_url_3: s.image_url_3 || null,
                        image_url_4: s.image_url_4 || null,
                        testament: s.testament,
                        book: s.book,
                        start_chapter: s.start_chapter,
                        start_verse: s.start_verse
                    })));
                    filteredStories = [...allStories];
                    loadedFromStaticJson = true;
                    console.log('[GRACE] Stories loaded from static JSON:', allStories.length);
                }
            }
        } catch (staticErr) {
            console.warn('[GRACE] Static JSON load failed:', staticErr);
        }
    }
    
    // If we have cached data and it's fresh, we're done
    if (loadedFromCache && !needsBackgroundRefresh) {
        return;
    }
    
    // STEP 3: Fetch from Supabase (background if we have data, blocking if we don't)
    const fetchFromSupabase = async () => {
        try {
            const { data, error } = await supabase
                .from('grahams_devotional_spreads')
                .select('spread_code, title, kjv_passage_ref, status_text, status_image, primary_slot, image_url_1, image_url_2, image_url_3, image_url_4, testament, book, start_chapter, start_verse');
            
            if (error) throw error;
            
            if (data && data.length > 0) {
                const sorted = sortStoriesChronologically(data);
                
                // Save to cache for next time
                window.GraceOffline?.saveStoryList(data);
                
                const hadData = loadedFromCache || loadedFromStaticJson;
                
                // If data changed or we didn't have any source, update
                if (!hadData || data.length !== allStories.length) {
                    allStories = sorted;
                    filteredStories = [...allStories];
                    if (hadData) {
                        // Re-render only if we already showed some data
                        applyFilters();
                    }
                    console.log('[GRACE] Stories updated from Supabase:', allStories.length);
                } else {
                    // Update in place without re-render (same count, just fresher data)
                    allStories = sorted;
                    filteredStories = [...allStories];
                    console.log('[GRACE] Stories refreshed from Supabase (no re-render needed)');
                }
                return true;
            }
            return false;
        } catch (err) {
            console.warn('[GRACE] Supabase failed:', err.message);
            return false;
        }
    };
    
    // If we have data from cache or static JSON, fetch Supabase in background
    if (loadedFromCache || loadedFromStaticJson) {
        fetchFromSupabase(); // Don't await - let it run in background
    } else {
        // No data at all - must wait for Supabase
        const supabaseWorked = await fetchFromSupabase();
        
        // Last resort fallback if everything failed
        if (!supabaseWorked && allStories.length === 0) {
            try {
                const response = await fetch('data/all-spreads.json?v=3');
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                
                const json = await response.json();
                if (json.spreads && json.spreads.length > 0) {
                    allStories = sortStoriesChronologically(json.spreads.map(s => ({
                        spread_code: s.spread_code,
                        title: s.title,
                        kjv_passage_ref: s.kjv_key_verse_ref || `${s.book} ${s.start_chapter}:${s.start_verse}`,
                        status_text: 'done',
                        status_image: s.image_url_1 ? 'done' : 'pending',
                        primary_slot: s.primary_slot || 1,
                        image_url_1: s.image_url_1 || null,
                        image_url_2: s.image_url_2 || null,
                        image_url_3: s.image_url_3 || null,
                        image_url_4: s.image_url_4 || null,
                        testament: s.testament,
                        book: s.book,
                        start_chapter: s.start_chapter,
                        start_verse: s.start_verse
                    })));
                    filteredStories = [...allStories];
                    console.log('[GRACE] Stories loaded from fallback JSON:', allStories.length);
                } else {
                    throw new Error('No spreads in fallback JSON');
                }
            } catch (fallbackErr) {
                console.error('[GRACE] All story sources failed:', fallbackErr);
                const grid = document.getElementById('storiesGrid');
                if (grid) {
                    grid.innerHTML = `
                        <div class="empty-state">
                            <p>Unable to load stories. Please check your connection and try again.</p>
                            <button onclick="location.reload()" style="margin-top: 10px; padding: 8px 16px; cursor: pointer;">
                                Retry
                            </button>
                        </div>
                    `;
                }
            }
        }
    }
}

// OT and NT grouping definitions
const OT_GROUPINGS = ['Torah', 'History', 'Poetry', 'Prophets'];
const NT_GROUPINGS = ['Gospels', 'Acts', 'Epistles', 'Revelation'];

// Populate the grouping slider based on selected testament
function populateGroupingSlider(testament) {
    const groupingFilter = document.getElementById('groupingFilter');
    const groupingRow = document.getElementById('groupingFilterRow');
    if (!groupingFilter || !groupingRow) return;
    
    // Hide if "All" is selected
    if (testament === 'all') {
        groupingRow.classList.remove('visible');
        return;
    }
    
    // Get groupings for this testament
    const groupings = testament === 'OT' ? OT_GROUPINGS : NT_GROUPINGS;
    
    // Calculate story counts per grouping
    const groupingCounts = {};
    groupings.forEach(groupName => {
        const books = BOOK_GROUPINGS[groupName] || [];
        groupingCounts[groupName] = allStories.filter(s => books.includes(s.book)).length;
    });
    
    // Build segment buttons
    let html = '<button class="segment active" data-value="all">All</button>';
    groupings.forEach(groupName => {
        const count = groupingCounts[groupName];
        if (count > 0) {
            html += `<button class="segment" data-value="${groupName}">${groupName}</button>`;
        }
    });
    
    groupingFilter.innerHTML = html;
    groupingRow.classList.add('visible');
    
    // Set up click handlers
    setupGroupingFilterHandlers();
}

// Set up grouping filter click handlers
function setupGroupingFilterHandlers() {
    const groupingBtns = document.querySelectorAll('#groupingFilter .segment');
    groupingBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            groupingBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const value = btn.dataset.value;
            currentFilters.grouping = value;
            currentFilters.book = 'all';
            
            // Populate book slider if grouping selected
            populateBookSlider(value);
            
            applyFilters();
        });
    });
}

// Populate the book slider based on selected grouping
function populateBookSlider(grouping) {
    const bookFilter = document.getElementById('bookFilter');
    const bookRow = document.getElementById('bookFilterRow');
    if (!bookFilter || !bookRow) return;
    
    // Hide if "All" grouping is selected
    if (grouping === 'all') {
        bookRow.classList.remove('visible');
        return;
    }
    
    // Get books for this grouping
    const books = BOOK_GROUPINGS[grouping] || [];
    
    // Calculate story counts per book
    const bookCounts = {};
    books.forEach(book => {
        bookCounts[book] = allStories.filter(s => s.book === book).length;
    });
    
    // Build segment buttons (only books with stories)
    let html = '<button class="segment active" data-value="all">All</button>';
    books.forEach(book => {
        const count = bookCounts[book];
        if (count > 0) {
            html += `<button class="segment" data-value="${book}">${book}</button>`;
        }
    });
    
    bookFilter.innerHTML = html;
    bookRow.classList.add('visible');
    
    // Set up click handlers
    setupBookFilterHandlers();
}

// Set up book filter click handlers
function setupBookFilterHandlers() {
    const bookBtns = document.querySelectorAll('#bookFilter .segment');
    bookBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            bookBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            currentFilters.book = btn.dataset.value;
            applyFilters();
        });
    });
}

// Legacy function for backwards compatibility
function populateBookDropdown(testamentFilter = 'all') {
    populateGroupingSlider(testamentFilter);
}

function setupFilters() {
    // Testament segment control
    const testamentBtns = document.querySelectorAll('#testamentFilter .segment');
    testamentBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            testamentBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilters.testament = btn.dataset.value;
            
            // Reset cascading filters when testament changes
            currentFilters.book = 'all';
            currentFilters.grouping = 'all';
            
            // Hide book slider
            const bookRow = document.getElementById('bookFilterRow');
            if (bookRow) bookRow.classList.remove('visible');
            
            // Populate grouping slider (or hide if "All")
            populateGroupingSlider(currentFilters.testament);
            
            applyFilters();
        });
    });
    
    // Status filter buttons in header
    const statusBtns = document.querySelectorAll('#statusFilter .stat-btn');
    statusBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            statusBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilters.status = btn.dataset.status;
            applyFilters();
        });
    });
    
    // Search input
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(() => {
            currentFilters.search = searchInput.value.toLowerCase().trim();
            applyFilters();
        }, 300));
    }
    
    // Surprise Me button
    const surpriseBtn = document.getElementById('surpriseBtn');
    if (surpriseBtn) {
        surpriseBtn.addEventListener('click', goToRandomStory);
    }
}

function goToRandomStory() {
    // Haptic feedback for surprise action
    hapticFeedback('medium');
    
    // Use filtered stories if there are active filters, otherwise use all stories
    const storiesToChooseFrom = filteredStories.length > 0 ? filteredStories : allStories;
    
    if (storiesToChooseFrom.length === 0) {
        return;
    }
    
    const randomIndex = Math.floor(Math.random() * storiesToChooseFrom.length);
    const randomStory = storiesToChooseFrom[randomIndex];
    
    // Use hash-based routing
    if (window.GraceRouter) {
        window.GraceRouter.navigateToStory(randomStory.spread_code);
    } else {
        window.location.hash = `#/story/${randomStory.spread_code}`;
    }
}

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // ⌘K or Ctrl+K or / to focus search
        if ((e.metaKey && e.key === 'k') || (e.ctrlKey && e.key === 'k') || (e.key === '/' && !e.target.matches('input, textarea'))) {
            e.preventDefault();
            const searchInput = document.getElementById('searchInput');
            if (searchInput) searchInput.focus();
        }
        
        // R key for random story (when not in input)
        if (e.key === 'r' && !e.target.matches('input, textarea') && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            goToRandomStory();
        }
        
        // Escape to clear search
        if (e.key === 'Escape') {
            const searchInput = document.getElementById('searchInput');
            if (searchInput && document.activeElement === searchInput) {
                searchInput.value = '';
                currentFilters.search = '';
                searchInput.blur();
                applyFilters();
            }
        }
    });
}

function applyFilters() {
    const { testament, book, grouping, status, search, userFilter } = currentFilters;
    
    // Get offline available stories if offline
    const isOffline = window.GraceOffline?.isOffline();
    
    filteredStories = allStories.filter(story => {
        // Offline filter: only show cached/library stories when offline
        if (isOffline && window.offlineStoryCodes) {
            if (!window.offlineStoryCodes.has(story.spread_code)) {
                return false;
            }
        }
        
        // Testament filter
        if (testament !== 'all' && story.testament !== testament) {
            return false;
        }
        
        // Grouping filter (e.g., Torah, Gospels)
        if (grouping !== 'all') {
            const booksInGroup = BOOK_GROUPINGS[grouping] || [];
            if (!booksInGroup.includes(story.book)) {
                return false;
            }
        }
        
        // Book filter
        if (book !== 'all' && story.book !== book) {
            return false;
        }
        
        // Status filter
        if (status !== 'all') {
            const isComplete = story.status_text === 'done' && story.status_image === 'done';
            if (status === 'complete' && !isComplete) return false;
            if (status === 'pending' && isComplete) return false;
        }
        
        // Search filter
        if (search) {
            const searchFields = [
                story.title,
                story.kjv_passage_ref,
                story.spread_code,
                story.book
            ].filter(Boolean).map(f => f.toLowerCase());
            
            if (!searchFields.some(field => field.includes(search))) {
                return false;
            }
        }
        
        // User filters (favorites, library, read/unread) - only apply if authenticated
        if (userFilter !== 'all' && window.GraceAuth?.isAuthenticated()) {
            const spreadCode = story.spread_code;
            const isFavorited = userFavorites.has(spreadCode);
            const isRead = userReadStories.has(spreadCode);
            const isInLibrary = userLibrary.has(spreadCode);
            
            if (userFilter === 'favorites' && !isFavorited) {
                return false;
            }
            if (userFilter === 'library' && !isInLibrary) {
                return false;
            }
            if (userFilter === 'unread' && isRead) {
                return false;
            }
            if (userFilter === 'read' && !isRead) {
                return false;
            }
        }
        
        return true;
    });
    
    renderStories();
    updateActiveFilters();
    updateResultsCount();
}

function updateActiveFilters() {
    const container = document.getElementById('activeFilters');
    if (!container) return;
    
    const tags = [];
    
    if (currentFilters.testament !== 'all') {
        const label = currentFilters.testament === 'OT' ? 'Old Testament' : 'New Testament';
        tags.push({ type: 'testament', label });
    }
    
    if (currentFilters.grouping !== 'all') {
        tags.push({ type: 'grouping', label: currentFilters.grouping });
    }
    
    if (currentFilters.book !== 'all') {
        tags.push({ type: 'book', label: currentFilters.book });
    }
    
    if (currentFilters.status !== 'all') {
        const label = currentFilters.status === 'complete' ? 'Complete' : 'Pending';
        tags.push({ type: 'status', label });
    }
    
    if (currentFilters.search) {
        tags.push({ type: 'search', label: `"${currentFilters.search}"` });
    }
    
    // User filter tags
    if (currentFilters.userFilter !== 'all' && window.GraceAuth?.isAuthenticated()) {
        const labels = {
            'favorites': '♥ Favorites',
            'library': '↓ Offline Library',
            'unread': 'Unread',
            'read': 'Read'
        };
        tags.push({ type: 'userFilter', label: labels[currentFilters.userFilter] || currentFilters.userFilter });
    }
    
    container.innerHTML = tags.map(tag => `
        <span class="filter-tag">
            ${tag.label}
            <button onclick="clearFilter('${tag.type}')" aria-label="Remove filter">×</button>
        </span>
    `).join('');
}

function clearFilter(type) {
    if (type === 'testament') {
        currentFilters.testament = 'all';
        currentFilters.grouping = 'all';
        currentFilters.book = 'all';
        document.querySelectorAll('#testamentFilter .segment').forEach(b => b.classList.remove('active'));
        document.querySelector('#testamentFilter .segment[data-value="all"]')?.classList.add('active');
        // Hide cascading sliders
        document.getElementById('groupingFilterRow')?.classList.remove('visible');
        document.getElementById('bookFilterRow')?.classList.remove('visible');
    } else if (type === 'grouping') {
        currentFilters.grouping = 'all';
        currentFilters.book = 'all';
        document.querySelectorAll('#groupingFilter .segment').forEach(b => b.classList.remove('active'));
        document.querySelector('#groupingFilter .segment[data-value="all"]')?.classList.add('active');
        document.getElementById('bookFilterRow')?.classList.remove('visible');
    } else if (type === 'book') {
        currentFilters.book = 'all';
        document.querySelectorAll('#bookFilter .segment').forEach(b => b.classList.remove('active'));
        document.querySelector('#bookFilter .segment[data-value="all"]')?.classList.add('active');
    } else if (type === 'status') {
        currentFilters.status = 'all';
        document.querySelectorAll('#statusFilter .stat-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('#statusFilter .stat-btn[data-status="all"]')?.classList.add('active');
    } else if (type === 'search') {
        currentFilters.search = '';
        document.getElementById('searchInput').value = '';
    } else if (type === 'userFilter') {
        currentFilters.userFilter = 'all';
        document.querySelectorAll('#userFilter .segment').forEach(b => b.classList.remove('active'));
        document.querySelector('#userFilter .segment[data-value="all"]')?.classList.add('active');
    }
    
    applyFilters();
}

function updateResultsCount() {
    const countEl = document.getElementById('resultsCount');
    if (countEl) {
        countEl.textContent = filteredStories.length;
    }
}

/**
 * Get contextual empty state HTML based on active filters
 */
function getEmptyStateHTML() {
    const userFilter = currentFilters.userFilter;
    const hasSearch = currentFilters.search && currentFilters.search.trim().length > 0;
    
    // Different messages for different filter states
    if (userFilter === 'favorites') {
        return `
            <div class="empty-state empty-state-favorites">
                <div class="empty-icon">♥</div>
                <h3>No Favorites Yet</h3>
                <p>Stories you favorite will appear here. Tap the heart icon on any story to save it!</p>
                <button class="empty-action-btn" onclick="document.querySelector('#userFilter .segment[data-value=\\'all\\']').click()">
                    Browse All Stories
                </button>
            </div>
        `;
    }
    
    if (userFilter === 'library') {
        return `
            <div class="empty-state empty-state-library">
                <div class="empty-icon">↓</div>
                <h3>No Offline Stories Yet</h3>
                <p>Save stories for offline reading by tapping the download icon on any story page. Perfect for flights or times without internet!</p>
                <button class="empty-action-btn" onclick="document.querySelector('#userFilter .segment[data-value=\\'all\\']').click()">
                    Browse Stories
                </button>
            </div>
        `;
    }
    
    if (userFilter === 'read') {
        return `
            <div class="empty-state empty-state-read">
                <div class="empty-icon">📖</div>
                <h3>No Stories Read Yet</h3>
                <p>Stories are automatically marked as read when you scroll through them, or you can tap the checkmark icon.</p>
                <button class="empty-action-btn" onclick="document.querySelector('#userFilter .segment[data-value=\\'all\\']').click()">
                    Start Reading
                </button>
            </div>
        `;
    }
    
    if (userFilter === 'unread') {
        return `
            <div class="empty-state empty-state-celebration">
                <div class="empty-icon">🎉</div>
                <h3>You've Read Everything!</h3>
                <p>Amazing! You've completed all the stories in your current view. What a journey through Scripture!</p>
                <button class="empty-action-btn" onclick="document.querySelector('#userFilter .segment[data-value=\\'all\\']').click()">
                    Review All Stories
                </button>
            </div>
        `;
    }
    
    if (hasSearch) {
        return `
            <div class="empty-state empty-state-search">
                <div class="empty-icon">🔍</div>
                <h3>No Results Found</h3>
                <p>No stories match "<strong>${escapeHTML(currentFilters.search)}</strong>". Try different keywords or browse by book.</p>
                <button class="empty-action-btn" onclick="document.getElementById('searchInput').value=''; currentFilters.search=''; applyFilters();">
                    Clear Search
                </button>
            </div>
        `;
    }
    
    // Default empty state
    return `
        <div class="empty-state">
            <div class="empty-icon">📜</div>
            <h3>No Stories Found</h3>
            <p>No stories match your current filters. Try adjusting your selections.</p>
            <button class="empty-action-btn" onclick="resetFilters()">
                Clear All Filters
            </button>
        </div>
    `;
}

/**
 * Helper to escape HTML entities
 */
function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * Reset all filters to defaults
 */
function resetFilters() {
    currentFilters = {
        testament: 'all',
        grouping: 'all',
        book: 'all',
        status: 'all',
        search: '',
        userFilter: 'all'
    };
    
    // Reset UI
    document.querySelectorAll('.segment').forEach(s => s.classList.remove('active'));
    document.querySelector('#testamentFilter .segment[data-value="all"]')?.classList.add('active');
    document.querySelector('#userFilter .segment[data-value="all"]')?.classList.add('active');
    document.getElementById('searchInput').value = '';
    
    applyFilters();
}

// Progressive loading state
const INITIAL_LOAD_COUNT = 48; // First batch - fills viewport
const LOAD_MORE_COUNT = 24; // Subsequent batches
let renderedStoryCount = 0;
let loadMoreObserver = null;

function renderStories() {
    const grid = document.getElementById('storiesGrid');
    if (!grid) return;
    
    console.log('[GRACE] renderStories called, filteredStories:', filteredStories.length);
    
    // Reset progressive loading state
    renderedStoryCount = 0;
    cleanupLoadMoreObserver();
    
    if (filteredStories.length === 0) {
        grid.innerHTML = getEmptyStateHTML();
        hideBreadcrumb();
        return;
    }
    
    // Render initial batch
    grid.innerHTML = '';
    renderStoryBatch(grid, 0, INITIAL_LOAD_COUNT);
    
    // Setup scroll-reveal breadcrumb in header
    setupScrollRevealBreadcrumb();
    
    // Setup progressive loading if there are more stories
    if (renderedStoryCount < filteredStories.length) {
        setupLoadMoreObserver(grid);
    }
}

/**
 * Cleanup load more observer
 */
function cleanupLoadMoreObserver() {
    if (loadMoreObserver) {
        loadMoreObserver.disconnect();
        loadMoreObserver = null;
    }
    // Remove any existing sentinel
    const existingSentinel = document.getElementById('loadMoreSentinel');
    if (existingSentinel) {
        existingSentinel.remove();
    }
}

/**
 * Setup IntersectionObserver for progressive loading
 */
function setupLoadMoreObserver(grid) {
    // Create sentinel element
    const sentinel = document.createElement('div');
    sentinel.id = 'loadMoreSentinel';
    sentinel.className = 'load-more-sentinel';
    sentinel.innerHTML = '<div class="loading-spinner"></div>';
    grid.appendChild(sentinel);
    
    // Create observer
    loadMoreObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && renderedStoryCount < filteredStories.length) {
                // Remove sentinel temporarily while loading
                sentinel.remove();
                
                // Render next batch
                renderStoryBatch(grid, renderedStoryCount, LOAD_MORE_COUNT);
                
                // Re-add sentinel if there are more stories
                if (renderedStoryCount < filteredStories.length) {
                    grid.appendChild(sentinel);
                }
            }
        });
    }, {
        rootMargin: '200px' // Start loading 200px before reaching bottom
    });
    
    loadMoreObserver.observe(sentinel);
}

/**
 * Render a batch of stories starting from startIndex
 */
function renderStoryBatch(grid, startIndex, count) {
    const endIndex = Math.min(startIndex + count, filteredStories.length);
    let html = '';
    
    // Track headers for this batch
    let currentTestament = null;
    let currentGrouping = null;
    let currentBook = null;
    
    // Get header state from previous batch
    if (startIndex > 0 && filteredStories[startIndex - 1]) {
        const prevStory = filteredStories[startIndex - 1];
        currentTestament = prevStory.testament;
        currentGrouping = BOOK_TO_GROUPING[prevStory.book] || 'Unknown';
        currentBook = prevStory.book;
    }
    
    for (let index = startIndex; index < endIndex; index++) {
        const story = filteredStories[index];
        const testament = story.testament;
        const book = story.book;
        const grouping = BOOK_TO_GROUPING[book] || 'Unknown';
        
        // Debug first story
        if (index === 0) {
            console.log('[GRACE] First story:', { testament, book, grouping, title: story.title });
        }
        
        // Add Testament header when it changes
        if (testament && testament !== currentTestament) {
            currentTestament = testament;
            currentGrouping = null;
            currentBook = null;
            const testamentName = testament === 'OT' ? 'Old Testament' : 'New Testament';
            html += `<div class="section-header testament-header" data-testament="${testamentName}" data-grouping="" data-book=""><h2>${testamentName}</h2></div>`;
        }
        
        // Add Grouping header when it changes
        if (grouping && grouping !== currentGrouping) {
            currentGrouping = grouping;
            currentBook = null;
            const testamentName = currentTestament === 'OT' ? 'Old Testament' : 'New Testament';
            const description = GROUPING_DESCRIPTIONS[grouping] || '';
            html += `<div class="section-header grouping-header" data-testament="${testamentName}" data-grouping="${grouping}" data-book=""><h3>${grouping}</h3>${description ? `<span class="grouping-description">${description}</span>` : ''}</div>`;
        }
        
        // Add Book header when it changes, UNLESS:
        // 1. We're in the Gospels grouping (books are interleaved chronologically)
        // 2. AND no specific book filter is active
        const isGospelsGrouping = grouping === 'Gospels';
        const isFilteredToSingleBook = currentFilters.book !== 'all';
        const shouldShowBookHeaders = !isGospelsGrouping || isFilteredToSingleBook;
        
        if (shouldShowBookHeaders && book && book !== currentBook) {
            currentBook = book;
            const testamentName = currentTestament === 'OT' ? 'Old Testament' : 'New Testament';
            html += `<div class="section-header book-header" data-testament="${testamentName}" data-grouping="${currentGrouping}" data-book="${book}"><h4>${book}</h4></div>`;
        } else if (!shouldShowBookHeaders) {
            // Track book changes even if not showing headers (for breadcrumb)
            currentBook = book;
        }
        
        // Story card
        const isComplete = story.status_text === 'done' && story.status_image === 'done';
        const statusClass = isComplete ? 'complete' : 'pending';
        const statusText = isComplete ? 'Complete' : 'Pending';
        
        // Use shared function for primary image
        // Pass user's slot selection if they have one, otherwise uses global default
        const userSlot = userPrimaryImages.get(story.spread_code);
        const imageUrl = getPrimaryImageUrl(story, userSlot);
        // Use thumbnail for homepage cards (90% smaller, ~50KB vs 500KB)
        const thumbnailUrl = getThumbnailUrl(imageUrl);
        
        const passageRef = story.kjv_passage_ref || '';
        
        // User state classes
        const isFavorited = userFavorites.has(story.spread_code);
        const isRead = userReadStories.has(story.spread_code);
        const userClasses = [
            isFavorited ? 'favorited' : '',
            isRead ? 'read' : ''
        ].filter(Boolean).join(' ');
        
        html += `
            <a href="#/story/${story.spread_code}" class="story-card ${userClasses}">
                <div class="card-image">
                    ${thumbnailUrl 
                        ? `<img src="${thumbnailUrl}" alt="${story.title}" loading="lazy">`
                        : `<div class="placeholder">No image yet</div>`
                    }
                    <span class="card-status ${statusClass} admin-only">${statusText}</span>
                </div>
                <div class="card-content">
                    <h3 class="card-title">${story.title || 'Untitled'}</h3>
                    ${passageRef ? `<span class="card-reference">${passageRef}</span>` : ''}
                </div>
            </a>
        `;
    }
    
    // Append to grid (don't replace if this is a subsequent batch)
    if (startIndex === 0) {
        grid.innerHTML = html;
    } else {
        grid.insertAdjacentHTML('beforeend', html);
    }
    
    // Update rendered count
    renderedStoryCount = endIndex;
    console.log('[GRACE] Rendered stories:', renderedStoryCount, '/', filteredStories.length);
}

// ============================================================================
// SCROLL-REVEAL BREADCRUMB SYSTEM
// ============================================================================
// The breadcrumb row is hidden in the header by default.
// When the user scrolls past an in-grid section header, the breadcrumb row
// slides into view and shows the current section context.
// ============================================================================

let currentBreadcrumbState = { testament: '', grouping: '', book: '' };
let breadcrumbVisible = false;

function setupScrollRevealBreadcrumb() {
    const headerBreadcrumb = document.getElementById('headerBreadcrumb');
    const header = document.getElementById('mainHeader');
    
    // Detect mobile for enhanced logging
    const isMobile = window.innerWidth <= 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const logPrefix = isMobile ? '[GRACE-MOBILE]' : '[GRACE]';
    
    console.log(logPrefix, 'Setting up scroll-reveal breadcrumb');
    console.log(logPrefix, 'Viewport:', window.innerWidth, 'x', window.innerHeight);
    console.log(logPrefix, 'User Agent:', navigator.userAgent.substring(0, 50) + '...');
    
    if (!headerBreadcrumb) {
        console.log(logPrefix, 'ERROR: No header breadcrumb element found (#headerBreadcrumb)');
        return;
    }
    console.log(logPrefix, 'Header breadcrumb element found:', headerBreadcrumb);
    
    if (!header) {
        console.log(logPrefix, 'WARNING: No main header element found (#mainHeader)');
    } else {
        console.log(logPrefix, 'Main header element found, height:', header.offsetHeight);
    }
    
    // Remove old scroll handler if exists
    if (window._breadcrumbScrollHandler) {
        window.removeEventListener('scroll', window._breadcrumbScrollHandler);
        window.removeEventListener('touchmove', window._breadcrumbScrollHandler);
        console.log(logPrefix, 'Removed old scroll handlers');
    }
    
    // Get all section headers in the grid
    const sectionHeaders = document.querySelectorAll('.section-header');
    console.log(logPrefix, 'Found', sectionHeaders.length, 'section headers for scroll tracking');
    
    if (sectionHeaders.length === 0) {
        console.log(logPrefix, 'ERROR: No section headers to track - breadcrumb will not work');
        return;
    }
    
    // Log first few section headers for debugging
    if (isMobile) {
        sectionHeaders.forEach((sh, i) => {
            if (i < 3) {
                console.log(logPrefix, `Header ${i}:`, sh.dataset.testament, sh.dataset.grouping, sh.dataset.book);
            }
        });
    }
    
    // Get header height for threshold calculation
    const getHeaderBottom = () => {
        const bottom = header ? header.getBoundingClientRect().bottom : 60;
        return bottom;
    };
    
    // Track scroll events for mobile debugging
    let scrollEventCount = 0;
    
    // Scroll handler
    const onScroll = () => {
        const headerBottom = getHeaderBottom();
        
        // Log periodically on mobile for debugging
        if (isMobile) {
            scrollEventCount++;
            if (scrollEventCount <= 5 || scrollEventCount % 50 === 0) {
                console.log(logPrefix, `Scroll event #${scrollEventCount}, headerBottom: ${headerBottom.toFixed(0)}, scrollY: ${window.scrollY.toFixed(0)}`);
            }
        }
        
        let shouldShow = false;
        let activeTestament = '';
        let activeGrouping = '';
        let activeBook = '';
        
        // Check each section header
        sectionHeaders.forEach(sh => {
            const rect = sh.getBoundingClientRect();
            
            // If this header is at or above the header bottom, it has scrolled past
            if (rect.top <= headerBottom) {
                shouldShow = true;
                
                // Extract data from this header
                const t = sh.dataset.testament;
                const g = sh.dataset.grouping;
                const b = sh.dataset.book;
                
                // Update active values (later headers override earlier ones)
                if (t) activeTestament = t;
                if (g) activeGrouping = g;
                if (b) activeBook = b;
            }
        });
        
        // Show or hide the breadcrumb row
        if (shouldShow && !breadcrumbVisible) {
            headerBreadcrumb.classList.add('visible');
            breadcrumbVisible = true;
            console.log(logPrefix, 'Breadcrumb row shown');
        } else if (!shouldShow && breadcrumbVisible) {
            headerBreadcrumb.classList.remove('visible');
            breadcrumbVisible = false;
            console.log(logPrefix, 'Breadcrumb row hidden');
        }
        
        // Update breadcrumb text if values changed
        if (shouldShow && (
            activeTestament !== currentBreadcrumbState.testament ||
            activeGrouping !== currentBreadcrumbState.grouping ||
            activeBook !== currentBreadcrumbState.book
        )) {
            updateBreadcrumbText(activeTestament, activeGrouping, activeBook);
        }
    };
    
    // Throttled scroll handler
    let ticking = false;
    window._breadcrumbScrollHandler = () => {
        if (!ticking) {
            requestAnimationFrame(() => {
                onScroll();
                ticking = false;
            });
            ticking = true;
        }
    };
    
    // Add both scroll and touchmove listeners for iOS compatibility
    window.addEventListener('scroll', window._breadcrumbScrollHandler, { passive: true });
    window.addEventListener('touchmove', window._breadcrumbScrollHandler, { passive: true });
    
    console.log(logPrefix, 'Scroll and touchmove listeners attached');
    
    // Initial check
    console.log(logPrefix, 'Running initial scroll check...');
    onScroll();
    console.log(logPrefix, 'Setup complete');
}

function updateBreadcrumbText(testament, grouping, book) {
    currentBreadcrumbState = { testament, grouping, book };
    
    const testamentEl = document.getElementById('breadcrumbTestament');
    const groupingEl = document.getElementById('breadcrumbGrouping');
    const bookEl = document.getElementById('breadcrumbBook');
    const countEl = document.getElementById('breadcrumbCount');
    const sep1 = document.getElementById('breadcrumbSep1');
    const sep2 = document.getElementById('breadcrumbSep2');
    
    // Testament - always show
    if (testamentEl) {
        testamentEl.textContent = testament || '';
    }
    
    // Grouping
    if (groupingEl && sep1) {
        if (grouping) {
            groupingEl.textContent = grouping;
            groupingEl.style.display = 'inline';
            sep1.style.display = 'inline';
        } else {
            groupingEl.style.display = 'none';
            sep1.style.display = 'none';
        }
    }
    
    // Book
    if (bookEl && sep2) {
        if (book) {
            bookEl.textContent = book;
            bookEl.style.display = 'inline';
            sep2.style.display = 'inline';
        } else {
            bookEl.style.display = 'none';
            sep2.style.display = 'none';
        }
    }
    
    // Count
    if (countEl) {
        countEl.textContent = `${filteredStories.length} stories`;
    }
    
    console.log('[GRACE] Breadcrumb text:', testament, '›', grouping, '›', book);
}

// Old setInitialBreadcrumb removed - now handled in setupUnifiedBreadcrumb

// Old updateBreadcrumb removed - now using updateBreadcrumbDisplay

function setupBreadcrumbClicks() {
    const testamentEl = document.getElementById('breadcrumbTestament');
    const groupingEl = document.getElementById('breadcrumbGrouping');
    
    if (testamentEl) {
        testamentEl.addEventListener('click', () => {
            const testament = currentBreadcrumbState.testament;
            if (testament) {
                // Set testament filter
                const testamentValue = testament === 'Old Testament' ? 'OT' : 'NT';
                currentFilters.testament = testamentValue;
                currentFilters.grouping = 'all';
                currentFilters.book = 'all';
                
                // Update UI
                document.querySelectorAll('#testamentFilter .segment').forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.value === testamentValue);
                });
                
                // Show grouping slider, hide book slider
                populateGroupingSlider(testamentValue);
                document.getElementById('bookFilterRow')?.classList.remove('visible');
                
                applyFilters();
            }
        });
    }
    
    if (groupingEl) {
        groupingEl.addEventListener('click', () => {
            const grouping = currentBreadcrumbState.grouping;
            if (grouping) {
                // Determine testament from grouping
                const otGroupings = ['Torah', 'History', 'Poetry', 'Prophets'];
                const testamentValue = otGroupings.includes(grouping) ? 'OT' : 'NT';
                
                currentFilters.testament = testamentValue;
                currentFilters.grouping = grouping;
                currentFilters.book = 'all';
                
                // Update UI
                document.querySelectorAll('#testamentFilter .segment').forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.value === testamentValue);
                });
                
                // Show grouping slider with selection, hide book slider
                populateGroupingSlider(testamentValue);
                document.querySelectorAll('#groupingFilter .segment').forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.value === grouping);
                });
                populateBookSlider(grouping);
                
                applyFilters();
            }
        });
    }
}

function hideBreadcrumb() {
    const headerBreadcrumb = document.getElementById('headerBreadcrumb');
    if (headerBreadcrumb) {
        headerBreadcrumb.classList.remove('visible');
        breadcrumbVisible = false;
    }
    if (window._breadcrumbScrollHandler) {
        window.removeEventListener('scroll', window._breadcrumbScrollHandler);
        window._breadcrumbScrollHandler = null;
    }
}

function updateStats() {
    const total = allStories.length;
    const complete = allStories.filter(s => s.status_text === 'done' && s.status_image === 'done').length;
    const pending = total - complete;
    
    const totalEl = document.getElementById('totalCount');
    const completeEl = document.getElementById('completeCount');
    const pendingEl = document.getElementById('pendingCount');
    
    if (totalEl) totalEl.textContent = total;
    if (completeEl) completeEl.textContent = complete;
    if (pendingEl) pendingEl.textContent = pending;
}

// ============================================================================
// Story Page
// ============================================================================

let currentStory = null;
let storyList = [];
let showingGrid = false;
let storyAuthUnsubscribe = null; // Store unsubscribe function for auth listener cleanup

async function initStoryPage(storyId, navigationId) {
    // Get storyId from parameter or fall back to URL params (for direct links)
    if (!storyId) {
        const urlParams = new URLSearchParams(window.location.search);
        storyId = urlParams.get('id');
    }
    
    // Also check hash route
    if (!storyId && window.GraceRouter) {
        storyId = window.GraceRouter.getCurrentStoryId();
    }
    
    if (!storyId) {
        showError();
        return;
    }
    
    // Initialize authentication (only once)
    if (window.GraceAuth && !window.GraceAuth.getCurrentUser()) {
        await window.GraceAuth.initAuth();
        window.GraceAuth.setupAuthModal();
    }
    
    // Check if this navigation is stale (user navigated elsewhere)
    if (navigationId && navigationId !== currentNavigationId) {
        console.log('[GRACE] Stale navigation detected, aborting story load');
        return;
    }
    
    // Setup story auth controls
    setupStoryAuthControls();
    
    // Listen for auth state changes (store unsubscribe for cleanup)
    if (window.GraceAuth) {
        storyAuthUnsubscribe = window.GraceAuth.onAuthStateChange(handleStoryAuthStateChange);
    }
    
    // Load all stories for navigation
    await loadStoryList();
    
    // Check again after async operation
    if (navigationId && navigationId !== currentNavigationId) {
        console.log('[GRACE] Stale navigation detected after story list load');
        return;
    }
    
    // Load the specific story
    await loadStory(storyId, navigationId);
    
    // Setup navigation
    setupStoryNavigation();
    setupKeyboardNavigation();
    setupScrollIndicator();
    
    // Setup audio narration
    setupAudioControls();
    
    // Setup favorite button
    setupFavoriteButton();
    
    // Setup library button click handler
    setupLibraryButton();
    
    // Setup read button click handler
    setupReadButton();
    
    // Setup share button
    setupShareButton();
    
    // Setup read tracking (auto-mark on scroll)
    setupReadTracking();
}

/**
 * Setup auth controls specific to story view
 */
function setupStoryAuthControls() {
    const signInBtn = document.getElementById('storySignInBtn');
    const settingsBtn = document.getElementById('storySettingsBtn');
    
    if (signInBtn) {
        signInBtn.addEventListener('click', () => {
            window.GraceAuth?.showAuthModal();
        });
    }
    
    // Update visibility based on auth state
    if (window.GraceAuth?.isAuthenticated()) {
        if (signInBtn) signInBtn.style.display = 'none';
        if (settingsBtn) settingsBtn.style.display = 'flex';
    } else {
        if (signInBtn) signInBtn.style.display = 'inline-flex';
        if (settingsBtn) settingsBtn.style.display = 'none';
    }
}

async function loadStoryList() {
    try {
        // Add timeout to prevent hanging in PWA mode
        const timeoutMs = 5000;
        const supabasePromise = supabase
            .from('grahams_devotional_spreads')
            .select('spread_code, title, book, start_chapter, start_verse');
        
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Story list load timeout')), timeoutMs)
        );
        
        const { data, error } = await Promise.race([supabasePromise, timeoutPromise]);
        
        if (error) throw error;
        
        storyList = sortStoriesChronologically(data || []);
    } catch (err) {
        console.warn('[Story] Supabase story list failed, trying fallback:', err.message);
        
        // Try loading from fallback JSON
        try {
            const response = await fetch('data/all-spreads.json?v=3');
            if (response.ok) {
                const json = await response.json();
                if (json.spreads?.length > 0) {
                    storyList = sortStoriesChronologically(json.spreads.map(s => ({
                        spread_code: s.spread_code,
                        title: s.title,
                        book: s.book,
                        start_chapter: s.start_chapter,
                        start_verse: s.start_verse
                    })));
                    console.log('[Story] Story list loaded from fallback:', storyList.length);
                    return;
                }
            }
        } catch (fallbackErr) {
            console.error('[Story] Fallback also failed:', fallbackErr);
        }
        
        storyList = [];
    }
}

async function loadStory(storyId, navigationId) {
    try {
        let story = null;
        
        // If offline, try to load from cache/library first
        if (window.GraceOffline?.isOffline()) {
            story = await window.GraceOffline.getOfflineStory(storyId);
            if (!story) {
                showError('This story is not available offline.');
                return;
            }
        } else {
            // Online: fetch from Supabase with timeout
            const timeoutMs = 5000;
            const supabasePromise = supabase
                .from('grahams_devotional_spreads')
                .select('*')
                .eq('spread_code', storyId)
                .single();
            
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Story load timeout')), timeoutMs)
            );
            
            try {
                const { data, error } = await Promise.race([supabasePromise, timeoutPromise]);
                
                if (error || !data) {
                    throw new Error(error?.message || 'No data returned');
                }
                
                story = data;
                // Cache the story for future offline access (async, don't block)
                window.GraceOffline?.cacheStory(story);
            } catch (supabaseErr) {
                console.warn('[Story] Supabase failed, trying fallback:', supabaseErr.message);
                
                // Try offline cache first
                story = await window.GraceOffline?.getOfflineStory(storyId);
                
                // If not in cache, try loading from fallback JSON
                if (!story) {
                    try {
                        const response = await fetch('data/all-spreads.json?v=3');
                        if (response.ok) {
                            const json = await response.json();
                            const fallbackStory = json.spreads?.find(s => s.spread_code === storyId);
                            if (fallbackStory) {
                                // Map fallback data to match expected schema
                                story = {
                                    ...fallbackStory,
                                    kjv_passage_ref: fallbackStory.kjv_key_verse_ref || `${fallbackStory.book} ${fallbackStory.start_chapter}:${fallbackStory.start_verse}`,
                                    status_text: 'done',
                                    status_image: 'done'
                                };
                                console.log('[Story] Loaded from fallback JSON:', storyId);
                            }
                        }
                    } catch (fallbackErr) {
                        console.error('[Story] Fallback JSON also failed:', fallbackErr);
                    }
                }
                
                if (!story) {
                    showError();
                    return;
                }
            }
        }
        
        // Final stale navigation check before rendering
        if (navigationId && navigationId !== currentNavigationId) {
            console.log('[GRACE] Stale navigation detected, not rendering story');
            return;
        }
        
        currentStory = story;
        window._currentStory = story; // Expose for curation mode
        currentStoryIndex = storyList.findIndex(s => s.spread_code === storyId);
        
        // Use dedicated curation view when in curation mode
        if (curationMode.active) {
            renderCurationView(story);
        } else {
            renderStory(story);
            updateNavPosition();
            
            // Trigger smart prefetch for adjacent stories (non-blocking)
            if (window.GraceOffline?.prefetchAdjacentStories && filteredStories?.length > 0) {
                window.GraceOffline.prefetchAdjacentStories(story.spread_code, filteredStories, 2);
            }
        }
        
    } catch (err) {
        console.error('Error loading story:', err);
        // Try offline as last resort
        const offlineStory = await window.GraceOffline?.getOfflineStory(storyId);
        if (offlineStory) {
            currentStory = offlineStory;
            window._currentStory = offlineStory;
            currentStoryIndex = storyList.findIndex(s => s.spread_code === storyId);
            
            if (curationMode.active) {
                renderCurationView(offlineStory);
            } else {
                renderStory(offlineStory);
                updateNavPosition();
                
                // Trigger smart prefetch for adjacent stories (non-blocking)
                if (window.GraceOffline?.prefetchAdjacentStories && filteredStories?.length > 0) {
                    window.GraceOffline.prefetchAdjacentStories(offlineStory.spread_code, filteredStories, 2);
                }
            }
        } else {
            showError();
        }
    }
}

function renderStory(story) {
    const container = document.getElementById('bookStory');
    const template = document.getElementById('storyTemplate');
    
    if (!container || !template) return;
    
    // Clone and populate template
    const content = template.content.cloneNode(true);
    
    // Set title
    content.getElementById('storyTitle').textContent = story.title || 'Untitled Story';
    
    // Set verse range with Bible Gateway link
    const verseRangeEl = content.getElementById('verseRange');
    verseRangeEl.textContent = story.kjv_passage_ref || '';
    const bibleGatewayUrl = getBibleGatewayUrl(story.kjv_passage_ref);
    if (bibleGatewayUrl) {
        verseRangeEl.href = bibleGatewayUrl;
    }
    
    // Set key verse (use correct database field names)
    // Wrap in audio-segment for narration sync
    const keyVerseTextEl = content.getElementById('keyVerseText');
    const keyVerseRefEl = content.getElementById('keyVerseRef');
    // Strip ** markdown from key verse text
    const keyVerseText = (story.kjv_key_verse_text || '').replace(/\*\*/g, '');
    let audioSegmentIndex = 0;
    if (keyVerseText) {
        // Wrap key verse in audio-segment span
        keyVerseTextEl.innerHTML = `<span class="audio-segment" data-audio-index="${audioSegmentIndex}">${keyVerseText}</span>`;
        keyVerseRefEl.textContent = story.kjv_key_verse_ref ? `— ${story.kjv_key_verse_ref}` : '';
        audioSegmentIndex++;
    } else {
        keyVerseTextEl.parentElement.style.display = 'none';
    }
    
    // Set summary text (use correct database field name: paraphrase_text)
    // Each paragraph is wrapped in audio-segment for narration sync
    const summaryEl = content.getElementById('summaryText');
    if (story.paraphrase_text) {
        // Split into paragraphs if there are double line breaks
        const paragraphs = story.paraphrase_text.split(/\n\n+/).filter(p => p.trim());
        // Convert **bold** markdown to KJV quote styling, wrap each in audio-segment
        const formattedParagraphs = paragraphs.map((p, idx) => {
            const formatted = p.trim().replace(/\*\*(.+?)\*\*/g, '<span class="kjv-quote">$1</span>');
            return `<p><span class="audio-segment" data-audio-index="${audioSegmentIndex + idx}">${formatted}</span></p>`;
        });
        summaryEl.innerHTML = formattedParagraphs.join('');
    } else {
        summaryEl.innerHTML = '<p class="placeholder"><em>Summary not yet generated</em></p>';
    }
    
    // Set footer info
    content.getElementById('storyCode').textContent = story.spread_code || '';
    content.getElementById('batchInfo').textContent = story.spread_code || '';
    
    // Clear and render
    container.innerHTML = '';
    container.appendChild(content);
    
    // Render images
    renderImages(story);
    
    // Update page title
    document.title = `${story.title || 'Story'} | The Graham Bible`;
    
    // Update Open Graph meta tags for sharing
    updateOpenGraphTags(story);
}

async function renderImages(story) {
    const container = document.getElementById('imageContainer');
    if (!container) return;
    
    // Collect available candidate images
    const candidateImages = [
        story.image_url_1,
        story.image_url_2,
        story.image_url_3,
        story.image_url_4
    ];
    const hasCandidates = candidateImages.some(url => url && url.trim());
    
    // Get global primary using slot-based model
    const globalSlot = story.primary_slot || 1;
    const globalPrimaryUrl = candidateImages[globalSlot - 1] || null;
    
    // Check for user's personal primary image selection
    let userPrimarySlot = null;
    let userPrimaryUrl = null;
    const isLoggedIn = window.GraceAuth?.isAuthenticated() || false;
    
    if (isLoggedIn) {
        // For logged-in users, check if they have a personal selection
        userPrimarySlot = await window.GraceAuth.getUserPrimaryImage(story.spread_code);
        if (userPrimarySlot && candidateImages[userPrimarySlot - 1]) {
            userPrimaryUrl = candidateImages[userPrimarySlot - 1];
        }
        // If no personal selection, userPrimaryUrl stays null - they'll see the grid
    }
    
    // Store for use in other functions
    window._currentUserPrimarySlot = userPrimarySlot;
    window._currentGlobalPrimarySlot = globalSlot;
    
    // Check if we should show grid or single image
    if (!hasCandidates) {
        container.innerHTML = `
            <div class="placeholder" style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--color-charcoal-light);">
                <em>No images generated</em>
            </div>
        `;
        return;
    }
    
    // Determine what to show:
    // - Logged OUT: Show single image (global primary)
    // - Logged IN without personal selection: Show grid so they can choose
    // - Logged IN with personal selection: Show their selection (unless manually toggled to grid)
    if (!isLoggedIn && globalPrimaryUrl && !showingGrid) {
        // Logged out - show global primary as single image
        renderSingleImage(container, globalPrimaryUrl, story.title, hasCandidates, null);
    } else if (isLoggedIn && userPrimarySlot && userPrimaryUrl && !showingGrid) {
        // Logged in WITH personal selection - show their selection
        renderSingleImage(container, userPrimaryUrl, story.title, hasCandidates, userPrimarySlot);
    } else if (hasCandidates) {
        // Show grid: logged in without selection, or manually toggled to grid
        renderImageGrid(container, candidateImages, globalPrimaryUrl, userPrimarySlot);
    } else if (globalPrimaryUrl) {
        // Fallback to global primary
        renderSingleImage(container, globalPrimaryUrl, story.title, false, null);
    }
}

function renderSingleImage(container, imageUrl, title, canExpand, userPrimarySlot = null) {
    const template = document.getElementById('singleImageTemplate');
    if (!template) {
        container.innerHTML = `<div class="single-image"><img src="${imageUrl}" alt="${title}"></div>`;
        return;
    }
    
    const content = template.content.cloneNode(true);
    const img = content.getElementById('selectedImage');
    img.src = imageUrl;
    img.alt = title || 'Story illustration';
    
    // Update badge text based on whether it's user's selection or global
    const badge = content.querySelector('.primary-badge');
    if (badge) {
        if (userPrimarySlot) {
            badge.textContent = '✓ My Selection';
            badge.classList.add('user-selection');
        } else {
            badge.textContent = '✓ Primary';
        }
    }
    
    container.innerHTML = '';
    container.appendChild(content);
    
    // Setup expand button
    const expandBtn = document.getElementById('expandOptionsBtn');
    if (expandBtn && canExpand) {
        expandBtn.style.display = 'flex';
        expandBtn.addEventListener('click', () => {
            showingGrid = true;
            renderImages(currentStory);
        });
    } else if (expandBtn) {
        expandBtn.style.display = 'none';
    }
}

function renderImageGrid(container, candidateImages, globalPrimaryUrl, userPrimarySlot = null) {
    const template = document.getElementById('gridImageTemplate');
    if (!template) return;
    
    const content = template.content.cloneNode(true);
    container.innerHTML = '';
    container.appendChild(content);
    
    const isAuthenticated = window.GraceAuth?.isAuthenticated() || false;
    const isAdmin = window.GraceAuth?.isAdmin() || false;
    
    // Get global primary slot from story (now slot-based, not URL)
    const globalPrimarySlot = currentStory?.primary_slot || 1;
    
    // Determine what primary to show (user's or global)
    const userPrimaryUrl = userPrimarySlot ? candidateImages[userPrimarySlot - 1] : null;
    const displayPrimaryUrl = userPrimaryUrl || globalPrimaryUrl;
    
    // Update header text based on auth state
    const selectionTitle = container.querySelector('.selection-title');
    const collapseBtn = document.getElementById('collapseBtn');
    
    if (selectionTitle) {
        if (isAdmin) {
            selectionTitle.textContent = 'Select Primary Image (Admin)';
        } else if (isAuthenticated) {
            selectionTitle.textContent = 'Choose My Primary Image';
        } else {
            selectionTitle.textContent = 'View Image Options';
        }
    }
    
    if (displayPrimaryUrl && collapseBtn) {
        collapseBtn.style.display = 'flex';
        collapseBtn.addEventListener('click', () => {
            showingGrid = false;
            renderImages(currentStory);
        });
    }
    
    // Populate images
    const gridImages = container.querySelectorAll('.grid-image');
    gridImages.forEach((gridImage, index) => {
        const img = gridImage.querySelector('img');
        const imageUrl = candidateImages[index];
        const slot = index + 1;
        
        if (imageUrl && imageUrl.trim()) {
            // Use thumbnails in grid view (90% smaller, ~50KB vs 500KB)
            // Full-res only loads in single image view
            img.src = getThumbnailUrl(imageUrl);
            img.alt = `${currentStory?.title || 'Story'} - Option ${slot}`;
            
            // Check if this is global primary (now slot-based comparison)
            const isGlobalPrimary = globalPrimarySlot === slot;
            // Check if this is user's primary
            const isUserPrimary = userPrimarySlot === slot;
            
            // Update styling
            if (isUserPrimary) {
                gridImage.classList.add('is-user-primary');
            }
            if (isGlobalPrimary) {
                gridImage.classList.add('is-global-primary');
            }
            if (isUserPrimary || (isGlobalPrimary && !userPrimarySlot)) {
                gridImage.classList.add('is-primary');
            }
            
            // Update overlay text based on state
            const selectLabel = gridImage.querySelector('.select-label');
            if (selectLabel) {
                if (isAdmin) {
                    if (isGlobalPrimary) {
                        selectLabel.textContent = '✓ Global Default';
                    } else {
                        selectLabel.textContent = 'Set as Global Default';
                    }
                } else if (isAuthenticated) {
                    if (isUserPrimary) {
                        selectLabel.textContent = '✓ My Selection';
                    } else {
                        selectLabel.textContent = 'Set as My Primary';
                    }
                } else {
                    selectLabel.textContent = 'Sign in to select';
                }
            }
            
            // Add badges
            if (isGlobalPrimary && isAdmin) {
                const adminBadge = document.createElement('div');
                adminBadge.className = 'admin-badge';
                adminBadge.textContent = 'Global Default';
                gridImage.appendChild(adminBadge);
            }
            if (isUserPrimary) {
                const userBadge = document.createElement('div');
                userBadge.className = 'user-primary-badge';
                userBadge.textContent = 'My Selection';
                gridImage.appendChild(userBadge);
            }
            
            // Click to select as primary
            gridImage.addEventListener('click', (e) => {
                if (!e.target.closest('.regen-btn')) {
                    e.preventDefault();
                    e.stopPropagation();
                    handleImageSelection(slot, imageUrl);
                }
            });
        } else {
            gridImage.style.display = 'none';
        }
    });
    
    // Setup regeneration buttons (admin only)
    setupRegenerationButtons();
    updateAdminUI();
}

// Provide haptic feedback on supported devices
function hapticFeedback(type = 'light') {
    if ('vibrate' in navigator) {
        const patterns = {
            light: 10,
            medium: 20,
            heavy: 30,
            success: [10, 50, 10],
            error: [50, 30, 50]
        };
        navigator.vibrate(patterns[type] || patterns.light);
    }
}

/**
 * Handle image selection based on user role
 */
async function handleImageSelection(slot, imageUrl) {
    if (!currentStory) return;
    
    const isAuthenticated = window.GraceAuth?.isAuthenticated() || false;
    const isAdmin = window.GraceAuth?.isAdmin() || false;
    
    if (!isAuthenticated) {
        // Prompt to sign in
        window.GraceAuth?.showAuthModal();
        return;
    }
    
    if (isAdmin) {
        // Admin sets global default (now slot-based)
        await setGlobalPrimaryImage(slot);
    } else {
        // Regular user sets personal primary
        await setUserPrimaryImage(slot);
    }
}

/**
 * Set global primary image (ADMIN only)
 * Now uses slot number instead of URL - can never become orphaned
 */
async function setGlobalPrimaryImage(slot) {
    if (!currentStory) return;
    
    // Skip if this slot is already the global primary
    if (currentStory.primary_slot === slot) {
        showToast('This is already the global default');
        showingGrid = false;
        renderImages(currentStory);
        return;
    }
    
    // Haptic feedback on selection
    hapticFeedback('light');
    
    try {
        const { error } = await supabase
            .from('grahams_devotional_spreads')
            .update({ primary_slot: slot })
            .eq('spread_code', currentStory.spread_code);
        
        if (error) throw error;
        
        // Update local state
        currentStory.primary_slot = slot;
        
        // Success haptic
        hapticFeedback('success');
        
        // Show toast
        showToast('✓ Global default updated');
        
        // Switch to single view
        showingGrid = false;
        renderImages(currentStory);
        
    } catch (err) {
        console.error('Error saving global primary image:', err);
        showToast(getUserFriendlyError(err, 'image'), true);
    }
}

/**
 * Set user's personal primary image selection
 */
async function setUserPrimaryImage(slot) {
    if (!currentStory) return;
    
    // Skip if this is already user's selection
    if (window._currentUserPrimarySlot === slot) {
        showToast('This is already your selection');
        showingGrid = false;
        renderImages(currentStory);
        return;
    }
    
    // Haptic feedback on selection
    hapticFeedback('light');
    
    try {
        const success = await window.GraceAuth.setUserPrimaryImage(currentStory.spread_code, slot);
        
        if (!success) throw new Error('Failed to save');
        
        // Update local state
        window._currentUserPrimarySlot = slot;
        
        // Update the userPrimaryImages map so home page thumbnails will show the new selection
        userPrimaryImages.set(currentStory.spread_code, slot);
        
        // Set flag so home page knows to refresh
        sessionStorage.setItem('grace-user-data-changed', 'true');
        
        // Success haptic
        hapticFeedback('success');
        
        // Show toast
        showToast('✓ My primary image saved');
        
        // Switch to single view
        showingGrid = false;
        renderImages(currentStory);
        
    } catch (err) {
        console.error('Error saving user primary image:', err);
        showToast(getUserFriendlyError(err, 'image'), true);
    }
}

/**
 * Legacy function - redirects to role-based handler
 */
async function selectPrimaryImage(imageUrl) {
    // Find slot number from URL
    const candidateImages = [
        currentStory.image_url_1,
        currentStory.image_url_2,
        currentStory.image_url_3,
        currentStory.image_url_4
    ];
    const slot = candidateImages.findIndex(url => url === imageUrl) + 1;
    
    if (slot > 0) {
        await handleImageSelection(slot, imageUrl);
    }
}

/**
 * Update image selection labels based on auth state
 */
function updateImageSelectionLabels() {
    const isAuthenticated = window.GraceAuth?.isAuthenticated() || false;
    const isAdmin = window.GraceAuth?.isAdmin() || false;
    
    const selectLabels = document.querySelectorAll('.select-label');
    selectLabels.forEach(label => {
        const gridImage = label.closest('.grid-image');
        if (!gridImage) return;
        
        const isUserPrimary = gridImage.classList.contains('is-user-primary');
        const isGlobalPrimary = gridImage.classList.contains('is-global-primary');
        
        if (isAdmin) {
            if (isGlobalPrimary) {
                label.textContent = '✓ Global Default';
            } else {
                label.textContent = 'Set as Global Default';
            }
        } else if (isAuthenticated) {
            if (isUserPrimary) {
                label.textContent = '✓ My Selection';
            } else {
                label.textContent = 'Set as My Primary';
            }
        } else {
            label.textContent = 'Sign in to select';
        }
    });
}

function setupRegenerationButtons() {
    const regenBtns = document.querySelectorAll('.regen-btn');
    const isAdmin = window.GraceAuth?.isAdmin() || false;
    
    regenBtns.forEach(btn => {
        // Only show for admins
        btn.style.display = isAdmin ? '' : 'none';
        
        // Remove any existing listeners (prevents duplicates)
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        
        newBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            
            // Double-check admin status
            if (!window.GraceAuth?.isAdmin()) {
                showToast('Admin access required', true);
                return;
            }
            
            const slot = parseInt(newBtn.dataset.slot);
            triggerRegeneration(slot);
        });
    });
}

// ============================================================================
// Image Regeneration
// ============================================================================

let activeRegenerationRequest = null;
let regenerationPollInterval = null;
let countdownInterval = null;
let countdownStartTime = null;

// Estimated regeneration time in seconds (based on execution 815: 86s, rounded up)
const ESTIMATED_REGEN_TIME = 90;

// Stage definitions for countdown display
const REGEN_STAGES = [
    { maxSeconds: 15, text: 'Analyzing passage...' },
    { maxSeconds: 30, text: 'Generating prompts...' },
    { maxSeconds: 80, text: 'Creating images...' },
    { maxSeconds: 90, text: 'Finalizing...' }
];

async function triggerRegeneration(slot) {
    // Admin-only check
    if (!window.GraceAuth?.isAdmin()) {
        showToast('Admin access required', true);
        return;
    }
    
    if (!currentStory) {
        showToast('No story loaded', true);
        return;
    }
    
    const spreadCode = currentStory.spread_code;
    
    // Show the regeneration modal
    showRegenerationModal(slot);
    
    try {
        // Get webhook URL from config
        const webhookUrl = window.N8N_CONFIG?.webhookUrl;
        if (!webhookUrl) {
            throw new Error('n8n webhook URL not configured');
        }
        
        console.log('[Graham] Triggering regeneration:', { spreadCode, slot, webhookUrl });
        
        // Trigger the n8n workflow
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                spread_code: spreadCode,
                slot: slot
            })
        });
        
        console.log('[Graham] Webhook response status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('[Graham] Webhook error response:', errorText);
            throw new Error(`Webhook failed: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('[Graham] Webhook response data:', result);
        
        if (!result.request_id) {
            console.error('[Graham] No request_id in response:', result);
            throw new Error('No request_id returned from webhook');
        }
        
        activeRegenerationRequest = result.request_id;
        
        // Start polling for results
        startRegenerationPolling(result.request_id, slot);
        
    } catch (err) {
        console.error('[Graham] Error triggering regeneration:', err);
        showToast('Failed to start regeneration', true);
        hideRegenerationModal();
    }
}

function showRegenerationModal(slot) {
    const modalTemplate = document.getElementById('regenerationModalTemplate');
    if (!modalTemplate) return;
    
    const modalContent = modalTemplate.content.cloneNode(true);
    
    // Set the slot number in the modal
    const slotSpan = modalContent.getElementById('regenSlotNumber');
    if (slotSpan) slotSpan.textContent = slot;
    
    // Setup cancel button
    const cancelBtn = modalContent.getElementById('cancelRegenBtn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', cancelRegeneration);
    }
    
    // Add modal to page
    document.body.appendChild(modalContent);
    
    // Start the countdown timer
    startCountdown();
}

function startCountdown() {
    countdownStartTime = Date.now();
    const circumference = 2 * Math.PI * 45; // radius = 45
    
    // Update immediately, then every second
    updateCountdown();
    countdownInterval = setInterval(updateCountdown, 1000);
    
    function updateCountdown() {
        const elapsed = (Date.now() - countdownStartTime) / 1000;
        const remaining = Math.max(0, ESTIMATED_REGEN_TIME - elapsed);
        const progress = Math.min(1, elapsed / ESTIMATED_REGEN_TIME);
        
        // Update progress ring
        const ring = document.getElementById('progressRingFill');
        if (ring) {
            ring.style.strokeDashoffset = circumference * (1 - progress);
        }
        
        // Update countdown text
        const countdownText = document.getElementById('countdownText');
        if (countdownText) {
            if (remaining > 0) {
                const mins = Math.floor(remaining / 60);
                const secs = Math.ceil(remaining % 60);
                countdownText.textContent = `~${mins}:${secs.toString().padStart(2, '0')}`;
            } else {
                countdownText.textContent = '...';
            }
        }
        
        // Update stage text
        const stageText = document.getElementById('stageText');
        if (stageText) {
            if (elapsed > ESTIMATED_REGEN_TIME) {
                stageText.textContent = 'Almost ready...';
                stageText.classList.add('overtime');
            } else {
                const stage = REGEN_STAGES.find(s => elapsed < s.maxSeconds) || REGEN_STAGES[REGEN_STAGES.length - 1];
                stageText.textContent = stage.text;
                stageText.classList.remove('overtime');
            }
        }
    }
}

function startRegenerationPolling(requestId, slot) {
    // Poll every 3 seconds for up to 5 minutes
    let pollCount = 0;
    const maxPolls = 100; // 5 minutes at 3 second intervals
    
    console.log('[Graham] Starting regeneration polling for request:', requestId);
    
    regenerationPollInterval = setInterval(async () => {
        pollCount++;
        
        if (pollCount > maxPolls) {
            clearInterval(regenerationPollInterval);
            console.warn('[Graham] Regeneration timed out after 5 minutes');
            showToast('Regeneration timed out', true);
            hideRegenerationModal();
            return;
        }
        
        try {
            const { data, error } = await supabase
                .from('regeneration_requests')
                .select('status, option_urls')
                .eq('id', requestId)
                .single();
            
            if (error) {
                console.error('[Graham] Polling query error:', error);
                throw error;
            }
            
            console.log('[Graham] Poll #' + pollCount + ' status:', data?.status);
            
            if (data.status === 'ready' && data.option_urls?.length > 0) {
                clearInterval(regenerationPollInterval);
                console.log('[Graham] Regeneration complete, showing options');
                showRegenerationOptions(data.option_urls, slot, requestId);
            } else if (data.status === 'cancelled' || data.status === 'error') {
                clearInterval(regenerationPollInterval);
                console.error('[Graham] Regeneration failed with status:', data.status);
                showToast('Regeneration failed', true);
                hideRegenerationModal();
            }
            // Continue polling if status is still 'processing'
            
        } catch (err) {
            console.error('[Graham] Error polling regeneration status:', err);
            // Continue polling on error
        }
    }, 3000);
}

function showRegenerationOptions(optionUrls, slot, requestId) {
    // Stop the countdown
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    
    // Hide countdown container, show options grid
    const countdownContainer = document.getElementById('countdownContainer');
    const optionsGrid = document.getElementById('newImageOptionsGrid');
    
    if (countdownContainer) countdownContainer.style.display = 'none';
    if (!optionsGrid) return;
    
    optionsGrid.style.display = 'grid';
    
    // Clear skeleton loaders and add actual images
    optionsGrid.innerHTML = optionUrls.map((url, index) => `
        <div class="new-image-option" data-url="${url}" data-index="${index + 1}">
            <img src="${url}" alt="Option ${index + 1}">
            <span class="option-number">${index + 1}</span>
        </div>
    `).join('');
    
    // Add click handlers to select an option
    let selectedUrl = null;
    optionsGrid.querySelectorAll('.new-image-option').forEach(div => {
        div.addEventListener('click', () => {
            // Remove selection from all
            optionsGrid.querySelectorAll('.new-image-option').forEach(d => d.classList.remove('selected'));
            // Add selection to clicked
            div.classList.add('selected');
            selectedUrl = div.dataset.url;
            
            // Show the select button
            const selectBtn = document.getElementById('selectNewImageBtn');
            if (selectBtn) {
                selectBtn.style.display = 'inline-flex';
                selectBtn.onclick = () => confirmRegeneration(selectedUrl, slot, requestId);
            }
        });
    });
    
    // Update modal text
    const modalContent = document.querySelector('.modal-content');
    if (modalContent) {
        const heading = modalContent.querySelector('h2');
        const desc = modalContent.querySelector('p');
        if (heading) heading.textContent = 'Select New Image';
        if (desc) desc.textContent = `Choose one of the 4 newly generated images to replace slot ${slot}.`;
    }
}

async function confirmRegeneration(imageUrl, slot, requestId) {
    if (!currentStory || !imageUrl) return;
    
    const spreadCode = currentStory.spread_code;
    
    try {
        // Update the specific image_url_X slot in the spreads table
        const updateField = `image_url_${slot}`;
        const { error: updateError } = await supabase
            .from('grahams_devotional_spreads')
            .update({ [updateField]: imageUrl })
            .eq('spread_code', spreadCode);
        
        if (updateError) throw updateError;
        
        // Update regeneration request status
        await supabase
            .from('regeneration_requests')
            .update({ 
                status: 'selected',
                selected_url: imageUrl 
            })
            .eq('id', requestId);
        
        // Update local data
        currentStory[updateField] = imageUrl;
        
        showToast(`✓ Image ${slot} replaced`);
        hideRegenerationModal();
        
        // Re-render the images
        showingGrid = true;
        renderImages(currentStory);
        
    } catch (err) {
        console.error('Error confirming regeneration:', err);
        showToast(getUserFriendlyError(err, 'image'), true);
    }
}

function cancelRegeneration() {
    // Clear all intervals
    if (regenerationPollInterval) {
        clearInterval(regenerationPollInterval);
        regenerationPollInterval = null;
    }
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    
    // Update request status to cancelled if we have one
    if (activeRegenerationRequest) {
        supabase
            .from('regeneration_requests')
            .update({ status: 'cancelled' })
            .eq('id', activeRegenerationRequest)
            .then(() => {})
            .catch(err => console.warn('Could not cancel request:', err));
    }
    
    activeRegenerationRequest = null;
    hideRegenerationModal();
}

function hideRegenerationModal() {
    // Clear countdown interval
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    
    const modal = document.querySelector('.modal-overlay');
    if (modal) {
        modal.remove();
    }
    activeRegenerationRequest = null;
}

function showError() {
    const container = document.getElementById('bookStory');
    const template = document.getElementById('errorTemplate');
    
    if (container && template) {
        container.innerHTML = '';
        container.appendChild(template.content.cloneNode(true));
    }
}

/**
 * Update Open Graph meta tags for social sharing
 * @param {Object} story - Story object or null for home page
 */
function updateOpenGraphTags(story) {
    // Helper to update or create meta tag
    const setMetaTag = (property, content) => {
        let meta = document.querySelector(`meta[property="${property}"]`);
        if (!meta) {
            meta = document.createElement('meta');
            meta.setAttribute('property', property);
            document.head.appendChild(meta);
        }
        meta.setAttribute('content', content);
    };
    
    // Helper for twitter meta tags
    const setTwitterTag = (name, content) => {
        let meta = document.querySelector(`meta[name="${name}"]`);
        if (!meta) {
            meta = document.createElement('meta');
            meta.setAttribute('name', name);
            document.head.appendChild(meta);
        }
        meta.setAttribute('content', content);
    };
    
    if (story) {
        // Story page meta tags
        const title = story.title || 'Bible Story';
        const description = story.summary 
            ? story.summary.substring(0, 200) + (story.summary.length > 200 ? '...' : '')
            : `${story.title} - ${story.book} ${story.start_chapter}:${story.start_verse}`;
        const url = `https://www.grahambible.com/#/story/${story.spread_code}`;
        const imageUrl = story.selected_image_url || story.image_url_1 || 'https://www.grahambible.com/icons/icon-512.png';
        
        // Open Graph
        setMetaTag('og:title', `${title} | The Graham Bible`);
        setMetaTag('og:description', description);
        setMetaTag('og:url', url);
        setMetaTag('og:image', imageUrl);
        setMetaTag('og:type', 'article');
        
        // Twitter Card
        setTwitterTag('twitter:title', `${title} | The Graham Bible`);
        setTwitterTag('twitter:description', description);
        setTwitterTag('twitter:image', imageUrl);
    } else {
        // Home page meta tags (reset to defaults)
        setMetaTag('og:title', 'The Graham Bible');
        setMetaTag('og:description', 'An illustrated devotional Bible featuring 500 stories from Genesis to Revelation, each with AI-generated sacred artwork and faithful narrative retellings.');
        setMetaTag('og:url', 'https://www.grahambible.com');
        setMetaTag('og:image', 'https://www.grahambible.com/icons/icon-512.png');
        setMetaTag('og:type', 'website');
        
        setTwitterTag('twitter:title', 'The Graham Bible');
        setTwitterTag('twitter:description', 'An illustrated devotional Bible arranged story by story');
        setTwitterTag('twitter:image', 'https://www.grahambible.com/icons/icon-512.png');
    }
}

function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    const toastIcon = toast?.querySelector('.toast-icon');
    
    if (!toast) return;
    
    if (toastMessage) toastMessage.textContent = message;
    if (toastIcon) {
        toastIcon.textContent = isError ? '✕' : '✓';
        toastIcon.style.background = isError ? '#F44336' : '#4CAF50';
    }
    
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

/**
 * Convert Supabase/network errors into user-friendly messages
 * @param {Error|object} error - The error object
 * @param {string} context - What action was being performed
 * @returns {string} User-friendly error message
 */
function getUserFriendlyError(error, context = 'action') {
    const errorMsg = error?.message || error?.toString() || '';
    
    // Network/timeout errors
    if (errorMsg.includes('timeout') || errorMsg.includes('Timeout')) {
        return 'Taking longer than expected. Please try again.';
    }
    if (errorMsg.includes('fetch') || errorMsg.includes('network') || errorMsg.includes('Network')) {
        return 'Connection issue. Please check your internet.';
    }
    if (errorMsg.includes('Failed to fetch')) {
        return 'Could not connect to server. Please try again.';
    }
    
    // Auth errors
    if (errorMsg.includes('JWT') || errorMsg.includes('token') || errorMsg.includes('session')) {
        return 'Session expired. Please sign in again.';
    }
    if (errorMsg.includes('not authenticated') || errorMsg.includes('unauthorized')) {
        return 'Please sign in to continue.';
    }
    
    // Rate limiting
    if (errorMsg.includes('rate limit') || errorMsg.includes('too many')) {
        return 'Too many requests. Please wait a moment.';
    }
    
    // Generic database errors
    if (errorMsg.includes('duplicate') || errorMsg.includes('unique')) {
        return 'This action was already completed.';
    }
    
    // Default based on context
    const contextMessages = {
        'favorite': 'Could not update favorite. Please try again.',
        'read': 'Could not update read status. Please try again.',
        'library': 'Could not update library. Please try again.',
        'image': 'Could not update image. Please try again.',
        'load': 'Could not load content. Please refresh the page.',
        'save': 'Could not save changes. Please try again.'
    };
    
    return contextMessages[context] || 'Something went wrong. Please try again.';
}

function setupStoryNavigation() {
    // Top navigation buttons
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    
    if (prevBtn) {
        prevBtn.addEventListener('click', () => navigateStory(-1));
    }
    
    if (nextBtn) {
        nextBtn.addEventListener('click', () => navigateStory(1));
    }
    
    // Floating navigation buttons (mobile)
    const floatingPrevBtn = document.getElementById('floatingPrevBtn');
    const floatingNextBtn = document.getElementById('floatingNextBtn');
    
    if (floatingPrevBtn) {
        floatingPrevBtn.addEventListener('click', () => navigateStory(-1));
    }
    
    if (floatingNextBtn) {
        floatingNextBtn.addEventListener('click', () => navigateStory(1));
    }
}

function setupKeyboardNavigation() {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') {
            navigateStory(-1);
        } else if (e.key === 'ArrowRight') {
            navigateStory(1);
        } else if (e.key === 'Escape') {
            window.location.href = 'index.html';
        }
    });
}

function navigateStory(direction) {
    const newIndex = currentStoryIndex + direction;
    
    if (newIndex >= 0 && newIndex < storyList.length) {
        const newStory = storyList[newIndex];
        // Use hash-based routing
        if (window.GraceRouter) {
            window.GraceRouter.navigateToStory(newStory.spread_code);
        } else {
            window.location.hash = `#/story/${newStory.spread_code}`;
        }
    }
}

function updateNavPosition() {
    const posEl = document.getElementById('navPosition');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const floatingPrevBtn = document.getElementById('floatingPrevBtn');
    const floatingNextBtn = document.getElementById('floatingNextBtn');
    
    if (posEl && storyList.length > 0) {
        posEl.textContent = `${currentStoryIndex + 1} / ${storyList.length}`;
    }
    
    const atStart = currentStoryIndex <= 0;
    const atEnd = currentStoryIndex >= storyList.length - 1;
    
    if (prevBtn) {
        prevBtn.disabled = atStart;
    }
    
    if (floatingPrevBtn) {
        floatingPrevBtn.disabled = atStart;
    }
    
    if (nextBtn) {
        nextBtn.disabled = atEnd;
    }
    
    if (floatingNextBtn) {
        floatingNextBtn.disabled = atEnd;
    }
}

function setupScrollIndicator() {
    const rightPage = document.getElementById('rightPage');
    const indicator = document.getElementById('scrollIndicator');
    
    if (!rightPage || !indicator) return;
    
    // Show indicator if content is scrollable
    const checkScroll = () => {
        const isScrollable = rightPage.scrollHeight > rightPage.clientHeight;
        const isAtBottom = rightPage.scrollTop + rightPage.clientHeight >= rightPage.scrollHeight - 20;
        
        indicator.classList.toggle('visible', isScrollable && !isAtBottom);
        rightPage.classList.toggle('scrolled', rightPage.scrollTop > 10);
    };
    
    rightPage.addEventListener('scroll', checkScroll);
    window.addEventListener('resize', checkScroll);
    
    // Initial check
    setTimeout(checkScroll, 100);
}

// ============================================================================
// Story Page User Features
// ============================================================================

/**
 * Handle auth state changes on story page
 */
async function handleStoryAuthStateChange(state) {
    console.log('[GRACE Story] Auth state changed:', state.isAuthenticated);
    
    // Update favorite button visibility and state
    await updateFavoriteButton();
    
    // Update library button visibility and state
    await updateLibraryButton();
    
    // Update read button state
    await updateReadButton();
    
    // Update admin UI (regeneration buttons)
    updateAdminUI();
}

/**
 * Setup favorite button click handler
 */
function setupFavoriteButton() {
    const favoriteBtn = document.getElementById('favoriteBtn');
    if (!favoriteBtn) return;
    
    favoriteBtn.addEventListener('click', async () => {
        if (!window.GraceAuth?.isAuthenticated()) {
            window.GraceAuth?.showAuthModal();
            return;
        }
        
        if (!currentStory) return;
        
        const spreadCode = currentStory.spread_code;
        
        // Optimistic UI update - determine expected new state
        const wasInFavorites = userFavorites.has(spreadCode);
        const expectedState = !wasInFavorites;
        
        // Update UI immediately (optimistic)
        favoriteBtn.classList.toggle('active', expectedState);
        favoriteBtn.classList.add('just-toggled');
        setTimeout(() => favoriteBtn.classList.remove('just-toggled'), 350);
        hapticFeedback('light');
        
        // Toggle favorite in database (with retry logic)
        const result = await window.GraceAuth.toggleFavorite(spreadCode);
        
        if (result.success) {
            // Update local state for cross-page sync
            if (result.isFavorited) {
                userFavorites.add(spreadCode);
            } else {
                userFavorites.delete(spreadCode);
            }
            
            // Set flag so home page knows to refresh
            sessionStorage.setItem('grace-user-data-changed', 'true');
            
            // Show toast
            showToast(result.isFavorited ? '♥ Added to favorites' : 'Removed from favorites');
        } else {
            // Revert optimistic update on failure
            favoriteBtn.classList.toggle('active', wasInFavorites);
            showToast('Failed to update favorite. Please try again.', true);
        }
    });
    
    // Initial state
    updateFavoriteButton();
}

/**
 * Update favorite button state based on current auth and favorite status
 */
async function updateFavoriteButton() {
    const favoriteBtn = document.getElementById('favoriteBtn');
    if (!favoriteBtn || !currentStory) return;
    
    if (window.GraceAuth?.isAuthenticated()) {
        favoriteBtn.style.display = 'flex';
        const isFavorited = await window.GraceAuth.isFavorited(currentStory.spread_code);
        favoriteBtn.classList.toggle('active', isFavorited);
    } else {
        favoriteBtn.style.display = 'none';
    }
}

/**
 * Setup library button for saving stories offline
 */
function setupLibraryButton() {
    const libraryBtn = document.getElementById('libraryBtn');
    if (!libraryBtn) return;
    
    libraryBtn.addEventListener('click', async () => {
        if (!window.GraceAuth?.isAuthenticated()) {
            window.GraceAuth?.showAuthModal();
            return;
        }
        
        if (!currentStory) return;
        
        const spreadCode = currentStory.spread_code;
        
        // Toggle library status
        const isInLibrary = await window.GraceAuth.toggleLibrary(spreadCode, currentStory);
        
        // Update UI
        libraryBtn.classList.toggle('in-library', isInLibrary);
        libraryBtn.classList.add('just-toggled');
        setTimeout(() => libraryBtn.classList.remove('just-toggled'), 350);
        
        // Update title
        libraryBtn.title = isInLibrary ? 'Remove from offline library' : 'Save for offline reading';
        
        // Haptic feedback
        hapticFeedback('light');
        
        // Show toast
        showToast(isInLibrary ? '↓ Saved for offline reading' : 'Removed from library');
    });
    
    // Initial state
    updateLibraryButton();
}

/**
 * Update library button state based on auth and library status
 */
async function updateLibraryButton() {
    const libraryBtn = document.getElementById('libraryBtn');
    if (!libraryBtn || !currentStory) return;
    
    if (window.GraceAuth?.isAuthenticated()) {
        libraryBtn.style.display = 'flex';
        
        // Check if in library (local or cloud)
        const isInLibrary = window.GraceAuth.isInLibrary(currentStory.spread_code) ||
                           await window.GraceOffline?.isInLibrary(currentStory.spread_code);
        
        libraryBtn.classList.toggle('in-library', isInLibrary);
        libraryBtn.title = isInLibrary ? 'Remove from offline library' : 'Save for offline reading';
    } else {
        libraryBtn.style.display = 'none';
    }
}

/**
 * Update read button state
 */
async function updateReadButton() {
    const readBtn = document.getElementById('readBtn');
    if (!readBtn || !currentStory) return;
    
    if (window.GraceAuth?.isAuthenticated()) {
        readBtn.style.display = 'inline-flex';
        const isRead = await window.GraceAuth.isRead(currentStory.spread_code);
        if (isRead) {
            readBtn.classList.add('is-read');
            readBtn.title = 'Mark as unread';
        } else {
            readBtn.classList.remove('is-read');
            readBtn.title = 'Mark as read';
        }
    } else {
        readBtn.style.display = 'none';
    }
}

/**
 * Setup read button click handler
 * Uses event delegation to handle dynamically created buttons
 */
let readButtonInitialized = false;

function setupReadButton() {
    // Prevent multiple initializations
    if (readButtonInitialized) {
        updateReadButton();
        return;
    }
    readButtonInitialized = true;
    
    // Use event delegation on the document for reliability
    document.addEventListener('click', async (e) => {
        const readBtn = e.target.closest('#readBtn');
        if (!readBtn) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        if (!window.GraceAuth?.isAuthenticated() || !currentStory) {
            console.log('[Graham] Read button click ignored - not authenticated or no story');
            return;
        }
        
        const spreadCode = currentStory.spread_code;
        const isCurrentlyRead = readBtn.classList.contains('is-read');
        
        console.log('[Graham] Read button clicked:', { spreadCode, isCurrentlyRead });
        
        try {
            if (isCurrentlyRead) {
                // Unmark as read
                console.log('[Graham] Unmarking as read...');
                await window.GraceAuth.unmarkAsRead(spreadCode);
                userReadStories.delete(spreadCode);
                readBtn.classList.remove('is-read');
                readBtn.title = 'Mark as read';
                showToast('Marked as unread');
                console.log('[Graham] Successfully unmarked as read');
            } else {
                // Mark as read
                console.log('[Graham] Marking as read...');
                await window.GraceAuth.markAsRead(spreadCode);
                userReadStories.add(spreadCode);
                readBtn.classList.add('is-read');
                readBtn.classList.add('pop');
                readBtn.title = 'Mark as unread';
                setTimeout(() => readBtn.classList.remove('pop'), 300);
                showToast('Marked as read');
                console.log('[Graham] Successfully marked as read');
            }
            
            // Set flag so home page knows to refresh
            sessionStorage.setItem('grace-user-data-changed', 'true');
            
        } catch (err) {
            console.error('[Graham] Error toggling read status:', err);
            showToast(getUserFriendlyError(err, 'read'), true);
        }
    });
    
    // Initial state - show/hide based on auth
    updateReadButton();
}

/**
 * Setup share button functionality
 * Uses Web Share API on mobile, copy-to-clipboard on desktop
 */
function setupShareButton() {
    const shareBtn = document.getElementById('shareBtn');
    if (!shareBtn) return;
    
    shareBtn.addEventListener('click', async () => {
        if (!currentStory) return;
        
        const shareData = {
            title: currentStory.title,
            text: `${currentStory.title} - ${currentStory.book} ${currentStory.start_chapter}:${currentStory.start_verse}`,
            url: `https://www.grahambible.com/#/story/${currentStory.spread_code}`
        };
        
        // Try Web Share API first (mobile-friendly)
        if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
            try {
                await navigator.share(shareData);
                hapticFeedback('light');
            } catch (err) {
                // User cancelled or error - that's fine
                if (err.name !== 'AbortError') {
                    console.warn('[Share] Web Share failed:', err);
                    fallbackCopyToClipboard(shareData.url);
                }
            }
        } else {
            // Fallback: copy URL to clipboard
            fallbackCopyToClipboard(shareData.url);
        }
    });
}

/**
 * Fallback share method - copy URL to clipboard
 */
async function fallbackCopyToClipboard(url) {
    try {
        await navigator.clipboard.writeText(url);
        showToast('Link copied to clipboard!');
        hapticFeedback('light');
    } catch (err) {
        // Final fallback: prompt user to copy manually
        console.error('[Share] Clipboard copy failed:', err);
        prompt('Copy this link to share:', url);
    }
}

/**
 * Setup read tracking - auto-mark as read when user scrolls to bottom of content
 * Uses window scroll since .right-page doesn't have overflow:scroll
 */
function setupReadTracking() {
    let hasAutoMarkedAsRead = false;
    let maxScrollReached = 0; // Track how far user has scrolled
    
    const checkReadStatus = async () => {
        // Only auto-mark once per page load
        if (hasAutoMarkedAsRead) return;
        
        // Only track if authenticated
        if (!window.GraceAuth?.isAuthenticated()) return;
        
        // Already marked as read? Don't auto-trigger again
        const readBtn = document.getElementById('readBtn');
        if (readBtn?.classList.contains('is-read')) {
            hasAutoMarkedAsRead = true;
            return;
        }
        
        // Calculate scroll progress using window scroll
        // Both mobile and desktop use window scroll (rightPage doesn't have overflow:scroll)
        const totalScrollable = document.body.scrollHeight - window.innerHeight;
        let scrollProgress = 0;
        
        if (totalScrollable > 100) { // Need at least 100px of scrollable content
            scrollProgress = window.scrollY / totalScrollable;
        }
        
        // Track maximum scroll reached (in case user scrolls up)
        maxScrollReached = Math.max(maxScrollReached, scrollProgress);
        
        // Trigger at 85% scroll AND user must have scrolled meaningfully
        const hasScrolledEnough = maxScrollReached >= 0.85;
        const hasMinimumEngagement = maxScrollReached > 0.2; // User must scroll past 20%
        
        if (hasScrolledEnough && hasMinimumEngagement && currentStory) {
            hasAutoMarkedAsRead = true;
            const spreadCode = currentStory.spread_code;
            
            try {
                await window.GraceAuth.markAsRead(spreadCode);
                
                // Update local state for cross-page sync
                userReadStories.add(spreadCode);
                
                // Set flag so home page knows to refresh
                sessionStorage.setItem('grace-user-data-changed', 'true');
                
                // Update button state with animation
                if (readBtn) {
                    readBtn.classList.add('is-read');
                    readBtn.classList.add('pop');
                    readBtn.title = 'Mark as unread';
                    setTimeout(() => readBtn.classList.remove('pop'), 300);
                }
                
                console.log('[Graham] Auto-marked as read:', spreadCode, 'at scroll', Math.round(maxScrollReached * 100) + '%');
            } catch (err) {
                console.error('[Graham] Error auto-marking as read:', err);
            }
        }
    };
    
    // Listen to window scroll (both mobile and desktop use this)
    window.addEventListener('scroll', checkReadStatus, { passive: true });
    
    // Also check on touch end for mobile
    document.addEventListener('touchend', () => {
        setTimeout(checkReadStatus, 100);
    }, { passive: true });
}

/**
 * Update admin-only UI elements visibility
 */
function updateAdminUI() {
    const isAdmin = window.GraceAuth?.isAdmin() || false;
    
    // Show/hide regeneration buttons
    const regenBtns = document.querySelectorAll('.regen-btn');
    regenBtns.forEach(btn => {
        btn.style.display = isAdmin ? '' : 'none';
    });
    
    // Update selection labels
    updateImageSelectionLabels();
}

// ============================================================================
// Audio Narration (Web Speech API)
// ============================================================================

let speechSynthesis = window.speechSynthesis;
let currentUtterance = null;
let audioSpeeds = [0.75, 1, 1.25, 1.5];
let currentSpeedIndex = 1; // Default to 1x
let isAudioPlaying = false;
let audioTextParts = []; // Store text parts for reading
let currentPartIndex = 0;

function setupAudioControls() {
    const audioBtn = document.getElementById('audioBtn');
    
    console.log('[Audio] Setting up controls. Button found:', !!audioBtn, 'speechSynthesis available:', !!speechSynthesis);
    
    if (!audioBtn) {
        console.error('[Audio] Audio button not found in DOM');
        return;
    }
    
    if (!speechSynthesis) {
        console.error('[Audio] Web Speech API not supported');
        return;
    }
    
    // Pre-load voices (important for Chrome desktop)
    speechSynthesis.getVoices();
    
    // Main audio button - directly toggles playback (simplified UX)
    audioBtn.addEventListener('click', () => {
        console.log('[Audio] Button clicked. isAudioPlaying:', isAudioPlaying, 'paused:', speechSynthesis.paused);
        hapticFeedback();
        
        // Prepare text on first interaction
        if (audioTextParts.length === 0) {
            prepareAudioText();
            updateProgressDots();
            console.log('[Audio] Prepared', audioTextParts.length, 'text parts');
        }
        
        // Toggle playback directly
        if (isAudioPlaying) {
            // If playing, toggle pause/resume
            if (speechSynthesis.paused) {
                console.log('[Audio] Resuming...');
                speechSynthesis.resume();
                syncAllPlayButtons(true);
                showStickyAudioBar(true);
            } else {
                console.log('[Audio] Pausing...');
                speechSynthesis.pause();
                syncAllPlayButtons(false);
            }
        } else {
            // Start playback - the onstart callback will handle UI updates
            console.log('[Audio] Starting playback...');
            startReading();
        }
    });
    
    // Setup sticky audio bar (the main control interface during playback)
    setupStickyAudioBar();
}

function prepareAudioText() {
    audioTextParts = [];
    
    // Get all audio segments in DOM order
    const segments = document.querySelectorAll('.audio-segment[data-audio-index]');
    
    segments.forEach((segment, idx) => {
        const text = segment.textContent.trim();
        if (text) {
            const index = parseInt(segment.dataset.audioIndex);
            audioTextParts.push({
                type: index === 0 ? 'verse' : 'summary',
                text: text,
                element: segment,
                index: index
            });
        }
    });
    
    // Calculate total word count for time estimate
    const totalWords = audioTextParts.reduce((sum, part) => sum + part.text.split(/\s+/).length, 0);
    window._audioTotalWords = totalWords;
    window._audioWordsRead = 0;
    
    updateAudioStatus('Ready');
}

function togglePlayPause() {
    if (isAudioPlaying) {
        if (speechSynthesis.paused) {
            speechSynthesis.resume();
            syncAllPlayButtons(true);
            showStickyAudioBar(true);
        } else {
            speechSynthesis.pause();
            syncAllPlayButtons(false);
        }
    } else {
        startReading();
    }
}

// Sync play/pause state across all buttons
function syncAllPlayButtons(playing) {
    const audioBtn = document.getElementById('audioBtn');
    const stickyPlayPauseBtn = document.getElementById('stickyPlayPauseBtn');
    
    if (playing) {
        audioBtn?.classList.add('active');
        stickyPlayPauseBtn?.classList.add('playing');
    } else {
        // Keep active state on audioBtn if just paused (still in session)
        stickyPlayPauseBtn?.classList.remove('playing');
    }
}

function startReading() {
    console.log('[Audio] startReading called');
    
    if (audioTextParts.length === 0) {
        prepareAudioText();
    }
    
    if (audioTextParts.length === 0) {
        console.error('[Audio] No audio text parts found - segments missing from DOM');
        return;
    }
    
    console.log('[Audio] Starting with', audioTextParts.length, 'parts');
    
    // Chrome needs voices to be loaded - they load async
    const voices = speechSynthesis.getVoices();
    console.log('[Audio] Voices available:', voices.length);
    
    if (voices.length === 0) {
        console.log('[Audio] Waiting for voices to load...');
        // Try immediately anyway (some browsers work without explicit voices)
        currentPartIndex = 0;
        readNextPart();
        return;
    }
    
    currentPartIndex = 0;
    readNextPart();
}

function readNextPart() {
    console.log('[Audio] readNextPart called, index:', currentPartIndex, '/', audioTextParts.length);
    
    if (currentPartIndex >= audioTextParts.length) {
        // Finished reading all parts
        console.log('[Audio] Finished all parts');
        stopAudio();
        updateAudioStatus('Finished');
        return;
    }
    
    const part = audioTextParts[currentPartIndex];
    console.log('[Audio] Reading part:', currentPartIndex, 'text length:', part.text.length);
    
    currentUtterance = new SpeechSynthesisUtterance(part.text);
    currentUtterance.rate = audioSpeeds[currentSpeedIndex];
    currentUtterance.pitch = 1;
    currentUtterance.volume = 1;
    
    // Use a good voice if available
    const voices = speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => 
        v.lang.startsWith('en') && (v.name.includes('Samantha') || v.name.includes('Daniel') || v.name.includes('Google'))
    ) || voices.find(v => v.lang.startsWith('en'));
    
    if (preferredVoice) {
        currentUtterance.voice = preferredVoice;
        console.log('[Audio] Using voice:', preferredVoice.name);
    } else {
        console.log('[Audio] Using default voice');
    }
    
    currentUtterance.onstart = () => {
        console.log('[Audio] Speech started for part', currentPartIndex);
        isAudioPlaying = true;
        updateAudioStatus(part.type === 'verse' ? 'Key verse...' : 'Reading...');
        
        // Sync all play buttons
        syncAllPlayButtons(true);
        
        // Highlight current segment and scroll to it
        highlightCurrentSegment(currentPartIndex);
        scrollToCurrentSegment(currentPartIndex);
        
        // Show sticky bar and update progress
        showStickyAudioBar(true);
        updateProgressDots();
    };
    
    currentUtterance.onend = () => {
        // Mark as complete before moving on
        markSegmentComplete(currentPartIndex);
        
        // Update words read for time estimate
        const wordsInPart = part.text.split(/\s+/).length;
        window._audioWordsRead = (window._audioWordsRead || 0) + wordsInPart;
        
        currentPartIndex++;
        // Small pause between parts
        setTimeout(() => {
            if (isAudioPlaying) {
                readNextPart();
            }
        }, 500);
    };
    
    currentUtterance.onerror = (e) => {
        // 'canceled' is not a real error - it happens when we call cancel() to seek
        if (e.error === 'canceled' || e.error === 'interrupted') {
            console.log('[Audio] Speech canceled/interrupted (expected during seek)');
            return;
        }
        console.error('[Audio] Speech error:', e.error, e);
        stopAudio();
    };
    
    // Chrome bug workaround: cancel any stuck speech before starting
    if (speechSynthesis.speaking && !speechSynthesis.paused) {
        console.log('[Audio] Clearing stuck speech synthesis');
        speechSynthesis.cancel();
    }
    
    console.log('[Audio] Calling speechSynthesis.speak()');
    speechSynthesis.speak(currentUtterance);
    console.log('[Audio] speak() called, speaking:', speechSynthesis.speaking, 'pending:', speechSynthesis.pending);
}

function stopAudio() {
    speechSynthesis.cancel();
    isAudioPlaying = false;
    currentPartIndex = 0;
    window._audioWordsRead = 0;
    
    updateAudioStatus('Ready');
    
    // Reset all button states
    const audioBtn = document.getElementById('audioBtn');
    const stickyPlayPauseBtn = document.getElementById('stickyPlayPauseBtn');
    
    audioBtn?.classList.remove('active');
    stickyPlayPauseBtn?.classList.remove('playing');
    
    // Clear all highlighting
    clearAllHighlights();
    
    // Hide sticky bar
    showStickyAudioBar(false);
}

function cycleSpeed() {
    currentSpeedIndex = (currentSpeedIndex + 1) % audioSpeeds.length;
    const speedBtn = document.getElementById('speedBtn');
    const stickySpeedBtn = document.getElementById('stickySpeedBtn');
    const speedText = audioSpeeds[currentSpeedIndex] + '×';
    
    if (speedBtn) {
        speedBtn.textContent = speedText;
    }
    if (stickySpeedBtn) {
        stickySpeedBtn.textContent = speedText;
    }
    
    // Persist to localStorage
    try {
        localStorage.setItem('grace-audio-speed', currentSpeedIndex.toString());
    } catch (e) {}
    
    // If currently playing, update the rate
    if (currentUtterance && isAudioPlaying) {
        // Need to restart with new speed
        const wasPlaying = isAudioPlaying;
        speechSynthesis.cancel();
        if (wasPlaying) {
            readNextPart();
        }
    }
}

function updateAudioStatus(text) {
    // Status is now conveyed through visual states (play/pause icon, progress dots)
    // This function is a no-op but kept for potential future use
    console.log('[Audio]', text);
}

// Load voices when available
if (speechSynthesis) {
    speechSynthesis.onvoiceschanged = () => {
        // Voices loaded
    };
}

// ============================================================================
// Audio Highlighting & UI Sync
// ============================================================================

// Track user scroll to pause auto-scroll
let userScrolling = false;
let userScrollTimeout = null;

function highlightCurrentSegment(index) {
    // Remove active class from all segments
    document.querySelectorAll('.audio-segment.audio-active').forEach(el => {
        el.classList.remove('audio-active');
    });
    
    // Add active class to current segment
    const currentSegment = document.querySelector(`.audio-segment[data-audio-index="${index}"]`);
    if (currentSegment) {
        currentSegment.classList.add('audio-active');
    }
}

function markSegmentComplete(index) {
    const segment = document.querySelector(`.audio-segment[data-audio-index="${index}"]`);
    if (segment) {
        segment.classList.remove('audio-active');
        segment.classList.add('audio-complete');
    }
}

function clearAllHighlights() {
    document.querySelectorAll('.audio-segment').forEach(el => {
        el.classList.remove('audio-active', 'audio-complete');
    });
}

function scrollToCurrentSegment(index) {
    // Don't auto-scroll if user recently scrolled manually
    if (userScrolling) return;
    
    const segment = document.querySelector(`.audio-segment[data-audio-index="${index}"]`);
    if (segment) {
        // Check if element is in a comfortable viewing area
        const rect = segment.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const stickyBarHeight = 70; // Account for sticky bar
        const comfortZoneTop = viewportHeight * 0.25; // Top 25% of screen
        const comfortZoneBottom = viewportHeight * 0.65; // Bottom 35% of screen
        
        // Only scroll if element is outside the "comfort zone"
        if (rect.top < stickyBarHeight + 20 || rect.top > comfortZoneBottom) {
            // Use smooth scroll with a target in the upper-middle area
            segment.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'start',
                inline: 'nearest'
            });
            // Adjust for sticky bar by scrolling a bit more
            setTimeout(() => {
                window.scrollBy({ top: -stickyBarHeight - 20, behavior: 'smooth' });
            }, 100);
        }
    }
}

function showStickyAudioBar(show) {
    const stickyBar = document.getElementById('audioStickyBar');
    if (stickyBar) {
        if (show) {
            stickyBar.classList.add('visible');
        } else {
            stickyBar.classList.remove('visible');
        }
    }
}

function updateProgressDots() {
    const dotsContainer = document.getElementById('audioProgressDots');
    if (!dotsContainer) return;
    
    dotsContainer.innerHTML = '';
    
    audioTextParts.forEach((part, idx) => {
        const dot = document.createElement('div');
        dot.className = 'audio-progress-dot';
        dot.dataset.index = idx;
        
        if (idx < currentPartIndex) {
            dot.classList.add('complete');
        } else if (idx === currentPartIndex) {
            dot.classList.add('active');
        }
        
        // Click to seek - prevent event bubbling
        dot.addEventListener('click', (e) => {
            e.stopPropagation();
            seekToSection(idx);
        });
        
        dotsContainer.appendChild(dot);
    });
}

function seekToSection(index) {
    if (index < 0 || index >= audioTextParts.length) return;
    
    // Remember if we were playing
    const wasPlaying = isAudioPlaying;
    
    // Stop current speech (this will trigger onerror with 'canceled' which we now ignore)
    speechSynthesis.cancel();
    
    // Clear highlights for sections at and after the target
    document.querySelectorAll('.audio-segment').forEach(el => {
        const elIndex = parseInt(el.dataset.audioIndex);
        if (elIndex >= index) {
            el.classList.remove('audio-active', 'audio-complete');
        }
    });
    
    // Update index
    currentPartIndex = index;
    
    // Update UI - keep sticky bar visible during seek
    highlightCurrentSegment(index);
    updateProgressDots();
    showStickyAudioBar(true);
    
    // Continue reading if we were playing
    if (wasPlaying) {
        // Small delay to let cancel complete
        setTimeout(() => {
            readNextPart();
        }, 50);
    } else {
        scrollToCurrentSegment(index);
    }
    
    // Haptic feedback
    hapticFeedback();
}

function skipSection(direction) {
    const newIndex = currentPartIndex + direction;
    if (newIndex >= 0 && newIndex < audioTextParts.length) {
        seekToSection(newIndex);
    }
}

// Timer removed - progress dots are sufficient for tracking

function setupStickyAudioBar() {
    const stickyPlayPauseBtn = document.getElementById('stickyPlayPauseBtn');
    const stickyStopBtn = document.getElementById('stickyStopBtn');
    const stickySpeedBtn = document.getElementById('stickySpeedBtn');
    const skipPrevBtn = document.getElementById('skipPrevBtn');
    const skipNextBtn = document.getElementById('skipNextBtn');
    
    // Play/Pause from sticky bar
    stickyPlayPauseBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        hapticFeedback();
        togglePlayPause();
    });
    
    // Stop from sticky bar
    stickyStopBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        stopAudio();
        hapticFeedback();
    });
    
    // Speed from sticky bar
    stickySpeedBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        cycleSpeed();
        hapticFeedback();
    });
    
    // Skip buttons - prevent event bubbling
    skipPrevBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        skipSection(-1);
    });
    skipNextBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        skipSection(1);
    });
    
    // Detect user scroll to temporarily disable auto-scroll
    const rightPage = document.getElementById('rightPage');
    if (rightPage) {
        rightPage.addEventListener('scroll', () => {
            userScrolling = true;
            clearTimeout(userScrollTimeout);
            userScrollTimeout = setTimeout(() => {
                userScrolling = false;
            }, 3000); // Re-enable auto-scroll after 3s of no user scroll
        }, { passive: true });
    }
    
    // Also detect window scroll for mobile
    window.addEventListener('scroll', () => {
        if (isAudioPlaying) {
            userScrolling = true;
            clearTimeout(userScrollTimeout);
            userScrollTimeout = setTimeout(() => {
                userScrolling = false;
            }, 3000);
        }
    }, { passive: true });
    
    // Load saved speed preference
    try {
        const savedSpeed = localStorage.getItem('grace-audio-speed');
        if (savedSpeed !== null) {
            currentSpeedIndex = parseInt(savedSpeed, 10);
            const speedText = audioSpeeds[currentSpeedIndex] + '×';
            const speedBtn = document.getElementById('speedBtn');
            if (speedBtn) speedBtn.textContent = speedText;
            if (stickySpeedBtn) stickySpeedBtn.textContent = speedText;
        }
    } catch (e) {}
}

// ============================================================================
// Utilities
// ============================================================================

function getBibleGatewayUrl(passageRef) {
    if (!passageRef) return null;
    const encoded = encodeURIComponent(passageRef);
    // Use Bible version from settings, default to WEB
    const version = window.graceBibleVersion || 'WEB';
    return `https://www.biblegateway.com/passage/?search=${encoded}&version=${version}`;
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}