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
// PWA Detection
// ============================================================================

/**
 * Check if running as a PWA (installed app)
 * @returns {boolean}
 */
function isPWA() {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true ||
           document.referrer.includes('android-app://');
}

/**
 * Check if on a mobile device
 * @returns {boolean}
 */
function isMobile() {
    return window.matchMedia('(max-width: 768px)').matches ||
           /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize authentication system
 * Call this on page load after Supabase client is ready
 */
async function initAuth() {
    // Use global supabase client if local isn't available
    const sb = typeof supabase !== 'undefined' ? supabase : window.supabaseClient;
    if (!sb) {
        console.error('[Auth] Supabase client not available!');
        return null;
    }
    
    // Check for existing session with timeout (prevents hang if storage is blocked)
    let session = null;
    try {
        const sessionPromise = sb.auth.getSession();
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Session check timeout')), 5000)
        );
        const result = await Promise.race([sessionPromise, timeoutPromise]);
        session = result?.data?.session;
    } catch (err) {
        // Session check failed - continue without auth (common with strict privacy settings)
    }
    
    if (session?.user) {
        await setCurrentUser(session.user);
    }
    
    // Listen for auth state changes (login, logout, token refresh)
    try {
        sb.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' && session?.user) {
                await setCurrentUser(session.user);
                updateAuthUI();
                notifyAuthStateListeners();
                // Clean up URL hash after successful sign in
                if (window.location.hash.includes('access_token')) {
                    history.replaceState(null, '', window.location.pathname);
                }
            } else if (event === 'SIGNED_OUT') {
                currentUser = null;
                userProfile = null;
                updateAuthUI();
                notifyAuthStateListeners();
            } else if (event === 'TOKEN_REFRESHED' && session?.user) {
                currentUser = session.user;
            }
        });
    } catch (err) {
        // Could not set up auth listener - continue without real-time auth updates
    }
    
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
        const { data: profile, error } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('id', user.id)
            .single();
        
        if (error && error.code === 'PGRST116') {
            // Profile doesn't exist yet - create it
            const { data: newProfile, error: createError } = await supabase
                .from('user_profiles')
                .insert({ id: user.id, email: user.email })
                .select()
                .single();
            
            if (!createError) {
                userProfile = newProfile;
            } else {
                console.error('[Auth] Failed to create profile:', createError);
            }
        } else if (!error) {
            userProfile = profile;
        } else {
            console.error('[Auth] Error loading profile:', error);
        }
    } catch (err) {
        console.error('[Auth] Exception loading profile:', err);
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
    
    // Production: Custom domain (primary)
    if (hostname === 'www.grahambible.com' || hostname === 'grahambible.com') {
        return 'https://www.grahambible.com/';
    }
    
    // Production: GitHub Pages (fallback)
    if (hostname.includes('github.io')) {
        return 'https://grysngrhm-tech.github.io/graham-devotional/viewer/';
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
 * Send OTP code to email address (for PWA users)
 * Unlike magic link, this sends a 6-digit code that user enters manually
 * @param {string} email - User's email address
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function sendOTPCode(email) {
    if (!email || !email.includes('@')) {
        return { success: false, error: 'Please enter a valid email address' };
    }
    
    try {
        // Don't include emailRedirectTo - this makes Supabase send a code instead of link
        const { error } = await supabase.auth.signInWithOtp({
            email: email,
            options: {
                shouldCreateUser: true
            }
        });
        
        if (error) {
            console.error('[Auth] OTP send error:', error);
            return { success: false, error: error.message };
        }
        
        return { success: true };
    } catch (err) {
        console.error('[Auth] OTP send error:', err);
        return { success: false, error: 'An error occurred. Please try again.' };
    }
}

/**
 * Verify OTP code entered by user
 * @param {string} email - User's email address
 * @param {string} code - 6-digit OTP code
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function verifyOTPCode(email, code) {
    if (!email || !code) {
        return { success: false, error: 'Email and code are required' };
    }
    
    // Clean the code - remove spaces and non-digits
    const cleanCode = code.replace(/\D/g, '');
    
    if (cleanCode.length !== 8) {
        return { success: false, error: 'Please enter the 8-digit code' };
    }
    
    try {
        const { data, error } = await supabase.auth.verifyOtp({
            email: email,
            token: cleanCode,
            type: 'email'
        });
        
        if (error) {
            console.error('[Auth] OTP verify error:', error);
            // User-friendly error messages
            if (error.message.includes('expired')) {
                return { success: false, error: 'Code expired. Please request a new one.' };
            }
            if (error.message.includes('invalid')) {
                return { success: false, error: 'Invalid code. Please try again.' };
            }
            return { success: false, error: error.message };
        }
        
        if (data?.user) {
            currentUser = data.user;
            await loadUserProfile();
            notifyAuthListeners({ isAuthenticated: true, user: currentUser });
            return { success: true };
        }
        
        return { success: false, error: 'Verification failed. Please try again.' };
    } catch (err) {
        console.error('[Auth] OTP verify error:', err);
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
    const adminBtn = document.getElementById('adminBtn');
    const userFilter = document.getElementById('userFilter');
    
    if (isAuthenticated()) {
        // Show signed-in state
        if (signInBtn) signInBtn.style.display = 'none';
        if (settingsBtn) {
            settingsBtn.style.display = 'flex';
            settingsBtn.title = `Settings (${currentUser.email})`;
            // Add gold glow for admin users
            if (isAdmin()) {
                settingsBtn.classList.add('is-admin');
            } else {
                settingsBtn.classList.remove('is-admin');
            }
        }
        // Hide admin button from header (moved to settings)
        if (adminBtn) {
            adminBtn.style.display = 'none';
        }
        // Show user filters (favorites, read/unread)
        if (userFilter) userFilter.style.display = 'flex';
    } else {
        // Show signed-out state
        if (signInBtn) signInBtn.style.display = 'inline-flex';
        if (settingsBtn) {
            settingsBtn.style.display = 'none';
            settingsBtn.classList.remove('is-admin');
        }
        if (adminBtn) adminBtn.style.display = 'none';
        // Hide user filters
        if (userFilter) userFilter.style.display = 'none';
    }
    
    // Update admin-only elements
    updateAdminUI();
}

/**
 * Update admin-only UI elements
 */
function updateAdminUI() {
    const isAdminUser = isAdmin();
    
    // Add/remove body class for CSS-based visibility control
    if (isAdminUser) {
        document.body.classList.add('is-admin');
    } else {
        document.body.classList.remove('is-admin');
    }
    
    // Also directly toggle user-only elements
    const userElements = document.querySelectorAll('.user-only');
    userElements.forEach(el => {
        el.style.display = isAuthenticated() && !isAdminUser ? '' : 'none';
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
        hideAuthError();
        isVerifying = false; // Reset verification lock
        
        // Check if there's a pending OTP session (user closed modal while waiting for code)
        const savedEmail = sessionStorage.getItem('grace-auth-pending-email');
        const savedState = sessionStorage.getItem('grace-auth-pending-state');
        
        if (savedEmail && savedState === 'code_sent') {
            // Restore the code entry state
            pendingEmail = savedEmail;
            setAuthModalState('code_sent');
        } else {
            // Fresh start
            setAuthModalState('email');
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
    // Clear resend timer
    if (resendTimer) {
        clearInterval(resendTimer);
        resendTimer = null;
    }
}

/**
 * Setup auth modal event handlers
 */
// Auth modal state
let authModalState = 'email'; // 'email' | 'code_sent' | 'link_sent' | 'verifying'
let pendingEmail = '';
let resendTimer = null;
let resendCountdown = 0;
let isVerifying = false; // Prevent double submission

function setupAuthModal() {
    const modal = document.getElementById('authModal');
    const signInBtn = document.getElementById('signInBtn');
    const closeBtn = document.getElementById('authClose');
    const continueBtn = document.getElementById('sendMagicLink');
    const emailInput = document.getElementById('authEmail');
    const backBtn = document.getElementById('authBack');
    const resendBtn = document.getElementById('authResend');
    
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
    
    // Continue button (sends magic link or OTP based on context)
    if (continueBtn) {
        continueBtn.addEventListener('click', handleAuthContinue);
    }
    
    // Enter key in email input
    if (emailInput) {
        emailInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                handleAuthContinue();
            }
        });
    }
    
    // Back button (returns to email entry from code view)
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            // Clear saved state - user wants to start over
            clearPendingAuthState();
            setAuthModalState('email');
        });
    }
    
    // Back to email button (from link sent view)
    const backToEmailBtn = document.getElementById('authBackToEmail');
    if (backToEmailBtn) {
        backToEmailBtn.addEventListener('click', () => {
            clearPendingAuthState();
            setAuthModalState('email');
        });
    }
    
    // Resend code button
    if (resendBtn) {
        resendBtn.addEventListener('click', handleResendCode);
    }
    
    // Check login status button (for browser users after magic link)
    const checkStatusBtn = document.getElementById('checkLoginStatus');
    if (checkStatusBtn) {
        checkStatusBtn.addEventListener('click', checkLoginStatus);
    }
    
    // Setup OTP input behavior
    setupOTPInput();
    
    // Escape to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal?.classList.contains('visible')) {
            hideAuthModal();
        }
    });
}

