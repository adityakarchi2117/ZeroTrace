# Frontend Comprehensive Audit Report

**Scope:** `web-client/src/` — All `.tsx` and `.ts` component, hook, and lib files  
**lucide-react version:** 0.303.0  
**Date:** Auto-generated audit

---

## Table of Contents
1. [CRITICAL: SSR / Hydration Crashes](#1-critical-ssr--hydration-crashes)
2. [Imported-but-Unused Icons](#2-imported-but-unused-icons)
3. [Broken Icon / Badge Patterns](#3-broken-icon--badge-patterns)
4. [React Anti-Patterns & Bugs](#4-react-anti-patterns--bugs)
5. [Inconsistency: Inline SVGs vs lucide-react](#5-inconsistency-inline-svgs-vs-lucide-react)
6. [Summary Table](#6-summary-table)

---

## 1. CRITICAL: SSR / Hydration Crashes

These will throw `ReferenceError: window is not defined` (or `document`) during Next.js server-side rendering or static generation.

### Bug 1 — `CallView.tsx` line 123
**File:** `src/components/CallView.tsx`  
**Line:** 123  
**Code:**
```tsx
const [pipPosition, setPipPosition] = useState({ x: window.innerWidth - 200, y: 100 });
```
**Problem:** `window.innerWidth` is evaluated during component initialization (useState initializer runs on server in Next.js).  
**Fix:**
```tsx
const [pipPosition, setPipPosition] = useState({ x: 0, y: 100 });
useEffect(() => {
  setPipPosition({ x: window.innerWidth - 200, y: 100 });
}, []);
```

---

### Bug 2 — `CallView.tsx` line 69
**File:** `src/components/CallView.tsx`  
**Line:** 69  
**Code:**
```tsx
const newX = Math.max(16, Math.min(window.innerWidth - 176, elementStart.current.x + deltaX));
```
**Problem:** `window.innerWidth` used in a callback that could theoretically be invoked during SSR if the event fired early. Lower risk than Bug 1 since it's inside an event handler, but still worth guarding.  
**Fix:** Add `if (typeof window === 'undefined') return;` guard at the top of the handler.

---

### Bug 3 — `EnhancedCallView.tsx` line 182
**File:** `src/components/EnhancedCallView.tsx`  
**Line:** 182  
**Code:**
```tsx
initialPosition={{ x: window.innerWidth - 220, y: 100 }}
```
**Problem:** `window.innerWidth` evaluated in JSX render path. Will crash during SSR.  
**Fix:**
```tsx
const [initialPos, setInitialPos] = useState({ x: 0, y: 100 });
useEffect(() => setInitialPos({ x: window.innerWidth - 220, y: 100 }), []);
// ...
initialPosition={initialPos}
```

---

### Bug 4 — `DraggablePiP.tsx` line 28
**File:** `src/components/DraggablePiP.tsx`  
**Line:** 28  
**Code:**
```tsx
initialPosition = { x: window.innerWidth - 220, y: window.innerHeight - 280 },
```
**Problem:** Default parameter destructuring evaluates `window` at call time. Since calling component may render on server, this crashes SSR.  
**Fix:**
```tsx
initialPosition,
// ... inside component body:
const safeInitial = initialPosition ?? {
  x: typeof window !== 'undefined' ? window.innerWidth - 220 : 0,
  y: typeof window !== 'undefined' ? window.innerHeight - 280 : 0,
};
```

---

### Bug 5 — `DraggablePiP.tsx` lines 45–48
**File:** `src/components/DraggablePiP.tsx`  
**Lines:** 45–48  
**Code:**
```tsx
const bounds = {
  left: 0,
  right: window.innerWidth - size.width,
  top: 0,
  bottom: window.innerHeight - size.height - 100,
};
```
**Problem:** `window.innerWidth` / `window.innerHeight` evaluated in the component body (not in useEffect). Crashes SSR.  
**Fix:** Wrap in a `useMemo` with SSR guard, or move to a `useEffect`:
```tsx
const bounds = useMemo(() => ({
  left: 0,
  right: (typeof window !== 'undefined' ? window.innerWidth : 800) - size.width,
  top: 0,
  bottom: (typeof window !== 'undefined' ? window.innerHeight : 600) - size.height - 100,
}), [size]);
```

---

### Bug 6 — `useWindowFocus.ts` line 26
**File:** `src/hooks/useWindowFocus.ts`  
**Line:** 26  
**Code:**
```tsx
const [state, setState] = useState<WindowFocusState>({
  isFocused: true,
  isVisible: !document.hidden,
  wasBlurred: false,
  blurTime: null,
});
```
**Problem:** `document.hidden` accessed in useState initializer. `document` is undefined during SSR.  
**Fix:**
```tsx
isVisible: typeof document !== 'undefined' ? !document.hidden : true,
```

---

## 2. Imported-but-Unused Icons

| File | Line | Unused Icon(s) | Suggested Fix |
|------|------|----------------|---------------|
| `src/components/ChatView.tsx` | 28 | `Monitor` | Remove from import |
| `src/components/EnhancedCallView.tsx` | 12 | `MoreVertical` | Remove from import |
| `src/components/SmartCallOverlay.tsx` | 11 | `Phone` | Remove from import (only `PhoneOff` is used) |
| `src/components/PrivacyDashboard.tsx` | 9 | `Search` | Remove from import |
| `src/components/ProfileActionsMenu.tsx` | 15, 17, 18 | `Key`, `Bell`, `BellOff` | Remove from import |

**Total: 7 unused icon imports across 5 files.**

> Tree-shaking should eliminate these from production builds, but unused imports clutter the code and confuse reviewers.

---

## 3. Broken Icon / Badge Patterns

### Bug 7 — `ContactProfilePopup.tsx` line 136
**File:** `src/components/ContactProfilePopup.tsx`  
**Line:** 136  
**Code:**
```tsx
<span className="text-green-400 text-sm" title="Verified">?</span>
```
**Problem:** The `?` appears to be a corrupted/missing character where a verification checkmark should be. Compare with `ProfilePreview.tsx` which uses `✓` in the same pattern (verification_badges check). This renders a literal question mark as the "Verified" badge.  
**Fix:** Replace with a proper checkmark or lucide-react icon:
```tsx
<span className="text-green-400 text-sm" title="Verified">✓</span>
// or better:
<CheckCircle className="w-4 h-4 text-green-400" />
```

---

## 4. React Anti-Patterns & Bugs

### Bug 8 — `Settings.tsx` line 146
**File:** `src/components/Settings.tsx`  
**Line:** 146  
**Code:**
```tsx
<option value="medium" selected>Medium</option>
```
**Problem:** In React, the `selected` attribute on `<option>` is incorrect and will produce a console warning. React uses `defaultValue` on the parent `<select>` element, or controlled state via `value`.  
**Fix:**
```tsx
<select
  defaultValue="medium"
  className="w-full px-3 py-2 bg-slate-700 ..."
>
  <option value="small">Small</option>
  <option value="medium">Medium</option>
  <option value="large">Large</option>
</select>
```

---

### Bug 9 — `ProfileCard.tsx` lines 21–28 (Module-level side effect)
**File:** `src/components/ProfileCard.tsx`  
**Lines:** 21–28  
**Code:**
```tsx
const KEYFRAMES_ID = 'pc-keyframes';
if (typeof document !== 'undefined' && !document.getElementById(KEYFRAMES_ID)) {
  const style = document.createElement('style');
  style.id = KEYFRAMES_ID;
  style.textContent = `@keyframes pc-holo-bg { ... }`;
  document.head.appendChild(style);
}
```
**Problem:** While the `typeof document` guard prevents a crash, running DOM side effects at **module level** is a React anti-pattern. It executes once when the module is first imported, which can cause hydration mismatches (server HTML won't have this `<style>` tag but client will). It also runs during module evaluation in test environments.  
**Fix:** Move into a `useEffect` inside the component or into a `useInsertionEffect`:
```tsx
useEffect(() => {
  if (!document.getElementById(KEYFRAMES_ID)) {
    const style = document.createElement('style');
    style.id = KEYFRAMES_ID;
    style.textContent = `...`;
    document.head.appendChild(style);
  }
}, []);
```

---

## 5. Inconsistency: Inline SVGs vs lucide-react

Several components use hand-written inline SVGs instead of the project's standard `lucide-react` icons. This creates visual inconsistency (different sizing, stroke width, styling) and increases bundle bloat.

| File | Description |
|------|-------------|
| `src/components/Settings.tsx` | All icons use inline `<svg>` paths instead of lucide-react |
| `src/components/PendingRequestsPanel.tsx` | Close button, spinner, chevron all use inline SVGs |
| `src/components/TrustVerification.tsx` | Close, checkmark, spinner all use inline SVGs |
| `src/components/TrustedContactsList.tsx` | Close, spinner, chevron all use inline SVGs |

**Recommendation:** Migrate to lucide-react equivalents (`X`, `Loader2`, `ChevronDown`, `Check`, `Settings as SettingsIcon`) for consistency with the rest of the codebase.

---

## 6. Summary Table

| # | Severity | File | Line(s) | Category | Description |
|---|----------|------|---------|----------|-------------|
| 1 | **CRITICAL** | `CallView.tsx` | 123 | SSR Crash | `window.innerWidth` in useState initializer |
| 2 | LOW | `CallView.tsx` | 69 | SSR Risk | `window.innerWidth` in drag handler |
| 3 | **CRITICAL** | `EnhancedCallView.tsx` | 182 | SSR Crash | `window.innerWidth` in JSX render |
| 4 | **CRITICAL** | `DraggablePiP.tsx` | 28 | SSR Crash | `window` in default parameter |
| 5 | **CRITICAL** | `DraggablePiP.tsx` | 45–48 | SSR Crash | `window` in component body |
| 6 | **CRITICAL** | `useWindowFocus.ts` | 26 | SSR Crash | `document.hidden` in useState initializer |
| 7 | MEDIUM | `ContactProfilePopup.tsx` | 136 | Broken Badge | `?` character instead of `✓` checkmark |
| 8 | MEDIUM | `Settings.tsx` | 146 | React Bug | `selected` attr on `<option>` (React warning) |
| 9 | LOW | `ProfileCard.tsx` | 21–28 | Anti-pattern | Module-level DOM side effect |
| 10 | LOW | `ChatView.tsx` | 28 | Unused Import | `Monitor` imported, not used |
| 11 | LOW | `EnhancedCallView.tsx` | 12 | Unused Import | `MoreVertical` imported, not used |
| 12 | LOW | `SmartCallOverlay.tsx` | 11 | Unused Import | `Phone` imported, not used |
| 13 | LOW | `PrivacyDashboard.tsx` | 9 | Unused Import | `Search` imported, not used |
| 14 | LOW | `ProfileActionsMenu.tsx` | 15,17,18 | Unused Import | `Key`, `Bell`, `BellOff` imported, not used |
| 15 | LOW | Multiple files | — | Inconsistency | Inline SVGs instead of lucide-react |

### Stats
- **5 CRITICAL SSR crashes** (will break server rendering)
- **1 broken UI element** (wrong badge character)
- **1 React anti-pattern** (`selected` on option)
- **1 module-level side effect** (hydration risk)
- **7 unused icon imports** across 5 files
- **4 files** using inline SVGs instead of lucide-react

### Files Audited (Clean — No Issues Found)
- `AuthScreen.tsx` — All icons used, proper SSR guards (dynamic imports with `ssr: false`)
- `Sidebar.tsx` — All 17 icons used, event listeners properly cleaned up
- `ChatApp.tsx` — All icons used, `window` only in useEffect
- `NewChatModal.tsx` — All icons used, clean component
- `AddFriendPanel.tsx` — All icons used, clean component
- `BlockedUsersPanel.tsx` — All icons used, clean component
- `NotificationToast.tsx` — All icons used, proper `typeof document` guard for portal
- `SettingsModal.tsx` — All icons used, localStorage in useEffect (safe)
- `ProfilePage.tsx` — All icons used, clean component
- `WallpaperSettings.tsx` — All icons used, clean component
- `QRCodeDisplay.tsx` — All icons used, clean component
- `QRScanner.tsx` — All icons used, proper camera cleanup
- `EditProfileModal.tsx` — No lucide icons (uses text chars), clean
- `ReportDialog.tsx` — No lucide icons (uses emoji), clean
- `ProfileHistoryViewer.tsx` — No lucide icons, clean
- `VisibilitySelector.tsx` — No lucide icons, clean
- `PhotoUploader.tsx` — No lucide icons, Image() usage only in callbacks (safe)
- `ProfilePreview.tsx` — No lucide icons, URL validation done properly
- `UserProfile.tsx` — No lucide icons, clean component
- `VerificationBadgeDisplay.tsx` — No lucide icons, uses helper functions
- `useDraggable.ts` — window usage in event handlers only (safe)
- `usePictureInPicture.ts` — document usage in useEffect/callbacks (safe)
