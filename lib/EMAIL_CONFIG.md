# Pi Connect Email Configuration

## Overview

Pi Connect supports both internal emails (@username) and external emails (user@domain.com) with secure backend integration.

## Internal Emails (@username)

- Direct messaging between Pi users using their usernames
- No external provider needed
- Full threading, attachments (up to 10MB), and read receipts
- Labeled as "Internal" in UI

## External Emails (user@domain.com)

- Send/receive emails via SMTP and webhooks
- Requires email service provider configuration
- All credentials stored in backend environment variables (never exposed to frontend)
- Labeled as "External" with delivery status tracking

## Server Environment Variables

Add these to your `.env` or hosting environment:

```
# Email Provider Configuration (Choose one: sendgrid, mailgun, or aws-ses)
EMAIL_PROVIDER=sendgrid
EMAIL_API_KEY=your_api_key_here
EMAIL_FROM_ADDRESS=noreply@yourapp.com
EMAIL_WEBHOOK_SECRET=your_webhook_secret_here
```

### Supported Providers

#### SendGrid
```
EMAIL_PROVIDER=sendgrid
EMAIL_API_KEY=SG.your_sendgrid_api_key
EMAIL_FROM_ADDRESS=noreply@yourapp.com
EMAIL_WEBHOOK_SECRET=your_webhook_secret
```

#### Mailgun
```
EMAIL_PROVIDER=mailgun
EMAIL_API_KEY=key-your_mailgun_key
EMAIL_FROM_ADDRESS=noreply@yourapp.com
EMAIL_WEBHOOK_SECRET=your_webhook_secret
```

#### AWS SES
```
EMAIL_PROVIDER=aws-ses
EMAIL_API_KEY=AKIAIOSFODNN7EXAMPLE
EMAIL_FROM_ADDRESS=noreply@yourapp.com
EMAIL_WEBHOOK_SECRET=your_webhook_secret
```

## Backend API Routes

### POST /api/email/send
Sends external emails. Never called directly from frontend.

**Security**: 
- All email validation happens on backend
- API keys never exposed to client
- Rate limiting should be implemented
- Recipient validation prevents spam

### POST /api/email/webhook
Receives delivery/bounce notifications from email provider.

**Setup**: Configure webhook URL in your provider's dashboard:
- SendGrid: Account Settings → Event Webhook
- Mailgun: Webhooks → Add Webhook
- AWS SES: Configuration Set Event Destinations

## Frontend Security

✅ **Safe**: 
- Recipient validation (internal @username or external email format)
- Attachment size limits (10MB max)
- No credentials in browser
- Sanitized display of email content

❌ **NOT Safe**:
- SMTP credentials in frontend code
- API keys in client-side code
- Direct SMTP connections from browser
- Password-protected emails stored in plaintext

## Attachment Handling

- **Size limit**: 10MB per file
- **Storage**: Currently simulated (not persisted)
- **Security**: No executable files; validate MIME types on backend

## Email Validation

- **Internal**: Must be valid Pi username format (@username)
- **External**: RFC 5322 basic validation (name@domain.com)
- **Delivery tracking**: Tracked via provider webhooks

## Future Enhancements

- [ ] Implement real attachment storage (blob storage or cloud)
- [ ] Add PGP encryption for external emails
- [ ] Implement spam filtering
- [ ] Add email templates/signatures
- [ ] Support multiple sender addresses
- [ ] Add email forwarding rules
