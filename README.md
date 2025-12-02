# The Grahams' Devotional

A modern-retold illustrated devotional book — 500 spreads split into two volumes.

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

## Architecture

| Workflow | Purpose | When to Run |
|----------|---------|-------------|
| **Outline Builder** | Import spreads + fetch KJV/NIV scripture | Manual (once per batch) |
| **Processing Pipeline** | Generate summaries + images | Automatic (every 15 min) |

**Data Flow:**
1. Paste spread definitions into Outline Builder
2. Scripture is fetched and stored in Supabase
3. Processing Pipeline generates summaries with GPT-4
4. Processing Pipeline generates images with Flux
5. Everything stored in Supabase for export

## Documentation

| Document | Purpose |
|----------|---------|
| [docs/SYSTEM.md](docs/SYSTEM.md) | Technical reference — credentials, workflows, schema, troubleshooting |
| [docs/VIEWER.md](docs/VIEWER.md) | Web viewer documentation — features, filters, regeneration |

## Quick Start

1. **Setup Credentials** in n8n (see SYSTEM.md):
   - Supabase API Key (Header: `apikey`)
   - API.Bible Key (Header: `api-key`)
   - Replicate API Key (Header: `Authorization: Token ...`)
   - OpenAI via n8n credential manager

2. **Create Database**: Run SQL migrations from `supabase/migrations/`

3. **Create Storage Buckets**: 
   - `devotional-artwork` (public) - for generated images
   - `devotional-data` (public) - for outline JSON files

4. **Import Spreads**: 
   - Open Outline Builder workflow
   - Set batch number and book code
   - Run workflow

5. **Start Processing**:
   - Activate Processing Pipeline
   - Monitor with SQL queries in SYSTEM.md

## Workflows

| Workflow | n8n ID |
|----------|--------|
| Outline Builder | `dRZE4EHTdCr1pSjX` |
| Processing Pipeline | `Ixn36R5CgzjJn0WH` |

## Status Flow

```
Outline Builder creates:
  status_outline = done
  status_scripture = done
  status_text = pending
  status_image = pending

Processing Pipeline updates:
  status_text = done (after summary)
  status_image = done (after artwork)
```

## Web Viewer Features

The `viewer/` directory contains a static web app deployed via GitHub Pages:

- **Homepage**: Grid of all spreads with filters
- **Filters**: Testament, Book Groupings (Torah, Gospels, etc.), Individual Books, Status
- **Chronological Sorting**: Spreads displayed in Biblical order (Genesis → Revelation)
- **Spread View**: Two-page layout with image selection and navigation
- **Image Regeneration**: In-app regeneration with countdown timer UI

### Filter Options

| Category | Options |
|----------|---------|
| Testament | All / Old Testament / New Testament |
| Book Groupings | Torah, History, Poetry, Prophets, Gospels, Acts, Epistles, Revelation |
| Individual Books | All 66 books (when spreads exist) |
| Status | All / Complete / Pending |

## Project Structure

```
graham-devotional/
├── viewer/                    # Static web viewer (GitHub Pages)
│   ├── index.html            # Homepage - grid of all spreads
│   ├── spread.html           # Individual spread view
│   ├── styles.css            # All styling
│   ├── app.js                # Main application logic
│   └── config.js             # Supabase & n8n configuration
├── docs/
│   ├── SYSTEM.md             # Technical reference
│   └── VIEWER.md             # Viewer documentation
└── README.md                 # This file
```

## License

Private project for The Grahams' Devotional book.
