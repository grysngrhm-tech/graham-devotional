# Supabase Email Templates Configuration

## Overview

Custom email templates for The Graham Bible authentication.

**Important:** Use `{{ .ConfirmationURL }}` for the magic link button - Supabase handles all token processing automatically via `getSession()`.

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
              <a href="{{ .ConfirmationURL }}" style="display: inline-block; background-color: #C9A227; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; padding: 16px 48px; border-radius: 12px;">Confirm &amp; Sign In</a>
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
              <a href="{{ .ConfirmationURL }}" style="display: inline-block; background-color: #C9A227; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; padding: 16px 48px; border-radius: 12px;">Sign In</a>
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

## Template Variables

| Variable | Description |
|----------|-------------|
| `{{ .ConfirmationURL }}` | **USE THIS** - Full magic link URL (Supabase handles tokens automatically) |
| `{{ .Token }}` | OTP code for manual entry (8-digit) |
| `{{ .SiteURL }}` | Your site URL (don't use for login buttons) |
| `{{ .Email }}` | User's email address |

---

## Important Notes

1. **Both templates use `{{ .ConfirmationURL }}`** - This is handled automatically by Supabase's `getSession()`
2. **Do NOT use `{{ .SiteURL }}` for the login button** - It doesn't include authentication tokens
3. **OTP code (`{{ .Token }}`)** is 8-digit in this project's configuration
4. **Sender email must be lowercase** and match your verified domain in Resend

---

## Verification Steps

After updating templates:

1. **Test new user:** Sign up with new email, click the magic link → should log in
2. **Test returning user:** Request login, click the magic link → should log in
3. **Test OTP:** Enter the 8-digit code manually → should authenticate
