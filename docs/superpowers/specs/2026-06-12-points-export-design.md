# Points Export — Design Spec

**Date:** 2026-06-12  
**Status:** Approved

## Problem

The admin can already export a full report (ranking + attendance) from the Statistics screen. However, the admin Points tab (`(admin-tabs)/points.tsx`) has no export button. Admins who want a quick points-only table must navigate away from the tab they're already on.

## Goal

Add a download icon to the header of the admin Points tab that generates a points-ranking-only file (PDF or CSV/Excel) for an admin-selected date range.

## Scope

Three files change; no new components, no new screens.

---

## Design

### 1. `lib/export.ts` — `pointsOnly` flag

Add an optional `pointsOnly?: boolean` parameter to `generateCSV`, `generateHTML`, and `generateXLS`.

- **`generateCSV`**: when `pointsOnly=true`, emit only the "Ranking punktowy" section (columns: Lp., Imię i nazwisko, Punkty). Omit the "Statystyki obecności" section entirely.
- **`generateHTML`**: when `pointsOnly=true`, render only the ranking table. Remove the attendance table and its heading.
- **`generateXLS`**: same as HTML — only ranking rows, no attendance rows.
- **`buildExportData`**: unchanged. It still fetches attendance data (needed for the full report path). The `pointsOnly` flag only controls rendering, not data fetching.

### 2. `components/ExportModal.tsx` — `pointsOnly` prop

Add `pointsOnly?: boolean` to the `Props` interface.

- When `pointsOnly={true}`, the modal title changes to **"Eksportuj ranking punktów"**.
- The flag is forwarded to `generateCSV` / `generateHTML` / `generateXLS` at call time.
- Everything else is unchanged: format chips (PDF / CSV·Excel), period presets (7 / 30 / 90 / 365 / Własny), date picker, validation, share logic.

### 3. `app/(admin)/(admin-tabs)/points.tsx` — header button

- Add `exportVisible` boolean state (default `false`).
- Add a `<Stack.Screen>` (or `<Tabs.Screen>` if the tab navigator owns the header — verify in `_layout.tsx`) with `headerRight`: a `TouchableOpacity` containing `<Ionicons name="download-outline" size={22} color="#fff" />`, identical to the Statistics screen button.
- Render `<ExportModal visible={exportVisible} onClose={() => setExportVisible(false)} pointsOnly />` at the bottom of the returned JSX.
- Import `ExportModal` from `../../../components/ExportModal`.

> **Note for implementation:** Check `app/(admin)/(admin-tabs)/_layout.tsx` to confirm whether header options are set per-screen via `Stack.Screen` (if the tab is nested inside a Stack) or via `Tabs.Screen` options in the layout file. Use whichever pattern the existing tabs follow.

---

## Data flow

```
User taps download icon
  → setExportVisible(true)
  → ExportModal renders with pointsOnly=true
  → User picks format + date range → taps "Eksportuj"
  → buildExportData(supabase, parishId, parishName, from, to)
  → generateCSV/HTML/XLS(data, { pointsOnly: true })
  → shareFile(uri) / Print.printToFileAsync
  → Modal closes
```

---

## Out of scope

- No changes to the full-report export in Statistics.
- No new DB queries or views.
- No changes to member-facing points screens.
