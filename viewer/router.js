/**
 * The Graham Bible - Hash-Based Router
 * ============================================================================
 * Simple client-side router for single-page app navigation
 * Handles routes like:
 *   #/          - Home (story grid)
 *   #/story/OT001  - Story detail view
 * ============================================================================
 */

// Use IIFE to avoid polluting global scope
(function() {
    'use strict';
    
    // Router state
    let currentRoute = null;
    let routeChangeListeners = [];
    
    // Route patterns
    const ROUTES = {
        HOME: /^#?\/?$/,
        STORY: /^#\/story\/(.+)$/
    };
    
    /**
     * Initialize the router
     */
    function init() {
        // Handle initial route
        processRouteChange();
        
        // Listen for hash changes
        window.addEventListener('hashchange', processRouteChange);
        
        // Handle popstate for back/forward
        window.addEventListener('popstate', processRouteChange);
        
        console.log('[Router] Initialized');
    }
    
    /**
     * Parse the current hash and determine the route
     * @returns {Object} Route object with type and params
     */
    function parseRoute() {
        const hash = window.location.hash || '#/';
        
        // Check for story route
        const storyMatch = hash.match(ROUTES.STORY);
        if (storyMatch) {
            return {
                type: 'story',
                storyId: storyMatch[1]
            };
        }
        
        // Default to home
        return {
            type: 'home'
        };
    }
    
    /**
     * Process route changes (internal function)
     */
    function processRouteChange() {
        const newRoute = parseRoute();
        
        // Skip if route hasn't changed
        if (currentRoute && 
            currentRoute.type === newRoute.type && 
            currentRoute.storyId === newRoute.storyId) {
            return;
        }
        
        const previousRoute = currentRoute;
        currentRoute = newRoute;
        
        console.log('[Router] Route changed:', newRoute);
        
        // Notify listeners
        routeChangeListeners.forEach(callback => {
            try {
                callback(newRoute, previousRoute);
            } catch (err) {
                console.error('[Router] Listener error:', err);
            }
        });
    }
    
    /**
     * Navigate to a new route
     * @param {string} path - The hash path (e.g., '#/story/OT001')
     */
    function navigateTo(path) {
        // Ensure path starts with #
        if (!path.startsWith('#')) {
            path = '#' + path;
        }
        
        window.location.hash = path;
    }
    
    /**
     * Navigate to home
     */
    function navigateHome() {
        navigateTo('#/');
    }
    
    /**
     * Navigate to a story
     * @param {string} storyId - The story spread_code
     */
    function navigateToStory(storyId) {
        navigateTo(`#/story/${storyId}`);
    }
    
    /**
     * Register a callback for route changes
     * @param {Function} callback - Function called with (newRoute, previousRoute)
     * @returns {Function} Unsubscribe function
     */
    function onRouteChange(callback) {
        routeChangeListeners.push(callback);
        
        return () => {
            routeChangeListeners = routeChangeListeners.filter(cb => cb !== callback);
        };
    }
    
    /**
     * Get the current route
     * @returns {Object} Current route object
     */
    function getCurrentRoute() {
        return currentRoute || parseRoute();
    }
    
    /**
     * Check if current route is home
     * @returns {boolean}
     */
    function isHomeRoute() {
        const route = getCurrentRoute();
        return route.type === 'home';
    }
    
    /**
     * Check if current route is a story
     * @returns {boolean}
     */
    function isStoryRoute() {
        const route = getCurrentRoute();
        return route.type === 'story';
    }
    
    /**
     * Get current story ID if on story route
     * @returns {string|null}
     */
    function getCurrentStoryId() {
        const route = getCurrentRoute();
        return route.type === 'story' ? route.storyId : null;
    }
    
    /**
     * Generate a story URL
     * @param {string} storyId - The story spread_code
     * @returns {string} The hash URL
     */
    function getStoryUrl(storyId) {
        return `#/story/${storyId}`;
    }
    
    /**
     * Update document title based on route
     * @param {string} title - The title to set
     */
    function setPageTitle(title) {
        document.title = title ? `${title} | The Graham Bible` : 'The Graham Bible';
    }
    
    // Export for use in app.js
    window.GraceRouter = {
        init: init,
        navigateTo: navigateTo,
        navigateHome: navigateHome,
        navigateToStory: navigateToStory,
        onRouteChange: onRouteChange,
        getCurrentRoute: getCurrentRoute,
        isHomeRoute: isHomeRoute,
        isStoryRoute: isStoryRoute,
        getCurrentStoryId: getCurrentStoryId,
        getStoryUrl: getStoryUrl,
        setPageTitle: setPageTitle,
        parseRoute: parseRoute
    };
})();
