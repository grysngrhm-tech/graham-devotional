/**
 * The GRACE Bible - Authentication Module
 * ============================================================================
 * Handles user authentication via Supabase Auth with magic link sign-in.
 * Provides role-based access control (ADMIN vs USER).
 * ============================================================================
 */

// Auth state
let currentUser = null;
let userProfile = null;
let authStateListeners = [];

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize authentication system
 * Call this on page load after Supabase client is ready
 */
async function initAuth() {
    // Check for existing session
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session?.user) {
        await setCurrentUser(session.user);
    }
    
    // Listen for auth state changes (login, logout, token refresh)
    supabase.auth.onAuthStateChange(async (event, session) => {
        console.log('[Auth] State change:', event);
        
        if (event === 'SIGNED_IN' && session?.user) {
            await setCurrentUser(session.user);
            notifyAuthStateListeners();
        } else if (event === 'SIGNED_OUT') {
            currentUser = null;
            userProfile = null;
            notifyAuthStateListeners();
        } else if (event === 'TOKEN_REFRESHED' && session?.user) {
            currentUser = session.user;
        }
    });
    
    // Update UI based on initial state
    updateAuthUI();
    notifyAuthStateListeners();
    
    return currentUser;
}

/**
 * Set current user and load their profile
 */
async function setCurrentUser(user) {
    currentUser = user;
    
    // Load or create user profile
    try {
        console.log('[Auth] Loading profile for user:', user.id, user.email);
        const { data: profile, error } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('id', user.id)
            .single();
        
        if (error && error.code === 'PGRST116') {
            // Profile doesn't exist yet (trigger may not have fired)
            // Create it manually
            console.log('[Auth] Profile not found, creating new profile...');
            const { data: newProfile, error: createError } = await supabase
                .from('user_profiles')
                .insert({ id: user.id, email: user.email })
                .select()
                .single();
            
            if (!createError) {
                userProfile = newProfile;
                console.log('[Auth] Created new profile:', newProfile);
            } else {
                console.error('[Auth] Failed to create profile:', createError);
            }
        } else if (!error) {
            userProfile = profile;
            console.log('[Auth] Loaded existing profile:', profile);
        } else {
            console.error('[Auth] Error loading profile:', error);
        }
    } catch (err) {
        console.error('[Auth] Exception loading profile:', err);
    }
    
    // Prominent admin status logging
    const adminStatus = userProfile?.is_admin === true;
    console.log('%c[Auth] User: ' + user.email + ' | Admin: ' + adminStatus, 
        adminStatus ? 'color: green; font-weight: bold' : 'color: gray');
    
    if (adminStatus) {
        console.log('%c[Auth] ADMIN privileges enabled - regeneration controls will be visible', 'color: green');
    }
}

// ============================================================================
// Sign In / Sign Out
// ============================================================================

/**
 * Get the correct redirect URL for magic link authentication
 * Hardcoded production URL to avoid any URL encoding issues
 */
function getAuthRedirectUrl() {
    const hostname = window.location.hostname;
    
    // Production: Use hardcoded GitHub Pages URL to avoid any encoding issues
    if (hostname.includes('github.io')) {
        // Hardcoded to prevent any spaces or encoding problems
        return 'https://grysngrhm-tech.github.io/graham-devotional/';
    }
    
    // Development: use current location
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        console.warn('[Auth] Running in development mode.');
        return window.location.origin + '/';
    }
    
    // Other production environments
    return window.location.origin + '/';
}

/**
 * Send magic link to email address
 * @param {string} email - User's email address
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function signInWithMagicLink(email) {
    if (!email || !email.includes('@')) {
        return { success: false, error: 'Please enter a valid email address' };
    }
    
    try {
        const redirectUrl = getAuthRedirectUrl();
        console.log('[Auth] Magic link redirect URL:', redirectUrl);
        
        const { error } = await supabase.auth.signInWithOtp({
            email: email,
            options: {
                emailRedirectTo: redirectUrl
            }
        });
        
        if (error) {
            console.error('[Auth] Magic link error:', error);
            return { success: false, error: error.message };
        }
        
        return { success: true };
    } catch (err) {
        console.error('[Auth] Sign in error:', err);
        return { success: false, error: 'An error occurred. Please try again.' };
    }
}

/**
 * Sign out current user
 */
