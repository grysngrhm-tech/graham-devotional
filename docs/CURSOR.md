# Cursor / AI Development Guide

> How to work with The GRACE Bible codebase using Cursor AI and MCP integrations.

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
SUPABASE_URL = 'https://zekbemqgvupzmukpntog.supabase.co'
SUPABASE_ANON_KEY = 'eyJ...' // Public anon key
```

**Direct Database Access:**
For read operations, you can query Supabase directly using the anon key. For admin operations, use the Supabase dashboard or n8n workflows.

### n8n Webhooks

The only n8n integration from the viewer is the image regeneration webhook:

```javascript
// In viewer/config.js
N8N_WEBHOOK_URL = 'https://grysngrhm.app.n8n.cloud/webhook/regenerate-image'
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
image_url           TEXT             -- Primary selected image
image_url_1/2/3/4   TEXT             -- All 4 generated options
status_image        TEXT             -- 'pending', 'done', 'error'
start_chapter       INT              -- For sorting
start_verse         INT              -- For sorting
```

### Regeneration Table: `regeneration_requests`

```sql
id              UUID PRIMARY KEY
spread_code     TEXT NOT NULL
slot            INTEGER (1-4)
option_urls     TEXT[]           -- Array of 4 new image URLs
status          TEXT             -- 'processing', 'ready', 'completed', 'failed'
created_at      TIMESTAMPTZ
```

---

## Project Architecture

### Viewer Flow

```
User visits site
    ↓
Service Worker checks cache
    ↓
HTML loads (network-first)
    ↓
app.js initializes:
    - Theme (from localStorage or system)
    - Service worker registration
    - Install prompt setup
    - Page-specific init (index or spread)
    ↓
Supabase query for data
    ↓
Render UI
```

### Key Functions in app.js

```javascript
// Initialization
initTheme()                    // Dark/light mode
registerServiceWorker()        // PWA service worker
setupInstallPrompt()           // iOS/Android install banner

// Index Page
initIndexPage()                // Main entry for homepage
loadStories()                  // Fetch from Supabase
renderStories()                // Generate cards + section headers
setupScrollRevealBreadcrumb()  // Unified header behavior
setupFilters()                 // Testament, book, status filters

// Spread Page
initStoryPage()                // Main entry for story view
loadStory()                    // Fetch single spread
renderStory()                  // Display content
setupImageSelection()          // Primary image selection
setupRegenerationButtons()     // Regenerate image feature
setupAudioControls()           // Text-to-speech

// PWA
showInstallBanner()            // Platform-specific install UI
showUpdateNotification()       // New version toast
```

### CSS Organization

```css
/* styles.css structure (~2800 lines) */

/* Variables & Resets */        Lines 1-100
/* Dark Mode Variables */       Lines 66-95
/* Layout & Typography */       Lines 100-200
/* Header & Breadcrumb */       Lines 200-350
/* Intro Section */             Lines 350-480
/* Filters */                   Lines 480-750
/* Section Headers */           Lines 750-1000
/* Story Cards Grid */          Lines 1000-1200
/* Story Page Layout */         Lines 1200-1700
/* Image Selection UI */        Lines 1700-2100
/* Regeneration Modal */        Lines 2100-2400
/* Mobile Responsive */         Lines 2400-2700
/* PWA Install Banner */        Lines 2700-2800
```

---

## Common Development Tasks

### Adding a New Feature

1. Identify which files need changes
2. Update `app.js` with new logic
3. Update `styles.css` with styling
4. Update HTML if new elements needed
5. Bump cache version (CSS/JS query strings + SW cache name)
6. Test locally
7. Push to GitHub (auto-deploys)

### Debugging

**Browser Console Logs:**
```javascript
[GRACE]         // General viewer logs
[GRACE-MOBILE]  // Mobile-specific logs
[PWA]           // Service worker logs
[SW]            // Service worker internal logs
```

**Chrome DevTools:**
- Application > Manifest — Check PWA manifest
- Application > Service Workers — Check registration
- Application > Cache Storage — See cached files
- Network — Monitor API calls

### Cache Busting

When deploying changes:

```html
<!-- In index.html and spread.html -->
<link rel="stylesheet" href="styles.css?v=6">
<script src="app.js?v=6"></script>
```

```javascript
// In sw.js
const CACHE_NAME = 'grace-bible-v6';
```

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
4. **Technical constraints**: PWA requirements, mobile support, etc.

### Example Prompts

```
"Add a share button to the story view that uses the Web Share API. 
It should appear next to the audio button in the story header. 
On iOS, it should share the story URL with title. 
Fall back to copy-to-clipboard on unsupported browsers."
```

```
"The breadcrumb header isn't updating on mobile. Check the 
scroll event listener and add debug logging to identify 
where it's failing. The desktop version works correctly."
```

### Documentation Updates

After making significant changes:

1. Update `docs/VIEWER.md` with new features
2. Update `README.md` if architecture changed
3. Add to version history table
4. Commit documentation with code changes

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
npx eslint app.js
```

---

## Troubleshooting AI Sessions

### If Changes Don't Deploy
- Check GitHub Actions for Pages deployment status
- Hard refresh (Ctrl+Shift+R) to bypass cache
- Check service worker version in DevTools

### If Features Regress
- Check git history for when feature worked
- Compare current code with working commit
- Look for merge conflicts in CSS/JS

### If AI Gets Confused
- Provide full file paths when referencing code
- Use code blocks with line numbers
- Reference documentation files explicitly
- Break complex tasks into smaller steps

---

## Quick Reference

### Key Files
- `viewer/app.js` — All JavaScript logic
- `viewer/styles.css` — All styling
- `viewer/config.js` — Supabase/n8n config
- `viewer/sw.js` — Service worker

### Key IDs (HTML)
- `#mainHeader` — Sticky header
- `#headerBreadcrumb` — Collapsible breadcrumb row
- `#storiesGrid` — Card grid container
- `#themeToggle` — Dark mode button

### Key Classes (CSS)
- `.compact-header` — Sticky header
- `.header-breadcrumb` — Breadcrumb row
- `.section-header` — In-grid section dividers
- `.story-card` — Grid cards
- `.install-banner` — PWA install prompt

