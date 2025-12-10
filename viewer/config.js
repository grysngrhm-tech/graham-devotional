/**
 * The Graham Bible - Client Configuration
 * 
 * SECURITY NOTES:
 * - The SUPABASE_ANON_KEY below is intentionally public (safe to commit)
 * - It only allows operations permitted by Row Level Security (RLS) policies
 * - Never commit a service_role key to this file
 * - The n8n webhook secret should be injected at deploy time, not committed
 */

// Supabase Configuration (public anon key - RLS protected)
const SUPABASE_URL = 'https://zekbemqgvupzmukpntog.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpla2JlbXFndnVwem11a3BudG9nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1NjI2MTIsImV4cCI6MjA4MDEzODYxMn0.D6YxknCEeqhp1-9MBS-CZ31Bu4_dH6JV5T1d5Ud92Bo';

// n8n Webhook Configuration
// The secret should be set via deploy-time injection (e.g., environment variable replacement)
// Do NOT commit a real secret value here
const N8N_WEBHOOK_URL = 'https://grysngrhm.app.n8n.cloud/webhook/regenerate-image';
const N8N_WEBHOOK_SECRET = ''; // Leave empty in repo; inject at deploy

// Export for use in app.js
window.SUPABASE_CONFIG = {
    url: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY
};

window.N8N_CONFIG = {
    webhookUrl: N8N_WEBHOOK_URL,
    webhookSecret: N8N_WEBHOOK_SECRET
};