/**
 * Setup OTP input with auto-advance, paste support, and auto-submit
 */
function setupOTPInput() {
    const otpInput = document.getElementById('otpInput');
    if (!otpInput) return;
    
    // Handle input
    otpInput.addEventListener('input', (e) => {
        // Only allow digits
        let value = e.target.value.replace(/\D/g, '');
        
        // Limit to 8 digits
        if (value.length > 8) {
            value = value.substring(0, 8);
        }
        
        otpInput.value = value;
        
        // Auto-submit when 8 digits entered
        if (value.length === 8) {
            handleVerifyCode();
        }
    });
    
    // Handle paste
    otpInput.addEventListener('paste', (e) => {
        e.preventDefault();
        const pastedText = (e.clipboardData || window.clipboardData).getData('text');
        const digits = pastedText.replace(/\D/g, '').substring(0, 8);
        otpInput.value = digits;
        
        if (digits.length === 8) {
            handleVerifyCode();
        }
    });
    
    // Handle keydown for better UX
    otpInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && otpInput.value.length === 8) {
            handleVerifyCode();
        }
    });
}

/**
 * Set auth modal state and update UI accordingly
 */
function setAuthModalState(state) {
    authModalState = state;
    
    const emailView = document.getElementById('authEmailView');
    const codeView = document.getElementById('authCodeView');
    const linkSentView = document.getElementById('authLinkSentView');
    const modal = document.getElementById('authModal');
    const codeEmail = document.getElementById('codeEmail');
    const otpInput = document.getElementById('otpInput');
    const resendBtn = document.getElementById('authResend');
    
    // Clear any existing timers
    if (resendTimer) {
        clearInterval(resendTimer);
        resendTimer = null;
    }
    
    // Hide all views
    if (emailView) emailView.style.display = 'none';
    if (codeView) codeView.style.display = 'none';
    if (linkSentView) linkSentView.style.display = 'none';
    
    // Update modal data attribute for CSS transitions
    if (modal) modal.dataset.state = state;
    
    switch (state) {
        case 'email':
            if (emailView) emailView.style.display = 'block';
            const emailInput = document.getElementById('authEmail');
            if (emailInput) {
                emailInput.disabled = false;
                emailInput.value = pendingEmail || '';
                emailInput.focus();
            }
            const continueBtn = document.getElementById('sendMagicLink');
            if (continueBtn) {
                continueBtn.disabled = false;
                continueBtn.textContent = 'Continue';
            }
            break;
            
        case 'code_sent':
            if (codeView) codeView.style.display = 'block';
            if (codeEmail) codeEmail.textContent = pendingEmail;
            if (otpInput) {
                otpInput.value = '';
                otpInput.disabled = false;
                setTimeout(() => otpInput.focus(), 100);
            }
            // Start resend countdown (30 seconds)
            startResendCountdown(30);
            break;
            
        case 'link_sent':
            if (linkSentView) linkSentView.style.display = 'block';
            const linkEmail = document.getElementById('linkEmail');
            if (linkEmail) linkEmail.textContent = pendingEmail;
            break;
            
        case 'verifying':
            if (otpInput) otpInput.disabled = true;
            break;
    }
}