async function signOut() {
    try {
        const { error } = await supabase.auth.signOut();
        
        if (error) {
            console.error('[Auth] Sign out error:', error);
            return false;
        }
        
        currentUser = null;
        userProfile = null;
        updateAuthUI();
        
        return true;
    } catch (err) {
        console.error('[Auth] Sign out error:', err);
        return false;
    }
}

// ============================================================================
// User State Accessors
// ============================================================================

/**
 * Get current authenticated user
 * @returns {Object|null} User object or null if not authenticated
 */
function getCurrentUser() {
    return currentUser;
}

/**
 * Get current user's profile
 * @returns {Object|null} Profile object or null
 */
function getUserProfile() {
    return userProfile;
}

/**
 * Check if current user is authenticated
 * @returns {boolean}
 */
function isAuthenticated() {
    return currentUser !== null;
}

/**
 * Check if current user is an admin
 * @returns {boolean}
 */
function isAdmin() {
    return userProfile?.is_admin === true;
}

/**
 * Get current user's ID
 * @returns {string|null}
 */
function getUserId() {
    return currentUser?.id || null;
}

// ============================================================================
// Auth State Listeners
// ============================================================================

/**
 * Register a callback to be notified when auth state changes
 * @param {Function} callback - Function to call on auth state change
 */
function onAuthStateChange(callback) {
    authStateListeners.push(callback);
    
    // Return unsubscribe function
    return () => {
        authStateListeners = authStateListeners.filter(cb => cb !== callback);
    };
}

/**
 * Notify all listeners of auth state change
 */
function notifyAuthStateListeners() {
    const state = {
        user: currentUser,
        profile: userProfile,
        isAuthenticated: isAuthenticated(),
        isAdmin: isAdmin()
    };
    
    authStateListeners.forEach(callback => {
        try {
            callback(state);
        } catch (err) {
            console.error('[Auth] Listener error:', err);
        }
    });
}

// ============================================================================
// UI Management
// ============================================================================

/**
 * Update auth-related UI elements
 */
function updateAuthUI() {
    const signInBtn = document.getElementById('signInBtn');
    const settingsBtn = document.getElementById('settingsBtn');
    const userFiltersRow = document.getElementById('userFiltersRow');
    
    if (isAuthenticated()) {
        // Show signed-in state
        if (signInBtn) signInBtn.style.display = 'none';
        if (settingsBtn) {
            settingsBtn.style.display = 'flex';
            settingsBtn.title = `Settings (${currentUser.email})`;
        }
        if (userFiltersRow) userFiltersRow.style.display = 'flex';
    } else {
        // Show signed-out state
        if (signInBtn) signInBtn.style.display = 'inline-flex';
        if (settingsBtn) settingsBtn.style.display = 'none';
        if (userFiltersRow) userFiltersRow.style.display = 'none';
    }
    
    // Update admin-only elements
    updateAdminUI();
}

/**
 * Update admin-only UI elements
 */
function updateAdminUI() {
    const adminElements = document.querySelectorAll('.admin-only');
    const userElements = document.querySelectorAll('.user-only');
    
    adminElements.forEach(el => {
        el.style.display = isAdmin() ? '' : 'none';
    });
    
    userElements.forEach(el => {
        el.style.display = isAuthenticated() && !isAdmin() ? '' : 'none';
    });
}

// ============================================================================
// Auth Modal
// ============================================================================

/**
 * Show the auth modal
 */
function showAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) {
        modal.classList.add('visible');
        const emailInput = document.getElementById('authEmail');
        if (emailInput) {
            emailInput.value = '';
            emailInput.disabled = false;
            setTimeout(() => emailInput.focus(), 150);
        }
        // Clear any previous status
        const status = document.getElementById('authStatus');
        if (status) {
            status.textContent = '';
            status.className = 'auth-status';
        }
        // Reset send button
        const sendBtn = document.getElementById('sendMagicLink');
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.textContent = 'Send Magic Link';
        }
    }
}

