# Cursor / AI Development Guide

> How to work with The Graham Bible codebase using Cursor AI and MCP integrations.

---

## Overview

This project uses several external services connected via MCP (Model Context Protocol):

| Service | Purpose | MCP Available |
|---------|---------|---------------|
| **GitHub** | Code hosting, Pages deployment | ✅ Yes |
| **Supabase** | Database, storage, auth | ✅ Yes (via API) |
| **n8n** | Workflow automation | ✅ Yes (via webhook) |
| **Replicate** | Image generation (Flux) | Via n8n only |
| **OpenAI** | Text generation (GPT-4) | Via n8n only |

---

## MCP Integrations

### GitHub MCP

Cursor can interact with GitHub directly:

```
Available operations:
- mcp_github_get_file_contents
- mcp_github_create_or_update_file
- mcp_github_push_files
- mcp_github_list_commits
- mcp_github_create_pull_request
- mcp_github_search_code
- etc.
```

**Repository:** `grysngrhm-tech/graham-devotional`

### Supabase Access

The viewer connects to Supabase using public credentials:

```javascript
// These are in viewer/config.js (safe to commit)
window.SUPABASE_CONFIG = {
    url: 'https://zekbemqgvupzmukpntog.supabase.co',
    anonKey: 'eyJ...' // Public anon key
};
```

**Direct Database Access:**
For read operations, you can query Supabase directly using the anon key. For admin operations, use the Supabase dashboard or n8n workflows.

### n8n Webhooks

The only n8n integration from the viewer is the image regeneration webhook:

```javascript
// In viewer/config.js
window.N8N_WEBHOOK_URL = 'https://grysngrhm.app.n8n.cloud/webhook/regenerate-image'
```

**Workflow IDs:**
- Outline Builder: `dRZE4EHTdCr1pSjX`
- Processing Pipeline: `Ixn36R5CgzjJn0WH`

---

## Security Architecture

### Public Keys (Safe to Commit)

These are designed to be exposed and are protected by other mechanisms:

| Key | Protection |
|-----|------------|
| `SUPABASE_URL` | Public by design |
| `SUPABASE_ANON_KEY` | Row Level Security (RLS) limits access |
| `N8N_WEBHOOK_URL` | Webhook validates requests internally |

### Secret Keys (Never Commit)

These provide elevated access and must stay private:

| Key | Location | Access Level |
|-----|----------|--------------|
| `SUPABASE_SERVICE_ROLE_KEY` | n8n credentials | Full database access |
| `REPLICATE_API_KEY` | n8n credentials | Image generation |
| `OPENAI_API_KEY` | n8n credentials | GPT-4 access |

**Storage:** All secrets are stored in n8n's credential manager, never in this repository.

---

## Database Schema

### Main Table: `grahams_devotional_spreads`

```sql
-- Key columns for viewer
spread_code         TEXT UNIQUE      -- e.g., 'GEN-001'
testament           TEXT             -- 'OT' or 'NT'
book                TEXT             -- 'Genesis', 'Matthew', etc.
title               TEXT             -- Story title
kjv_passage_ref     TEXT             -- 'Genesis 1:1-2:3'
kjv_key_verse_ref   TEXT             -- 'Genesis 1:1'
kjv_key_verse_text  TEXT             -- KJV quote
paraphrase_text     TEXT             -- 440-520 word summary
image_url           TEXT             -- Primary selected image (global default)
image_url_1/2/3/4   TEXT             -- All 4 generated options
status_image        TEXT             -- 'pending', 'done', 'error'
start_chapter       INT              -- For sorting
start_verse         INT              -- For sorting
```

### User Tables