/**
 * Start countdown for resend button
 */
function startResendCountdown(seconds) {
    resendCountdown = seconds;
    const resendBtn = document.getElementById('authResend');
    
    if (resendBtn) {
        resendBtn.disabled = true;
        resendBtn.textContent = `Resend in ${resendCountdown}s`;
    }
    
    resendTimer = setInterval(() => {
        resendCountdown--;
        
        if (resendCountdown <= 0) {
            clearInterval(resendTimer);
            resendTimer = null;
            if (resendBtn) {
                resendBtn.disabled = false;
                resendBtn.textContent = 'Resend code';
            }
        } else if (resendBtn) {
            resendBtn.textContent = `Resend in ${resendCountdown}s`;
        }
    }, 1000);
}

/**
 * Handle continue button - sends OTP for PWA, magic link for browser
 */
async function handleAuthContinue() {
    const emailInput = document.getElementById('authEmail');
    const continueBtn = document.getElementById('sendMagicLink');
    const errorEl = document.getElementById('authError');
    
    if (!emailInput) return;
    
    const email = emailInput.value.trim();
    
    // Validate email
    if (!email) {
        showAuthError('Please enter your email address');
        emailInput.focus();
        return;
    }
    
    if (!email.includes('@')) {
        showAuthError('Please enter a valid email address');
        return;
    }
    
    // Store email for later use
    pendingEmail = email;
    
    // Show loading state
    if (continueBtn) {
        continueBtn.disabled = true;
        continueBtn.textContent = 'Sending...';
    }
    hideAuthError();
    
    // Determine flow based on PWA detection
    if (isPWA()) {
        // PWA: Send OTP code
        const result = await sendOTPCode(email);
        
        if (result.success) {
            // Save state so user can return if modal closes
            sessionStorage.setItem('grace-auth-pending-email', email);
            sessionStorage.setItem('grace-auth-pending-state', 'code_sent');
            setAuthModalState('code_sent');
        } else {
            showAuthError(result.error || 'Error sending code');
            if (continueBtn) {
                continueBtn.disabled = false;
                continueBtn.textContent = 'Continue';
            }
        }
    } else {
        // Browser: Send magic link
        const result = await signInWithMagicLink(email);
        
        if (result.success) {
            setAuthModalState('link_sent');
        } else {
            showAuthError(result.error || 'Error sending link');
            if (continueBtn) {
                continueBtn.disabled = false;
                continueBtn.textContent = 'Continue';
            }
        }
    }
}