/**
 * Hide the auth modal
 */
function hideAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) {
        modal.classList.remove('visible');
    }
}

/**
 * Setup auth modal event handlers
 */
function setupAuthModal() {
    const modal = document.getElementById('authModal');
    const signInBtn = document.getElementById('signInBtn');
    const closeBtn = document.getElementById('authClose');
    const sendLinkBtn = document.getElementById('sendMagicLink');
    const emailInput = document.getElementById('authEmail');
    
    // Open modal
    if (signInBtn) {
        signInBtn.addEventListener('click', showAuthModal);
    }
    
    // Close modal
    if (closeBtn) {
        closeBtn.addEventListener('click', hideAuthModal);
    }
    
    // Click outside to close
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                hideAuthModal();
            }
        });
    }
    
    // Send magic link
    if (sendLinkBtn) {
        sendLinkBtn.addEventListener('click', handleSendMagicLink);
    }
    
    // Enter key in email input
    if (emailInput) {
        emailInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                handleSendMagicLink();
            }
        });
    }
    
    // Escape to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal?.classList.contains('visible')) {
            hideAuthModal();
        }
    });
}

/**
 * Handle sending magic link
 */
async function handleSendMagicLink() {
    const emailInput = document.getElementById('authEmail');
    const status = document.getElementById('authStatus');
    const sendBtn = document.getElementById('sendMagicLink');
    
    if (!emailInput || !status) return;
    
    const email = emailInput.value.trim();
    
    if (!email) {
        status.textContent = 'Please enter your email address';
        status.className = 'auth-status error';
        emailInput.focus();
        return;
    }
    
    if (!email.includes('@')) {
        status.textContent = 'Please enter a valid email address';
        status.className = 'auth-status error';
        return;
    }
    
    // Disable button and show loading
    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.textContent = 'Sending...';
    }
    
    const result = await signInWithMagicLink(email);
    
    if (result.success) {
        status.textContent = 'Check your email for a magic link!';
        status.className = 'auth-status success';
        emailInput.disabled = true;
        if (sendBtn) {
            sendBtn.textContent = 'Link Sent!';
        }
    } else {
        status.textContent = result.error || 'Error sending link';
        status.className = 'auth-status error';
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.textContent = 'Send Magic Link';
        }
    }
}

// ============================================================================
// User Data Functions
// ============================================================================

/**
 * Get user's favorite stories
 * @returns {Promise<string[]>} Array of spread_codes
 */
async function getUserFavorites() {
    if (!isAuthenticated()) return [];
    
    try {
        const { data, error } = await supabase
            .from('user_favorites')
            .select('spread_code')
            .eq('user_id', currentUser.id);
        
        if (error) throw error;
        return data.map(f => f.spread_code);
    } catch (err) {
        console.error('[Auth] Error loading favorites:', err);
        return [];
    }
}

/**
 * Toggle favorite status for a story
 * @param {string} spreadCode - Story spread code
 * @returns {Promise<boolean>} New favorite status
 */
async function toggleFavorite(spreadCode) {
    if (!isAuthenticated()) return false;
    
    try {
        // Check if already favorited
        const { data: existing } = await supabase
            .from('user_favorites')
            .select('spread_code')
            .eq('user_id', currentUser.id)
            .eq('spread_code', spreadCode)
            .single();
        
        if (existing) {
            // Remove favorite
            await supabase
                .from('user_favorites')
                .delete()
                .eq('user_id', currentUser.id)
                .eq('spread_code', spreadCode);
            return false;
        } else {
            // Add favorite
            await supabase
                .from('user_favorites')
                .insert({ user_id: currentUser.id, spread_code: spreadCode });
            return true;
        }
    } catch (err) {
        console.error('[Auth] Error toggling favorite:', err);
        return false;
    }
}