```sql
-- User profile with admin flag
user_profiles (
    id UUID PRIMARY KEY,  -- References auth.users
    email TEXT,
    is_admin BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ
)

-- User favorites (stories user has hearted)
user_favorites (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES auth.users,
    spread_code TEXT,
    created_at TIMESTAMPTZ,
    UNIQUE(user_id, spread_code)
)

-- User read tracking
user_read_stories (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES auth.users,
    spread_code TEXT,
    read_at TIMESTAMPTZ,
    UNIQUE(user_id, spread_code)
)

-- User personal image selections
user_primary_images (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES auth.users,
    spread_code TEXT,
    image_slot INTEGER (1-4),
    UNIQUE(user_id, spread_code)
)
```

### Regeneration Table

```sql
regeneration_requests (
    id UUID PRIMARY KEY,
    spread_code TEXT,
    slot INTEGER (1-4),
    option_urls TEXT[],           -- Array of 4 new image URLs
    status TEXT,                  -- 'processing', 'ready', 'completed', 'failed'
    created_at TIMESTAMPTZ
)
```

---

## Project Architecture

### File Overview

| File | Purpose | Key Functions |
|------|---------|---------------|
| `app.js` | Main app logic | Stories, filters, rendering, SPA views |
| `router.js` | SPA routing | Hash-based navigation, route handling |
| `auth.js` | Authentication | Magic links, sessions, roles |
| `settings.js` | User preferences | Theme, font size, Bible version |
| `config.js` | Configuration | Supabase URL/key, n8n webhook |
| `admin.html` | Admin dashboard | Stats, user data, modals |
| `sw.js` | Service worker | Caching, offline support |
| `lib/supabase.min.js` | Supabase client | Self-hosted to avoid tracking blocks |
| `data/all-spreads.json` | Fallback data | Static story data if Supabase fails |

### Viewer Flow

```
User visits site
    ↓
Service Worker checks cache
    ↓
HTML loads (network-first)
    ↓
Scripts load:
    1. lib/supabase.min.js (Supabase client - self-hosted)
    2. config.js (Supabase config)
    3. auth.js (authentication)
    4. settings.js (user preferences)
    5. router.js (SPA routing)
    6. app.js (main logic)
    ↓
router.js initializes:
    - Parse current URL hash
    - Set up hashchange listener
    - Notify app.js of initial route
    ↓
auth.js initializes:
    - Check existing session (with timeout for blocked storage)
    - Load user profile (including is_admin)
    - Set up auth state change listener
    ↓
app.js initializes:
    - Apply theme from settings
    - Register service worker
    - Handle route (show home or story view)
    ↓
Supabase queries for data (with fallback to static JSON)
    ↓
Render UI based on auth state and route
```

### SPA Navigation

```javascript
// Navigate to a story
window.GraceRouter.navigate('#/story/GEN-001');

// Navigate home
window.GraceRouter.navigateHome();

// Get current route
const route = window.GraceRouter.getCurrentRoute();
// Returns: { type: 'home' } or { type: 'story', id: 'GEN-001' }

// Listen for route changes
window.GraceRouter.onRouteChange((newRoute, prevRoute) => {
    if (newRoute.type === 'story') {
        showStoryView(newRoute.id);
    } else {
        showHomeView();
    }
});
```

### Key Functions in app.js

```javascript
// Initialization
initTheme()                    // Dark/light mode from settings
registerServiceWorker()        // PWA service worker
initIndexPage()                // Homepage initialization
initStoryPage()                // Story page initialization

// Data Loading
loadStories()                  // Fetch all spreads
loadStory(spreadCode)          // Fetch single spread
loadUserData()                 // Fetch favorites, read, images

// Rendering
renderStories()                // Generate cards + section headers
renderStoryCard(story)         // Single card HTML
renderStory(spread)            // Story page content
renderImages(spread)           // Image grid with selection

// User Features
toggleFavorite(spreadCode)     // Add/remove favorite
markAsRead(spreadCode)         // Mark story as read
selectPersonalPrimary(slot)    // Set personal image choice

// Admin Features
triggerRegeneration(slot)      // Start image regeneration
setGlobalDefault(slot)         // Set global primary image

// PWA
showInstallBanner()            // Platform-specific install UI
showUpdateNotification()       // New version toast
```

