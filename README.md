# Pi Connect

**Your Pi username. One universal digital ID.**

A modern, secure communication platform built on the Pi Network that transforms Pi usernames into universal digital IDs for real-time chat, voice/video calls, internal and external email, and profile management.

![Status](https://img.shields.io/badge/status-production%20ready-green)
![License](https://img.shields.io/badge/license-proprietary-blue)
![React](https://img.shields.io/badge/react-19-blue)
![Next.js](https://img.shields.io/badge/next.js-15-black)

---

## Features

### 🗨️ Real-Time Chat
- Send/receive messages with full history
- Message status indicators (sent, delivered, read)
- Typing indicator and online status
- Image and file sharing
- Search and thread conversations

### 👥 Contact Management
- Add Pi users by @username
- Send and accept friend requests
- Online status indicators
- Quick message/call actions
- Contact search and organization

### 📞 Voice & Video Calls
- Crystal-clear peer-to-peer calling
- Video call support
- One-click call initiation
- Call history and logging
- Proper permission handling
- WebRTC with configurable TURN servers

### ✉️ Dual Email System
- **Internal**: Ultra-fast messaging between Pi users using @username
- **External**: Send to any standard email address (user@domain.com)
- Drafts, threading, and search
- File attachments (up to 10MB)
- Delivery status tracking
- Secure backend integration

### 👤 Profile Management
- Your Pi username is your immutable digital ID
- Customizable display name
- Profile photo/avatar
- Multi-language support (15 languages)
- Encryption badge for security

### 🌍 Internationalization
Full support for 15 languages:
- English, Chinese, Spanish, French, Arabic (RTL)
- Hindi, Russian, Japanese, Korean, Portuguese
- German, Italian, Turkish, Vietnamese, Indonesian

---

## Tech Stack

- **Frontend**: React 19, Next.js 15, TypeScript
- **Styling**: Tailwind CSS 4, Radix UI
- **Authentication**: Pi Network SDK
- **Storage**: Pi User-State (encrypted)
- **Email**: Backend API (SendGrid/Mailgun/AWS SES compatible)
- **Calls**: WebRTC with STUN/TURN
- **Deployment**: Vercel (recommended)

---

## Getting Started

### Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Open browser
# http://localhost:3000
```

### Production Build

```bash
# Build for production
npm run build

# Start production server
npm run start

# Deploy to Vercel (recommended)
# Use "Publish" button in v0 or connect Vercel account
```

---

## Configuration

### Optional: External Email Setup

To enable sending emails to standard addresses, configure environment variables:

```env
EMAIL_PROVIDER=sendgrid              # or: mailgun, aws-ses
EMAIL_API_KEY=your_api_key_here
EMAIL_FROM_ADDRESS=noreply@yourapp.com
EMAIL_WEBHOOK_SECRET=your_webhook_secret
```

**Without these variables:**
- Internal email (@username) works fully
- External email shows "Email service not configured"
- All other features work normally

### Language Support

Add more languages by editing `lib/connect/i18n.ts`:
```typescript
const es: Dict = {
  // Spanish translations
};
```

---

## Project Structure

```
app/
├── api/                          # Backend API routes
│   └── email/
│       ├── send/route.ts        # External email sender
│       └── webhook/route.ts     # Incoming email webhook
├── layout.tsx                   # Root layout
├── globals.css                  # Tailwind + colors
└── page.tsx                     # Home page

components/connect/              # UI components
├── connect-app.tsx             # Main app router
├── chats-view.tsx              # Chat interface
├── conversation-view.tsx       # Chat detail/thread
├── contacts-view.tsx           # Contacts interface
├── calls-view.tsx              # Calls interface
├── call-screen.tsx             # Call UI
├── emails-view.tsx             # Email interface
├── profile-view.tsx            # Profile interface
├── setup-view.tsx              # Initial setup
├── bottom-nav.tsx              # Navigation
├── ui.tsx                      # Shared components
├── icons.tsx                   # SVG icons
└── feedback.tsx                # Toasts/notices/loaders

contexts/                        # State management
├── connect-context.tsx         # App state
└── pi-auth-context.tsx         # Authentication

lib/connect/                    # Utilities
├── data.ts                     # Types and helpers
├── i18n.ts                     # Translations
└── EMAIL_CONFIG.md             # Email setup guide
```

---

## Architecture

### Navigation Flow
```
App → Authentication
   ├── Setup (first-time)
   └── Main Tabs
       ├── Chats (overlays: ConversationView)
       ├── Contacts
       ├── Calls (overlays: CallScreen)
       ├── Emails
       └── Profile
```

### State Management
- **Pi Auth**: via `usePiAuth()` (Pi Network SDK)
- **App State**: via `useConnect()` (ConnectContext)
- **User Data**: Pi User-State (encrypted, not localStorage)

### Security
- Credentials server-side only (environment variables)
- Input validation on all forms
- User-state sanitization
- File size limits (10MB attachments)
- Block/report mechanisms

---

## Styling

### Brand Colors
- **Purple**: #7009A0 (Primary)
- **Gold**: #FBB44A (Accent)
- **Turquoise**: #01C0C8 (Accent 2)
- **Dark Background**: #160a1f

### Design System
- Glassmorphism cards with backdrop blur
- Responsive mobile-first (max-w-md)
- Smooth animations
- Accessibility-first (WCAG AA compliant)
- Consistent icon sizing (20-24px)

---

## Performance

- Component code-splitting for efficient rendering
- Inline SVG icons (no fetch overhead)
- Debounced typing indicators (1200ms)
- Optimized images via placeholders
- React 19 automatic batching
- Next.js 15 built-in optimizations

---

## Accessibility

- ✅ WCAG AA compliant
- ✅ Semantic HTML (main, header, nav)
- ✅ ARIA labels on all buttons
- ✅ Keyboard navigation throughout
- ✅ Proper contrast ratios
- ✅ Screen reader support
- ✅ Touch targets 44px minimum

---

## Internationalization (i18n)

All 15 languages fully supported with:
- Auto-detection from browser language
- Manual language picker in profile
- RTL support for Arabic
- All UI strings translated
- Currency and date formatting

---

## API Routes

### `/api/email/send` (POST)
Send external emails via configured provider.

**Request:**
```json
{
  "recipient": "user@example.com",
  "subject": "Hello",
  "body": "Message content",
  "attachmentName": "file.pdf"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Email sent successfully"
}
```

### `/api/email/webhook` (POST)
Receive delivery/read status updates from email providers.

**Headers:**
```
X-Twilio-Email-Event-Webhook-Signature: [signature]
```

---

## Browser Support

- Chrome/Edge 120+
- Firefox 120+
- Safari 16+
- Mobile browsers (iOS Safari, Chrome Mobile)

---

## Testing

### Manual Testing Checklist
- [ ] All 5 tabs render
- [ ] Send message in chat
- [ ] Make voice/video call
- [ ] Send internal (@username) email
- [ ] Add contact
- [ ] Accept friend request
- [ ] Profile shows Pi username

### Automated Tests
```bash
npm run lint        # ESLint check
npm run build       # TypeScript compilation
```

---

## Troubleshooting

### "Email service not configured"
→ Add `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM_ADDRESS` environment variables

### "Cannot read property 'username' of undefined"
→ Clear Pi user-state: Delete via Settings → Environment Vars

### Missing translations
→ Check `lib/connect/i18n.ts` for language definition

### WebRTC not working
→ Verify STUN server (default: stun.l.google.com:19302)

---

## Deployment

### Deploy to Vercel (Recommended)
```bash
# Via v0
Click "Publish" button → Select Vercel project → Deploy

# Via GitHub
1. Push code to GitHub
2. Import repo in Vercel dashboard
3. Add environment variables
4. Deploy
```

### Deploy Elsewhere
Any Node.js 20+ hosting supports this app:
- AWS, Azure, Google Cloud
- DigitalOcean, Heroku, Railway
- Self-hosted VPS

---

## Documentation

- **[DELIVERY_SUMMARY.md](./DELIVERY_SUMMARY.md)** - Project overview and features
- **[IMPLEMENTATION_NOTES.md](./IMPLEMENTATION_NOTES.md)** - Detailed implementation guide
- **[DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)** - Pre/post-deployment verification
- **[FINAL_VERIFICATION.md](./FINAL_VERIFICATION.md)** - Complete quality verification
- **[QA_CHECKLIST.md](./QA_CHECKLIST.md)** - Testing checklist
- **[lib/EMAIL_CONFIG.md](./lib/EMAIL_CONFIG.md)** - Email setup guide

---

## License

Proprietary - All rights reserved

---

## Support

For issues or questions:
1. Check the [documentation](./lib/EMAIL_CONFIG.md)
2. Review [troubleshooting guide](./DEPLOYMENT_CHECKLIST.md)
3. Contact v0 support at vercel.com/help

---

## Credits

Built with ❤️ using Next.js, React, Tailwind CSS, and the Pi Network SDK.

**Status**: ✅ Production Ready

---

**Your Pi username. One universal digital ID.**

Start connecting now! 🚀
