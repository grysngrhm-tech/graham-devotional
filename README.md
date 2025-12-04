# The Graham Bible

**An illustrated Bible arranged story by story** — A modern-retold devotional featuring 500 Bible stories with AI-generated sacred artwork.

## Live Demo

🌐 **[grysngrhm-tech.github.io/graham-devotional](https://grysngrhm-tech.github.io/graham-devotional/viewer/index.html)**

## The Vision

Two printed 8.5×11" black-and-white devotional volumes:
- **Volume 1: Old Testament** — 300 spreads
- **Volume 2: New Testament** — 200 spreads

Each spread = two pages:
- **LEFT**: Full-page sacred artwork (Doré/Dürer/Rembrandt style)
- **RIGHT**: Title, KJV reference, key verse, 440-520 word narrative summary

## Distribution Summary

| Volume | Section | Spreads |
|--------|---------|---------|
| **OT** | Torah | 100 |
| **OT** | History | 90 |
| **OT** | Wisdom | 45 |
| **OT** | Prophets | 65 |
| **NT** | Gospels (Synoptic Harmony) | 105 |
| **NT** | Acts | 30 |
| **NT** | Epistles | 50 |
| **NT** | Revelation | 15 |
| | **TOTAL** | **500** |

---

## Web Viewer Features

The `viewer/` directory contains a Progressive Web App deployed via GitHub Pages:

### Core Features
- **Homepage Grid**: All 500 spreads with filtering and search
- **Story View**: Two-page book spread layout with image selection
- **Chronological Order**: Stories sorted Genesis → Revelation
- **Image Curation**: Select primary image from 4 AI-generated options
- **Image Regeneration**: Generate new options with countdown timer UI (Admin only)

### User Accounts

The app supports user accounts via Supabase Auth with **magic link email authentication**:

| Role | Capabilities |
|------|-------------|
| **Guest** | View all stories, browse images |
| **User** | All guest features + favorites, read tracking, personal image selections |
| **Admin** | All user features + image regeneration, global default images, admin dashboard |

### User Features (Logged In)
- **Favorites**: Heart button to save stories, filter by favorites on home page
- **Read Tracking**: Automatic tracking when scrolling to bottom of story
- **Personal Image Selection**: Choose your preferred primary image per story
- **Settings**: Dark mode, font size, Bible version for links

### Admin Features
- **Image Regeneration**: Generate new AI images for any story
- **Global Primary Images**: Set default images for all users
- **Admin Dashboard**: User statistics, top favorites, most read stories, image popularity

### Progressive Web App (PWA)
- **Installable**: Add to home screen on iOS and Android
- **Offline Support**: App shell cached for fast loading
- **Smart Install Prompt**: Platform-specific installation guidance
- **Update Notifications**: Toast when new version available

### UI Features
- **Dark Mode**: Rich dark theme with gold accents (default)
- **Unified Breadcrumb**: Scroll-reveal header showing current section
- **Audio Narration**: Text-to-speech using Web Speech API
- **Surprise Me**: Random story selection
- **Mobile Optimized**: Floating navigation, full-height images

### Filter System
| Category | Options |
|----------|---------|
| User Filters | All / Favorites / Unread / Read |
| Testament | All / Old Testament / New Testament |
| Book Groupings | Torah, History, Poetry, Prophets, Gospels, Acts, Epistles, Revelation |
| Individual Books | All 66 books (cascading based on testament) |
| Status (Admin) | All / Complete / Pending |

---

## Architecture

### Production Pipeline

| Component | Purpose | Technology |
|-----------|---------|------------|
| **Outline Builder** | Import spreads + fetch KJV/WEB scripture | n8n workflow |
| **Processing Pipeline** | Generate summaries + images | n8n + GPT-4 + Flux |
| **Database** | Store all spread data + user data | Supabase (PostgreSQL) |
| **Authentication** | User accounts with magic links | Supabase Auth |
| **Storage** | Host generated images | Supabase Storage |
| **Web Viewer** | Display, curate, and personalize | Static HTML/CSS/JS |
| **Hosting** | Serve web viewer | GitHub Pages |

### Data Flow
```
1. Paste spread definitions into Outline Builder
2. Scripture (KJV + WEB) fetched and stored in Supabase
3. Processing Pipeline generates summaries with GPT-4
4. Processing Pipeline generates 4 images per spread with Flux
5. Web viewer displays for curation
6. Admin selects global primary images
7. Users can select personal primary images
```

### Workflow IDs (n8n)
| Workflow | ID |
|----------|-----|
| Outline Builder | `dRZE4EHTdCr1pSjX` |
| Processing Pipeline | `Ixn36R5CgzjJn0WH` |

---

## Project Structure

```
graham-devotional/
├── viewer/                    # Static web viewer (PWA)
│   ├── index.html            # Homepage - grid of all spreads
│   ├── spread.html           # Individual spread view
│   ├── admin.html            # Admin dashboard (admin only)
│   ├── offline.html          # Offline fallback page
│   ├── styles.css            # All styling (4000+ lines)
│   ├── app.js                # Main application logic (3200+ lines)
│   ├── auth.js               # Authentication logic (800+ lines)
│   ├── settings.js           # User preferences logic (~150 lines)
│   ├── config.js             # Supabase & n8n configuration
│   ├── sw.js                 # Service worker for PWA
│   ├── manifest.json         # PWA manifest
│   └── icons/                # PWA icons (192, 512, maskable, etc.)
├── docs/
│   ├── SYSTEM.md             # Technical reference (pipelines, schema)
│   ├── VIEWER.md             # Viewer documentation
│   └── CURSOR.md             # AI/Cursor development guide
├── supabase/
│   └── migrations/           # Database migration SQL files
│       ├── 001-006           # Core spread tables
│       ├── 007_user_accounts.sql  # User auth tables
│       └── 008_set_admin.sql # Admin role assignment
├── scripts/
│   └── backfill-testament-book.sql
└── README.md                 # This file
```

---

## Documentation

| Document | Purpose |
|----------|---------|
| [docs/SYSTEM.md](docs/SYSTEM.md) | Technical reference — pipelines, schema, troubleshooting |
| [docs/VIEWER.md](docs/VIEWER.md) | Web viewer features — UI, filtering, PWA, auth |
| [docs/CURSOR.md](docs/CURSOR.md) | AI development guide — MCPs, secrets, architecture |

---

## Quick Start (Development)

### Prerequisites
- Node.js (for icon generation)
- Git
- Code editor (Cursor recommended)

### Local Development
```bash
# Clone repository
git clone https://github.com/grysngrhm-tech/graham-devotional.git
cd graham-devotional

# Start local server
cd viewer
python -m http.server 8000
# or: npx serve .

# Open in browser
# http://localhost:8000
```

### Deployment
Push to `main` branch — GitHub Pages auto-deploys from `viewer/` directory.

---

## Security Notes

### Safe to Commit (Public Keys)
- `SUPABASE_URL` — Project URL (public)
- `SUPABASE_ANON_KEY` — Anonymous/public key (protected by RLS)
- `N8N_WEBHOOK_URL` — Public webhook endpoints

### Never Commit (Secrets)
- `SUPABASE_SERVICE_ROLE_KEY` — Full database access
- `REPLICATE_API_KEY` — Image generation credits
- `OPENAI_API_KEY` — GPT-4 credits

All sensitive keys are stored in n8n's credential manager, not in this repository.

---

## User Account System

### Authentication Flow
1. User clicks "Sign In" button
2. Modal opens with email input
3. User enters email, receives magic link
4. User clicks link, automatically logged in
5. PWA users: Click link in browser, then "Check Login Status" in app

### User Data Tables
| Table | Purpose |
|-------|---------|
| `user_profiles` | User metadata + `is_admin` flag |
| `user_favorites` | Stories favorited by each user |
| `user_read_stories` | Stories read by each user |
| `user_primary_images` | Personal image selections per story |

### Row Level Security (RLS)
All user tables have RLS policies ensuring users can only:
- Read/write their own data
- Not access other users' data

---

## Status Flow

```
After Outline Builder:
  status_outline    = done
  status_scripture  = done
  status_text       = pending
  status_image      = pending

After Processing Pipeline:
  status_text       = done (440-520 word summary)
  status_image      = done (4 image URLs populated)
```

A spread is **complete** when all four statuses = `done`.

---

## License

Private project for The Grahams' Devotional book.
