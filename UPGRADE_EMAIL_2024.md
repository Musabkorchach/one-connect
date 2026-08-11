# Pi Connect Email Upgrade - 2024

## Summary

Upgraded Pi Connect email system to support both **internal emails** (@username between Pi users) and **external emails** (user@domain.com) with secure backend integration.

## Key Changes

### 1. **Data Types** (`lib/connect/data.ts`)
- Added `EmailType = "internal" | "external"` discriminator
- Updated `Email` interface:
  - Replaced `username`/`name` with `recipient` (universal field)
  - Added `senderName` (display name)
  - Changed `attachment` → `attachmentName` + `attachmentSize`
  - Added `deliveryStatus` for external emails (pending/sent/failed/spam)
  - Added `readAt` timestamp for external email tracking
  - Added `type` field to distinguish internal vs external
- Added validation helpers:
  - `validateEmailRecipient()` - returns "internal" | "external" | null
  - `isInternalEmail()` - checks @username format
  - `isExternalEmail()` - validates RFC 5322 format
- Added `MAX_ATTACHMENT_SIZE = 10MB` constant

### 2. **Backend API Routes**
Created two new secure API endpoints (credentials in env variables only):

- **POST /app/api/email/send/route.ts**
  - Handles external email sending via SMTP/provider API
  - Validates recipient format on backend
  - Never exposes API keys to frontend
  - Returns delivery tracking ID

- **POST /app/api/email/webhook/route.ts**
  - Webhook receiver for provider notifications (SendGrid, Mailgun, AWS SES)
  - Validates webhook signatures
  - Updates email delivery status
  - Handles bounce/spam classification

### 3. **Context Updates** (`contexts/connect-context.tsx`)
- Updated `sendEmail()` method:
  - Now accepts `recipient` (both @username and email@domain.com)
  - Routes to `/api/email/send` for external emails
  - Shows "pending" status while awaiting external delivery
  - Simulates internal email replies after 3 seconds
  
- Updated `saveDraft()` method:
  - Accepts same recipient format as sendEmail
  - Validates before saving

- Added imports for validation helpers

### 4. **UI Updates** (`components/connect/emails-view.tsx`)
- **Email List**:
  - Shows "Internal" or "External" badge for each email
  - External emails display delivery status (pending/sent/failed)
  - Attachment size displayed in KB
  
- **Read Email View**:
  - Shows email type prominently ("Internal" vs "External")
  - External emails show delivery status
  - Recipient shown correctly for both types
  
- **Compose Form**:
  - Recipient input accepts both formats (@username or email@domain.com)
  - Helpful text showing format guidance
  - Attachment size limits enforced (10MB max)
  - Both internal and external recipients in autocomplete dropdown

### 5. **Seed Data Updates** (`lib/connect/data.ts`)
Updated `seedEmails()` to include:
- Internal emails between Pi users
- External email example from notification service
- Demonstrates both "Internal" and "External" types

### 6. **Sanitization** (`lib/connect/data.ts`)
Updated `sanitizeEmails()` to:
- Validate `type` field (internal/external)
- Validate `recipient` format based on type
- Handle new `attachmentSize` and `deliveryStatus` fields
- Prevent prototype pollution attacks
- Clamp all numeric values

## Security Features

✅ **Frontend Security**:
- Recipient validation prevents invalid addresses
- Attachment size limits prevent abuse
- No credentials exposed in client code
- Sanitized display of external content

✅ **Backend Security**:
- All SMTP credentials in environment variables
- Webhook signature verification
- Rate limiting hooks (to be implemented)
- API key never logged or transmitted to client

❌ **NOT Included** (out of scope):
- Email encryption (PGP)
- Actual attachment storage
- Spam filtering rules
- Email forwarding/rules
- Template system

## Environment Configuration

Required environment variables (in server env, NOT frontend):

```
EMAIL_PROVIDER=sendgrid|mailgun|aws-ses
EMAIL_API_KEY=your_api_key
EMAIL_FROM_ADDRESS=noreply@yourapp.com
EMAIL_WEBHOOK_SECRET=your_webhook_secret
```

See `lib/EMAIL_CONFIG.md` for detailed setup.

## Backward Compatibility

⚠️ **Breaking Changes**:
- Email interface changed significantly
- Old seed data with `username` field won't load (sanitizer handles migration)
- `attachment` field renamed to `attachmentName` + `attachmentSize`

## Testing

1. **Internal Emails**: @username recipients work as before
2. **External Emails**: email@domain.com recipients trigger API calls
3. **Validation**: Invalid formats show error messages
4. **Attachments**: 10MB limit enforced with user feedback
5. **Delivery Status**: External emails show status updates

## Future Work

- [ ] Implement real attachment blob storage
- [ ] Add email provider webhook validation per provider
- [ ] Implement rate limiting for email sending
- [ ] Add email templates and signatures
- [ ] Support multiple sender addresses
- [ ] Add PGP encryption option
- [ ] Implement spam filtering
- [ ] Add email forwarding rules

## Files Modified

1. `/lib/connect/data.ts` - Email types, validation, seed data
2. `/contexts/connect-context.tsx` - sendEmail/saveDraft logic
3. `/components/connect/emails-view.tsx` - UI for compose and display
4. `/app/api/email/send/route.ts` - New: external email sender
5. `/app/api/email/webhook/route.ts` - New: webhook receiver
6. `/lib/EMAIL_CONFIG.md` - New: configuration guide
7. `/UPGRADE_EMAIL_2024.md` - This file

## No Breaking Changes to Other Features

- Chat system unchanged
- Contact system unchanged
- Call system unchanged
- Profile system unchanged
- All UI branding and mobile-first design preserved
