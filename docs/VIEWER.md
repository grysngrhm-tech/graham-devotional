# Web Viewer Documentation

> Documentation for the Graham Devotional web viewer application.

---

## Overview

The web viewer is a static HTML/CSS/JS application that displays devotional spreads and provides curation tools. It's deployed via GitHub Pages and connects directly to Supabase for data.

## Files

| File | Purpose |
|------|---------|
| `viewer/index.html` | Homepage - grid of all spreads with filters |
| `viewer/spread.html` | Individual spread view with image selection |
| `viewer/styles.css` | All CSS styling |
| `viewer/app.js` | Main application logic |
| `viewer/config.js` | Supabase & n8n webhook configuration |

---

## Configuration

### `config.js`

```javascript
// Supabase Configuration
const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key';

// n8n Webhook Configuration
const N8N_WEBHOOK_URL = 'https://your-n8n.app.n8n.cloud/webhook/regenerate-image';
```

**Important:** 
- Use the Supabase **anon key** (not service role key) for frontend
- Ensure RLS policies allow the operations the viewer needs

---

## Homepage Features

### Grid Display

- Shows all spreads as cards with thumbnails
- Cards show: image, title, passage reference
- Pending spreads show placeholder with status indicator
- Click any card to view the full spread

### Filter System

The viewer supports multiple filter types:

#### Testament Filter
- **All** - Show all spreads
- **Old Testament** - Only OT books
- **New Testament** - Only NT books

#### Book Filter
Organized into three sections:

1. **Book Groupings** (top of dropdown)
   - Torah (Genesis - Deuteronomy)
   - History (Joshua - Esther)
   - Poetry (Job - Song of Solomon)
   - Prophets (Isaiah - Malachi)
   - Gospels (Matthew - John)
   - Acts
   - Epistles (Romans - Jude)
   - Revelation

2. **Old Testament Books** (individual)
3. **New Testament Books** (individual)

Each option shows the count of available spreads.

#### Status Filter
- **All** - Show all spreads
- **Complete** - Only spreads with images (`status_image = 'done'`)
- **Pending** - Spreads without images

#### Search
- Searches across: title, passage reference, spread code
- Case-insensitive
- Real-time filtering as you type

### Chronological Sorting

Spreads are displayed in Biblical order:

1. **Book Order**: Canonical Protestant order (Genesis → Revelation)
2. **Chapter**: Within each book, by chapter number
3. **Verse**: Within each chapter, by verse number

This ensures stories appear in narrative sequence regardless of when they were processed.

**Book Order Constant:**
```javascript
const BIBLE_BOOK_ORDER = [
    // Old Testament (39 books)
    'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy',
    'Joshua', 'Judges', 'Ruth', '1 Samuel', '2 Samuel', '1 Kings', '2 Kings',
    '1 Chronicles', '2 Chronicles', 'Ezra', 'Nehemiah', 'Esther',
    'Job', 'Psalms', 'Proverbs', 'Ecclesiastes', 'Song of Solomon',
    'Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel',
    'Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah', 'Micah', 'Nahum',
    'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi',
    // New Testament (27 books)
    'Matthew', 'Mark', 'Luke', 'John', 'Acts',
    'Romans', '1 Corinthians', '2 Corinthians', 'Galatians', 'Ephesians',
    'Philippians', 'Colossians', '1 Thessalonians', '2 Thessalonians',
    '1 Timothy', '2 Timothy', 'Titus', 'Philemon', 'Hebrews',
    'James', '1 Peter', '2 Peter', '1 John', '2 John', '3 John', 'Jude',
    'Revelation'
];
```

---

## Spread View Features

### Two-Page Layout

Mimics the book spread format:
- **Left Page**: Full-size image display
- **Right Page**: Title, passage reference, key verse, paraphrase text

### Image Options

Shows all 4 generated image options:
- Thumbnail grid below the main image
- Click any thumbnail to view full-size
- Currently selected image has visual indicator

### Select as Primary

- Click any image option to select it as the primary
- Updates `image_url` column in Supabase
- Visual feedback confirms selection

### Image Regeneration

Each image slot has a regenerate button:

1. Click the regenerate icon on any image
2. Modal opens with countdown timer
3. Estimated time: ~90 seconds
4. Timer shows stages:
   - "Analyzing passage..." (0-15s)
   - "Generating prompts..." (15-30s)
   - "Creating images..." (30-80s)
   - "Finalizing..." (80-90s)
5. When complete, 4 new options appear
6. Click any option to select it

**Technical Flow:**
1. Frontend POSTs to n8n webhook with `{ spread_code, slot }`
2. n8n creates `regeneration_requests` record
3. Frontend polls the record for status changes
4. When `status = 'ready'`, `option_urls` contains 4 new image URLs
5. User selection updates the spread's `image_url_X` column

