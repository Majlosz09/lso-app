# Welcome Screen Redesign — Design Spec

**Date:** 2026-06-10  
**Project:** LSO App (`lso-app`)  
**File:** `app/(auth)/welcome.tsx`

---

## Goal

Redesign the welcome screen to make a strong first impression — modern, visually engaging, and immediately actionable. Current screen is functional but flat and uninspiring.

---

## Design Decisions

### Visual Style
- **Full-screen gradient hero** covering the top half of the screen
- Gradient: `#0D1764 → #1A237E → #283593` (existing `primaryDark → primary → slightly lighter`)
- Subtle decorative cross symbols (`✝`) in the background at low opacity (~4–5%) as a nod to the church context
- Frosted-glass logo container: white at 12% opacity + `rgba(255,255,255,0.18)` border
- Logo placeholder (`shield-half-outline` Ionicon) remains until a proper logo is designed

### Layout Structure
Two distinct sections:

1. **Hero** (always visible on first load — no scroll needed)
   - Logo, app name, subtitle, tagline
   - Both CTAs visible immediately
   - Scroll hint: `↓ poznaj funkcje ↓` (uppercase, low opacity, letter-spacing)

2. **Features** (revealed by scrolling down)
   - 4 feature cards on light background (`#F8F9FA`)
   - Free badge
   - Scroll hint at bottom of hero

### Buttons — Both Prominent
Both CTAs live inside the hero section and are equally prominent:

| Button | Style | Color | Action |
|--------|-------|-------|--------|
| Zarejestruj się | Solid | `#FFC107` gold + `#0D1764` text | `router.push('/(auth)/register')` |
| Zaloguj się | Solid white | `#FFFFFF` + `#1A237E` text | `router.push('/(auth)/login')` |

**Why one register button:** `register.tsx` already contains a `ChooseScreen` step that lets the user pick their path — ministrant/rodzic (with invite code) or admin (new parish). There is no need for separate buttons on the welcome screen; the selection happens naturally one step later.

### Feature Cards (4 items)
Each card: icon on `#E8EAF6` background, bold title, short description. Ordered by user relevance:

1. **Grafik służb** (`calendar-outline`) — Automatyczny plan na cały rok liturgiczny z powiadomieniami push
2. **Weryfikacja obecności** (`location-outline`) — GPS, kod QR lub potwierdzenie przez opiekuna — w kilka sekund
3. **System punktów i rankingi** (`trophy-outline`) — Rankingi i historia punktów motywujące do regularnej służby
4. **Czat z opiekunem** (`chatbubbles-outline`) — Komunikacja wewnątrz grupy — bez zewnętrznych komunikatorów

**Removed:** Zastępstwa — feature does not exist in the app yet.

### Free Badge
Gold-tinted (`#FFF8E1` background, `#FFC107` border tint) badge at the bottom of the features section:
> ❤️ Bezpłatna aplikacja misyjna — wspierana dobrowolnymi ofiarami

### Removed Elements
- Stats bar (50+ parafii, 500+ ministrantów) — belongs on a marketing website, not in-app
- Invite hint ("Jesteś ministrantem? Poproś opiekuna…") — register.tsx explains this in the right context

---

## Color Palette

All colors sourced from `lib/theme.ts` (no new colors introduced):

| Token | Hex | Usage |
|-------|-----|-------|
| `primaryDark` | `#0D1764` | Gradient start, button text |
| `primary` | `#1A237E` | Gradient mid, login button text |
| `#283593` | — | Gradient end (hardcoded, close to primary) |
| `gold` | `#FFC107` | Register CTA, badge accent |
| `goldSurface` | `#FFF8E1` | Free badge background |
| `primarySurface` | `#E8EAF6` | Feature icon backgrounds |
| `bg` | `#F8F9FA` | Features section background |
| `surface` | `#FFFFFF` | Feature card background |
| `border` | `#E5E7EB` | Feature card borders |

---

## Component Structure

`welcome.tsx` remains a single file component. No new components needed.

```
WelcomeScreen
├── StatusBar (light-content, #0D1764 bg)
└── ScrollView
    ├── Hero (View, gradient via LinearGradient or style)
    │   ├── Decorative circles (position:absolute)
    │   ├── Decorative crosses (position:absolute)  
    │   ├── Logo container (View + Ionicons shield)
    │   ├── App name + subtitle + tagline
    │   ├── btnGold → Zarejestruj się
    │   ├── btnWhite → Zaloguj się
    │   └── Scroll hint text
    └── Features (View, bg #F8F9FA)
        ├── FeatureCard × 4
        └── FreeBadge
```

### LinearGradient note
Current `welcome.tsx` uses a plain `backgroundColor` for the hero. The gradient requires `expo-linear-gradient`. Check if it's already installed (`expo-linear-gradient` is included in Expo SDK 54 by default). If not, install with `npx expo install expo-linear-gradient`.

---

## What Changes vs. Current Implementation

| Area | Before | After |
|------|--------|-------|
| Hero background | Flat `c.primary` | `LinearGradient` indigo |
| Decorative elements | None | Circles + subtle crosses |
| Register button label | "Zarejestruj swoją parafię" | "Zarejestruj się" |
| Login button style | Outline border | Solid white |
| Both CTAs position | In scroll body (below hero) | Inside hero (visible on load) |
| Feature: Zastępstwa | Present | Removed |
| Feature: Czat | Absent | Added |
| Stats bar | Absent | Not added (decision: belongs on website) |
| Invite hint | Present at bottom | Removed |
| Feature icon backgrounds | `c.primary + '12'` | `c.primarySurface` (#E8EAF6) |
| Free badge | Plain row | Gold-tinted card |
