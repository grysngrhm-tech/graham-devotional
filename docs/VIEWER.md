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
| `auth.js` | Authentication logic |
| `settings.js` | User preferences |
| `config.js` | Supabase & n8n configuration |
| `sw.js` | Service worker for PWA |
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

### Magic Link Flow

The app uses Supabase Auth with email magic links (passwordless authentication):

1. User clicks "Sign In" button in header
2. Modal opens with email input
3. User enters email and clicks "Send Magic Link"
4. Email with login link sent to user
5. User clicks link → redirected to app and logged in
6. Session persisted in browser

### PWA Login Flow

PWA users face a challenge: magic links open in the browser, not the installed app.

**Solution:**
1. After sending magic link, a "Check Login Status" button appears
2. User clicks link in email (opens browser)
3. Browser logs in (session stored)
4. User returns to PWA and taps "Check Login Status"
5. PWA checks for existing session and logs in

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

### Settings Modal

Accessed via gear icon in header (when logged in):

| Setting | Options | Default |
|---------|---------|---------|
| Dark Mode | On/Off | On |
| Font Size | Small/Medium/Large | Medium |
| Bible Version | NIV/ESV/KJV/NKJV/NLT/NASB/WEB | NIV |

**Settings Persistence:**
- Stored in `localStorage` as `graham-settings`
- Applied immediately on page load
- Synced across tabs

**Admin Link:**
- Admin users see "Admin Panel" link in settings
- Gold glow effect on settings icon indicates admin status

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
- Updates `image_url` column (global default)
- All users without personal selection see this image
- Users with personal selections unaffected

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
| **Offline Page** | Beautiful fallback when offline with no cached content |
| **Update Notifications** | Toast appears when new version available |
| **Install Prompt** | Smart banner with platform-specific instructions |

### Service Worker Strategy

```
Static Assets (CSS, JS, images):
  → Cache first, network fallback

HTML Pages:
  → Network first, cache fallback, offline page last resort

Google Fonts:
  → Cache first (dedicated font cache)

Supabase API:
  → Network only (can't cache dynamic data)
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
- Gospels, Acts, Epistles, Revelation (NT)
- Cascades based on testament

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

### Unified Breadcrumb Header

Scroll-reveal breadcrumb showing current section:

**Behavior:**
1. Breadcrumb hidden at page top
2. Slides in when user scrolls past first section header
3. Updates dynamically as user scrolls
4. Shows: Testament › Book Grouping › Book

### Chronological Sorting

Spreads displayed in Biblical order:
1. **Book Order**: Canonical Protestant (Genesis → Revelation)
2. **Chapter**: Within each book
3. **Verse**: Within each chapter

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
- Stacked header (title above stats)
- Full-width filters
- Floating navigation buttons
- Hidden tagline and keyboard shortcuts

### Image Handling
- `object-fit: contain` (no cropping)
- Full height images
- Touch-friendly image selection

### Safe Areas
- Bottom padding for iPhone home indicator
- `env(safe-area-inset-bottom)` support

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
    .select('spread_code, title, kjv_passage_ref, status_text, status_image, image_url, image_url_1, testament, book, start_chapter, start_verse');
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

---

## Troubleshooting

### Authentication Issues

**Magic link not working:**
- Check Supabase Auth settings: Site URL and Redirect URLs
- Ensure redirect URL matches exactly (no trailing spaces)
- PWA users: Use "Check Login Status" button after clicking link

**Admin features not showing:**
- Verify `is_admin = true` in `user_profiles` table
- Check browser console for auth state logs
- Try logging out and back in

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
<link rel="stylesheet" href="styles.css?v=16">
<script src="app.js?v=16"></script>
```

Also update service worker cache name:
```javascript
const CACHE_NAME = 'graham-bible-v1';
```

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

```bash
# Copy from source
cp data/all-spreads.json viewer/data/all-spreads.json

# Or with PowerShell
Copy-Item "data\all-spreads.json" -Destination "viewer\data\all-spreads.json"
```

**When to update:**
- New stories added to the outline
- Story metadata changes (titles, references)
- Not needed for: image updates, status changes (those come from Supabase)

---

## Version History

| Date | Version | Changes |
|------|---------|---------|
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