/**
 * Handle OTP code verification
 */
async function handleVerifyCode() {
    // Prevent double submission
    if (isVerifying) return;
    
    const otpInput = document.getElementById('otpInput');
    const codeView = document.getElementById('authCodeView');
    const authHeader = codeView?.querySelector('.auth-header h2');
    
    if (!otpInput || !pendingEmail) return;
    
    const code = otpInput.value.trim();
    
    if (code.length !== 8) {
        showAuthError('Please enter the 8-digit code');
        return;
    }
    
    // Lock submission
    isVerifying = true;
    
    // Show verifying state
    setAuthModalState('verifying');
    hideAuthError();
    
    // Update header to show verifying
    if (authHeader) authHeader.textContent = 'Verifying...';
    
    const result = await verifyOTPCode(pendingEmail, code);
    
    if (result.success) {
        // Success! Show clear feedback
        if (codeView) codeView.classList.add('success');
        if (authHeader) authHeader.textContent = 'Success!';
        
        // Clear saved auth state
        sessionStorage.removeItem('grace-auth-pending-email');
        sessionStorage.removeItem('grace-auth-pending-state');
        
        // Brief delay to show success state, then reload
        setTimeout(() => {
            hideAuthModal();
            // Reset state for next time
            pendingEmail = '';
            authModalState = 'email';
            isVerifying = false;
            // Reload to refresh user data
            window.location.reload();
        }, 1000);
    } else {
        // Unlock submission
        isVerifying = false;
        
        // Reset header
        if (authHeader) authHeader.textContent = 'Enter Code';
        
        // Error - shake and reset input
        if (codeView) {
            codeView.classList.add('shake');
            setTimeout(() => codeView.classList.remove('shake'), 500);
        }
        
        showAuthError(result.error || 'Invalid code');
        setAuthModalState('code_sent');
        
        // Clear and refocus input
        if (otpInput) {
            otpInput.value = '';
            setTimeout(() => otpInput.focus(), 100);
        }
    }
}

/**
 * Handle resend code button
 */
async function handleResendCode() {
    const resendBtn = document.getElementById('authResend');
    
    if (!pendingEmail || resendCountdown > 0) return;
    
    if (resendBtn) {
        resendBtn.disabled = true;
        resendBtn.textContent = 'Sending...';
    }
    
    const result = await sendOTPCode(pendingEmail);
    
    if (result.success) {
        startResendCountdown(30);
    } else {
        showAuthError(result.error || 'Error resending code');
        if (resendBtn) {
            resendBtn.disabled = false;
            resendBtn.textContent = 'Resend code';
        }
    }
}