### Key Functions in auth.js

```javascript
window.GraceAuth = {
    // Initialization
    initAuth()                   // Initialize auth state
    
    // Authentication
    signInWithMagicLink(email)   // Send magic link email
    signOut()                    // Log out user
    checkSession()               // Check for existing session
    
    // State
    isAuthenticated()            // Returns boolean
    isAdmin()                    // Returns boolean
    getCurrentUser()             // Returns user object or null
    getUserProfile()             // Returns profile with is_admin
    
    // Events
    onAuthStateChange(callback)  // Subscribe to auth changes
    
    // UI
    updateAuthUI()               // Update header buttons
    setupAuthModal()             // Setup sign-in modal
    setupSettingsModal()         // Setup settings modal
    
    // Helpers
    isPWA()                      // Check if running as PWA
    isMobile()                   // Check if mobile device
};
```

### Key Functions in settings.js

```javascript
window.GraceSettings = {
    // Load/Save
    loadSettings()               // Load from localStorage
    saveSettings()               // Save to localStorage
    
    // Apply
    applySettings()              // Apply to DOM
    applyTheme(darkMode)         // Set dark/light mode
    applyFontSize(size)          // Set font scale
    
    // Getters
    getSettings()                // Get current settings object
    getBibleVersion()            // Get preferred Bible version
    
    // UI
    setupSettingsModal()         // Bind settings modal events
    populateUserInfo()           // Show email in settings
};
```

### CSS Organization

```css
/* styles.css structure (~4000 lines) */

/* Variables & Resets */        Lines 1-100
/* Dark Mode Variables */       Lines 66-95
/* Font Size Variables */       Lines 96-130
/* Layout & Typography */       Lines 130-250
/* Header & Breadcrumb */       Lines 250-450
/* Auth Buttons & Modals */     Lines 450-700
/* Settings Modal */            Lines 700-900
/* Filters */                   Lines 900-1200
/* Section Headers */           Lines 1200-1400
/* Story Cards Grid */          Lines 1400-1700
/* User States (favorites) */   Lines 1700-1850
/* Story Page Layout */         Lines 1850-2300
/* Image Selection UI */        Lines 2300-2700
/* Regeneration Modal */        Lines 2700-3000
/* Audio Controls */            Lines 3000-3200
/* Mobile Responsive */         Lines 3200-3700
/* PWA Install Banner */        Lines 3700-3850
/* Admin Styles */              Lines 3850-4000
```

---

## Common Development Tasks

### Adding a New Feature

1. Identify which files need changes
2. Update JavaScript with new logic
3. Update `styles.css` with styling
4. Update HTML if new elements needed
5. Bump cache version:
   - CSS/JS query strings in HTML
   - SW cache name in `sw.js`
6. Test locally
7. Push to GitHub (auto-deploys)

### Working with Authentication

```javascript
// Check if user is logged in
if (GraceAuth.isAuthenticated()) {
    // User is logged in
    const user = GraceAuth.getCurrentUser();
    console.log('User:', user.email);
}

// Check if user is admin
if (GraceAuth.isAdmin()) {
    // Show admin-only features
}

// React to auth changes
GraceAuth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN') {
        // User just logged in
    } else if (event === 'SIGNED_OUT') {
        // User just logged out
    }
});
```

### Working with User Data

```javascript
// Load user's favorites and read stories
async function loadUserData() {
    const userId = GraceAuth.getCurrentUser()?.id;
    if (!userId) return;
    
    // Favorites
    const { data: favorites } = await supabase
        .from('user_favorites')
        .select('spread_code')
        .eq('user_id', userId);
    
    // Read stories
    const { data: reads } = await supabase
        .from('user_read_stories')
        .select('spread_code')
        .eq('user_id', userId);
    
    // Personal image selections
    const { data: images } = await supabase
        .from('user_primary_images')
        .select('spread_code, image_slot')
        .eq('user_id', userId);
}
```

