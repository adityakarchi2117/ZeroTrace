# ZeroTrace Codebase Audit Report

**Date:** February 2026  
**Scope:** Web Client (Frontend) & Backend API  
**Auditor:** AI Assistant

---

## Executive Summary

This audit identifies **missing connections**, **orphaned components**, and **visible but non-functional features** in the ZeroTrace web application. While the core messaging functionality is connected, several features exist in the codebase but are not integrated into the main application flow.

---

## 🔴 CRITICAL: Visible but Non-Functional Features

These features have UI elements visible to users but don't actually work:

### 1. Screen Sharing in Video Calls
**Location:** `CallView.tsx` (line 367-375)

**Issue:** The screen share button is visible during video calls but the functionality is NOT implemented in the WebRTC service.

```tsx
// CallView.tsx shows this button:
<motion.button 
  onClick={onToggleScreenShare} 
  className={`p-4 rounded-full ${isScreenSharing ? 'bg-blue-500' : 'bg-gray-700'}`}
>
  <Monitor className="w-6 h-6 text-white" />
</motion.button>
```

**Missing Implementation:**
- `webrtc.ts` has no `getDisplayMedia()` or screen sharing logic
- `useWebRTC.ts` hook doesn't expose screen sharing methods
- The `onToggleScreenShare` handler in ChatView is a no-op

**Recommendation:** Either:
1. Implement screen sharing in WebRTC service, OR
2. Remove the button until feature is ready

---

### 2. Settings Modal - Export Key Backup Button
**Location:** `SettingsModal.tsx` (line 71-74, 186-192)

**Issue:** The "Export Key Backup" button is visible but only logs to console.

```tsx
const exportKeys = () => {
  // TODO: Implement key export functionality
  console.log('Exporting keys...');
};
```

**Impact:** Users may think their keys are being exported when nothing happens.

---

### 3. Settings Modal - Notification Toggles
**Location:** `SettingsModal.tsx` (lines 218-238)

**Issue:** Notification checkboxes use `defaultChecked` instead of `checked`, so:
- State changes are not persisted
- Backend API is never called
- Settings reset on modal reopen

```tsx
// WRONG - doesn't save state:
<input
  type="checkbox"
  defaultChecked  // ← Should be 'checked' with onChange
  className="..."
/>
```

---

## 🟠 ORPHANED COMPONENTS (Exist but Not Used)

These components are fully implemented but never imported or rendered:

### 1. TrustedContactsList.tsx
**Purpose:** Display list of trusted contacts with verification status  
**Location:** `src/components/TrustedContactsList.tsx`  
**Status:** ❌ NOT IMPORTED ANYWHERE  
**Size:** ~200 lines

**Missing Integration:** Should be accessible from:
- Settings → Security tab
- Or as a standalone contacts management page

---

### 2. TrustVerification.tsx
**Purpose:** Manual fingerprint verification UI for contacts  
**Location:** `src/components/TrustVerification.tsx`  
**Status:** ❌ NOT IMPORTED ANYWHERE  
**Size:** ~150 lines

**Missing Integration:** Should be:
- Linked from contact profile actions
- Used when accepting friend requests (instead of inline modal)

---

### 3. UserProfile.tsx
**Purpose:** User profile display and editing  
**Location:** `src/components/UserProfile.tsx`  
**Status:** ❌ NOT IMPORTED ANYWHERE  
**Size:** ~170 lines

**Missing Integration:** Should be:
- Accessible from Settings → Profile
- Or from clicking own avatar

---

### 4. EnhancedCallView.tsx
**Purpose:** Advanced call UI with better layout  
**Location:** `src/components/EnhancedCallView.tsx`  
**Status:** ❌ NOT IMPORTED ANYWHERE  
**Note:** Uses DraggablePiP component

**Missing Integration:** Should replace or be an alternative to `CallView.tsx`

---

### 5. NotificationToast.tsx + useNotificationToasts hook
**Purpose:** Toast notification system  
**Location:** `src/components/NotificationToast.tsx`  
**Status:** ❌ NOT IMPORTED ANYWHERE  
**Size:** ~300 lines

**Missing Integration:** Should be:
- Added to root layout (ChatApp.tsx)
- Used for friend request notifications, errors, etc.

---

### 6. ProfileActionsMenu.tsx
**Purpose:** Dropdown menu for contact actions (verify, unfriend, block, show QR)  
**Location:** `src/components/ProfileActionsMenu.tsx`  
**Status:** ❌ NOT IMPORTED ANYWHERE  
**Size:** ~324 lines

**Missing Integration:** Should be:
- Used in ChatView header (replacing inline menu)
- Connected to QR code display and trust verification

---

### 7. DraggablePiP.tsx
**Purpose:** Draggable Picture-in-Picture component for calls  
**Location:** `src/components/DraggablePiP.tsx`  
**Status:** ❌ Only used in UNUSED EnhancedCallView  

**Note:** CallView.tsx has its own inline PiP implementation instead.

