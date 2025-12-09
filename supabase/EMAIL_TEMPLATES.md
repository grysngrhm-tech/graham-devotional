# Supabase Email Templates Configuration (PKCE Flow)

## Overview

Custom email templates for The Graham Bible authentication using **PKCE flow** (the modern, secure default).

**Key Difference from Implicit Flow:**
- PKCE requires `{{ .TokenHash }}` in a custom URL format
- The app handles token verification via `verifyOtp()`
- `{{ .ConfirmationURL }}` alone does NOT work with PKCE

---

## SMTP Configuration (Resend)

**Supabase Dashboard > Project Settings > Authentication > SMTP Settings**

| Setting | Value |
|---------|-------|
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | Your Resend API Key (starts with `re_`) |
| Sender email | `hello@grahambible.com` (must be lowercase!) |
| Sender name | `The Graham Bible` |

---

## Template 1: Confirm signup

Sent when a **new user** signs up for the first time.

**Subject:**
```
Welcome to The Graham Bible
```

**Body (HTML):**
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f5f5f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 440px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
          
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px; text-align: center; border-bottom: 1px solid #f0f0f0;">
              <h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 600; color: #1a1a1a;">The Graham Bible</h1>
              <p style="margin: 0; font-size: 14px; color: #888888;">An illustrated Bible arranged story by story</p>
            </td>
          </tr>
          
          <!-- Welcome Message -->
          <tr>
            <td style="padding: 32px 32px 16px; text-align: center;">
              <p style="margin: 0; font-size: 16px; color: #1a1a1a;">Welcome! Tap the button below to confirm your account:</p>
            </td>
          </tr>
          
          <!-- Primary CTA Button -->
          <tr>
            <td style="padding: 8px 32px 32px; text-align: center;">
              <a href="{{ .SiteURL }}/#/auth/confirm?token_hash={{ .TokenHash }}&type=signup" style="display: inline-block; background-color: #C9A227; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; padding: 16px 48px; border-radius: 12px;">Confirm &amp; Sign In</a>
            </td>
          </tr>
          
          <!-- Divider -->
          <tr>
            <td style="padding: 0 32px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="border-top: 1px solid #f0f0f0;"></td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- OTP Code Section -->
          <tr>
            <td style="padding: 24px 32px 16px; text-align: center;">
              <p style="margin: 0; font-size: 13px; color: #888888;">Or enter this code in the app:</p>
            </td>
          </tr>
          
          <tr>
            <td style="padding: 0 32px 24px; text-align: center;">
              <div style="display: inline-block; background-color: #f8f8f8; border-radius: 8px; padding: 12px 24px;">
                <span style="font-size: 24px; font-family: 'SF Mono', 'Menlo', 'Monaco', 'Courier New', monospace; font-weight: 600; letter-spacing: 4px; color: #1a1a1a;">{{ .Token }}</span>
              </div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px 32px; text-align: center; background-color: #fafafa;">
              <p style="margin: 0; font-size: 12px; color: #999999;">This link expires in 1 hour.<br>If you didn't request this, you can safely ignore it.</p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

---

## Template 2: Magic Link

Sent for **returning users** who request a login link.

**Subject:**
```
Your Graham Bible Login Link
```