### Admin-Only UI

```html
<!-- Elements only visible to admin -->
<div class="admin-only">
    <!-- This content hidden by default, shown when body has is-admin class -->
</div>
```

```css
/* CSS for admin visibility */
.admin-only {
    display: none;
}

body.is-admin .admin-only {
    display: flex; /* or block, etc. */
}
```

```javascript
// In auth.js, updateAdminUI adds/removes body class
function updateAdminUI() {
    if (isAdmin()) {
        document.body.classList.add('is-admin');
    } else {
        document.body.classList.remove('is-admin');
    }
}
```

### Debugging

**Browser Console Logs:**
```javascript
[Graham]         // General viewer logs
[Graham-Auth]    // Authentication logs
[Graham-Mobile]  // Mobile-specific logs
[PWA]            // Service worker logs
[SW]             // Service worker internal logs
[Admin]          // Admin page logs
```

**Chrome DevTools:**
- Application > Manifest — Check PWA manifest
- Application > Service Workers — Check registration
- Application > Cache Storage — See cached files
- Application > Local Storage — Check settings, auth
- Network — Monitor API calls

### Cache Busting

When deploying changes:

```html
<!-- In index.html -->
<link rel="stylesheet" href="styles.css?v=20">
<script src="app.js?v=22"></script>
<script src="auth.js?v=5"></script>
<script src="router.js?v=2"></script>
```

```javascript
// In sw.js
const CACHE_NAME = 'graham-bible-v6';
```

### Maintaining Self-Hosted Libraries

**Supabase Library (`lib/supabase.min.js`):**

Update when Supabase releases security fixes or needed features:

```bash
# PowerShell
Invoke-WebRequest -Uri "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js" -OutFile "viewer\lib\supabase.min.js"

# Bash
curl -o viewer/lib/supabase.min.js https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js
```

**Why Self-Hosted?**
Browser tracking prevention (Edge, Firefox, Safari, Brave) blocks third-party CDN scripts from accessing localStorage. Self-hosting makes it "first-party".

### Maintaining Fallback Data

**Static JSON (`data/all-spreads.json`):**

Update when story outlines change:

```bash
# PowerShell
Copy-Item "data\all-spreads.json" -Destination "viewer\data\all-spreads.json"

# Bash
cp data/all-spreads.json viewer/data/all-spreads.json
```

**When to update:**
- New stories added
- Story metadata changes (titles, references)
- NOT needed for image/status updates (those come from Supabase)

### Testing PWA

1. **Desktop Chrome:**
   - DevTools > Application > Manifest (check for errors)
   - DevTools > Lighthouse > PWA audit

2. **iOS Safari:**
   - Visit site, scroll to trigger install banner
   - Share → Add to Home Screen
   - Open installed app, verify standalone mode

3. **Android Chrome:**
   - Visit site, should see install prompt
   - Verify app in app drawer after install

---

## Working with AI Tools

### Giving Context

When asking Cursor to make changes, provide:

1. **What you want**: Clear description of the feature
2. **Where it goes**: Which files are involved
3. **How it should look**: UI/UX expectations
4. **Technical constraints**: Auth requirements, mobile support, etc.

### Example Prompts

```
"Add a share button to the story view that uses the Web Share API. 
It should appear next to the audio button in the story header. 
On iOS, it should share the story URL with title. 
Fall back to copy-to-clipboard on unsupported browsers."
```

```
"The favorites filter isn't working on mobile. Check the 
filter event listeners and add debug logging to identify 
where it's failing. The desktop version works correctly."
```

```
"Add a new admin feature: bulk image regeneration. In the admin 
panel, add a button that regenerates images for all stories with 
status_image = 'pending'. Use the existing regeneration webhook 
and add a progress indicator."
```

### Documentation Updates

After making significant changes:

1. Update `docs/VIEWER.md` with new user features
2. Update `docs/SYSTEM.md` with new database tables or workflows
3. Update `docs/CURSOR.md` with new development patterns
4. Add to version history tables
5. Commit documentation with code changes

