// Supabase Configuration
const SUPABASE_URL = 'https://zekbemqgvupzmukpntog.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpla2JlbXFndnVwem11a3BudG9nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1NjI2MTIsImV4cCI6MjA4MDEzODYxMn0.D6YxknCEeqhp1-9MBS-CZ31Bu4_dH6JV5T1d5Ud92Bo';

// n8n Webhook Configuration (Production URL)
// Optional shared secret: set during deployment (do not commit a real secret).
const N8N_WEBHOOK_URL = 'https://grysngrhm.app.n8n.cloud/webhook/regenerate-image';
const N8N_WEBHOOK_SECRET = ''; // set via deploy-time injection if available

// Export for use in app.js
window.SUPABASE_CONFIG = {
    url: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY
};

window.N8N_CONFIG = {
    webhookUrl: N8N_WEBHOOK_URL,
    webhookSecret: N8N_WEBHOOK_SECRET
};