---

### 8. Settings.tsx (Duplicate)
**Purpose:** Standalone settings page  
**Location:** `src/components/Settings.tsx`  
**Status:** ❌ NOT IMPORTED ANYWHERE  
**Note:** ChatApp uses `SettingsModal.tsx` instead

**Recommendation:** Delete this duplicate or integrate it.

---

## 🟡 PARTIALLY IMPLEMENTED FEATURES

### 1. Notifications System
**Backend:** ✅ Full API exists (`/api/friend/notifications/*`)  
**Frontend API:** ✅ `friendApi.ts` has all methods  
**Frontend UI:** ❌ No notification center/panel

**Missing:**
- Notification bell icon in header
- Notification dropdown/panel
- Badge count on bell icon
- Real-time notification via WebSocket

---

### 2. Contact Nicknames
**Backend:** ✅ API exists (`PUT /api/friend/contact/{id}/nickname`)  
**Frontend API:** ✅ Method exists in `friendApi.ts`  
**Frontend UI:** ❌ No UI to set nicknames

**Missing:**
- Edit nickname option in contact menu
- Display nicknames in conversation list

---

### 3. Key Change Notifications
**Backend:** ✅ API exists (`POST /api/friend/key-changed/{id}`)  
**Frontend API:** ✅ Method exists  
**Frontend UI:** ❌ No handling for key change events

**Missing:**
- WebSocket event handler for key changes
- Warning UI when contact's key changes
- Re-verification flow

---

### 4. Message Reactions
**Backend:** ❌ No API found  
**Frontend:** ❌ Not implemented  
**Status:** Not started

---

## 🟢 PROPERLY CONNECTED FEATURES

These features are fully implemented and working:

✅ **Authentication** (Login/Register/Logout)  
✅ **End-to-End Encryption** (X25519 + Ed25519)  
✅ **Messaging** (Text, Images, Files)  
✅ **Friend Requests** (Send/Accept/Reject/Cancel)  
✅ **Video/Voice Calls** (WebRTC - basic functionality)  
✅ **Contact Management** (Add/Remove/Block/Unblock)  
✅ **Appearance Settings** (Theme, Colors, Font, Wallpaper)  
✅ **QR Code Sharing** (Show/Scan QR - newly implemented)  
✅ **Typing Indicators**  
✅ **Online Status**  
✅ **Pending Requests Panel**  
✅ **Blocked Users Panel**  
✅ **Message Status** (Sent/Delivered/Read)  
✅ **Message Deletion** (For me/For everyone)  
✅ **Sidebar Collapse/Expand**  

---

## 📋 RECOMMENDED PRIORITY FIXES

### High Priority (User-Facing Issues)

1. **Fix or Remove Screen Share Button**
   - Either implement screen sharing
   - Or remove the button to avoid confusion

2. **Fix Export Keys Button**
   - Implement actual key export
   - Or remove until ready

3. **Connect Notification System**
   - Add notification bell to header
   - Show notification dropdown
   - Display unread counts

4. **Fix Settings Notification Toggles**
   - Change `defaultChecked` to `checked`
   - Connect to backend API

### Medium Priority (Missing Features)

5. **Integrate ProfileActionsMenu**
   - Use in ChatView header
   - Connect QR display
   - Connect trust verification

6. **Add Notification Toast System**
   - Add to root layout
   - Use for all success/error messages

7. **Add Contact Nicknames UI**
   - Allow setting nicknames
   - Display in conversation list

### Low Priority (Nice to Have)

8. **Integrate TrustedContactsList**
   - Add to Settings → Security
   - Or standalone contacts page

9. **Decide on EnhancedCallView**
   - Either use it (replace CallView)
   - Or delete it

10. **Delete Duplicate Settings.tsx**
    - Remove unused file

---

## 📊 STATISTICS

| Category | Count |
|----------|-------|
| Total Components | 24 |
| Orphaned Components | 8 |
| Visible but Non-Functional | 3 |
| Backend API Not Used | 3 |
| Properly Connected | ~15 |

---

## FILES TO REVIEW

### Orphaned (Can be deleted or integrated):
- `src/components/TrustedContactsList.tsx`
- `src/components/TrustVerification.tsx`
- `src/components/UserProfile.tsx`
- `src/components/EnhancedCallView.tsx`
- `src/components/NotificationToast.tsx`
- `src/components/ProfileActionsMenu.tsx`
- `src/components/Settings.tsx` (duplicate)

### Need Fixes:
- `src/components/CallView.tsx` - Remove screen share button
- `src/components/ChatView.tsx` - Fix settings modal issues
- `src/components/SettingsModal.tsx` - Fix notification toggles
- `src/lib/useWebRTC.ts` - Add screen sharing or remove from UI
- `src/lib/webrtc.ts` - Add screen sharing implementation

### Need Integration:
- `src/components/ChatApp.tsx` - Add NotificationToast provider
- `src/components/Sidebar.tsx` - Add notification bell