/**
 * Show error message in auth modal
 */
function showAuthError(message) {
    const errorEl = document.getElementById('authError');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.display = 'block';
    }
}

/**
 * Hide error message in auth modal
 */
function hideAuthError() {
    const errorEl = document.getElementById('authError');
    if (errorEl) {
        errorEl.textContent = '';
        errorEl.style.display = 'none';
    }
}

/**
 * Clear pending auth state from sessionStorage
 */
function clearPendingAuthState() {
    sessionStorage.removeItem('grace-auth-pending-email');
    sessionStorage.removeItem('grace-auth-pending-state');
    pendingEmail = '';
}


/**
 * Check login status - useful for PWA users after clicking magic link in browser
 */
async function checkLoginStatus() {
    const status = document.getElementById('authStatus');
    const checkBtn = document.getElementById('checkLoginStatus');
    
    if (checkBtn) {
        checkBtn.disabled = true;
        checkBtn.textContent = 'Checking...';
    }
    
    try {
        // Re-check session from Supabase
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.user) {
            await setCurrentUser(session.user);
            updateAuthUI();
            notifyAuthStateListeners();
            
            if (status) {
                status.textContent = 'Logged in successfully!';
                status.className = 'auth-status success';
            }
            
            // Close modal after brief delay
            setTimeout(() => {
                hideAuthModal();
                // Reload page to refresh all user data
                window.location.reload();
            }, 1000);
        } else {
            if (status) {
                status.textContent = 'Not logged in yet. Click the link in your email, then try again.';
                status.className = 'auth-status error';
            }
            if (checkBtn) {
                checkBtn.disabled = false;
                checkBtn.textContent = 'Check Login Status';
            }
        }
    } catch (err) {
        console.error('[Auth] Error checking status:', err);
        if (status) {
            status.textContent = 'Error checking login status';
            status.className = 'auth-status error';
        }
        if (checkBtn) {
            checkBtn.disabled = false;
            checkBtn.textContent = 'Check Login Status';
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
 * @returns {Promise<{success: boolean, isFavorited: boolean}>} Result with success flag and new favorite status
 */
async function toggleFavorite(spreadCode) {
    if (!isAuthenticated()) return { success: false, isFavorited: false };
    
    const maxRetries = 2;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
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
                const { error } = await supabase
                    .from('user_favorites')
                    .delete()
                    .eq('user_id', currentUser.id)
                    .eq('spread_code', spreadCode);
                
                if (error) throw error;
                return { success: true, isFavorited: false };
            } else {
                // Add favorite
                const { error } = await supabase
                    .from('user_favorites')
                    .insert({ user_id: currentUser.id, spread_code: spreadCode });
                
                if (error) throw error;
                return { success: true, isFavorited: true };
            }
        } catch (err) {
            console.error(`[Auth] Error toggling favorite (attempt ${attempt + 1}):`, err);
            if (attempt === maxRetries) {
                return { success: false, isFavorited: false };
            }
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
        }
    }
    
    return { success: false, isFavorited: false };
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
 * @returns {Promise<boolean>} Success
 */
async function markAsRead(spreadCode) {
    if (!isAuthenticated()) return false;
    
    const maxRetries = 2;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            // Use upsert to avoid duplicates
            const { error } = await supabase
                .from('user_read_stories')
                .upsert(
                    { user_id: currentUser.id, spread_code: spreadCode },
                    { onConflict: 'user_id,spread_code' }
                );
            
            if (error) throw error;
            return true;
        } catch (err) {
            console.error(`[Auth] Error marking as read (attempt ${attempt + 1}):`, err);
            if (attempt === maxRetries) return false;
            await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
        }
    }
    
    return false;
}

/**
 * Unmark a story as read (remove from read list)
 * @param {string} spreadCode - Story spread code
 * @returns {Promise<boolean>} Success
 */
async function unmarkAsRead(spreadCode) {
    if (!isAuthenticated()) return false;
    
    const maxRetries = 2;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const { error } = await supabase
                .from('user_read_stories')
                .delete()
                .eq('user_id', currentUser.id)
                .eq('spread_code', spreadCode);
            
            if (error) throw error;
            return true;
        } catch (err) {
            console.error(`[Auth] Error unmarking as read (attempt ${attempt + 1}):`, err);
            if (attempt === maxRetries) return false;
            await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
        }
    }
    
    return false;
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
 * Get ALL user's primary image selections (for home page display)
 * @returns {Promise<Map<string, number>>} Map of spread_code -> image_slot
 */
