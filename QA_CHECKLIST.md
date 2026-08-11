# Pi Connect - QA & Testing Checklist

## Pre-Launch Verification

### 1. Splash Screen (Loading)
- [ ] Page loads and shows professional splash screen
- [ ] Dark gradient background with animated elements
- [ ] Pi logo appears in glassmorphic card
- [ ] Spinner ring animates around logo
- [ ] "Pi Connect" text shows with gradient
- [ ] Bouncing dots indicator animates
- [ ] "Connecting..." text displays
- [ ] Error state shows with retry button if auth fails
- [ ] All animations smooth (no jank)
- [ ] Text contrast readable

### 2. Chats Tab
- [ ] List displays all conversations
- [ ] Conversations sorted by recent first
- [ ] Last message preview shows correctly
  - [ ] Text displays in truncated form
  - [ ] Photo shows "Photo" label
  - [ ] File shows filename
- [ ] Time displays correctly (timeAgo)
- [ ] Search works for contact name
- [ ] Search works for username
- [ ] Search highlights matching results
- [ ] Empty state shows when no chats
- [ ] Click on chat opens conversation
- [ ] Message statuses display correctly
  - [ ] Single checkmark for sent
  - [ ] Double gray checkmark for delivered
  - [ ] Double turquoise checkmark for read
- [ ] Typing indicator shows in header (animated gold text)
- [ ] Online status shows green dot on avatar
- [ ] Online status shows "Online" text in header
- [ ] Conversation auto-scrolls to bottom
- [ ] Messages grouped by day
- [ ] Encryption banner visible
- [ ] Send message works with Enter
- [ ] CJK IME: Enter during composition doesn't send
- [ ] Image attachment works
- [ ] File attachment works
- [ ] Attachment download button present
- [ ] Back button returns to list

### 3. Contacts Tab
- [ ] All contacts display with avatar + online status
- [ ] Contacts sorted alphabetically
- [ ] Sticky letter headers while scrolling
- [ ] Online status shows green for online
- [ ] Offline status shows username in gray
- [ ] Add contact button (+ icon) present
- [ ] Click add button opens sheet
- [ ] Enter username without @ works
- [ ] Enter username with @ works
- [ ] Submit adds contact successfully
- [ ] Duplicate add shows "already added" error
- [ ] Self-add shows "can't add yourself" error
- [ ] Invalid username shows error
- [ ] Contact requests visible at top
- [ ] Accept request (green check) works
- [ ] Decline request (red X) works
- [ ] Accepted contact moves to list
- [ ] Declined request disappears
- [ ] Contact detail sheet opens on click
- [ ] Three action buttons visible (Message/Voice/Video)
- [ ] Message button calls onMessage
- [ ] Voice call button calls onCall
- [ ] Video call button calls onCall
- [ ] Contact search works in call picker
- [ ] Empty state shows when no contacts

### 4. Calls Tab
- [ ] Call list displays with call history
- [ ] Incoming calls show green icon
- [ ] Outgoing calls show turquoise icon
- [ ] Missed calls show red icon
- [ ] Call duration displays correctly
- [ ] Time displays correctly (timeAgo)
- [ ] New call FAB visible (turquoise button, bottom-right)
- [ ] Click FAB opens call picker
- [ ] Call picker shows contacts
- [ ] Search works in call picker
- [ ] Voice call button initiates voice call
- [ ] Video call button initiates video call
- [ ] Call screen shows with large avatar
- [ ] Avatar pulses during ringing phase
- [ ] "Ringing..." text appears (2s+)
- [ ] Phase changes to "Connecting" (after 1.4s)
- [ ] Phase changes to "Active" (after 2.6s)
- [ ] Duration timer starts and increments during active
- [ ] Mute button toggles mic state
- [ ] Mute icon changes when active
- [ ] Speaker button toggles audio
- [ ] Camera button toggles video (disabled for voice)
- [ ] Switch camera button works (video only)
- [ ] Hangup button ends call
- [ ] Call duration recorded in history
- [ ] WebRTC config visible (STUN server info)
- [ ] TURN server noted as configurable
- [ ] Permission error shows if mic denied
- [ ] Permission error shows if camera denied
- [ ] Error message clear and helpful

