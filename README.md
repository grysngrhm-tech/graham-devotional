# The Graham Bible

An interactive, AI-assisted illustrated devotional Bible: 500 scenes from Genesis to Revelation with sacred artwork and narrative retellings.

**[GrahamBible.com](https://www.grahambible.com)** | [View the Demo](https://grysngrhm-tech.github.io/graham-devotional/)

---

## What Is The Graham Bible?

The Graham Bible is a devotional project that presents Scripture as a series of 500 illustrated stories, arranged chronologically from Creation to Revelation. Each story is a two-page "spread" designed for print:

- **Left page**: A full-page piece of sacred artwork in black and white, rendered in the cross-hatching style of classical engravers like Gustave Doré, Albrecht Dürer, and Rembrandt.
- **Right page**: The story title, a Scripture reference, a highlighted key verse, and a 440–520 word narrative retelling.

The text is not commentary. It is a faithful retelling of the biblical narrative—reverent and serious, preserving the rawness of Scripture where appropriate. The World English Bible (WEB) is used to help the AI understand the passage in modern language, but all quotations are drawn from the King James Version (KJV).

The web viewer at [GrahamBible.com](https://www.grahambible.com) is intentionally minimal. This README serves as the deeper "About" page for those who want to understand the project more fully.

---

## How the Web Viewer Works

When you open The Graham Bible, you can:

- **Browse all 500 stories** in a visual grid, with each card showing a thumbnail and title.
- **Filter by Testament** (Old or New), by book category (Torah, Prophets, Gospels, etc.), or search by title.
- **Open any story** to see the full artwork alongside the devotional text.
- **See multiple illustrations** for each story—four AI-generated options—and select your favorite as the primary image.
- **Tap "Surprise Me"** to jump to a random story.
- **Listen to audio narration** using text-to-speech.
- **Save favorites** and track which stories you've read (with a free account).
- **Install as an app** on your phone or tablet for offline access.

The interface is dark by default, with gold accents. It works on desktop and mobile, and can be installed as a Progressive Web App (PWA).

---

## The Vision: Printed Volumes

The ultimate goal is two printed 8.5×11" black-and-white devotional volumes:

| Volume | Content | Spreads |
|--------|---------|---------|
| **Volume 1** | Old Testament | 300 |
| **Volume 2** | New Testament | 200 |

Each spread is designed to be read as a single devotional unit—a moment of reflection with Scripture and art.

### Distribution by Section

| Testament | Section | Spreads |
|-----------|---------|---------|
| OT | Torah | 100 |
| OT | History | 90 |
| OT | Wisdom | 45 |
| OT | Prophets | 65 |
| NT | Gospels (Synoptic Harmony) | 105 |
| NT | Acts | 30 |
| NT | Epistles | 50 |
| NT | Revelation | 15 |
| | **Total** | **500** |

The web viewer serves two purposes: it is a devotional experience in its own right, and it is the curation tool used to prepare spreads for eventual print publication.

---

## AI and Art Pipeline

The Graham Bible uses AI to assist with both text and image generation, but all output is reviewed and curated by humans. Here is how it works at a high level:

1. **Define Spreads** — Story outlines are created with Scripture references (book, chapter, verse ranges).
2. **Fetch Scripture** — The KJV text is retrieved for quotations; the WEB text is used to give the AI modern context.
3. **Generate Summaries** — GPT-4 produces a 440–520 word narrative retelling and identifies a key verse.
4. **Generate Artwork** — Flux (an AI image model) creates four unique black-and-white illustrations per story, each with a different artistic interpretation.
5. **Curate and Display** — Humans select the primary image for each story. Users can also choose their own preferred image.

The pipeline is automated using n8n workflows, with data stored in Supabase (PostgreSQL). The web viewer is a static site hosted on GitHub Pages.

---

## Web Viewer Features (Technical)

For developers and contributors, here is a summary of the viewer's technical capabilities:

### Progressive Web App (PWA)
- Installable on iOS and Android
- Offline caching via service worker
- Update notifications when new content is available

### User Accounts
- Magic link email authentication (Supabase Auth)
- Roles: Guest, User, Admin
- User features: favorites, read tracking, personal image selection
- Admin features: image regeneration, global default images, usage dashboard

### Filter System
- By Testament (All / OT / NT)
- By book category (Torah, History, Poetry, Prophets, Gospels, Acts, Epistles, Revelation)
- By individual book (all 66)
- By user state (Favorites, Unread, Read)

### UI
- Dark mode (default), with gold accents
- Responsive layout for desktop and mobile
- Audio narration via Web Speech API
- Keyboard shortcuts for navigation

For implementation details, see [docs/VIEWER.md](docs/VIEWER.md).

---

## Architecture and Project Structure

```
graham-devotional/
├── viewer/                    # Static web viewer (PWA)
│   ├── index.html            # Single-page application (SPA)
│   ├── admin.html            # Admin dashboard
│   ├── privacy.html          # Privacy Policy
│   ├── terms.html            # Terms of Service
│   ├── 404.html              # Custom error page
│   ├── offline.html          # Offline fallback
│   ├── styles.css            # All styling
│   ├── app.js                # Main application logic
│   ├── router.js             # Hash-based SPA router
│   ├── auth.js               # Authentication logic
│   ├── settings.js           # User preferences
│   ├── config.js             # Supabase and n8n configuration
│   ├── sw.js                 # Service worker
│   ├── manifest.json         # PWA manifest
│   ├── robots.txt            # Search engine directives
│   ├── sitemap.xml           # SEO sitemap
│   ├── CNAME                 # Custom domain config
│   ├── lib/                  # Self-hosted libraries
│   │   └── supabase.min.js   # Supabase JS client
│   ├── data/                 # Fallback data
│   │   └── all-spreads.json  # Static story data
│   └── icons/                # App icons
├── docs/
│   ├── SYSTEM.md             # Pipelines, database schema, troubleshooting
│   ├── VIEWER.md             # Viewer features, UI, PWA, authentication
│   └── CURSOR.md             # AI/Cursor development patterns
├── data/
│   └── all-spreads.json      # Source story outlines
├── supabase/
│   └── migrations/           # Database migration SQL files
└── README.md                 # This file
```

### Documentation

| Document | Purpose |
|----------|---------|
| [docs/SYSTEM.md](docs/SYSTEM.md) | Technical reference for pipelines, schema, and troubleshooting |
| [docs/VIEWER.md](docs/VIEWER.md) | Viewer implementation details, UI, PWA, and authentication |
| [docs/CURSOR.md](docs/CURSOR.md) | Guide for AI-assisted development with Cursor |

---

## Quick Start (Development)

### Prerequisites
- Git
- A local HTTP server (Python, Node, etc.)

### Local Development
```bash
# Clone the repository
git clone https://github.com/grysngrhm-tech/graham-devotional.git
cd graham-devotional

# Start a local server
cd viewer
python -m http.server 8000
# or: npx serve .

# Open in browser
# http://localhost:8000
```

### Deployment
Push to the `main` branch. GitHub Pages automatically deploys from the `viewer/` directory.

---

## Security

### Public Keys (Safe to Commit)
- `SUPABASE_URL` — Public project URL
- `SUPABASE_ANON_KEY` — Public key, protected by Row Level Security
- `N8N_WEBHOOK_URL` — Public webhook endpoint

### Secret Keys (Never Commit)
- `SUPABASE_SERVICE_ROLE_KEY` — Full database access
- `REPLICATE_API_KEY` — Image generation credits
- `OPENAI_API_KEY` — GPT-4 credits

All secrets are stored in n8n's credential manager, not in this repository.

---

## About

The Graham Bible is a family devotional project that combines AI-assisted text and image generation with careful human curation. Scripture quotations are from the King James Version. Modern comprehension is aided by the World English Bible. All summaries and artwork are reviewed and curated by humans before publication.

This project is made publicly available as a technical and artistic experiment.

---

*For questions or feedback, visit the repository or reach out through the site.*