async function getAllUserPrimaryImages() {
    if (!isAuthenticated()) return new Map();
    
    try {
        const { data, error } = await supabase
            .from('user_primary_images')
            .select('spread_code, image_slot')
            .eq('user_id', currentUser.id);
        
        if (error) throw error;
        
        const imageMap = new Map();
        (data || []).forEach(item => {
            imageMap.set(item.spread_code, item.image_slot);
        });
        
        return imageMap;
    } catch (err) {
        console.error('[Auth] Error loading all primary images:', err);
        return new Map();
    }
}

/**
 * Load ALL user data in parallel for faster home page loading
 * Combines 4 queries into 2 parallel batches for ~50% speed improvement
 * @returns {Promise<{favorites: string[], readStories: string[], library: string[], primaryImages: Map}>}
 */
async function getAllUserDataParallel() {
    if (!isAuthenticated()) {
        return {
            favorites: [],
            readStories: [],
            library: [],
            primaryImages: new Map()
        };
    }
    
    const userId = currentUser.id;
    
    try {
        // Run all queries in parallel
        const [favResult, readResult, libResult, imgResult] = await Promise.all([
            // Query 1: Favorites
            supabase.from('user_favorites').select('spread_code').eq('user_id', userId),
            // Query 2: Read stories
            supabase.from('user_read_stories').select('spread_code').eq('user_id', userId),
            // Query 3: Library
            supabase.from('user_library').select('spread_code').eq('user_id', userId),
            // Query 4: Primary images
            supabase.from('user_primary_images').select('spread_code, image_slot').eq('user_id', userId)
        ]);
        
        // Process results
        const favorites = (favResult.data || []).map(f => f.spread_code);
        const readStories = (readResult.data || []).map(r => r.spread_code);
        const library = (libResult.data || []).map(l => l.spread_code);
        
        const primaryImages = new Map();
        (imgResult.data || []).forEach(item => {
            primaryImages.set(item.spread_code, item.image_slot);
        });
        
        console.log('[Auth] User data loaded in parallel:', {
            favorites: favorites.length,
            read: readStories.length,
            library: library.length,
            primaryImages: primaryImages.size
        });
        
        return { favorites, readStories, library, primaryImages };
    } catch (err) {
        console.error('[Auth] Error loading user data in parallel:', err);
        return {
            favorites: [],
            readStories: [],
            library: [],
            primaryImages: new Map()
        };
    }
}

/**
 * Set user's primary image selection for a story
 * @param {string} spreadCode - Story spread code
 * @param {number} imageSlot - Image slot (1-4)
 * @returns {Promise<boolean>} Success
 */
async function setUserPrimaryImage(spreadCode, imageSlot) {
    if (!isAuthenticated()) {
        console.error('[Auth] Cannot set primary image: not authenticated');
        return false;
    }
    
    const maxRetries = 2;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const { error } = await supabase
                .from('user_primary_images')
                .upsert(
                    { user_id: currentUser.id, spread_code: spreadCode, image_slot: imageSlot },
                    { onConflict: 'user_id,spread_code' }
                );
            
            if (error) throw error;
            return true;
        } catch (err) {
            console.error(`[Auth] Error setting primary image (attempt ${attempt + 1}):`, err);
            if (attempt === maxRetries) return false;
            await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
        }
    }
    
    return false;
}

// ============================================================================
// Offline Library Functions
// ============================================================================

// Local state for library (synced with Supabase) - prefixed to avoid conflict with app.js
let _libraryCache = new Set();

/**
 * Get user's offline library entries from Supabase
 * @returns {Promise<string[]>} Array of spread codes
 */
async function getUserLibrary() {
    if (!isAuthenticated()) return [];
    
    try {
        const { data, error } = await supabase
            .from('user_library')
            .select('spread_code')
            .eq('user_id', currentUser.id);
        
        if (error) throw error;
        
        const codes = (data || []).map(d => d.spread_code);
        _libraryCache = new Set(codes);
        return codes;
    } catch (err) {
        console.error('[Auth] Error loading library:', err);
        return [];
    }
}

