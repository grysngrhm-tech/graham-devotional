# The Graham Bible - System Reference

> Technical documentation for the automated devotional production pipeline and user systems.

---

## Quick Start

1. **Upload `data/all-spreads.json`** to Supabase Storage bucket `devotional-data`
2. **Run database migrations** to create tables and indexes
3. **Run Outline Builder** with batch number (0-49) to import 10 spreads at a time
4. **Run Processing Pipeline** to generate summaries and images for that batch
5. **Check results**, tweak prompts if needed, then repeat for next batch
6. **Monitor progress** with SQL queries below

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     OUTLINE BUILDER v6                          │
│                    (Manual, Batch Processing)                   │
├─────────────────────────────────────────────────────────────────┤
│  Fetch JSON → Slice Batch → Build Refs → Fetch KJV → Merge KJV │
│       → Fetch WEB → Merge WEB → Prepare for Supabase → Upsert  │
│       ↓                                                         │
│  status_scripture = 'done', status_text = 'pending'            │
│  (Both KJV and WEB passage text populated)                     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                   PROCESSING PIPELINE v6                        │
│            (Continuous Loop + Parallel Processing)              │
├─────────────────────────────────────────────────────────────────┤
│  Branch 1: Get pending summary → GPT-4 (with WEB context)      │
│       → Parse structured output (KEY_VERSE + SUMMARY)          │
│       → Update (paraphrase_text, kjv_key_verse_ref/text)       │
│       ↓                                                         │
│  Branch 2: Get pending image → Abstract → 4 Prompts → Flux     │
│       → Upload 4 images → Update URLs                          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      WEB VIEWER + AUTH                          │
│            (User Accounts + Personalization)                    │
├─────────────────────────────────────────────────────────────────┤
│  Supabase Auth (Magic Links) → User Profiles                   │
│       → Favorites, Read Tracking, Personal Image Selections    │
│       → Admin Dashboard for content curation                   │
└─────────────────────────────────────────────────────────────────┘
```

**Key Principles:**
- Scripture is static data (fetched once at import)
- Key verse is identified by AI during summary generation (not pre-defined)
- WEB (World English Bible) provides modern context for AI understanding
- All quotations in output are from KJV only
- User data isolated by Row Level Security (RLS)

---

## Credentials Setup

You need **3 credentials** in n8n:

### 1. Supabase API Key
- **Name:** `Header Auth account` (or similar)
- **Header Name:** `apikey`
- **Header Value:** Your Supabase service role key

### 2. Replicate API Key
- **Name:** `Header Auth account 3`
- **Header Name:** `Authorization`
- **Header Value:** `Token r8_YourReplicateAPIKey` (note: "Token" prefix required!)

### 3. OpenAI (via n8n Credentials)
- Use n8n's built-in OpenAI credential manager
- Add your API key there

**Note:** bible-api.com requires NO authentication - just HTTP requests!

---

## Workflows

| Workflow | ID | Purpose | Trigger |
|----------|-----|---------|---------|
| **Outline Builder** | `dRZE4EHTdCr1pSjX` | Import spreads + fetch KJV/WEB scripture | Manual |
| **Processing Pipeline** | `Ixn36R5CgzjJn0WH` | Generate summaries + images | Every 15 min / Manual / Webhook |

### Outline Builder

**Flow:**
```
Manual Trigger
    → Set Batch Number (0-49)
    → Fetch JSON from Supabase Storage
    → Slice to 10 spreads based on batch_number
    → Build Bible Refs
    → Fetch KJV Passage (bible-api.com?translation=kjv)
    → Merge KJV Data
    → Fetch WEB Passage (bible-api.com?translation=web)
    → Merge WEB Data
    → Prepare for Supabase
    → Upsert to Supabase
    → Summary
```

**How to use:**
1. Open workflow in n8n
2. Edit "Set Batch Number" node - change `BATCH_NUMBER` constant
3. Click "Test workflow"
4. Check Summary node for results
5. Run Processing Pipeline to generate summaries/images for this batch
6. Repeat with next batch_number

**Batch calculation:**
- Batch 0: spreads 0-9 (GEN-001 through GEN-010)
- Batch 1: spreads 10-19
- ...
- Total: 50 batches × 10 spreads = 500 spreads

**Output:** Records with `status_scripture='done'`, `status_text='pending'`, both `kjv_passage_text` and `web_passage_text` populated

### Processing Pipeline

**Flow:**
```
Manual "Start Batch Processing" or Scheduled Trigger (every 15 min backup)
    ↓