---

## Useful Commands

### Local Development
```bash
cd viewer
python -m http.server 8000
# or
npx serve .
```

### Generate PWA Icons
```bash
cd viewer
npm install canvas  # First time only
node generate-icons.js
```

### Check for Lint Errors
Use Cursor's built-in linting or:
```bash
npx eslint app.js auth.js settings.js
```

### Git Operations
```bash
# Stage and commit
git add -A
git commit -m "Description of changes"

# Push to deploy
git push origin main
```

---

## Troubleshooting AI Sessions

### If Changes Don't Deploy
- Check GitHub Actions for Pages deployment status
- Hard refresh (Ctrl+Shift+R) to bypass cache
- Check service worker version in DevTools
- Verify cache name was updated in sw.js

### If Features Regress
- Check git history for when feature worked
- Compare current code with working commit
- Look for merge conflicts in CSS/JS

### If AI Gets Confused
- Provide full file paths when referencing code
- Use code blocks with line numbers
- Reference documentation files explicitly
- Break complex tasks into smaller steps

### If Auth Not Working
- Check Supabase dashboard for auth settings
- Verify Site URL and Redirect URLs match exactly
- Check browser console for auth-related errors
- Clear localStorage and try again

### If App Hangs or Shows Blank Page

**Symptom:** Skeleton cards show but stories never load

**Cause:** Browser tracking prevention blocking localStorage access

**Solution:** This is fixed by self-hosting Supabase. If issue recurs:
1. Verify `lib/supabase.min.js` exists and loads
2. Check console for "Tracking Prevention blocked" errors
3. Verify script tag in index.html points to local file, not CDN
4. Test in private/incognito window

**Technical Background:**
- Browsers block third-party scripts (CDNs) from localStorage
- Supabase uses localStorage for auth tokens
- Self-hosted scripts are "first-party" and unrestricted
- Fallback data loading ensures stories show even if Supabase fails

---

## Quick Reference

### Key Files
- `viewer/app.js` — Main application logic
- `viewer/router.js` — Hash-based SPA routing
- `viewer/auth.js` — Authentication logic
- `viewer/settings.js` — User preferences
- `viewer/styles.css` — All styling
- `viewer/config.js` — Supabase/n8n config
- `viewer/admin.html` — Admin dashboard
- `viewer/sw.js` — Service worker
- `viewer/lib/supabase.min.js` — Self-hosted Supabase client
- `viewer/data/all-spreads.json` — Fallback story data

### URL Structure (Hash-Based Routing)
- Home: `https://www.grahambible.com/` or `/#/`
- Story: `https://www.grahambible.com/#/story/GEN-001`

### Files That Need Sync
| Source | Deployed Copy | Sync Trigger |
|--------|---------------|--------------|
| CDN supabase-js | `viewer/lib/supabase.min.js` | Security updates |
| `data/all-spreads.json` | `viewer/data/all-spreads.json` | Story changes |

### Key IDs (HTML)
- `#mainHeader` — Sticky header
- `#headerBreadcrumb` — Collapsible breadcrumb row
- `#storiesGrid` — Card grid container
- `#authControls` — Sign in/settings buttons
- `#authModal` — Sign-in modal
- `#settingsModal` — Settings modal

### Key Classes (CSS)
- `.compact-header` — Sticky header
- `.header-breadcrumb` — Breadcrumb row
- `.section-header` — In-grid section dividers
- `.story-card` — Grid cards
- `.favorited` — Golden glow on favorited cards
- `.admin-only` — Hidden except for admins
- `.auth-modal` — Modal styling
- `.install-banner` — PWA install prompt

### localStorage Keys
- `graham-settings` — User preferences (theme, font, bible version)
- `graham-install-dismissed` — PWA banner dismissal timestamp

### sessionStorage Keys
- `grace-user-data-changed` — Flag to refresh user data on page load
