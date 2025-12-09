# Supabase Email Templates Configuration

## Problem
New users receive Supabase's default "Confirm signup" email which lacks:
- Graham Bible branding
- OTP code for PWA login
- Custom styling

## Solution
Update both email templates in Supabase Dashboard to provide consistent experience.

---

## Steps to Configure

1. Go to **Supabase Dashboard** > **Authentication** > **Email Templates**
2. Update **both** templates below

---

## Template 1: Confirm signup

This is sent when a **new user** signs up for the first time.

**Subject:**
```
Welcome to The Graham Bible - Your Login Code
```

**Body (HTML):**
```html
<div style="font-family: Georgia, 'Times New Roman', serif; max-width: 500px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a;">
  <h1 style="font-size: 24px; font-weight: normal; margin-bottom: 8px; color: #1a1a1a;">
    The Graham Bible
  </h1>
  <p style="font-size: 14px; color: #666; margin-bottom: 32px;">
    An illustrated Bible arranged story by story
  </p>
  
  <p style="font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
    Welcome! Your login code is:
  </p>
  
  <div style="background: #f5f5f5; border-radius: 8px; padding: 24px; text-align: center; margin-bottom: 24px;">
    <span style="font-size: 36px; letter-spacing: 8px; font-family: 'Courier New', monospace; font-weight: bold; color: #1a1a1a;">
      {{ .Token }}
    </span>
  </div>
  
  <p style="font-size: 14px; color: #666; margin-bottom: 24px;">
    Enter this code in the app to sign in. The code expires in 1 hour.
  </p>
  
  <p style="font-size: 14px; color: #666; margin-bottom: 16px;">
    Or click the button below to sign in directly:
  </p>
  
  <a href="{{ .ConfirmationURL }}" style="display: inline-block; background: #1a1a1a; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-size: 14px;">
    Sign In to The Graham Bible
  </a>
  
  <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
  
  <p style="font-size: 12px; color: #999;">
    If you didn't request this email, you can safely ignore it.
  </p>
</div>
```

---

## Template 2: Magic Link

This is sent for **returning users** who request a login link.

**Subject:**
```
Your Graham Bible Login Code
```

**Body (HTML):**
```html
<div style="font-family: Georgia, 'Times New Roman', serif; max-width: 500px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a;">
  <h1 style="font-size: 24px; font-weight: normal; margin-bottom: 8px; color: #1a1a1a;">
    The Graham Bible
  </h1>
  <p style="font-size: 14px; color: #666; margin-bottom: 32px;">
    An illustrated Bible arranged story by story
  </p>
  
  <p style="font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
    Your login code is:
  </p>
  
  <div style="background: #f5f5f5; border-radius: 8px; padding: 24px; text-align: center; margin-bottom: 24px;">
    <span style="font-size: 36px; letter-spacing: 8px; font-family: 'Courier New', monospace; font-weight: bold; color: #1a1a1a;">
      {{ .Token }}
    </span>
  </div>
  
  <p style="font-size: 14px; color: #666; margin-bottom: 24px;">
    Enter this code in the app to sign in. The code expires in 1 hour.
  </p>
  
  <p style="font-size: 14px; color: #666; margin-bottom: 16px;">
    Or click the button below to sign in directly:
  </p>
  
  <a href="{{ .SiteURL }}" style="display: inline-block; background: #1a1a1a; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-size: 14px;">
    Sign In to The Graham Bible
  </a>
  
  <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
  
  <p style="font-size: 12px; color: #999;">
    If you didn't request this email, you can safely ignore it.
  </p>
</div>
```

---

## Important Notes

1. **Both templates need the OTP code** (`{{ .Token }}`) prominently displayed
2. The "Confirm signup" template uses `{{ .ConfirmationURL }}` for the link
3. The "Magic Link" template uses `{{ .SiteURL }}` for the link
4. Ensure your Site URL is set correctly in Authentication > URL Configuration

---

## Verification

After updating templates:
1. Sign up with a new email address
2. Verify the email shows the OTP code and Graham Bible branding
3. Test logging in with an existing account to verify Magic Link template