**Body (HTML):**
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f5f5f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 440px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
          
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px; text-align: center; border-bottom: 1px solid #f0f0f0;">
              <h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 600; color: #1a1a1a;">The Graham Bible</h1>
              <p style="margin: 0; font-size: 14px; color: #888888;">An illustrated Bible arranged story by story</p>
            </td>
          </tr>
          
          <!-- Welcome Back Message -->
          <tr>
            <td style="padding: 32px 32px 16px; text-align: center;">
              <p style="margin: 0; font-size: 16px; color: #1a1a1a;">Welcome back! Tap the button below to sign in:</p>
            </td>
          </tr>
          
          <!-- Primary CTA Button -->
          <tr>
            <td style="padding: 8px 32px 32px; text-align: center;">
              <a href="{{ .SiteURL }}/#/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink" style="display: inline-block; background-color: #C9A227; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; padding: 16px 48px; border-radius: 12px;">Sign In</a>
            </td>
          </tr>
          
          <!-- Divider -->
          <tr>
            <td style="padding: 0 32px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="border-top: 1px solid #f0f0f0;"></td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- OTP Code Section -->
          <tr>
            <td style="padding: 24px 32px 16px; text-align: center;">
              <p style="margin: 0; font-size: 13px; color: #888888;">Or enter this code in the app:</p>
            </td>
          </tr>
          
          <tr>
            <td style="padding: 0 32px 24px; text-align: center;">
              <div style="display: inline-block; background-color: #f8f8f8; border-radius: 8px; padding: 12px 24px;">
                <span style="font-size: 24px; font-family: 'SF Mono', 'Menlo', 'Monaco', 'Courier New', monospace; font-weight: 600; letter-spacing: 4px; color: #1a1a1a;">{{ .Token }}</span>
              </div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px 32px; text-align: center; background-color: #fafafa;">
              <p style="margin: 0; font-size: 12px; color: #999999;">This link expires in 1 hour.<br>If you didn't request this, you can safely ignore it.</p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

---

## Key Differences Between Templates

| Aspect | Confirm signup | Magic Link |
|--------|---------------|------------|
| Subject | "Welcome to The Graham Bible" | "Your Graham Bible Login Link" |
| Greeting | "Welcome!" | "Welcome back!" |
| Button Text | "Confirm & Sign In" | "Sign In" |
| Type Parameter | `type=signup` | `type=magiclink` |
| Purpose | New user email verification | Returning user login |

---

## Template Variables Reference (PKCE Flow)

| Variable | Description | Use In |
|----------|-------------|--------|
| `{{ .SiteURL }}` | Your site URL (e.g., `https://www.grahambible.com`) | Base of custom link |
| `{{ .TokenHash }}` | Hashed authentication token | Query parameter in link |
| `{{ .Token }}` | 8-digit OTP code | Displayed for manual entry |
| `{{ .Email }}` | User's email address | Optional personalization |

### PKCE Link Format

```
{{ .SiteURL }}/#/auth/confirm?token_hash={{ .TokenHash }}&type=<type>
```

- The `/#/` is required for hash-based SPA routing
- `type=signup` for new user confirmation
- `type=magiclink` for returning user login

### Why NOT `{{ .ConfirmationURL }}`?

`{{ .ConfirmationURL }}` generates a link to Supabase's auth server, which works for **implicit flow**. But with **PKCE flow** (the modern default), your app must:
1. Receive the token_hash
2. Call `supabase.auth.verifyOtp({ token_hash, type })` 
3. Exchange it for a session

This is handled in `viewer/auth.js` in the `initAuth()` function.

---

## Client-Side Token Verification

The app handles PKCE token verification in `viewer/auth.js`:

```javascript
// In initAuth() - handles PKCE magic link
if (hash.includes('token_hash=')) {
    const params = new URLSearchParams(hash.split('?')[1]);
    const tokenHash = params.get('token_hash');
    const type = params.get('type');
    
    const { data, error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: type === 'signup' ? 'signup' : 'magiclink'
    });
    
    if (data?.session) {
        // User is now logged in
    }
}
```

---

## Verification Steps

After updating templates:

1. **Deploy auth.js** with PKCE token verification
2. **Copy templates** to Supabase Dashboard > Authentication > Email Templates
3. **Test new user:**
   - Sign up with new email
   - Should receive "Confirm signup" email
   - Click link → should log in successfully
4. **Test returning user:**
   - Sign out, request new login
   - Should receive "Magic Link" email
   - Click link → should log in successfully
5. **Test OTP fallback:**
   - Request login in PWA
   - Enter 8-digit code manually
   - Should authenticate

---

## Troubleshooting

**Link doesn't log in:**
- Ensure `auth.js?v=14` (or latest) is deployed
- Check browser console for `[Auth] Detected token_hash` log
- Verify URL format matches `/#/auth/confirm?token_hash=...`

**OTP code not working:**
- Ensure code hasn't expired (1 hour limit)
- Check code is entered correctly (8 digits)
- Try requesting a new code

**Email not received:**
- Check spam folder
- Verify SMTP settings in Supabase
- Check Resend dashboard for delivery status
