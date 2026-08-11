# Email Upgrade Testing Checklist

## Compilation Check ✅

- [x] No TypeScript errors in `/lib/connect/data.ts` (Email interface updated)
- [x] No TypeScript errors in `/contexts/connect-context.tsx` (sendEmail/saveDraft updated)
- [x] No TypeScript errors in `/components/connect/emails-view.tsx` (UI updated)
- [x] API routes created without syntax errors
- [x] All exports properly declared

## Data Model Tests

### Internal Emails (@username)
- [ ] Create internal email to @user.name
- [ ] Verify `type: "internal"` in data
- [ ] Verify `recipient` is "@user.name"
- [ ] Verify `senderName` shows Pi username
- [ ] Verify "Internal" badge displays
- [ ] Verify attachment stored correctly

### External Emails (email@domain.com)
- [ ] Create external email to user@gmail.com
- [ ] Verify `type: "external"` in data
- [ ] Verify `recipient` is "user@gmail.com"
- [ ] Verify `deliveryStatus` is "pending"
- [ ] Verify "External" badge displays
- [ ] Verify delivery status shown in UI
- [ ] Verify placeholder email from webhook works

## Validation Tests

### Recipient Validation
- [ ] Accept @validusername format
- [ ] Accept email@domain.com format
- [ ] Reject invalid @username (no underscores/hyphens in name)
- [ ] Reject invalid email format
- [ ] Show helpful error messages
- [ ] Show inline guidance in compose form

### Attachment Tests
- [ ] Upload file under 10MB
- [ ] Show file size in KB
- [ ] Reject file over 10MB with error message
- [ ] Display attachment in email view
- [ ] Show attachment metadata (name + size)

## UI/UX Tests

### Email List View
- [ ] Internal emails show "Internal" badge
- [ ] External emails show "External" badge + delivery status
- [ ] Both show correct sender name
- [ ] Both show correct recipient
- [ ] Read/unread states work correctly
- [ ] Preview text displays correctly

### Email Detail View
- [ ] Email type badge visible
- [ ] External email shows delivery status
- [ ] Recipient displayed correctly (@ for internal, email for external)
- [ ] Attachment information shown if present
- [ ] Reply button works for both types

### Compose Form
- [ ] Recipient field accepts both formats
- [ ] Inline guidance shows format hints
- [ ] Autocomplete suggests @username from contacts
- [ ] Attachment section enforces 10MB limit
- [ ] Send button triggers appropriate logic
- [ ] Draft saves with correct recipient type

## Backend Integration Tests

### API /api/email/send
- [ ] Validates recipient format server-side
- [ ] Returns pending status for external emails
- [ ] Never exposes API keys in response
- [ ] Handles invalid recipients gracefully

### API /api/email/webhook
- [ ] Accepts webhook payload structure
- [ ] Validates webhook signature (when implemented)
- [ ] Updates email delivery status correctly
- [ ] Handles bounce/spam events correctly

## Data Persistence Tests

### Seed Data
- [ ] Both internal and external emails load on startup
- [ ] "Internal" label shows correctly
- [ ] "External" label with delivery status shows correctly

### Sanitization
- [ ] Invalid email types default to "internal"
- [ ] Missing recipients are skipped
- [ ] Attachment sizes clamped to 10MB limit
- [ ] Attachment sizes of 0 or undefined handled
- [ ] Old `username`/`name` data doesn't break (migration)
- [ ] Old `attachment` field doesn't break (migration)

## No Regressions

- [ ] Chat system works unchanged
- [ ] Contact system works unchanged
- [ ] Call system works unchanged
- [ ] Profile system works unchanged
- [ ] All existing internal emails still work
- [ ] No performance degradation

## Mobile UI Tests

- [ ] Email list scrolls smoothly
- [ ] Badges readable on small screens
- [ ] Compose form usable on mobile
- [ ] Recipient input readable with hint text
- [ ] Attachment section not cramped

## Security Tests

- [ ] Credentials never logged to console
- [ ] API responses don't contain secrets
- [ ] Recipient validation prevents injection
- [ ] Sanitization prevents proto pollution
- [ ] Attachment size prevents abuse
- [ ] External email metadata treated as untrusted

## Error Handling Tests

- [ ] Empty recipient shows error
- [ ] Invalid recipient shows error
- [ ] Missing subject shows helpful hint (optional)
- [ ] Failed send shows error toast
- [ ] Network error handled gracefully

## Browser Compatibility

- [ ] Works in Chrome/Edge (WebKit)
- [ ] Works in Firefox (Gecko)
- [ ] Works in Safari (WebKit)
- [ ] Works on iOS Safari
- [ ] Works on Android Chrome

## Performance Tests

- [ ] Load 100 emails without lag
- [ ] Scrolling email list is smooth
- [ ] No memory leaks on compose/delete cycles
- [ ] Attachment upload doesn't block UI

---

## Notes

- Seed data includes both internal and external examples
- External email delivery simulated in API layer
- No real SMTP configured yet (uses mock provider)
- Webhook receiver in place but not actively integrated
- Attachment data not persisted to storage yet

## Future Tests (After Storage Integration)

- [ ] Upload and download attachment files
- [ ] Test 10MB file edge case
- [ ] Test various MIME types
- [ ] Test concurrent uploads