### Navigation

- **Previous/Next Arrows**: Navigate between spreads in chronological order
- **Keyboard Shortcuts**: ← (previous), → (next)
- **Touch Support**: Swipe left/right on mobile
- **Position Indicator**: Shows "15 / 247" style counter

Navigation follows the same Biblical chronological order as the homepage.

---

## Styling

### Design System

| Element | Value |
|---------|-------|
| Primary Color | #1A1A1A (Charcoal) |
| Background | #FAF8F5 (Cream) |
| Accent | Gold highlights |
| Title Font | EB Garamond (serif) |
| Body Font | Crimson Text (serif) |
| UI Font | System fonts |

### CSS Variables

```css
:root {
    --font-title: 'EB Garamond', serif;
    --font-body: 'Crimson Text', serif;
    --color-primary: #1A1A1A;
    --color-bg: #FAF8F5;
    --spacing-sm: 0.5rem;
    --spacing-md: 1rem;
    --spacing-lg: 1.5rem;
    --spacing-xl: 2rem;
}
```

### Regeneration Modal

The countdown timer uses an SVG progress ring:

```html
<svg class="progress-ring" viewBox="0 0 100 100">
    <circle class="progress-ring-bg" cx="50" cy="50" r="45"/>
    <circle class="progress-ring-fill" id="progressRingFill" cx="50" cy="50" r="45"/>
</svg>
```

Progress is animated using `stroke-dashoffset`:
```javascript
const circumference = 2 * Math.PI * 45; // ~283
ring.style.strokeDashoffset = circumference * (1 - progress);
```

---

## Data Fetching

### Supabase Queries

**Load All Spreads:**
```javascript
const { data, error } = await supabase
    .from('grahams_devotional_spreads')
    .select('spread_code, title, kjv_passage_ref, status_text, status_image, image_url, image_url_1, testament, book, start_chapter, start_verse');
```

**Load Single Spread:**
```javascript
const { data, error } = await supabase
    .from('grahams_devotional_spreads')
    .select('*')
    .eq('spread_code', spreadCode)
    .single();
```

**Update Primary Image:**
```javascript
const { error } = await supabase
    .from('grahams_devotional_spreads')
    .update({ image_url: selectedUrl })
    .eq('spread_code', spreadCode);
```

---

## Book Groupings

The viewer organizes books into 8 groupings for easier filtering:

```javascript
const BOOK_GROUPINGS = {
    'Torah': ['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy'],
    'History': ['Joshua', 'Judges', 'Ruth', '1 Samuel', '2 Samuel', '1 Kings', '2 Kings', 
                '1 Chronicles', '2 Chronicles', 'Ezra', 'Nehemiah', 'Esther'],
    'Poetry': ['Job', 'Psalms', 'Proverbs', 'Ecclesiastes', 'Song of Solomon'],
    'Prophets': ['Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel', 
                 'Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah', 'Micah', 'Nahum', 
                 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi'],
    'Gospels': ['Matthew', 'Mark', 'Luke', 'John'],
    'Acts': ['Acts'],
    'Epistles': ['Romans', '1 Corinthians', '2 Corinthians', 'Galatians', 'Ephesians', 
                 'Philippians', 'Colossians', '1 Thessalonians', '2 Thessalonians', 
                 '1 Timothy', '2 Timothy', 'Titus', 'Philemon', 'Hebrews', 
                 'James', '1 Peter', '2 Peter', '1 John', '2 John', '3 John', 'Jude'],
    'Revelation': ['Revelation']
};
```

When a grouping is selected, the filter includes all books in that group.

---

## Troubleshooting

### Images not loading
- Check Supabase storage bucket is public
- Verify URLs in database are correct
- Check browser console for CORS errors

### Filters showing empty results
- Ensure `testament` and `book` columns are populated
- Run backfill SQL if columns are NULL
- Check JavaScript console for errors

### Regeneration not working
- Verify n8n webhook URL in `config.js`
- Check n8n workflow is active
- Verify Replicate has sufficient credits
- Check `regeneration_requests` table for error status

### Navigation order incorrect
- Ensure `start_chapter` and `start_verse` columns are populated
- Verify `book` column matches expected names exactly
- Check for typos in book names (e.g., "Song of Solomon" not "Song of Songs")

---

## Development

### Local Development

1. Clone the repository
2. Open `viewer/index.html` in browser
3. Use a local server for CORS compliance:
   ```bash
   python -m http.server 8000
   # or
   npx serve viewer
   ```

### Deployment

The viewer auto-deploys via GitHub Pages when changes are pushed to `main` branch.

GitHub Pages serves from `viewer/` directory.