### 5. Profile Tab
- [ ] Avatar displays large (100px)
- [ ] Display name shows correctly
- [ ] Pi username displays with @ symbol
- [ ] Edit Profile button present
- [ ] Digital ID section has shield icon
- [ ] Digital ID shows copy button
- [ ] Copy ID copies to clipboard
- [ ] Copy feedback shows (checkmark appears)
- [ ] Cannot edit username field
- [ ] Username shown in read-only format
- [ ] Language setting shows current language
- [ ] Click language opens picker
- [ ] All 15 languages visible in picker
- [ ] Current language highlighted
- [ ] Select language updates immediately
- [ ] About section shows app description
- [ ] Encryption badge visible in about
- [ ] Edit Profile sheet opens on button click
- [ ] Avatar upload works
- [ ] Camera overlay visible on avatar
- [ ] Display name can be edited
- [ ] Save button validates non-empty name
- [ ] Save updates profile
- [ ] Cancel closes sheet without saving
- [ ] Edit sheet pre-fills current values

### 6. Design & Branding
- [ ] Purple (#7009A0) used for primary elements
- [ ] Gold (#FBB44A) used for accents
- [ ] Turquoise (#01C0C8) used for secondary accents
- [ ] Dark background (#0a0410) applied
- [ ] Glassmorphism (pc-glass) used on cards
- [ ] Rounded corners consistent (2xl)
- [ ] Typography readable with proper contrast
- [ ] Icons consistent throughout
- [ ] No jarring color changes
- [ ] Mobile view respects safe areas
- [ ] Bottom nav properly positioned
- [ ] Fixed spacing (no arbitrary values)

### 7. Accessibility
- [ ] All buttons have aria-labels
- [ ] Headings use semantic tags
- [ ] Images have alt text or titles
- [ ] Focus visible on interactive elements
- [ ] Keyboard navigation works
- [ ] Text size minimum 14px
- [ ] Color contrast passes WCAG AA
- [ ] Links distinguishable from text
- [ ] No flashing elements >3Hz
- [ ] Screen reader reads all content

### 8. Mobile Optimization
- [ ] Responds to viewport changes
- [ ] Touch targets minimum 44px
- [ ] No horizontal scrolling
- [ ] Bottom nav not hidden
- [ ] Safe area respected
- [ ] Notch/cutout handled properly
- [ ] Landscape orientation works
- [ ] Portrait orientation works
- [ ] Text wraps properly
- [ ] Buttons don't overlap

### 9. Performance
- [ ] Page loads in <2s
- [ ] Animations smooth (60fps)
- [ ] No console errors
- [ ] No memory leaks
- [ ] Search responsive (no lag)
- [ ] Scrolling smooth
- [ ] Typing indicator smooth
- [ ] Call screen responsive
- [ ] No flashing or flickering
- [ ] Images load without distortion

### 10. Data Persistence
- [ ] Chats persist after refresh
- [ ] Contacts persist after refresh
- [ ] Profile persists after refresh
- [ ] Language preference persists
- [ ] Call history persists
- [ ] Message states persist
- [ ] No data loss on navigation

### 11. No Regressions
- [ ] No wallet/payment functionality
- [ ] No crypto/blockchain code
- [ ] No payment buttons
- [ ] No payment forms
- [ ] Email system doesn't break chats
- [ ] All existing features work
- [ ] No console warnings
- [ ] No TypeScript errors

### 12. Error Handling
- [ ] Network errors handled gracefully
- [ ] Permission errors show helpful messages
- [ ] Validation errors clear
- [ ] Empty states display correctly
- [ ] No unhandled exceptions
- [ ] Recovery options provided
- [ ] Error messages user-friendly

### 13. Browser Compatibility
- [ ] Works on Chrome
- [ ] Works on Safari
- [ ] Works on Firefox
- [ ] Works on Edge
- [ ] Mobile browsers supported
- [ ] No console errors in any browser

### 14. Real-World Scenarios
- [ ] Add multiple contacts
- [ ] Delete and re-add contact
- [ ] Chat with multiple people
- [ ] Upload various file types
- [ ] Make multiple calls
- [ ] Switch between tabs rapidly
- [ ] Search while typing message
- [ ] Accept/decline multiple requests
- [ ] Change language mid-session
- [ ] Refresh during active call

## Sign-Off

- QA Lead: _______________
- Date: ___________________
- Overall Status: [ ] PASS [ ] FAIL
- Critical Issues: _______________________
- Ready for Production: [ ] YES [ ] NO

## Notes

_________________________________
_________________________________
_________________________________
