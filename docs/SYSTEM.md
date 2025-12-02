# System Documentation

Technical reference for the Graham Devotional Bible system.

---

## Table of Contents

1. [n8n Workflow Details](#n8n-workflow-details)
2. [Supabase Configuration](#supabase-configuration)
3. [API Integrations](#api-integrations)
4. [Troubleshooting Guide](#troubleshooting-guide)
5. [Common Operations](#common-operations)

---

## n8n Workflow Details

### Devotional - Outline Builder

**Workflow ID:** `dRZE4EHTdCr1pSjX`
**Status:** Inactive (manual execution only)

#### Purpose
Reads JSON outline files from Supabase storage and creates spread rows in the database.

#### Input Parameters
- `batch_id`: Integer batch number for grouping
- `book_code`: 3-letter book abbreviation (e.g., "GEN", "EXO")

#### Key Nodes

| Node | Function |
|------|----------|
| Get Book Outline | Fetches JSON from `devotional-data/{book_code}.json` |
| Parse Outline | Extracts chapter/verse boundaries and titles |
| Prepare for Supabase | Formats data with testament, book name, spread_code |
| Upsert Spreads | Inserts rows with conflict resolution on `spread_code` |

#### Output Fields Set
- `spread_code`: Format `{BOOK}-{NNN}` (e.g., "GEN-001")
- `batch_id`: From input parameter
- `testament`: "OT" or "NT" based on book
- `book`: Full book name (e.g., "Genesis")
- `start_chapter`, `start_verse`, `end_chapter`, `end_verse`: Passage boundaries
- `title`: Story title from outline
- `kjv_passage_ref`: Formatted reference (e.g., "Genesis 1:1-31")
- `status_scripture`: "done" (outlines include this)
- `status_text`: "pending"
- `status_image`: "pending"

---

### Devotional - Processing Pipeline

**Workflow ID:** `Ixn36R5CgzjJn0WH`
**Status:** Active
**Triggers:** Schedule (15 min), Manual, Webhook

#### Architecture

```
┌─────────────────┐     ┌─────────────────┐
│ Schedule Trigger│     │ Manual Trigger  │
│ (Every 15 min)  │     │ (Button)        │
└────────┬────────┘     └────────┬────────┘
         │                       │
         └───────────┬───────────┘
                     │
         ┌───────────▼───────────┐
         │                       │
    ┌────▼────┐            ┌─────▼─────┐
    │Get Text │            │ Get Image │
    │  Item   │            │   Item    │
    └────┬────┘            └─────┬─────┘
         │                       │
    ┌────▼────┐            ┌─────▼─────┐
    │ Process │            │  Process  │
    │  Text   │            │  Images   │
    └────┬────┘            └─────┬─────┘
         │                       │
         └───────────┬───────────┘
                     │
              ┌──────▼──────┐
              │  Loop Wait  │
              │  (3 sec)    │
              └──────┬──────┘
                     │
                     └──────► (back to Get Items)
```

#### Text Generation Path

**Query:** Find spreads where:
- `status_scripture = 'done'`
- `status_text = 'pending'`
- `LIMIT 1, ORDER BY id ASC`

**Steps:**
1. **Generate Paraphrase** (OpenAI GPT-4o)
   - System prompt: Child-friendly Bible storyteller
   - Includes KJV quotes in bold for memorability
   - ~150-200 words per spread

2. **Extract Key Verse** (OpenAI)
   - Identifies most memorable/quotable verse
   - Returns reference and text

3. **Update Spread**
   - Sets `paraphrase_text`, `kjv_key_verse_ref`, `kjv_key_verse_text`
   - Sets `status_text = 'done'`

#### Image Generation Path

**Query:** Find spreads where:
- `status_text = 'done'`
- `status_image = 'pending'` OR `image_url_1 IS NULL`
- `LIMIT 1, ORDER BY id ASC`

**Steps:**
1. **Generate Abstract** (OpenAI GPT-4o)
   - Creates visual description of the scene
   - Captures mood, colors, composition

2. **Prepare Prompt Data** (Code node)
   - Safely extracts spread data from multiple sources
   - Handles both batch and regeneration paths

3. **Generate 4 Prompts** (OpenAI)
   - Creates 4 unique image prompts from abstract
   - Style: Watercolor, period-accurate, emotional depth

4. **Generate Images** (Replicate - Flux Schnell)
   - 4 parallel image generations
   - Batch interval: 1 second between requests
   - Resolution: 1024x1024

5. **Upload to Storage** (Supabase)
   - Uploads to `devotional-images/{spread_code}/`
   - Generates public URLs

6. **Update Spread**
   - Sets `image_url_1` through `image_url_4`
   - Sets `image_url` = `image_url_1` (default selection)
   - Sets `status_image = 'done'`

#### Regeneration Path (Webhook Trigger)

**Webhook:** `POST /webhook/regenerate-image`

**Payload:**
```json
{
  "spread_code": "GEN-001",
  "slot": 2
}
```

**Steps:**
1. Create `regeneration_requests` record with status "processing"
2. Return request_id to caller immediately
3. Fetch spread data
4. Generate new abstract + 4 prompts
5. Generate 4 images
6. Update `regeneration_requests`:
   - `status = 'ready'`
   - `option_urls = [url1, url2, url3, url4]`
7. UI polls and displays options
8. User selection updates spread via separate Supabase call

---

## Supabase Configuration

### Project Details
- **URL:** `https://zekbemqgvupzmukpntog.supabase.co`
- **Region:** (Check Supabase dashboard)

### Storage Buckets

| Bucket | Purpose | Access |
|--------|---------|--------|
| `devotional-data` | Source JSON outlines | Private |
| `devotional-images` | Generated artwork | Public |

### Row Level Security (RLS)

**grahams_devotional_spreads:**
- SELECT: Enabled for anon users
- UPDATE: Enabled for anon users (for image selection)
- INSERT/DELETE: Service role only

**regeneration_requests:**
- All operations enabled for anon users

### Indexes

Recommended indexes for performance:
```sql
CREATE INDEX idx_spreads_status ON grahams_devotional_spreads(status_text, status_image);
CREATE INDEX idx_spreads_code ON grahams_devotional_spreads(spread_code);
CREATE INDEX idx_spreads_book ON grahams_devotional_spreads(book, start_chapter, start_verse);
```

---

## API Integrations

### OpenAI
- **Model:** GPT-4o
- **Usage:** Text generation, prompt creation
- **Credential:** Stored in n8n

### Replicate
- **Model:** `black-forest-labs/flux-schnell`
- **Usage:** Image generation
- **Rate Limits:**
  - < $5 credit: 1 req/min
  - $5-$20 credit: 10 req/min
  - > $20 credit: 600 req/min
- **Credential:** Header Auth with format `Token {API_KEY}`

### Bible API
- **Service:** api.bible or similar
- **Usage:** Fetching KJV scripture text
- **Note:** Some spreads may have pre-populated scripture

---

## Troubleshooting Guide

### Workflow Stops at "Get Summary Item"

**Symptom:** Workflow runs but stops early, no text/image processing

**Cause:** When Supabase query returns 0 items, n8n doesn't execute downstream nodes

**Solution:** The "Extract Summary Item" node now:
1. Has `alwaysOutputData: true`
2. Returns `{ _empty: true }` when no items found
3. "Has Summary Item?" if-node checks for this marker

### Image Generation Rate Limit Errors

**Error:** "The service is receiving too many requests"

**Cause:** Replicate rate limits based on account credit

**Solutions:**
1. Add more credit to Replicate account (>$20 recommended)
2. Increase batch interval in "Generate Image" node
3. Current setting: 1 second between requests

### Replicate Authentication Error

**Error:** "Authorization failed - please check your credentials"

**Cause:** Incorrect header format

**Solution:** Header must be formatted as:
- Name: `Authorization`
- Value: `Token r8_xxxxxxxxxxxxx` (note the word "Token" with space)

### Spreads Not Appearing in Viewer

**Possible causes:**
1. Missing `testament` or `book` columns
2. Incorrect `status_text` or `status_image` values
3. No `image_url` set

**Diagnosis:**
```sql
SELECT spread_code, testament, book, status_text, status_image, image_url
FROM grahams_devotional_spreads
WHERE status_text = 'done'
ORDER BY id DESC
LIMIT 10;
```

### Images Not Loading in Viewer

**Possible causes:**
1. Storage bucket not public
2. Invalid URLs in database
3. CORS issues

**Solution:** Check Supabase storage policies:
```sql
-- Make devotional-images bucket public
UPDATE storage.buckets 
SET public = true 
WHERE name = 'devotional-images';
```

---

## Common Operations

### Processing a New Batch

1. **Prepare outline JSON** in `devotional-data` bucket:
```json
{
  "book": "Genesis",
  "testament": "OT",
  "spreads": [
    {
      "spread_number": 1,
      "title": "Creation",
      "start_chapter": 1,
      "start_verse": 1,
      "end_chapter": 2,
      "end_verse": 3
    }
  ]
}
```

2. **Run Outline Builder** with parameters:
   - batch_id: Next batch number
   - book_code: "GEN"

3. **Monitor Processing Pipeline** - runs automatically every 15 min

4. **Check progress** in Supabase:
```sql
SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN status_text = 'done' THEN 1 ELSE 0 END) as text_done,
  SUM(CASE WHEN status_image = 'done' THEN 1 ELSE 0 END) as image_done
FROM grahams_devotional_spreads
WHERE batch_id = X;
```

### Manually Triggering Regeneration

From n8n:
1. Open "Processing Pipeline" workflow
2. Click "Start Batch Processing" button

From command line:
```bash
curl -X POST https://grysngrhm.app.n8n.cloud/webhook/regenerate-image \
  -H "Content-Type: application/json" \
  -d '{"spread_code": "GEN-001", "slot": 2}'
```

### Resetting a Spread for Reprocessing

```sql
-- Reset text generation
UPDATE grahams_devotional_spreads
SET status_text = 'pending',
    paraphrase_text = NULL,
    kjv_key_verse_ref = NULL,
    kjv_key_verse_text = NULL
WHERE spread_code = 'GEN-001';

-- Reset image generation
UPDATE grahams_devotional_spreads
SET status_image = 'pending',
    image_url = NULL,
    image_url_1 = NULL,
    image_url_2 = NULL,
    image_url_3 = NULL,
    image_url_4 = NULL
WHERE spread_code = 'GEN-001';
```

### Backfilling Testament/Book Data

If spreads are missing testament/book columns:

```sql
UPDATE grahams_devotional_spreads SET
  testament = CASE 
    WHEN spread_code LIKE 'GEN-%' THEN 'OT'
    WHEN spread_code LIKE 'EXO-%' THEN 'OT'
    -- ... (add all books)
    WHEN spread_code LIKE 'MAT-%' THEN 'NT'
    WHEN spread_code LIKE 'REV-%' THEN 'NT'
  END,
  book = CASE 
    WHEN spread_code LIKE 'GEN-%' THEN 'Genesis'
    WHEN spread_code LIKE 'EXO-%' THEN 'Exodus'
    -- ... (add all books)
  END
WHERE testament IS NULL OR book IS NULL;
```

---

## Version History

| Date | Changes |
|------|---------|
| 2025-12-02 | Added Biblical chronological sorting to viewer |
| 2025-12-02 | Fixed parallel text/image processing paths |
| 2025-12-02 | Fixed Replicate authentication header format |
| 2025-12-01 | Added image regeneration feature with countdown UI |
| 2025-12-01 | Implemented book grouping filters (Torah, Gospels, etc.) |
| 2025-12-01 | Fixed filter functionality using direct Supabase columns |
