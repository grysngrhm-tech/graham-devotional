// Supabase Configuration
const SUPABASE_URL = 'https://zekbemqgvupzmukpntog.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpla2JlbXFndnVwem11a3BudG9nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1NjI2MTIsImV4cCI6MjA4MDEzODYxMn0.D6YxknCEeqhp1-9MBS-CZ31Bu4_dH6JV5T1d5Ud92Bo';

// n8n Webhook Configuration
// TODO: Update this URL with your n8n cloud instance webhook URL
// Format: https://[your-account].app.n8n.cloud/webhook/regenerate-image
// Or for self-hosted: https://[your-n8n-domain]/webhook/regenerate-image
const N8N_WEBHOOK_URL = 'https://graysoncgl.app.n8n.cloud/webhook/regenerate-image';

// Export for use in app.js
window.SUPABASE_CONFIG = {
    url: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY
};

window.N8N_CONFIG = {
    webhookUrl: https://grysngrhm.app.n8n.cloud/webhook-test/regenerate-image
};


