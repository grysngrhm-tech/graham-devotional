# Web Viewer Documentation

> Complete documentation for The Graham Bible web viewer application.

---

## Overview

The web viewer is a **Progressive Web App (PWA)** and **Single-Page Application (SPA)** that displays devotional spreads, supports user accounts with favorites and read tracking, and provides curation tools for admins. It's deployed via GitHub Pages with a custom domain and connects directly to Supabase for data and authentication.

**Live URL:** [www.grahambible.com](https://www.grahambible.com)  
**Alternate URL:** [grysngrhm-tech.github.io/graham-devotional](https://grysngrhm-tech.github.io/graham-devotional/)

---

## File Structure

| File | Purpose |
|------|---------|
| `index.html` | Single-page app (home + story views) |
| `admin.html` | Admin dashboard |
| `privacy.html` | Privacy Policy page |
| `terms.html` | Terms of Service page |
| `404.html` | Custom error page |
| `offline.html` | Offline fallback page |
| `styles.css` | All CSS styling |
| `app.js` | Main application logic |
| `router.js` | Hash-based SPA router |
| `auth.js` | Authentication + OTP login + library sync |
| `offline.js` | IndexedDB storage + offline detection |
| `settings.js` | User preferences |
| `config.js` | Supabase & n8n configuration |
| `sw.js` | Service worker for PWA + image caching |
| `manifest.json` | PWA manifest |
| `robots.txt` | Search engine directives |
| `sitemap.xml` | SEO sitemap |
| `CNAME` | Custom domain configuration |
| `lib/supabase.min.js` | Self-hosted Supabase client |
| `data/all-spreads.json` | Fallback story data |
| `icons/` | PWA icons (7 files) |

---

## Architecture

### Single-Page Application (SPA)

The viewer uses **hash-based routing** to provide a seamless single-page experience while remaining compatible with GitHub Pages (static hosting).

**URL Structure:**
- Home: `https://www.grahambible.com/` or `/#/`
- Story: `https://www.grahambible.com/#/story/GEN-001`

**Router (`router.js`):**
```javascript
// Routes
{ type: 'home' }               // Homepage with story grid
{ type: 'story', id: 'GEN-001' } // Individual story view

// Navigation
window.GraceRouter.navigate('#/story/GEN-001');
window.GraceRouter.navigateHome();

// Listen for changes
window.GraceRouter.onRouteChange((newRoute, prevRoute) => {
    // Handle view transitions
});
```

**View Switching:**
- Both views exist in `index.html` (`#homeView` and `#storyView`)
- Router toggles visibility via `display: none/block`
- State preserved when navigating between views

### Self-Hosted Dependencies

To avoid browser tracking prevention blocking third-party CDNs, the Supabase JS library is self-hosted:

**Location:** `viewer/lib/supabase.min.js`

**Why Self-Hosting?**
- Browser privacy features (Edge, Firefox, Safari, Brave) block third-party scripts from accessing localStorage
- This breaks Supabase auth and can hang data loading
- Self-hosted scripts are "first-party" and never blocked

### Fallback Data Loading

If Supabase is unreachable, the app falls back to static JSON data:

**Location:** `viewer/data/all-spreads.json`

**Flow:**
1. Try loading from Supabase (live data with images, status)
2. If failed, load from static JSON (basic story info)
3. If both fail, show error with retry button

---

## Configuration

### `config.js`

```javascript
// Supabase Configuration (public keys - safe to commit)
window.SUPABASE_CONFIG = {
    url: 'https://zekbemqgvupzmukpntog.supabase.co',
    anonKey: 'eyJ...' // Anon key (protected by RLS)
};

// n8n Webhook Configuration
window.N8N_WEBHOOK_URL = 'https://grysngrhm.app.n8n.cloud/webhook/regenerate-image';
```

**Security Note:** The anon key is designed to be public. It only allows operations permitted by Row Level Security (RLS) policies. The service role key (full access) is stored in n8n, never in this repo.

---

## User Authentication

### Magic Link Flow (PKCE)

The app uses Supabase Auth with email magic links (passwordless authentication) using **PKCE flow** for security:

1. User clicks "Sign In" button in header
2. Modal opens with email input
3. User enters email and clicks "Send Magic Link"
4. Email with login link sent to user (contains `token_hash`)
5. User clicks link → app receives token_hash in URL
6. App calls `verifyOtp({ token_hash, type })` to exchange for session
7. Session persisted in browser

**PKCE Flow vs Implicit Flow:**
- PKCE (Proof Key for Code Exchange) is more secure
- Requires custom URL format: `{{ .SiteURL }}/#/auth/confirm?token_hash={{ .TokenHash }}&type=...`
- App handles token verification (not Supabase redirect)
- See `supabase/EMAIL_TEMPLATES.md` for template configuration

### PWA Login Flow (OTP Code)

PWA users face a challenge: magic links open in the browser, not the installed app. The app automatically detects PWA mode and uses OTP codes instead.

**Solution (PWA - Automatic):**
1. User enters email in sign-in modal
2. App detects PWA mode → sends OTP code instead of magic link
3. Email contains 8-digit code (plus magic link as backup)
4. User enters code in PWA
5. Code verified → user logged in within PWA

**Solution (Browser - Fallback):**
1. After sending magic link, a "Check Login Status" button appears
2. User clicks link in email (opens browser)
3. Browser logs in (session stored)
4. User returns to PWA and taps "Check Login Status"
5. PWA checks for existing session and logs in

**OTP Features:**
- 8-digit numeric code
- Auto-submit on full entry
- Paste support
- 60-second resend cooldown
- Session state persists if modal closes
- Visual success feedback before closing

### Auth State Management

```javascript
// In auth.js
window.GraceAuth = {
    initAuth(),              // Initialize auth state
    signInWithMagicLink(),   // Send magic link
    signOut(),               // Log out user
    isAuthenticated(),       // Check if logged in
    isAdmin(),               // Check if admin role
    getCurrentUser(),        // Get current user object
    onAuthStateChange()      // Subscribe to auth changes
};
```

### User Roles

| Role | Detection | Capabilities |
|------|-----------|--------------|
| **Guest** | Not authenticated | View stories, browse images |
| **User** | Authenticated, `is_admin = false` | Favorites, read tracking, personal images |
| **Admin** | Authenticated, `is_admin = true` | All user features + regeneration, admin dashboard |

### Admin Assignment

To make a user an admin, run in Supabase SQL Editor:

```sql
UPDATE user_profiles 
SET is_admin = true 
WHERE email = 'admin@example.com';
```

---

## User Features

### Favorites

Users can mark stories as favorites:

**Story Page:**
- Heart icon button below story title
- Click to toggle favorite status
- Filled red heart = favorited
- Outlined heart = not favorited
- Animation on click for feedback

**Home Page:**
- Favorited stories have golden glow border
- Filter toggle: "All / Favorites / Unread / Read"
- Favorites filter shows only favorited stories

### Read Tracking

Stories are automatically marked as "read":

**Trigger:** User scrolls to (or near) the bottom of the story page content.

**Story Page:**
- Checkmark icon appears on card when read
- Non-intrusive visual indicator

**Home Page:**
- Read stories show checkmark on card
- Filter toggle for "Unread" or "Read" stories
- Filters combine: can show "Favorites that are Unread"

### Personal Image Selection

Users can choose their preferred primary image per story:

**Behavior:**
- Logged-out users: See admin-selected default image
- Logged-in users without selection: See 4-image grid
- Logged-in users with selection: See their selected primary

**Selection Process:**
1. View story page
2. Click any of the 4 images
3. Click "Select as Primary"
4. Image becomes your personal primary
5. Persists across sessions

### Offline Library

Logged-in users can save stories for offline reading:

**Saving Stories:**
- Download icon (↓) on story page header
- Click to save story + primary image to device
- Icon turns green when saved
- Stories saved to IndexedDB (persists across sessions)

**Accessing Library:**
- "Library" (📥) filter button on home page
- Shows only saved stories when offline
- Stories available without internet connection

**Storage Management (Settings):**
| Section | Description |
|---------|-------------|
| **Automatic Cache** | Recently viewed stories (LRU, auto-managed) |
| **My Library** | Manually saved stories (permanent until removed) |

**Actions:**
- "Clear Automatic Cache" — Remove auto-cached stories
- "Download All Favorites" — Bulk save all favorited stories
- "Clear My Library" — Remove all saved stories

### Settings Modal

Accessed via gear icon in header (when logged in). iOS-inspired design with grouped sections.

**Appearance Section:**
| Setting | Options | Default |
|---------|---------|---------|
| Dark Mode | On/Off | On |
| Font Size | Small/Medium/Large | Medium |

**Reading Section:**
| Setting | Options | Default |
|---------|---------|---------|
| Bible Version | NIV/ESV/KJV/NKJV/NLT/NASB/WEB | NIV |

*Note: Bible Version changes the link to view the full scripture on Bible Gateway, not the quotes in the story.*

**Storage Section:**
- Download Entire Bible — Downloads all stories and primary images for offline viewing
- Clear Automatic Cache — Remove auto-cached stories
- Clear My Library — Remove all manually saved stories (logged in only)
- Storage usage statistics displayed
- Device Storage Quota — Visual progress bar showing used/available space

**Download Entire Bible Feature:**
- Downloads all story data and the user's primary image per story
- Uses global default image if user hasn't selected a primary
- Reduces download size by ~75% (only 1 image per story vs 4)
- Progress persists if interrupted — can resume later
- Shows percentage and story count during download

**Performance Section:**
| Setting | Options | Default |
|---------|---------|---------|
| Smart Prefetch | On/Off | On |

*Smart Prefetch preloads adjacent stories (prev/next 2) when viewing a story for faster navigation.*

**Account Section:**
- Shows current user email
- Sign Out button

**About Section:**
- Admin users see "Admin Panel" link
- Gold glow effect on settings icon indicates admin status

**Settings Persistence:**
- Stored in `localStorage` as `graham-settings`
- Applied immediately on page load
- Synced across tabs

**Mobile Settings:**
- Bottom-sheet style modal (slides up from bottom)
- Max height 85% of viewport
- Internal scrolling if content overflows
- Tap backdrop to close

---

## Admin Features

### Admin Dashboard (`admin.html`)

**Access:** Only authenticated admins (checked via `is_admin` flag)

**Dashboard Overview Cards:**
| Card | Data | Clickable? |
|------|------|------------|
| Total Stories | Count of all spreads | No |
| Complete Stories | Spreads with status_image = 'done' | No |
| Registered Users | Total user_profiles count | Yes → User stats modal |
| Total Favorites | Sum of all favorites | Yes → Top favorites modal |
| Stories Read | Sum of all read records | Yes → Top reads modal |
| Image Selections | Sum of personal primaries | Yes → Top images modal |

**Modal Details:**
- **User Stats:** Total users, admin count, new this week
- **Top Favorites:** Top 10 most favorited stories
- **Top Reads:** Top 10 most read stories
- **Top Images:** Top 8 selected images with thumbnails

**Quick Actions:**
- View Site (return to homepage)
- Refresh Stats
- Open Supabase Dashboard
- Open GitHub Repo

**Recent Users Table:**
- Email, role, favorites count, read count, join date
- Last 10 users

**Popular Images Grid:**
- Top 6 most selected images with selection counts
- Visual popularity bars

### Image Regeneration (Admin Only)

Admins can regenerate images for any story:

1. Visit any story page
2. Click regenerate icon (↻) on any image
3. Modal opens with countdown timer (~90 seconds)
4. n8n workflow generates 4 new options
5. Select preferred image
6. Option to set as global default

**Technical Flow:**
```
Admin clicks regenerate
    ↓
POST to n8n webhook: { spread_code, slot }
    ↓
n8n creates regeneration_requests entry
    ↓
Web app polls table every 2 seconds
    ↓
When status = 'ready', show 4 new options
    ↓
Admin selection updates spread's image_url_X
```

### Global Default Images

When admin selects a primary image:
- Updates `primary_slot` column (integer 1-4) indicating which slot is the global default
- All users without personal selection see the image from this slot
- Users with personal selections unaffected
- Uses slot-based reference (not URL duplication) to prevent orphaned references after regeneration

### Admin Curation Mode

A dedicated workflow for efficiently reviewing and setting default images across all stories.

**Access:**
1. Go to Admin Dashboard (`/viewer/admin.html`)
2. Click "Curate Default Images" card
3. Navigates to main app in curation mode

**Curation View Layout:**
- **Left side:** 2×2 image grid for quick comparison
- **Right side:** Story metadata (title, focal symbol, visual approach, prompt)
- **Top bar:** Progress indicator and navigation controls
- **Keyboard shortcuts** displayed at bottom

**Keyboard Shortcuts:**
| Key | Action |
|-----|--------|
| `1-4` | Set image slot 1-4 as global default |
| `Shift+1-4` | Regenerate image in slot 1-4 |
| `←` | Previous story |
| `→` | Next story |
| `Esc` | Exit curation mode |

**Curation Filter:**
- Default: Stories without a global default image (`no-default`)
- Shows only stories needing attention
- Progress bar shows completion status

**Generate All Images (Empty Stories):**
- For stories with no images at all, a "Generate All Images" button appears
- Triggers n8n workflow to generate all 4 images at once
- Images automatically assigned to slots 1-4 (no selection modal)
- Progress indicator shows generation status

**Admin Dashboard Stats:**
- Stories Needing Default Image
- Pending Images
- Being Regenerated

---

## Loading States

### Skeleton Loading

The app uses skeleton loading states for smooth transitions and perceived performance.

**Story Page Skeleton:**
- Animated placeholder for image area (left)
- Skeleton lines for title, passage, key verse, and paraphrase
- Pulse animation while loading
- Replaced immediately when data arrives

**Home Page Skeleton:**
- Grid of skeleton cards matching actual layout
- Animated image placeholder per card
- Skeleton text for title and metadata
- 12 skeleton cards shown during initial load

**CSS Animation:**
```css
@keyframes skeleton-pulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 0.8; }
}
```

---

## Error Handling

### User-Friendly Error Messages

Network and database errors are translated to friendly messages:

| Error Type | User Message |
|------------|--------------|
| Network error | "Network error. Please check your connection and try again." |
| Timeout | "Request timed out. Please try again." |
| Auth expired | "Your session has expired. Please sign in again." |
| Generic | "Something went wrong. Please try again." |

**Toast Notifications:**
- Error toasts shown in red
- Success toasts shown in default style
- Auto-dismiss after 3-5 seconds
- Can be manually dismissed

**Optimistic Updates:**
- UI updates immediately on user action
- Reverts with error toast if backend fails
- Applies to: favorites, read status, image selection

---

## Progressive Web App (PWA)

### Installation

**iOS Safari:**
1. Visit the site in Safari
2. Scroll down (banner appears after engagement)
3. Tap "How to Install"
4. Follow steps: Share (□↑) → Add to Home Screen → Add

**Android Chrome:**
1. Visit the site in Chrome
2. Banner appears after scrolling
3. Tap "Install"
4. Chrome's native install dialog appears

**Already Installed:**
- Banner never appears (detected via `display-mode: standalone`)
- Dismissal remembered for 7 days

### PWA Features

| Feature | Description |
|---------|-------------|
| **App Shell Caching** | HTML, CSS, JS, icons cached for instant load |
| **Network-First HTML** | Always fetches fresh content, falls back to cache |
| **Font Caching** | Google Fonts cached in separate cache |
| **Image Caching** | Story images cached for offline viewing |
| **Offline Page** | Beautiful fallback when offline with no cached content |
| **Offline Banner** | Shows when device is offline with cached story count |
| **Update Notifications** | Toast appears when new version available |
| **Install Prompt** | Smart banner with platform-specific instructions |
| **OTP Authentication** | Code-based login for PWA (no browser redirect) |

### Offline Capabilities

**Automatic Caching:**
- Stories cached in IndexedDB when viewed
- Primary images cached in Cache API
- LRU eviction keeps cache size manageable (~100 stories)
- Works for all users (logged in or not)

**Smart Prefetch:**
- When viewing a story, adjacent stories (prev/next 2) are prefetched in background
- Uses `requestIdleCallback` for low-priority fetching (doesn't block UI)
- Only prefetches story data (not images) to save bandwidth
- Configurable via Settings > Performance > Smart Prefetch toggle
- Dramatically improves navigation speed between stories

**User Library (logged in):**
- Manual "Save to Library" button on stories
- Stories saved permanently until removed
- Synced to Supabase for cross-device access
- "Library" filter shows saved stories

**Offline Detection:**
- Automatic detection via `navigator.onLine`
- Offline banner shows cached story count
- Filters automatically show only available stories
- Graceful degradation when network unavailable

### Service Worker Strategy

```
Static Assets (CSS, JS, lib/supabase.min.js):
  → Cache first, network fallback

HTML Pages:
  → Network first, cache fallback, offline page last resort

Google Fonts:
  → Cache first (dedicated font cache)

Story Images (Supabase Storage):
  → Cache first with network fallback
  → Stored in dedicated image cache

Supabase API:
  → Network with 5-second timeout
  → Falls back to IndexedDB/static JSON
```

### Icons

| File | Size | Purpose |
|------|------|---------|
| `icon-192.png` | 192×192 | Android PWA |
| `icon-512.png` | 512×512 | Android install |
| `icon-180.png` | 180×180 | iOS touch icon |
| `icon-maskable-192.png` | 192×192 | Android adaptive |
| `icon-maskable-512.png` | 512×512 | Android adaptive |
| `favicon-32.png` | 32×32 | Browser tabs |
| `icon.svg` | scalable | Modern browsers |

---

## Homepage Features

### Header

**Structure:**
```
The Graham Bible — An illustrated Bible arranged story by story
[Admin Status Buttons (admin only)] [Sign In / Settings Button]
```

- Tagline hidden on mobile (< 900px)
- Sign In button for guests
- Settings gear icon for logged-in users
- Gold glow on settings icon for admins

### Filter System

**User Filters (logged in only):**
- All / Favorites / Unread / Read
- Segment control style
- Shown above testament filter

**Testament Filter:**
- All / Old Testament / New Testament
- Segment control style

**Book Groupings:**
- Torah, History, Poetry, Prophets (OT)
- Gospels (chronological), Acts, Epistles, Revelation (NT)
- Cascades based on testament
- Gospels shown in Jesus's life order, not by book

**Individual Books:**
- All 66 books
- Cascades based on grouping

**Status Filter (admin only):**
- Total / Complete / Pending
- Shows counts in buttons

**Search:**
- Searches: title, passage reference, spread code
- Real-time filtering
- Keyboard shortcut: ⌘K (Mac) / Ctrl+K (Windows)
- Shortcut hint hidden on mobile

### Grid Display

- Cards show: image, title, book, passage reference
- Favorited cards: golden glow border
- Read cards: checkmark indicator
- Pending spreads: placeholder image
- Complete badge (admin only)
- Click any card to view full spread

### Performance Optimizations

**Image Transforms (Supabase):**
- Homepage thumbnails use Supabase image transforms (400px width, 80% quality)
- Story page 4-image grid also uses transformed thumbnails
- Only single-image story view loads full resolution
- Reduces initial page load by ~80%

**Progressive Loading:**
- Initial load: 48 story cards
- More cards loaded on scroll via IntersectionObserver
- Static JSON (`data/all-spreads.json`) loaded first for instant rendering
- Background Supabase fetch updates with latest data

**Preconnect Hints:**
- Google Fonts
- Supabase storage domain
- Reduces DNS/TLS handshake latency

### Unified Breadcrumb Header

Scroll-reveal breadcrumb showing current section:

**Behavior:**
1. Breadcrumb hidden at page top
2. Slides in when user scrolls past first section header
3. Updates dynamically as user scrolls
4. Shows: Testament › Book Grouping › Book

### Chronological Sorting

Stories are displayed in chronological order using the `spread_code` prefix system:

**How It Works:**
- Each story has a unique `spread_code` (e.g., `GEN-001`, `GSP-042`)
- The prefix determines the section (GEN = Genesis, GSP = Gospels, etc.)
- The numeric suffix determines order within that section
- Stories are sorted by prefix order, then by numeric suffix

**The Gospels Are Special:**
- All four Gospels (Matthew, Mark, Luke, John) share the `GSP` prefix
- The GSP numeric sequence follows **Jesus's chronological life**, not canonical book order
- Example: GSP-001 = Luke 1:1-25 (Birth of John Foretold), GSP-004 = Matthew 1:18-25 (Joseph's Dream)
- This allows readers to follow Jesus's story in the order it happened

**Header Behavior:**
- For most book groupings: Book headers appear when the book changes
- For the Gospels grouping: Book headers are **hidden** (since books are interleaved chronologically)
- If user filters to a specific Gospel (e.g., Matthew): No book header needed (all stories are from that book)

**Spread Code Prefixes (in order):**
| Section | Prefixes |
|---------|----------|
| Torah | GEN, EXO, LEV, NUM, DEU |
| History | JOS, JDG, RUT, 1SA, 2SA, 1KI, 2KI, 1CH, 2CH, EZR, NEH, EST |
| Poetry | JOB, PSA, PRO, ECC, SNG |
| Prophets | ISA, JER, LAM, EZK, DAN, HOS, JOE, AMO, OBA, JON, MIC, NAH, HAB, ZEP, HAG, ZEC, MAL |
| Gospels | GSP (single prefix, chronological) |
| Acts | ACT |
| Epistles | ROM, 1CO, 2CO, GAL, EPH, PHP, COL, 1TH, 2TH, 1TI, 2TI, TIT, PHM, HEB, JAS, 1PE, 2PE, 1JO, 2JO, 3JO, JUD |
| Revelation | REV |

---

## Spread View Features

### Two-Page Layout

**Desktop:** Mimics book spread format
- **Left Page**: Full-size image (fixed, doesn't scroll)
- **Right Page**: Content (scrollable)
  - Title + favorite button
  - Passage reference (links to Bible Gateway)
  - Key verse (KJV, italic styling)
  - Paraphrase text (440-520 words)

**Mobile:** Stacks vertically
- Image at top (full width, no crop)
- Content below
- Floating navigation buttons at bottom

### Image Selection

**4 AI-generated options per spread:**

**Grid View (default for logged-in users without selection):**
- 2×2 thumbnail grid
- Currently selected has checkmark badge
- Click any image to view full-size
- Hover reveals "Select as Primary" button

**Collapsed View (after selection):**
- Shows only primary image
- "Change Image Selection" button to expand

### Audio Narration

Text-to-speech using Web Speech API:

**Controls:**
- Speaker icon in story header
- Expands to show: Play/Pause, Stop, Speed (0.75x, 1x, 1.25x, 1.5x)

**Reads:**
1. Story title
2. Key verse
3. Full paraphrase text

**Features:**
- Free (no API cost)
- Works offline
- System voice (varies by device)
- Stops when navigating away

### Navigation

**Desktop:**
- Previous/Next arrows in nav bar
- Position indicator: "15 / 247"
- Keyboard: ← (previous), → (next)

**Mobile:**
- Floating buttons at bottom corners
- Previous (←) on left, Next (→) on right
- Disabled at start/end of collection

---

## Dark Mode

### Color Palette

| Variable | Light | Dark |
|----------|-------|------|
| `--bg-primary` | #FAFAFA | #121212 |
| `--bg-secondary` | #FFFFFF | #1A1A1A |
| `--text-primary` | #1A1A1A | #F5F5F5 |
| `--text-secondary` | #555555 | #BBBBBB |
| `--color-gold` | #888888 | #C9A227 |

### Implementation

- CSS variables for all colors
- `[data-theme="dark"]` selector for overrides
- Persisted in `localStorage` via `graham-settings`
- Dark mode is default
- Can be toggled in Settings modal

---

## Mobile Optimizations

### Layout Changes (< 768px)
- Single column grid (2 cards per row)
- Horizontal header (title + settings in same row)
- Full-width filters with horizontal scroll
- Floating navigation buttons at bottom
- Hidden tagline and keyboard shortcuts

### Touch Targets
All interactive elements meet 44×44px minimum:
- Navigation buttons
- Favorite/Library/Read/Share buttons
- Modal close buttons
- Image selection overlays
- Regeneration buttons

### Story Header (Mobile)
- Action icons row above title (not beside)
- Title has full width for readability
- Icons: Favorite, Library, Read, Audio, Share

### Image Handling
- `object-fit: contain` (no cropping)
- Full height images
- Touch-friendly image selection (always visible overlay)
- Tap to select primary image

### Modals (Mobile)
- Bottom-sheet style (slides up from bottom)
- Max height 85% of viewport
- Internal scrolling for overflow
- Tap backdrop to close
- Rounded top corners

### Safe Areas
- Bottom padding for iPhone home indicator
- `env(safe-area-inset-bottom)` support
- Top padding for notch: `env(safe-area-inset-top)`

### Scroll Improvements
- Touch events for breadcrumb updates
- Passive event listeners for performance
- `-webkit-sticky` for iOS Safari

---

## Data Fetching

### Supabase Queries

**Load All Spreads (Homepage):**
```javascript
const { data } = await supabase
    .from('grahams_devotional_spreads')
    .select('spread_code, title, kjv_passage_ref, status_text, status_image, primary_slot, image_url_1, image_url_2, image_url_3, image_url_4, testament, book, start_chapter, start_verse');
```

**Primary Image Selection Logic:**
```javascript
function getPrimaryImageUrl(story, userPrimarySlot = null) {
    // Priority 1: User's personal selection
    if (userPrimarySlot) {
        const url = story[`image_url_${userPrimarySlot}`];
        if (url) return url;
    }
    // Priority 2: Global default (admin-curated)
    const globalSlot = story.primary_slot || 1;
    return story[`image_url_${globalSlot}`] || story.image_url_1 || null;
}
```

**Thumbnail URL Generation:**
```javascript
function getThumbnailUrl(imageUrl, width = 400, quality = 80) {
    if (!imageUrl?.includes('supabase.co/storage/v1/object/')) return imageUrl;
    const thumbnailUrl = imageUrl.replace('/storage/v1/object/', '/storage/v1/render/image/');
    return `${thumbnailUrl}?width=${width}&quality=${quality}`;
}
```

**Load Single Spread:**
```javascript
const { data } = await supabase
    .from('grahams_devotional_spreads')
    .select('*')
    .eq('spread_code', spreadCode)
    .single();
```

**Load User Favorites:**
```javascript
const { data } = await supabase
    .from('user_favorites')
    .select('spread_code')
    .eq('user_id', userId);
```

**Toggle Favorite:**
```javascript
// Add
await supabase.from('user_favorites').insert({ user_id, spread_code });

// Remove
await supabase.from('user_favorites').delete()
    .eq('user_id', userId)
    .eq('spread_code', spreadCode);
```

**Mark as Read:**
```javascript
await supabase.from('user_read_stories').upsert({
    user_id: userId,
    spread_code: spreadCode,
    read_at: new Date().toISOString()
});
```

**Get/Set Personal Primary Image:**
```javascript
// Get
const { data } = await supabase
    .from('user_primary_images')
    .select('image_slot')
    .eq('user_id', userId)
    .eq('spread_code', spreadCode)
    .single();

// Set
await supabase.from('user_primary_images').upsert({
    user_id: userId,
    spread_code: spreadCode,
    image_slot: slot
});
```

**Offline Library Operations:**
```javascript
// Get user's library
const { data } = await supabase
    .from('user_library')
    .select('spread_code')
    .eq('user_id', userId);

// Add to library
await supabase.from('user_library').insert({
    user_id: userId,
    spread_code: spreadCode
});

// Remove from library
await supabase.from('user_library').delete()
    .eq('user_id', userId)
    .eq('spread_code', spreadCode);
```

---

## Troubleshooting

### Authentication Issues

**Magic link not working:**
- Check Supabase Auth settings: Site URL and Redirect URLs
- Ensure redirect URL matches exactly (no trailing spaces)
- Email template must use `{{ .ConfirmationURL }}` (not `{{ .SiteURL }}`)
- SMTP sender email must be lowercase and match verified domain
- PWA users: Use OTP code entry or "Check Login Status" button

**Magic link redirects but doesn't log in:**
- Ensure `auth.js` calls `getSession()` before setting up listeners
- Check browser console for `[Auth]` logs
- Hard refresh (`Ctrl+Shift+R`) to clear cached JavaScript
- Verify latest `auth.js` version is deployed (check `?v=` parameter)

**Admin features not showing:**
- Verify `is_admin = true` in `user_profiles` table
- Check browser console for auth state logs
- Run SQL to restore admin status if needed:
  ```sql
  UPDATE public.user_profiles 
  SET is_admin = true 
  WHERE email = 'your-email@example.com';
  ```
- Try logging out and back in

**Admin RLS issues (empty data in admin panel):**
- RLS policies may be blocking admin access
- Use `SECURITY DEFINER` functions for admin queries
- See `supabase/migrations/011_admin_rls_policies.sql`

**Session not persisting:**
- Check localStorage is not blocked
- Verify cookies are enabled
- PWA: Session shared with browser

### Images not loading
- Check Supabase storage bucket is public
- Verify URLs in database are correct
- Check browser console for CORS errors

### Filters showing empty results
- Ensure `testament` and `book` columns populated
- Run backfill SQL if columns are NULL
- Check JavaScript console for errors

### Regeneration not working
- Verify n8n webhook URL in `config.js`
- Check n8n workflow is active
- Verify Replicate has sufficient credits
- Check `regeneration_requests` table for errors

### PWA not installing
- Must be served over HTTPS (GitHub Pages provides this)
- Check manifest.json for errors (DevTools > Application)
- Verify service worker registered
- iOS: Must use Safari (other browsers don't support PWA)

### Dark mode not persisting
- Check localStorage is not blocked
- Settings stored in `graham-settings` key
- Clear cache and try again

### Favorites/Read not syncing
- Check user is logged in
- Verify RLS policies allow insert/update
- Check browser console for API errors
- Data syncs via sessionStorage flag between pages

---

## Development

### Local Development

```bash
cd viewer
python -m http.server 8000
# or
npx serve .
```

Open: `http://localhost:8000`

### Cache Busting

When making changes, update version query strings:
```html
<link rel="stylesheet" href="styles.css?v=33">
<script src="app.js?v=33"></script>
<script src="auth.js?v=13"></script>
<script src="offline.js?v=3"></script>
<script src="settings.js?v=3"></script>
```

Also update service worker cache name:
```javascript
const CACHE_NAME = 'graham-bible-v12';
```

**Current Versions (as of Dec 2025):**
| File | Version |
|------|---------|
| `styles.css` | v35 |
| `app.js` | v38 |
| `auth.js` | v14 |
| `offline.js` | v4 |
| `settings.js` | v4 |
| `router.js` | v2 |
| Service Worker | v18 |

### Deployment

Push to `main` branch — GitHub Pages auto-deploys.

**Primary URL:** `https://www.grahambible.com`  
**Alternate URL:** `https://grysngrhm-tech.github.io/graham-devotional/`

---

## SEO & Social Sharing

### Search Engine Optimization

**robots.txt:**
```
User-agent: *
Allow: /
Sitemap: https://www.grahambible.com/sitemap.xml
```

**sitemap.xml:**
- Lists the homepage URL
- Note: Hash-based URLs (`/#/story/...`) are not indexed by search engines
- For full story indexing, server-side rendering would be needed

**JSON-LD Structured Data:**
```json
{
  "@type": "WebSite",
  "name": "The Graham Bible",
  "url": "https://www.grahambible.com",
  "description": "An illustrated devotional Bible..."
}
```

### Social Sharing

**Open Graph Tags (Dynamic):**
- Home page: Default site metadata
- Story pages: Dynamic title, description, image based on story
- Updated via JavaScript when navigating to story

**Share Button:**
- Uses Web Share API on mobile (native share sheet)
- Falls back to copy-to-clipboard on desktop
- Located in story header next to audio controls

---

## Maintenance Tasks

### When to Update Files

| File | Update When | How |
|------|-------------|-----|
| `lib/supabase.min.js` | Supabase releases security fixes or needed features | Re-download from jsdelivr |
| `data/all-spreads.json` | Story outlines change | Copy from `data/all-spreads.json` in repo root |
| `sitemap.xml` | New static pages added | Add new `<url>` entries |
| `sw.js` (cache version) | Any file changes | Bump `CACHE_NAME` version |
| CSS/JS query strings | Any CSS/JS changes | Bump `?v=X` in `index.html` |

### Updating Supabase Library

```bash
# Download latest version
curl -o viewer/lib/supabase.min.js \
  https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js

# Or with PowerShell
Invoke-WebRequest -Uri "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js" -OutFile "viewer\lib\supabase.min.js"
```

**When to update:**
- Security vulnerabilities announced
- New Supabase features needed
- Breaking API changes (test thoroughly!)

### Updating Fallback Data

**Automated Export (Recommended):**

```bash
# From project root
cd graham-devotional
npm install  # First time only
node scripts/export-stories.js
```

This script:
- Fetches all 500 stories from Supabase
- Exports to `viewer/data/all-spreads.json`
- Includes `primary_slot` and all 4 image URLs per story
- Shows count of stories with/without images

**Manual Copy (Legacy):**
```bash
cp data/all-spreads.json viewer/data/all-spreads.json
```

**When to update:**
- After admin sets new global default images (primary_slot changes)
- After image regeneration (new image URLs)
- New stories added to the outline
- Story metadata changes (titles, references)

**Cache Busting:**
After updating, bump the version parameter in app.js:
```javascript
fetch('data/all-spreads.json?v=3')  // Increment version
```
Also update service worker cache name in `sw.js`.

---

## Version History

| Date | Version | Changes |
|------|---------|---------|
| 2025-12-09 | v38.0 | Settings button fix, storage quota display, smart prefetch system |
| 2025-12-09 | v37.0 | Primary slot migration: replaced image_url with primary_slot integer |
| 2025-12-09 | v36.0 | Homepage performance: image transforms, pagination, static JSON optimization |
| 2025-12-09 | v35.0 | Custom email templates with Playfair Display font, iOS-inspired design |
| 2025-12-09 | v34.0 | PKCE flow support: token_hash verification, updated email templates |
| 2025-12-09 | v33.0 | Magic link auth fix, reverted initAuth to working code |
| 2025-12-09 | v32.0 | Loading skeletons (story + home), improved error handling with user-friendly toasts |
| 2025-12-09 | v31.0 | Download Entire Bible progress persistence (resume interrupted downloads) |
| 2025-12-09 | v30.0 | Custom Supabase email templates with Resend SMTP integration |
| 2025-12-08 | v29.0 | Admin curation mode redesign: image grid, abstract display, keyboard shortcuts |
| 2025-12-08 | v28.0 | Generate All Images feature for stories with no images |
| 2025-12-08 | v27.0 | Admin RLS policy fix (SECURITY DEFINER function for profiles) |
| 2025-12-07 | v26.0 | iOS-inspired settings modal redesign, Download Entire Bible feature |
| 2025-12-07 | v25.0 | Optimistic data loading with story-list caching |
| 2025-12-06 | v24.0 | Race condition fixes for rapid navigation |
| 2025-12-06 | v23.0 | Event listener cleanup to prevent memory leaks |
| 2025-12-06 | v22.0 | User primary image selection for home page thumbnails |
| 2025-12-05 | v21.0 | Bug fixes: favorites/read sync, image selection persistence |
| 2025-12-04 | v12.0 | Mobile layout fixes, filter ordering, story header restructure |
| 2025-12-04 | v11.5 | Supabase timeout wrappers, fallback data for story pages |
| 2025-12-04 | v11.0 | OTP authentication for PWA, 8-digit code entry |
| 2025-12-04 | v10.5 | Offline library, IndexedDB storage, image caching |
| 2025-12-04 | v10.2 | Touch targets 44px minimum, bottom-sheet modals |
| 2025-12-04 | v10.0 | Self-hosted Supabase library, fallback data loading |
| 2025-12-04 | v9.5 | Privacy Policy, Terms of Service, legal notices |
| 2025-12-04 | v9.0 | SEO: robots.txt, sitemap.xml, JSON-LD structured data, 404 page |
| 2025-12-04 | v8.5 | Share button with Web Share API, dynamic OG tags |
| 2025-12-04 | v8.2 | SPA conversion: hash-based routing, single index.html |
| 2025-12-04 | v8.1 | Custom domain: www.grahambible.com |
| 2025-12-04 | v8.0 | Rebrand to "The Graham Bible", admin tile modals |
| 2025-12-04 | v7.5 | Fix PWA login button, tagline in header |
| 2025-12-04 | v7.4 | Admin-only status indicators, mobile PWA detection |
| 2025-12-04 | v7.3 | Admin panel with statistics dashboard |
| 2025-12-04 | v7.2 | Gold glow for admin, admin link in settings |
| 2025-12-04 | v7.1 | PWA login flow with "Check Login Status" |
| 2025-12-04 | v7.0 | User accounts, favorites, read tracking, settings modal |
| 2025-12-03 | v6.0 | PWA install prompt with iOS/Android detection |
| 2025-12-03 | v5.5 | Complete PWA: icons, manifest, service worker, offline page |
| 2025-12-02 | v5.0 | Dark mode, audio narration, surprise button |
| 2025-12-02 | v4.0 | Unified scroll-reveal breadcrumb header |
| 2025-12-01 | v3.0 | Image regeneration feature with countdown UI |
| 2025-12-01 | v2.0 | Book grouping filters (Torah, Gospels, etc.) |
| 2025-12-01 | v1.0 | Initial viewer with filters and curation |