PARALLEL PROCESSING:
    Branch 1: SUMMARY GENERATION
        → Get 1 pending summary item (scripture=done, text=pending)
        → Generate Summary (GPT-4o) with structured output
        → Validate & Parse
        → Update database
        ↓
    Branch 2: IMAGE GENERATION (4 variations per spread)
        → Get 1 pending image item (text=done, image=pending)
        → Generate Abstract (GPT-4o - visual analysis)
        → Prepare Prompt Data (safely extract from multiple sources)
        → Generate 4 Creative Prompts (GPT-4o - 4 unique interpretations)
        → Split Prompts → 4 items
        → Generate Image (Flux Schnell, batch interval: 1s) × 4
        → Download Image × 4
        → Upload to Storage ({spread_code}-1.png, -2.png, -3.png, -4.png)
        → Aggregate URLs
        → Update database (image_url_1, image_url_2, image_url_3, image_url_4)
        ↓
    Wait 3 seconds → LOOP BACK
    ↓
If no work found in both branches → STOP (queue empty)
```

**Key Features:**
- **Parallel Processing**: Text and image generation run simultaneously
- **Continuous Processing**: Workflow loops automatically until all pending work is complete
- Generates **4 unique image variations** per spread for selection later
- AI-powered prompt generation (not hardcoded templates)
- Each image has different: focal symbol, artistic influence, sacred geometry
- All images are black and white with cross-hatching style

**Triggers:**
- **"Start Batch Processing"** (Manual): Click to start continuous processing
- **"Every 15 Minutes"** (Scheduled): Backup trigger to restart if workflow stopped
- **"Regenerate Image"** (Webhook): For UI-triggered regeneration (admin only)

---

## In-App Image Regeneration

The web viewer includes an in-app regeneration feature that allows **admin users** to regenerate individual image slots directly from the UI.

**Flow:**
```
Admin clicks regenerate button on image slot
    ↓
Web app sends POST to n8n webhook (/webhook/regenerate-image)
    → Payload: { spread_code, slot }
    ↓
n8n workflow:
    1. Respond immediately with request_id
    2. Create regeneration_requests entry (status: 'processing')
    3. Fetch spread data from Supabase
    4. Generate Abstract → 4 Prompts → 4 Images
    5. Upload images to storage
    6. Update regeneration_requests with option_urls (status: 'ready')
    ↓
Web app polls regeneration_requests table for status
    → When status = 'ready', display 4 new options in modal
    → Countdown timer shows ~90 second estimate
    ↓
Admin selects preferred image
    → Web app updates grahams_devotional_spreads.image_url_X with new URL
    → Web app updates regeneration_requests (status: 'selected')
```

**Configuration:**
- n8n webhook URL configured in `viewer/config.js` as `N8N_WEBHOOK_URL`
- RLS must allow web app to read/write `regeneration_requests` table
- Only users with `is_admin = true` can trigger regeneration

---

## Database Schema

### Table: `grahams_devotional_spreads`

```sql
CREATE TABLE public.grahams_devotional_spreads (
    id                      SERIAL PRIMARY KEY,
    spread_code             TEXT UNIQUE NOT NULL,
    batch_id                INTEGER,
    testament               TEXT NOT NULL,           -- "OT" or "NT"
    book                    TEXT NOT NULL,
    start_chapter           INT NOT NULL,
    start_verse             INT NOT NULL,
    end_chapter             INT NOT NULL,
    end_verse               INT NOT NULL,
    title                   TEXT,
    
    -- KJV (primary output)
    kjv_passage_ref         TEXT,
    kjv_passage_text        TEXT,
    kjv_key_verse_ref       TEXT,        -- AI-identified key verse reference
    kjv_key_verse_text      TEXT,        -- AI-identified key verse text
    
    -- WEB (modern context for AI understanding)
    web_passage_text        TEXT,        -- World English Bible translation
    
    -- Generated content
    paraphrase_text         TEXT,        -- 440-520 word summary
    mood_category           TEXT,        -- awe|peace|struggle|triumph|sorrow|mystery|joy|warning
    image_abstract          TEXT,        -- Scene analysis from GPT-4
    image_prompt            TEXT,        -- Primary image prompt (first of 4)
    image_url               TEXT,        -- Primary/selected image URL (global default)
    image_url_1             TEXT,        -- First artistic variation URL
    image_url_2             TEXT,        -- Second artistic variation URL
    image_url_3             TEXT,        -- Third artistic variation URL
    image_url_4             TEXT,        -- Fourth artistic variation URL
    
    -- Status tracking (pending/done/error)
    status_outline          TEXT DEFAULT 'pending',
    status_scripture        TEXT DEFAULT 'pending',
    status_text             TEXT DEFAULT 'pending',
    status_image            TEXT DEFAULT 'pending',
    
    -- Error handling
    error_message           TEXT,
    retry_count             INT DEFAULT 0,
    last_processed_at       TIMESTAMPTZ,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);
