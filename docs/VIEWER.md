# Web Viewer Documentation

> Complete documentation for The GRACE Bible web viewer application.

---

## Overview

The web viewer is a **Progressive Web App (PWA)** that displays devotional spreads and provides curation tools. It's deployed via GitHub Pages and connects directly to Supabase for data.

**Live URL:** [grysngrhm-tech.github.io/graham-devotional](https://grysngrhm-tech.github.io/graham-devotional/viewer/index.html)

---

## File Structure

| File | Purpose | Lines |
|------|---------|-------|
| `index.html` | Homepage - grid of all spreads | ~170 |
| `spread.html` | Individual spread view | ~240 |
| `offline.html` | Offline fallback page | ~100 |
| `styles.css` | All CSS styling | ~2800 |
| `app.js` | Main application logic | ~2000 |
| `config.js` | Supabase & n8n configuration | ~17 |
| `sw.js` | Service worker for PWA | ~80 |
| `manifest.json` | PWA manifest | ~60 |
| `icons/` | PWA icons (7 files) | — |

---

## Configuration

### `config.js`

```javascript
// Supabase Configuration (public keys - safe to commit)
const SUPABASE_URL = 'https://zekbemqgvupzmukpntog.supabase.co';
const SUPABASE_ANON_KEY = 'eyJ...'; // Anon key (protected by RLS)

// n8n Webhook Configuration
const N8N_WEBHOOK_URL = 'https://grysngrhm.app.n8n.cloud/webhook/regenerate-image';
```

**Security Note:** The anon key is designed to be public. It only allows operations permitted by Row Level Security (RLS) policies. The service role key (full access) is stored in n8n, never in this repo.

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

### Grid Display

- Shows all spreads as cards with thumbnails
- Cards show: image, title, book, passage reference
- Pending spreads show placeholder
- Complete badge on finished spreads
- Click any card to view full spread

### Unified Breadcrumb Header

A scroll-reveal breadcrumb that shows current section context:

```
The GRACE Bible
───────────────
Old Testament › Torah › Genesis     (appears on scroll)
```

**Behavior:**
1. Breadcrumb hidden at page top
2. Slides in when user scrolls past first section header
3. Updates dynamically as user scrolls through sections
4. Shows: Testament › Book Grouping › Book

**Technical Implementation:**
- Breadcrumb row is inside the main sticky header
- JavaScript scroll listener detects when in-grid headers pass header bottom
- CSS transition for smooth slide-in (`max-height` + `opacity`)
- Uses `requestAnimationFrame` for performance

### Filter System

#### Testament Filter (Segment Control)
- **All** — Show all spreads
- **Old Testament** — Only OT books
- **New Testament** — Only NT books

#### Book Filter (Dropdown)
Cascading dropdown that updates based on testament selection:

When "All" selected:
- Book Groupings (Torah, History, etc.)
- All 66 books

When "Old Testament" selected:
- OT Groupings only (Torah, History, Poetry, Prophets)
- OT books only (Genesis - Malachi)

When "New Testament" selected:
- NT Groupings only (Gospels, Acts, Epistles, Revelation)
- NT books only (Matthew - Revelation)

#### Status Filter (Pills)
- **All** — Show all spreads
- **Complete** — Only `status_image = 'done'`
- **Pending** — Only `status_image != 'done'`

#### Search
- Searches: title, passage reference, spread code
- Case-insensitive
- Real-time filtering as you type
- Keyboard shortcut: ⌘K (Mac) / Ctrl+K (Windows)

### Special Features

#### Surprise Me Button
Random story selection:
- Golden shuffle button in filter row
- Navigates to random spread
- Weighted toward incomplete spreads (optional)

#### Dark Mode Toggle
- Sun/moon icon in header
- Persists preference in localStorage
- Respects system preference by default
- Rich dark theme with gold accents

### Chronological Sorting

Spreads displayed in Biblical order:
1. **Book Order**: Canonical Protestant (Genesis → Revelation)
2. **Chapter**: Within each book
3. **Verse**: Within each chapter

---

## Spread View Features

### Two-Page Layout

Desktop mimics book spread format:
- **Left Page**: Full-size image (fixed, doesn't scroll)
- **Right Page**: Content (scrollable)
  - Title
  - Passage reference (links to Bible Gateway)
  - Key verse (KJV, italic styling)
  - Paraphrase text (440-520 words)

Mobile stacks vertically:
- Image at top (full width, no crop)
- Content below
- Floating navigation buttons at bottom

### Image Selection

4 AI-generated options per spread:

**Grid View:**
- 2×2 thumbnail grid
- Currently selected has checkmark badge
- Click any image to view full-size
- Hover reveals "Select as Primary" button

**Collapsed View:**
- Shows only primary image
- "Change Image Selection" button to expand

### Select as Primary

1. Click image thumbnail
2. Click "Select as Primary" (or checkmark)
3. Updates `image_url` column in Supabase
4. Visual feedback confirms selection

### Image Regeneration

Each image slot has regenerate button (↻ icon):

1. Click regenerate icon
2. Modal opens with countdown timer (~90 seconds)
3. Progress ring shows stages:
   - "Analyzing passage..." (0-15s)
   - "Generating prompts..." (15-30s)
   - "Creating images..." (30-80s)
   - "Finalizing..." (80-90s)
4. When complete, 4 new options appear
5. Select preferred image
6. Modal closes, spread updated

**Technical Flow:**
```
User clicks regenerate
    ↓
POST to n8n webhook: { spread_code, slot }
    ↓
n8n creates regeneration_requests entry
    ↓
Web app polls table every 2 seconds
    ↓
When status = 'ready', show 4 new options
    ↓
User selection updates spread's image_url_X
```

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
- Persisted in `localStorage` as `grace-theme`
- System preference detection via `prefers-color-scheme`
- IIFE in `<head>` prevents flash of wrong theme

---

## Mobile Optimizations

### Layout Changes (< 768px)
- Single column grid (2 cards per row)
- Stacked header (title above stats)
- Full-width filters
- Floating navigation buttons

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

**Update Primary Image:**
```javascript
await supabase
    .from('grahams_devotional_spreads')
    .update({ image_url: selectedUrl })
    .eq('spread_code', spreadCode);
```

**Poll Regeneration Status:**
```javascript
const { data } = await supabase
    .from('regeneration_requests')
    .select('*')
    .eq('id', requestId)
    .single();
```

---

## Troubleshooting

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
- Clear cache and try again
- Verify `data-theme` attribute on `<html>`

### Breadcrumb not appearing
- Scroll down past first section header
- Check console for `[GRACE]` logs
- Verify section headers have `data-*` attributes

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
<link rel="stylesheet" href="styles.css?v=5">
<script src="app.js?v=5"></script>
```

Also update service worker cache name:
```javascript
const CACHE_NAME = 'grace-bible-v5';
```

### Deployment

Push to `main` branch — GitHub Pages auto-deploys.

Site available at: `https://grysngrhm-tech.github.io/graham-devotional/viewer/`

---

## Version History

| Date | Version | Changes |
|------|---------|---------|
| 2025-12-03 | v5.0 | PWA install prompt with iOS/Android support |
| 2025-12-03 | v4.0 | Complete PWA implementation (icons, offline, updates) |
| 2025-12-03 | v3.0 | Mobile breadcrumb fixes, dark mode story view |
| 2025-12-02 | v2.0 | Unified scroll-reveal breadcrumb header |
| 2025-12-02 | v1.5 | Dark mode, audio narration, surprise button |
| 2025-12-02 | v1.4 | Mobile improvements, floating navigation |
| 2025-12-02 | v1.3 | Cascading filters, iOS sticky fix |
| 2025-12-02 | v1.2 | Section headers (Testament, Grouping, Book) |
| 2025-12-01 | v1.1 | Image regeneration with countdown UI |
| 2025-12-01 | v1.0 | Initial viewer with filters and curation |
