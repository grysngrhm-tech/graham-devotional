# Supabase Email Templates Configuration

## Overview

Custom email templates for The Graham Bible authentication. These templates provide:
- Graham Bible branding with signature gold color (#C9A227)
- Magic link as primary login method (most prominent)
- OTP code as secondary option for PWA users
- iOS-inspired clean design
- Works in both light and dark email clients

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

**Important:** Email domain must match your verified domain in Resend. Case matters!

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
  <meta name="supported-color-schemes" content="light dark">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f5f5f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 440px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
          
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px; text-align: center; border-bottom: 1px solid #f0f0f0;">
              <h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 600; color: #1a1a1a; letter-spacing: -0.5px;">The Graham Bible</h1>
              <p style="margin: 0; font-size: 14px; color: #888888;">An illustrated Bible arranged story by story</p>
            </td>
          </tr>
          
          <!-- Welcome Message -->
          <tr>
            <td style="padding: 32px 32px 16px; text-align: center;">
              <p style="margin: 0; font-size: 16px; color: #1a1a1a;">Welcome! Tap the button below to sign in:</p>
            </td>
          </tr>
          
          <!-- Primary CTA Button -->
          <tr>
            <td style="padding: 8px 32px 32px; text-align: center;">
              <a href="{{ .ConfirmationURL }}" style="display: inline-block; background-color: #C9A227; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; padding: 16px 48px; border-radius: 12px; letter-spacing: 0.3px;">Sign In</a>
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
  <meta name="supported-color-schemes" content="light dark">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f5f5f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 440px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
          
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px; text-align: center; border-bottom: 1px solid #f0f0f0;">
              <h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 600; color: #1a1a1a; letter-spacing: -0.5px;">The Graham Bible</h1>
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
              <a href="{{ .ConfirmationURL }}" style="display: inline-block; background-color: #C9A227; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; padding: 16px 48px; border-radius: 12px; letter-spacing: 0.3px;">Sign In</a>
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
| Purpose | First-time users | Returning users |
| Link variable | `{{ .ConfirmationURL }}` | `{{ .ConfirmationURL }}` |
| OTP variable | `{{ .Token }}` | `{{ .Token }}` |

---

## Template Variables Reference

| Variable | Description |
|----------|-------------|
| `{{ .ConfirmationURL }}` | Full magic link URL that logs user in |
| `{{ .Token }}` | 6-digit OTP code |
| `{{ .SiteURL }}` | Your site URL (don't use for login links) |
| `{{ .Email }}` | User's email address |

**Important:** Use `{{ .ConfirmationURL }}` for the Sign In button, NOT `{{ .SiteURL }}`.

---

## Design Principles

1. **Magic link is primary** — Large gold button, above the fold
2. **OTP is secondary** — Smaller, below divider, for PWA users
3. **Clean typography** — System fonts, readable sizes
4. **Brand colors** — Gold (#C9A227) for CTA, neutral grays elsewhere
5. **Mobile-first** — Responsive, large touch targets
6. **Light/dark compatible** — Neutral colors work in both modes

---

## Verification Steps

After updating templates:

1. **Test new user flow:**
   - Use incognito/private browser
   - Sign up with new email
   - Verify "Confirm signup" template received
   - Click magic link → should log in

2. **Test returning user flow:**
   - Sign out
   - Request new login link
   - Verify "Magic Link" template received
   - Click magic link → should log in

3. **Test OTP flow (PWA):**
   - Open PWA version
   - Request login
   - Enter OTP code from email
   - Should authenticate within PWA
