/**
 * Export all stories with image URLs from Supabase to static JSON
 * 
 * Usage:
 *   node scripts/export-stories.js
 * 
 * Environment Variables (optional):
 *   SUPABASE_URL       - Supabase project URL (defaults to prod)
 *   SUPABASE_ANON_KEY  - Supabase anon key (defaults to prod)
 * 
 * Note: The anon key is safe to use because:
 *   - It only has read access to public data via RLS policies
 *   - grahams_devotional_spreads has public SELECT
 *   - No service-role key is needed for this read-only export
 * 
 * This script exports the story list with image URLs for faster first-load.
 * The static JSON is used as fallback and for instant rendering.
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Configuration - prefer environment variables, fallback to public anon key
// The anon key below is intentionally public (RLS-protected, read-only access)
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zekbemqgvupzmukpntog.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpla2JlbXFndnVwem11a3BudG9nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1NjI2MTIsImV4cCI6MjA4MDEzODYxMn0.D6YxknCEeqhp1-9MBS-CZ31Bu4_dH6JV5T1d5Ud92Bo';

// Validate we're not accidentally using service role
if (SUPABASE_ANON_KEY.includes('service_role')) {
    console.error('ERROR: Do not use service_role key for export. Use anon key only.');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function exportStories() {
    console.log('Fetching stories from Supabase...');
    console.log('URL:', SUPABASE_URL);
    
    const { data, error } = await supabase
        .from('grahams_devotional_spreads')
        .select('spread_code, title, testament, book, start_chapter, start_verse, end_chapter, end_verse, kjv_passage_ref, primary_slot, image_url_1, image_url_2, image_url_3, image_url_4')
        .order('spread_code');
    
    if (error) {
        console.error('Error fetching stories:', error);
        process.exit(1);
    }
    
    console.log(`Fetched ${data.length} stories`);
    
    // Transform to format for static JSON
    // Now includes primary_slot and all image URLs so app can compute primary
    const spreads = data.map(story => ({
        spread_code: story.spread_code,
        testament: story.testament,
        book: story.book,
        start_chapter: story.start_chapter,
        start_verse: story.start_verse,
        end_chapter: story.end_chapter,
        end_verse: story.end_verse,
        title: story.title,
        kjv_key_verse_ref: story.kjv_passage_ref,
        // Store slot reference (1-4) instead of URL - matches new data model
        primary_slot: story.primary_slot || 1,
        image_url_1: story.image_url_1 || null,
        image_url_2: story.image_url_2 || null,
        image_url_3: story.image_url_3 || null,
        image_url_4: story.image_url_4 || null
    }));
    
    const output = {
        version: '3.0', // New version with slot-based primary
        exported_at: new Date().toISOString(),
        total_spreads: spreads.length,
        spreads
    };
    
    // Write to file
    const outputPath = path.join(__dirname, '..', 'viewer', 'data', 'all-spreads.json');
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    
    console.log(`Exported ${spreads.length} stories to ${outputPath}`);
    
    // Count stories with images
    const withImages = spreads.filter(s => s.image_url_1).length;
    console.log(`Stories with images: ${withImages}/${spreads.length}`);
    
    // Reminder about cache busting
    console.log('\n--- IMPORTANT ---');
    console.log('After export, remember to:');
    console.log('1. Bump ?v= param in sw.js APP_SHELL for all-spreads.json');
    console.log('2. Bump CACHE_NAME in sw.js');
    console.log('3. Bump ?v= param in app.js fetch calls for all-spreads.json');
}

exportStories().catch(console.error);