/**
 * Check if a story is in the user's library (from local cache)
 * @param {string} spreadCode
 * @returns {boolean}
 */
function isInLibrary(spreadCode) {
    return _libraryCache.has(spreadCode);
}

/**
 * Add a story to the user's offline library
 * Also saves the story data to local IndexedDB
 * @param {string} spreadCode
 * @param {Object} storyData - Full story object to save locally
 * @returns {Promise<boolean>}
 */
async function addToLibrary(spreadCode, storyData) {
    if (!isAuthenticated()) return false;
    
    try {
        // Add to Supabase (cloud sync)
        await supabase
            .from('user_library')
            .upsert(
                { user_id: currentUser.id, spread_code: spreadCode },
                { onConflict: 'user_id,spread_code' }
            );
        
        // Save story data locally
        if (storyData && window.GraceOffline) {
            await window.GraceOffline.saveToLibrary(storyData);
        }
        
        // Update local state
        _libraryCache.add(spreadCode);
        
        return true;
    } catch (err) {
        console.error('[Auth] Error adding to library:', err);
        return false;
    }
}

/**
 * Remove a story from the user's offline library
 * @param {string} spreadCode
 * @returns {Promise<boolean>}
 */
async function removeFromLibrary(spreadCode) {
    if (!isAuthenticated()) return false;
    
    try {
        // Remove from Supabase
        await supabase
            .from('user_library')
            .delete()
            .eq('user_id', currentUser.id)
            .eq('spread_code', spreadCode);
        
        // Remove from local IndexedDB
        if (window.GraceOffline) {
            await window.GraceOffline.removeFromLibrary(spreadCode);
        }
        
        // Update local state
        _libraryCache.delete(spreadCode);
        
        return true;
    } catch (err) {
        console.error('[Auth] Error removing from library:', err);
        return false;
    }
}

/**
 * Toggle a story's library status
 * @param {string} spreadCode
 * @param {Object} storyData - Full story object (needed for add)
 * @returns {Promise<boolean>} New state (true = in library)
 */
async function toggleLibrary(spreadCode, storyData) {
    if (isInLibrary(spreadCode)) {
        await removeFromLibrary(spreadCode);
        return false;
    } else {
        await addToLibrary(spreadCode, storyData);
        return true;
    }
}

/**
 * Sync library state: download any library entries that aren't locally cached
 * Called on login to ensure local storage matches Supabase
 */
async function syncLibrary() {
    if (!isAuthenticated() || !window.GraceOffline) return;
    
    try {
        // Get library entries from Supabase
        const cloudLibrary = await getUserLibrary();
        
        // Get locally stored library entries
        const localCodes = await window.GraceOffline.getLibraryStoryCodes();
        
        // Find entries in cloud but not local (need to download)
        const needsDownload = cloudLibrary.filter(code => !localCodes.has(code));
        
        if (needsDownload.length > 0) {
            console.log(`[Auth] Syncing ${needsDownload.length} library entries...`);
            // Note: We don't auto-download here to avoid unexpected data usage
            // User can manually re-download from settings if needed
        }
    } catch (err) {
        console.error('[Auth] Error syncing library:', err);
    }
}

/**
 * Clear the user's entire library (local and cloud)
 */
async function clearLibrary() {
    if (!isAuthenticated()) return false;
    
    try {
        // Clear from Supabase
        await supabase
            .from('user_library')
            .delete()
            .eq('user_id', currentUser.id);
        
        // Clear local IndexedDB
        if (window.GraceOffline) {
            await window.GraceOffline.clearLibrary();
        }
        
        // Update local state
        _libraryCache.clear();
        
        return true;
    } catch (err) {
        console.error('[Auth] Error clearing library:', err);
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
    sendOTPCode,
    verifyOTPCode,
    signOut,
    checkLoginStatus,
    
    // State accessors
    getCurrentUser,
    getUserProfile,
    isAuthenticated,
    isAdmin,
    getUserId,
    isPWA,
    isMobile,
    
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
    unmarkAsRead,
    isRead,
    getUserPrimaryImage,
    getAllUserPrimaryImages,
    getAllUserDataParallel,
    setUserPrimaryImage,
    
    // Offline library
    getUserLibrary,
    isInLibrary,
    addToLibrary,
    removeFromLibrary,
    toggleLibrary,
    syncLibrary,
    clearLibrary
};


