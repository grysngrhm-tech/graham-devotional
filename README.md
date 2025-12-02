# Graham Devotional Bible

A visual devotional Bible project that generates AI-illustrated spreads for Bible stories, featuring beautiful watercolor artwork paired with accessible story summaries.

## 🌟 Project Overview

The Graham Devotional Bible transforms Bible passages into visually engaging "spreads" - each containing:
- **Story Title** - A descriptive name for the passage
- **Scripture Reference** - KJV passage range
- **Key Verse** - A highlighted memorable verse
- **Paraphrase Summary** - An accessible retelling of the story
- **AI-Generated Artwork** - Four watercolor-style illustrations per spread

### Live Demo
The viewer is deployed via GitHub Pages at the repository's GitHub Pages URL.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           DATA SOURCES                               │
├─────────────────────────────────────────────────────────────────────┤
│  Supabase Bucket: devotional-data                                   │
│  └── Contains JSON files with Bible book outlines                   │
│      (chapters, verse ranges, titles, etc.)                         │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        n8n WORKFLOWS                                 │
├─────────────────────────────────────────────────────────────────────┤
│  1. Outline Builder - Creates spread rows from JSON outlines        │
│  2. Processing Pipeline - Generates text & images for spreads       │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     SUPABASE DATABASE                                │
├─────────────────────────────────────────────────────────────────────┤
│  Table: grahams_devotional_spreads                                  │
│  Table: regeneration_requests (for UI-triggered regeneration)       │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      WEB VIEWER (GitHub Pages)                       │
├─────────────────────────────────────────────────────────────────────┤
│  Static HTML/CSS/JS app that displays spreads                       │
│  - Homepage with filters                                            │
│  - Spread detail view with navigation                               │
│  - Image selection & regeneration UI                                │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
graham-devotional/
├── viewer/                    # Static web viewer (GitHub Pages)
│   ├── index.html            # Homepage - grid of all spreads
│   ├── spread.html           # Individual spread view
│   ├── styles.css            # All styling
│   ├── app.js                # Main application logic
│   └── config.js             # Supabase & n8n configuration
├── data/
│   └── all-spreads.json      # (Legacy) Local spread metadata
└── README.md                 # This file
```

---

## 🗄️ Database Schema

### Table: `grahams_devotional_spreads`

| Column | Type | Description |
|--------|------|-------------|
| `id` | int | Auto-increment primary key |
| `spread_code` | text | Unique identifier (e.g., "GEN-001") |
| `batch_id` | int | Batch number for processing |
| `testament` | text | "OT" or "NT" |
| `book` | text | Book name (e.g., "Genesis") |
| `start_chapter` | int | Starting chapter number |
| `start_verse` | int | Starting verse number |
| `end_chapter` | int | Ending chapter number |
| `end_verse` | int | Ending verse number |
| `title` | text | Story title |
| `kjv_passage_ref` | text | Full passage reference |
| `kjv_key_verse_ref` | text | Key verse reference |
| `kjv_key_verse_text` | text | Key verse text |
| `paraphrase_text` | text | AI-generated story summary |
| `image_url` | text | Selected primary image URL |
| `image_url_1` | text | First image option |
| `image_url_2` | text | Second image option |
| `image_url_3` | text | Third image option |
| `image_url_4` | text | Fourth image option |
| `status_scripture` | text | "pending" or "done" |
| `status_text` | text | "pending" or "done" |
| `status_image` | text | "pending" or "done" |
| `created_at` | timestamp | Row creation time |
| `updated_at` | timestamp | Last update time |

### Table: `regeneration_requests`

Used for tracking UI-triggered image regeneration requests.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `spread_code` | text | Associated spread |
| `slot` | int | Image slot (1-4) |
| `status` | text | "processing", "ready", "selected", "cancelled", "error" |
| `option_urls` | jsonb | Array of generated image URLs |
| `selected_url` | text | URL of selected image |
| `created_at` | timestamp | Request creation time |

---

## ⚙️ n8n Workflows

### 1. Devotional - Outline Builder
**ID:** `dRZE4EHTdCr1pSjX`

Creates spread rows in Supabase from JSON outline files stored in the `devotional-data` bucket.

**Trigger:** Manual execution with batch parameters

**Process:**
1. Reads JSON outline file from Supabase storage
2. Parses book metadata (testament, book name, chapters)
3. Upserts rows to `grahams_devotional_spreads` with:
   - spread_code, batch_id
   - testament, book, start_chapter, start_verse, end_chapter, end_verse
   - title, kjv_passage_ref
   - status fields set to "pending"

### 2. Devotional - Processing Pipeline
**ID:** `Ixn36R5CgzjJn0WH`

Processes spreads in two phases: text generation and image generation.

**Triggers:**
- Schedule: Every 15 minutes
- Manual: "Start Batch Processing" button
- Webhook: For UI-triggered regeneration

**Text Generation Flow:**
1. Query for spreads with `status_scripture=done` AND `status_text=pending`
2. Fetch KJV scripture from Bible API
3. Generate paraphrase summary via OpenAI
4. Update spread with key verse and paraphrase text
5. Set `status_text=done`

**Image Generation Flow:**
1. Query for spreads with `status_text=done` AND `status_image=pending`
2. Generate abstract description via OpenAI
3. Generate 4 image prompts via OpenAI
4. Create 4 images via Replicate (Flux model)
5. Upload images to Supabase storage
6. Update spread with image URLs
7. Set `status_image=done`

**Regeneration Flow (Webhook):**
1. Receive spread_code and slot from webhook
2. Create regeneration_request record
3. Fetch spread data
4. Generate new abstract + 4 prompts
5. Create 4 new images
6. Store URLs in regeneration_request.option_urls
7. Set status to "ready"
8. (User selects image in UI, which updates the spread)

---

## 🖥️ Web Viewer Features

### Homepage (`index.html`)
- **Grid Display**: All spreads shown as cards with thumbnails
- **Filters**:
  - Testament (All / Old / New)
  - Book Groupings (Torah, History, Poetry, Prophets, Gospels, Acts, Epistles, Revelation)
  - Individual Books
  - Status (All / Complete / Pending)
  - Search (title, passage, spread code)
- **Chronological Sorting**: Spreads ordered by Biblical book order, then chapter, then verse
- **Stats**: Complete/Pending counts

### Spread View (`spread.html`)
- **Two-Page Layout**: Image on left, text on right (book spread style)
- **Image Selection**: 
  - View all 4 generated images
  - Select primary image (saved to Supabase)
  - Collapse to show only selected image
- **Image Regeneration**:
  - Click regenerate button on any slot
  - Modal shows countdown timer (~90 seconds)
  - Choose from 4 new options
- **Navigation**:
  - Previous/Next arrows
  - Keyboard shortcuts (←/→)
  - Touch swipe support
  - Position indicator (e.g., "15 / 247")

---

## 🔧 Configuration

### Supabase
- **Project URL**: `https://zekbemqgvupzmukpntog.supabase.co`
- **Storage Bucket**: `devotional-images` (for generated artwork)
- **Storage Bucket**: `devotional-data` (for source JSON outlines)