/**
 * Check if a story is favorited
 * @param {string} spreadCode - Story spread code
 * @returns {Promise<boolean>}
 */
async function isFavorited(spreadCode) {
    if (!isAuthenticated()) return false;
    
    try {
        const { data } = await supabase
            .from('user_favorites')
            .select('spread_code')
            .eq('user_id', currentUser.id)
            .eq('spread_code', spreadCode)
            .single();
        
        return !!data;
    } catch (err) {
        return false;
    }
}

/**
 * Get user's read stories
 * @returns {Promise<string[]>} Array of spread_codes
 */
async function getUserReadStories() {
    if (!isAuthenticated()) return [];
    
    try {
        const { data, error } = await supabase
            .from('user_read_stories')
            .select('spread_code')
            .eq('user_id', currentUser.id);
        
        if (error) throw error;
        return data.map(r => r.spread_code);
    } catch (err) {
        console.error('[Auth] Error loading read stories:', err);
        return [];
    }
}

/**
 * Mark a story as read
 * @param {string} spreadCode - Story spread code
 */
async function markAsRead(spreadCode) {
    if (!isAuthenticated()) return;
    
    try {
        // Use upsert to avoid duplicates
        await supabase
            .from('user_read_stories')
            .upsert(
                { user_id: currentUser.id, spread_code: spreadCode },
                { onConflict: 'user_id,spread_code' }
            );
        
        console.log('[Auth] Marked as read:', spreadCode);
    } catch (err) {
        console.error('[Auth] Error marking as read:', err);
    }
}

/**
 * Check if a story has been read
 * @param {string} spreadCode - Story spread code
 * @returns {Promise<boolean>}
 */
async function isRead(spreadCode) {
    if (!isAuthenticated()) return false;
    
    try {
        const { data } = await supabase
            .from('user_read_stories')
            .select('spread_code')
            .eq('user_id', currentUser.id)
            .eq('spread_code', spreadCode)
            .single();
        
        return !!data;
    } catch (err) {
        return false;
    }
}

/**
 * Get user's primary image selection for a story
 * @param {string} spreadCode - Story spread code
 * @returns {Promise<number|null>} Image slot (1-4) or null
 */
async function getUserPrimaryImage(spreadCode) {
    if (!isAuthenticated()) return null;
    
    try {
        const { data } = await supabase
            .from('user_primary_images')
            .select('image_slot')
            .eq('user_id', currentUser.id)
            .eq('spread_code', spreadCode)
            .single();
        
        return data?.image_slot || null;
    } catch (err) {
        return null;
    }
}

/**
 * Set user's primary image selection for a story
 * @param {string} spreadCode - Story spread code
 * @param {number} imageSlot - Image slot (1-4)
 */
async function setUserPrimaryImage(spreadCode, imageSlot) {
    if (!isAuthenticated()) return false;
    
    try {
        await supabase
            .from('user_primary_images')
            .upsert(
                { user_id: currentUser.id, spread_code: spreadCode, image_slot: imageSlot },
                { onConflict: 'user_id,spread_code' }
            );
        
        console.log('[Auth] Set primary image:', spreadCode, 'slot', imageSlot);
        return true;
    } catch (err) {
        console.error('[Auth] Error setting primary image:', err);
        return false;
    }
}

// ============================================================================
// Export for use in app.js
// ============================================================================

window.GraceAuth = {
    // Initialization
    initAuth,
    setupAuthModal,
    
    // Auth actions
    signInWithMagicLink,
    signOut,
    
    // State accessors
    getCurrentUser,
    getUserProfile,
    isAuthenticated,
    isAdmin,
    getUserId,
    
    // UI
    updateAuthUI,
    showAuthModal,
    hideAuthModal,
    
    // Listeners
    onAuthStateChange,
    
    // User data
    getUserFavorites,
    toggleFavorite,
    isFavorited,
    getUserReadStories,
    markAsRead,
    isRead,
    getUserPrimaryImage,
    setUserPrimaryImage
};