```

### Table: `regeneration_requests`

```sql
CREATE TABLE regeneration_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spread_code TEXT NOT NULL,
  slot INTEGER NOT NULL CHECK (slot BETWEEN 1 AND 4),
  option_urls TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'processing' CHECK (status IN ('processing', 'ready', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
```

### Table: `user_profiles`

```sql
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  is_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger to auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

### Table: `user_favorites`

```sql
CREATE TABLE user_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  spread_code TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, spread_code)
);
```

### Table: `user_read_stories`

```sql
CREATE TABLE user_read_stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  spread_code TEXT NOT NULL,
  read_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, spread_code)
);
```

### Table: `user_primary_images`

```sql
CREATE TABLE user_primary_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  spread_code TEXT NOT NULL,
  image_slot INTEGER NOT NULL CHECK (image_slot BETWEEN 1 AND 4),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, spread_code)
);
```

### Row Level Security (RLS) Policies

All user tables have RLS enabled with these policies:

```sql
-- user_profiles: Users can read/update their own profile
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

-- user_favorites: Users can CRUD their own favorites
ALTER TABLE user_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own favorites" ON user_favorites
  FOR ALL USING (auth.uid() = user_id);

-- user_read_stories: Users can CRUD their own read records
ALTER TABLE user_read_stories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own read stories" ON user_read_stories
  FOR ALL USING (auth.uid() = user_id);

-- user_primary_images: Users can CRUD their own image selections
ALTER TABLE user_primary_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own image selections" ON user_primary_images
  FOR ALL USING (auth.uid() = user_id);
```

### Storage Buckets

| Bucket | Purpose | Access |
|--------|---------|--------|
| `devotional-artwork` | Generated images | Public |
| `devotional-data` | Source JSON outlines | Public |
| `devotional-images` | Alternative image storage | Public |

---

## Authentication System

### Supabase Auth Configuration

**Site URL:** `https://grysngrhm-tech.github.io/graham-devotional/`

**Redirect URLs (must include):**
- `https://grysngrhm-tech.github.io/graham-devotional/`
- `https://grysngrhm-tech.github.io/graham-devotional/viewer/`
- `https://grysngrhm-tech.github.io/graham-devotional/viewer/index.html`
- `https://grysngrhm-tech.github.io/graham-devotional/viewer/spread.html`

**Email Templates:**
- Magic Link template should use `{{ .SiteURL }}` for redirect

### Making a User Admin

Run in Supabase SQL Editor:

```sql
-- Check if user exists and their current status
SELECT id, email, is_admin FROM user_profiles 
WHERE email = 'admin@example.com';

-- Set admin flag
UPDATE user_profiles 
SET is_admin = true 
WHERE email = 'admin@example.com';
```

---

## Status Flow

```
After Outline Builder:
  status_outline    = done
  status_scripture  = done (or error if API failed)
  status_text       = pending
  status_image      = pending
  kjv_passage_text  = populated
  web_passage_text  = populated

After Processing Pipeline (summary pass):
  status_text       = done (or error if word count wrong)
  paraphrase_text   = populated (440-520 words)
  kjv_key_verse_ref = populated (e.g., "Genesis 1:1")
  kjv_key_verse_text = populated (exact KJV text)

After Processing Pipeline (image pass):
  status_image      = done (or error if generation failed)
  image_url_1/2/3/4 = populated
```

A spread is **complete** when all four statuses = `done`.

---

## API Reference

### Bible API (bible-api.com)

**Free, no authentication required!**

**Base URL:** `https://bible-api.com`

**Translations Available:**
- `?translation=kjv` - King James Version (primary)
- `?translation=web` - World English Bible (modern context)

**Reference Format:**
```
{book}+{chapter}:{verse}-{verse}?translation=kjv
Example: genesis+1:1-31?translation=kjv
```

**Multi-chapter format:**
```
{book}+{start_chapter}:{start_verse}-{end_chapter}:{end_verse}
Example: genesis+1:1-2:3?translation=web
```

**Rate Limiting:** Use 2-second delays between requests to avoid throttling.

### Replicate API

**Model:** `black-forest-labs/flux-schnell`

**Rate Limits (based on account credit):**
- < $5 credit: 1 req/min
- $5-$20 credit: 10 req/min
- > $20 credit: 600 req/min

**Important:** Header must be `Authorization: Token r8_xxx` (note "Token" prefix)

---

## Troubleshooting

### Scripture text is empty
- Check `error_message` column in Supabase
- Verify book name matches mapping in Build Bible Refs node
- bible-api.com uses lowercase names: "genesis" not "Genesis"

### Summary word count error
- `status_text = 'error'` with word count in error_message
- Will retry on next pipeline run
- Adjust prompt temperature if consistently failing

### Replicate 401 Unauthorized
- Check "Header Auth account 3" credential
- Format: `Authorization: Token r8_YourKey`
- Verify Replicate account has credits

### Replicate Rate Limit ("less than $5.0 in credit")
- Add more funds to Replicate account (>$20 recommended for 600 req/min)
- Current batch interval: 1 second between requests
- If persisting, verify correct API token is configured

### Image generation timeout
- Flux Schnell usually responds in 10-30 seconds
- If timeout, check Replicate status page
- Reduce prompt length if consistently failing

### Workflow stops at "Get Summary Item"
- This is expected when no text work remains
- Image generation runs in parallel and continues
- Check both paths in workflow execution logs

### Spreads not appearing in correct order
- Viewer sorts by Biblical book order, then chapter, then verse
- Ensure `book`, `start_chapter`, `start_verse` columns are populated
- Run backfill SQL if columns are empty

### User can't log in
- Check Supabase Auth settings (Site URL, Redirect URLs)
- Verify no trailing spaces in URLs
- PWA users: Must use "Check Login Status" button

### Admin features not appearing
- Verify `is_admin = true` in `user_profiles` table
- Check browser console for auth state logs
- Gold glow on settings icon indicates admin status

---

## Useful SQL Queries

### Count by status
```sql
SELECT 
  status_outline, status_scripture, status_text, status_image,
  COUNT(*) 
FROM grahams_devotional_spreads 
GROUP BY 1,2,3,4
ORDER BY 1,2,3,4;
```

### Find errors
```sql
SELECT spread_code, title, error_message 
FROM grahams_devotional_spreads 
WHERE error_message IS NOT NULL;
```

### Progress by book
```sql
SELECT 
  testament, book,
  COUNT(*) as total,
  SUM(CASE WHEN status_scripture = 'done' THEN 1 ELSE 0 END) as scripture_done,
  SUM(CASE WHEN status_text = 'done' THEN 1 ELSE 0 END) as text_done,
  SUM(CASE WHEN status_image = 'done' THEN 1 ELSE 0 END) as image_done
FROM grahams_devotional_spreads
GROUP BY testament, book
ORDER BY MIN(id);
```

### View completed spreads with all 4 images
```sql
SELECT spread_code, title, image_url_1, image_url_2, image_url_3, image_url_4
FROM grahams_devotional_spreads
WHERE status_image = 'done'
ORDER BY id;
```

### Reset failed items for retry
```sql
UPDATE grahams_devotional_spreads
SET status_scripture = 'pending', error_message = NULL
WHERE status_scripture = 'error';
```

### User statistics
```sql
-- Total users
SELECT COUNT(*) FROM user_profiles;

-- Admin count
SELECT COUNT(*) FROM user_profiles WHERE is_admin = true;

-- Users with most favorites
SELECT p.email, COUNT(f.id) as favorites
FROM user_profiles p
LEFT JOIN user_favorites f ON p.id = f.user_id
GROUP BY p.id, p.email
ORDER BY favorites DESC
LIMIT 10;

-- Most favorited stories
SELECT f.spread_code, s.title, COUNT(*) as count
FROM user_favorites f
JOIN grahams_devotional_spreads s ON f.spread_code = s.spread_code
GROUP BY f.spread_code, s.title
ORDER BY count DESC
LIMIT 10;

-- Most read stories
SELECT r.spread_code, s.title, COUNT(*) as count
FROM user_read_stories r
JOIN grahams_devotional_spreads s ON r.spread_code = s.spread_code
GROUP BY r.spread_code, s.title
ORDER BY count DESC
LIMIT 10;
```

### Set user as admin
```sql
UPDATE user_profiles 
SET is_admin = true 
WHERE email = 'admin@example.com';
```

---

## Version History

| Date | Version | Changes |
|------|---------|---------|
| 2025-12-04 | v8.0 | Rebrand to "The Graham Bible", admin tile modals |
| 2025-12-04 | v7.0 | User accounts, favorites, read tracking, admin dashboard |
| 2025-12-03 | v6.8 | PWA install prompt with iOS/Android detection |
| 2025-12-03 | v6.7 | Complete PWA: icons, manifest, service worker, offline page |
| 2025-12-03 | v6.6 | Mobile breadcrumb fixes, touchmove support |
| 2025-12-02 | v6.5 | Dark mode fixes for story view |
| 2025-12-02 | v6.4 | Unified scroll-reveal breadcrumb header |
| 2025-12-02 | v6.3 | Dark mode, audio narration, surprise button |
| 2025-12-02 | v6.2 | Added Biblical chronological sorting to viewer |
| 2025-12-02 | v6.1 | Fixed parallel text/image processing paths |
| 2025-12-01 | v6.0 | Added image regeneration feature with countdown UI |
| 2025-12-01 | v5.5 | Implemented book grouping filters (Torah, Gospels, etc.) |
| 2025-12-01 | v5.4 | Fixed filter functionality using direct Supabase columns |
