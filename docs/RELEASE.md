# Release Checklist for The Graham Bible

This document outlines the steps required to prepare and deploy a new release of The Graham Bible web viewer.

## Pre-Release Steps

1. **Update Version Numbers:**
   - Increment the `v=` parameter for `app.js` in `viewer/index.html`.
   - Increment the `v=` parameter for `styles.css` in `viewer/index.html`.
   - Update the `CACHE_NAME` constant in `viewer/sw.js`.
   - Ensure all versioned assets in `APP_SHELL` array in `viewer/sw.js` match the `index.html` versions.
   - If `all-spreads.json` data model changes, update its `v=` parameter in `viewer/index.html` and `viewer/sw.js`.

2. **Export Latest Story Data:**
   - Run `node scripts/export-stories.js` to generate the latest `viewer/data/all-spreads.json`.
   - Verify the `version` field in the JSON matches the expected data model version.

3. **Review `viewer/config.js`:**
   - Ensure `N8N_WEBHOOK_SECRET` is empty or correctly configured for your deployment environment (e.g., injected via CI/CD). **Do NOT commit a live secret.**

4. **Local Sanity Checks:**
   - Run the app locally.
   - Verify login/magic link flow.
   - Check core functionality (browsing stories, favorites, settings, offline).
   - If admin, verify curation mode and regeneration.
   - Check console for unexpected errors or excessive logging (ensure `GB_DEBUG` is `false` for production).

## Deployment Steps

1. **Commit Changes:**
   - Commit all updated files (code, versions, docs).
   - Push to GitHub.

2. **Trigger Deployment:**
   - GitHub Pages will automatically deploy from the `main` branch.

3. **CDN Cache Invalidation (if applicable):**
   - If using a CDN (e.g., Cloudflare), manually purge the cache for `index.html`, `app.js`, `styles.css`, `sw.js`, and `manifest.json` to ensure users get the latest service worker and app shell immediately.

## Post-Deployment Verification

1. **Live Site Check:**
   - Open `www.grahambible.com` in an incognito window (to ensure fresh load).
   - Verify the app loads correctly.
   - Check the browser's developer console for any errors.
   - Confirm the new Service Worker is active (Application tab).
   - Test login/magic link.
   - Test core features.
   - If admin, test regeneration.

2. **Monitor Logs:**
   - Monitor any server-side logs (e.g., n8n, Supabase) for errors related to webhooks or database interactions.