### n8n
- **Cloud Instance**: `https://grysngrhm.app.n8n.cloud`
- **Regeneration Webhook**: `/webhook/regenerate-image`

### External APIs
- **OpenAI**: GPT-4o for text generation and prompt creation
- **Replicate**: Flux Schnell model for image generation
- **Bible API**: For fetching KJV scripture text

---

## 🚀 Deployment

### Frontend (GitHub Pages)
The `viewer/` directory is deployed automatically via GitHub Pages.

1. Push changes to `main` branch
2. GitHub Actions builds and deploys to Pages
3. Site updates within minutes

### n8n Workflows
Workflows are managed in n8n Cloud and trigger automatically based on schedules or webhooks.

---

## 📝 Development Notes

### Adding New Batches
1. Create JSON outline file in `devotional-data` bucket
2. Run "Outline Builder" workflow with batch number
3. "Processing Pipeline" automatically picks up new spreads

### Image Regeneration
- Triggered from UI via webhook
- Creates entry in `regeneration_requests` table
- Processing Pipeline handles generation
- UI polls for completion and displays options

### Biblical Book Order
Spreads are sorted using canonical Protestant order:
- OT: Genesis → Malachi (39 books)
- NT: Matthew → Revelation (27 books)

Within each book, sorted by:
1. Chapter number (`start_chapter`)
2. Verse number (`start_verse`)

---

## 🎨 Design System

### Colors
- Primary: Charcoal (#1A1A1A)
- Background: Cream (#FAF8F5)
- Accent: Gold highlights

### Typography
- Titles: EB Garamond (serif)
- Body: Crimson Text (serif)
- UI: System fonts

### Image Style
Prompts generate watercolor-style biblical artwork with:
- Warm, muted color palette
- Textured, painterly quality
- Period-appropriate clothing and settings
- Emotional depth and movement

---

## 📄 License

Private project - All rights reserved.

---

## 🙏 Credits

- **Bible Text**: King James Version (Public Domain)
- **AI Models**: OpenAI GPT-4o, Replicate Flux
- **Infrastructure**: Supabase, n8n Cloud, GitHub Pages
