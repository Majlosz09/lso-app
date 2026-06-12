# Points Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a download button to the admin Points tab header that generates a points-ranking-only PDF/CSV with a selectable date range.

**Architecture:** Add optional `opts.pointsOnly` parameter to the three export generators in `lib/export.ts`; thread it through `ExportModal` via a new `pointsOnly` prop; mount the ExportModal in `_layout.tsx` alongside a new download icon in a composite `pointsHeaderRight` for the Points tab — the layout owns the state so no coupling between the screen file and the header.

**Tech Stack:** TypeScript, Expo/React Native, expo-print, expo-file-system, expo-sharing, Jest (jest-expo)

---

### Task 1: Extend export tests for `pointsOnly`

**Files:**
- Modify: `__tests__/lib/export.test.ts`

- [ ] **Step 1: Append `pointsOnly` test blocks**

Open `__tests__/lib/export.test.ts` and add the following two describe blocks at the end of the file (after the last closing `}`):

```typescript
describe('generateCSV pointsOnly', () => {
  it('omits attendance section when pointsOnly=true', () => {
    const csv = generateCSV(SAMPLE, { pointsOnly: true })
    expect(csv).not.toContain('Statystyki obecności')
    expect(csv).not.toContain('Liczba służb')
  })

  it('still contains ranking section when pointsOnly=true', () => {
    const csv = generateCSV(SAMPLE, { pointsOnly: true })
    expect(csv).toContain('Ranking punktowy')
    expect(csv).toContain('Jan Kowalski')
    expect(csv).toContain('50')
  })

  it('shows fallback message only once when pointsOnly=true and members empty', () => {
    const csv = generateCSV({ ...SAMPLE, members: [] }, { pointsOnly: true })
    expect(csv.match(/Brak danych/g)?.length).toBe(1)
  })
})

describe('generateHTML pointsOnly', () => {
  it('contains exactly one <table> when pointsOnly=true', () => {
    const count = (generateHTML(SAMPLE, { pointsOnly: true }).match(/<table/g) ?? []).length
    expect(count).toBe(1)
  })

  it('omits attendance heading when pointsOnly=true', () => {
    const html = generateHTML(SAMPLE, { pointsOnly: true })
    expect(html).not.toContain('Statystyki obecności')
  })

  it('still contains ranking heading when pointsOnly=true', () => {
    const html = generateHTML(SAMPLE, { pointsOnly: true })
    expect(html).toContain('Ranking punktowy')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd c:\Users\brival\Desktop\Projekty\lso-app
npx jest __tests__/lib/export.test.ts --no-coverage
```

Expected: existing tests PASS, new tests FAIL (functions don't yet accept `opts`).

- [ ] **Step 3: Commit failing tests**

```bash
git add __tests__/lib/export.test.ts
git commit -m "test: add pointsOnly tests for generateCSV and generateHTML"
```

---

### Task 2: Implement `pointsOnly` in `lib/export.ts`

**Files:**
- Modify: `lib/export.ts`

- [ ] **Step 1: Replace `generateCSV`**

In `lib/export.ts`, replace the entire `generateCSV` function with:

```typescript
export function generateCSV(data: ExportData, opts?: { pointsOnly?: boolean }): string {
  const pointsOnly = opts?.pointsOnly ?? false
  const BOM = '﻿'
  const noData = 'Brak danych w wybranym okresie'
  const generatedDate = new Date(data.generatedAt).toLocaleDateString('pl-PL')
  const lines: string[] = []

  lines.push(`Raport LSO — ${data.parishName}`)
  lines.push(`Okres:,${data.from} — ${data.to}`)
  lines.push(`Wygenerowano:,${generatedDate}`)
  lines.push('')

  lines.push('Ranking punktowy')
  lines.push('')
  lines.push('Lp.,Imię i nazwisko,Punkty')
  if (data.members.length === 0) {
    lines.push(noData)
  } else {
    data.members.forEach((m, i) => lines.push(`${i + 1},"${m.fullName}",${m.points}`))
  }

  if (!pointsOnly) {
    lines.push('')
    lines.push('Statystyki obecności')
    lines.push('')
    lines.push('Lp.,Imię i nazwisko,Liczba służb,Obecny,Frekwencja')
    if (data.members.length === 0) {
      lines.push(noData)
    } else {
      data.members.forEach((m, i) =>
        lines.push(`${i + 1},"${m.fullName}",${m.scheduled},${m.present},${m.attendanceRate.toFixed(1)}%`)
      )
    }
  }

  return BOM + lines.join('\n')
}
```

- [ ] **Step 2: Replace `generateHTML`**

Replace the entire `generateHTML` function with:

```typescript
export function generateHTML(data: ExportData, opts?: { pointsOnly?: boolean }): string {
  const pointsOnly = opts?.pointsOnly ?? false
  const MEDAL = ['🥇', '🥈', '🥉']
  const noData3 = '<tr><td colspan="3" style="text-align:center;padding:16px;color:#888">Brak danych w wybranym okresie</td></tr>'
  const noData4 = '<tr><td colspan="4" style="text-align:center;padding:16px;color:#888">Brak danych w wybranym okresie</td></tr>'

  const rankingRows = data.members.length === 0 ? noData3 : data.members
    .map((m, i) => {
      const medal = i < 3 ? `${MEDAL[i]} ` : ''
      const bold = i < 3 ? ' style="font-weight:700"' : ''
      return `<tr><td style="text-align:center;color:#888">${i + 1}</td><td${bold}>${medal}${m.fullName}</td><td style="text-align:right;font-weight:600">${m.points}</td></tr>`
    }).join('\n')

  const attendanceRows = data.members.length === 0 ? noData4 : data.members
    .map((m, i) => {
      const rateColor = m.attendanceRate >= 80 ? '#16a34a' : m.attendanceRate >= 50 ? '#d97706' : '#dc2626'
      return `<tr><td style="text-align:center;color:#888">${i + 1}</td><td>${m.fullName}</td><td style="text-align:right">${m.scheduled}</td><td style="text-align:right">${m.present}</td><td style="text-align:right;font-weight:600;color:${rateColor}">${m.attendanceRate.toFixed(1)}%</td></tr>`
    }).join('\n')

  const generatedDate = new Date(data.generatedAt).toLocaleDateString('pl-PL')

  const attendanceSection = pointsOnly ? '' : `
<h2>Statystyki obecności</h2>
<table>
  <thead><tr><th style="width:40px;text-align:center">Lp.</th><th>Imię i nazwisko</th><th style="text-align:right">Służby</th><th style="text-align:right">Obecny</th><th style="text-align:right">Frekwencja</th></tr></thead>
  <tbody>${attendanceRows}</tbody>
</table>`

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;color:#1a1a2e;background:#fff}
  .hdr{background:#1A237E;color:#fff;padding:20px 28px}
  .hdr h1{font-size:20px;font-weight:700;margin-bottom:4px}
  .hdr .meta{font-size:12px;opacity:.75}
  .body{padding:24px 28px}
  h2{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;
     color:#1A237E;margin:28px 0 10px;padding-bottom:6px;border-bottom:2px solid #1A237E}
  h2:first-child{margin-top:0}
  table{width:100%;border-collapse:collapse;font-size:12px}
  thead tr{background:#E8EAF6}
  th{padding:8px 10px;text-align:left;font-weight:700;color:#1A237E;border-bottom:2px solid #1A237E}
  td{padding:7px 10px;border-bottom:1px solid #e8e8e8}
  tbody tr:hover{background:#f5f7ff}
  .footer{margin-top:32px;padding-top:12px;border-top:1px solid #e0e0e0;font-size:10px;color:#aaa;text-align:center}
  @media print{
    body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .hdr{background:#1A237E!important;-webkit-print-color-adjust:exact}
  }
</style>
</head><body>
<div class="hdr">
  <h1>${data.parishName}</h1>
  <div class="meta">Raport LSO &nbsp;·&nbsp; ${data.from} — ${data.to} &nbsp;·&nbsp; Wygenerowano: ${generatedDate}</div>
</div>
<div class="body">
<h2>Ranking punktowy</h2>
<table>
  <thead><tr><th style="width:40px;text-align:center">Lp.</th><th>Imię i nazwisko</th><th style="text-align:right">Punkty</th></tr></thead>
  <tbody>${rankingRows}</tbody>
</table>
${attendanceSection}
<div class="footer">Wygenerowano ${generatedDate} &nbsp;·&nbsp; Aplikacja LSO</div>
</div>
</body></html>`
}
```

- [ ] **Step 3: Replace `generateXLS`**

Replace the entire `generateXLS` function with:

```typescript
export function generateXLS(data: ExportData, opts?: { pointsOnly?: boolean }): string {
  const pointsOnly = opts?.pointsOnly ?? false
  const generatedDate = new Date(data.generatedAt).toLocaleDateString('pl-PL')

  const C = 'border:1px solid #C5CAE9;padding:6px 10px;font-family:Calibri,Arial,sans-serif;font-size:10pt'
  const TH = `${C};background:#1A237E;color:#fff;font-weight:700`
  const E = 'border:none;padding:0'
  const SEC = 'background:#E8EAF6;color:#1A237E;font-weight:700;font-size:11pt;padding:8px 12px;font-family:Calibri,Arial,sans-serif;border-bottom:2px solid #1A237E'
  const META = 'color:#666;padding:3px 12px;font-family:Calibri,Arial,sans-serif;font-size:10pt;border:none'

  const rankingRows = data.members.length === 0
    ? `<tr><td colspan="3" style="${C};text-align:center;color:#888">Brak danych w wybranym okresie</td><td colspan="2" style="${E}"></td></tr>`
    : data.members.map((m, i) => {
        const bold = i < 3 ? ';font-weight:700' : ''
        const evenBg = i % 2 === 1 ? ';background:#F5F7FF' : ''
        return `<tr>
          <td style="${C};text-align:center${evenBg}">${i + 1}</td>
          <td style="${C}${bold}${evenBg}">${m.fullName}</td>
          <td style="${C};text-align:right${bold}${evenBg}">${m.points}</td>
          <td colspan="2" style="${E}"></td>
        </tr>`
      }).join('')

  const attendanceSection = pointsOnly ? '' : (() => {
    const attendanceRows = data.members.length === 0
      ? `<tr><td colspan="5" style="${C};text-align:center;color:#888">Brak danych w wybranym okresie</td></tr>`
      : data.members.map((m, i) => {
          const rateColor = m.attendanceRate >= 80 ? '#16a34a' : m.attendanceRate >= 50 ? '#d97706' : '#dc2626'
          const evenBg = i % 2 === 1 ? ';background:#F5F7FF' : ''
          return `<tr>
            <td style="${C};text-align:center${evenBg}">${i + 1}</td>
            <td style="${C}${evenBg}">${m.fullName}</td>
            <td style="${C};text-align:right${evenBg}">${m.scheduled}</td>
            <td style="${C};text-align:right${evenBg}">${m.present}</td>
            <td style="${C};text-align:right;font-weight:600;color:${rateColor}${evenBg}">${m.attendanceRate.toFixed(1)}%</td>
          </tr>`
        }).join('')
    return `<tr><td colspan="5" style="padding:6px;border:none"></td></tr>
<tr><td colspan="5" style="${SEC}">Statystyki obecności</td></tr>
<tr>
  <th style="${TH};text-align:center;width:50px">Lp.</th>
  <th style="${TH}">Imię i nazwisko</th>
  <th style="${TH};text-align:right">Liczba służb</th>
  <th style="${TH};text-align:right">Obecny</th>
  <th style="${TH};text-align:right">Frekwencja</th>
</tr>
${attendanceRows}`
  })()

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<!--[if gte mso 9]><xml>
<x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
<x:Name>Raport LSO</x:Name>
<x:WorksheetOptions><x:Selected/></x:WorksheetOptions>
</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
</head><body>
<table cellspacing="0">
<tr><td colspan="5" style="background:#1A237E;color:#fff;font-weight:700;font-size:14pt;padding:14px 12px;font-family:Calibri,Arial,sans-serif">${data.parishName}</td></tr>
<tr><td colspan="5" style="${META}">Raport LSO &nbsp;&nbsp; ${data.from} — ${data.to}</td></tr>
<tr><td colspan="5" style="${META};padding-bottom:10px">Wygenerowano: ${generatedDate}</td></tr>
<tr><td colspan="5" style="padding:4px;border:none"></td></tr>
<tr><td colspan="3" style="${SEC}">Ranking punktowy</td><td colspan="2" style="border:none"></td></tr>
<tr>
  <th style="${TH};text-align:center;width:50px">Lp.</th>
  <th style="${TH}">Imię i nazwisko</th>
  <th style="${TH};text-align:right">Punkty</th>
  <td colspan="2" style="${E}"></td>
</tr>
${rankingRows}
${attendanceSection}
</table>
</body></html>`
}
```

- [ ] **Step 4: Run all export tests**

```bash
npx jest __tests__/lib/export.test.ts --no-coverage
```

Expected: ALL tests PASS (both existing and new `pointsOnly` tests).

- [ ] **Step 5: Commit**

```bash
git add lib/export.ts
git commit -m "feat: add pointsOnly option to export generators"
```

---

### Task 3: Add `pointsOnly` prop to `ExportModal`

**Files:**
- Modify: `components/ExportModal.tsx`

- [ ] **Step 1: Update `Props` interface and component signature**

In `components/ExportModal.tsx`, replace:
```typescript
interface Props {
  visible: boolean
  onClose: () => void
}
```
with:
```typescript
interface Props {
  visible: boolean
  onClose: () => void
  pointsOnly?: boolean
}
```

Replace:
```typescript
export function ExportModal({ visible, onClose }: Props) {
```
with:
```typescript
export function ExportModal({ visible, onClose, pointsOnly = false }: Props) {
```

- [ ] **Step 2: Update the modal title**

In the JSX, replace:
```typescript
<Text style={styles.title}>Eksportuj raport</Text>
```
with:
```typescript
<Text style={styles.title}>
  {pointsOnly ? 'Eksportuj ranking punktów' : 'Eksportuj raport'}
</Text>
```

- [ ] **Step 3: Pass `pointsOnly` to all three generator calls in `handleExport`**

Find and replace each generator call:

Replace:
```typescript
const xls = generateXLS(data)
```
with:
```typescript
const xls = generateXLS(data, { pointsOnly })
```

Replace:
```typescript
const csv = generateCSV(data)
```
with:
```typescript
const csv = generateCSV(data, { pointsOnly })
```

Replace:
```typescript
const html = generateHTML(data)
```
with:
```typescript
const html = generateHTML(data, { pointsOnly })
```

- [ ] **Step 4: Run full test suite**

```bash
npx jest --no-coverage
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add components/ExportModal.tsx
git commit -m "feat: add pointsOnly prop to ExportModal"
```

---

### Task 4: Wire download button in admin tabs layout

**Files:**
- Modify: `app/(admin)/(admin-tabs)/_layout.tsx`

The tab headers are configured in `_layout.tsx`. The ExportModal state lives here too — no changes needed in `points.tsx`.

- [ ] **Step 1: Add `useState` import and `ExportModal` import**

In `app/(admin)/(admin-tabs)/_layout.tsx`, add to the existing `react` import:
```typescript
import { useState } from 'react'
```

Add after the last existing import line:
```typescript
import { ExportModal } from '../../../components/ExportModal'
```

- [ ] **Step 2: Add `View` to the `react-native` import**

The current import is:
```typescript
import { TouchableOpacity } from 'react-native'
```

Change to:
```typescript
import { TouchableOpacity, View } from 'react-native'
```

- [ ] **Step 3: Add `exportVisible` state inside `AdminTabsLayout`**

After the existing state/variable declarations (`const router`, `const { profile }`, etc.), add:
```typescript
const [exportVisible, setExportVisible] = useState(false)
```

- [ ] **Step 4: Add `pointsHeaderRight` function**

After the existing `backButton` function definition, add:
```typescript
const pointsHeaderRight = () => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 8 }}>
    <TouchableOpacity onPress={() => setExportVisible(true)} hitSlop={8} style={{ marginRight: 4 }}>
      <Ionicons name="download-outline" size={22} color="#fff" />
    </TouchableOpacity>
    <TouchableOpacity
      onPress={() => router.push('/(admin)/(admin-tabs)/profile')}
      hitSlop={8}
    >
      {avatarUrl
        ? <AvatarImage avatarUrl={avatarUrl} size={32} borderColor="rgba(255,255,255,0.6)" borderWidth={2} />
        : <Ionicons name="person-circle-outline" size={30} color="#fff" />
      }
    </TouchableOpacity>
  </View>
)
```

- [ ] **Step 5: Update the points `Tabs.Screen` to use `pointsHeaderRight`**

Find:
```typescript
<Tabs.Screen
  name="points"
  options={{
    title: 'Punkty',
    tabBarIcon: ({ color, size }) => (
      <Ionicons name="trophy-outline" size={size} color={color} />
    ),
    headerRight: avatarButton,
  }}
/>
```

Replace `headerRight: avatarButton` with `headerRight: pointsHeaderRight`:
```typescript
<Tabs.Screen
  name="points"
  options={{
    title: 'Punkty',
    tabBarIcon: ({ color, size }) => (
      <Ionicons name="trophy-outline" size={size} color={color} />
    ),
    headerRight: pointsHeaderRight,
  }}
/>
```

- [ ] **Step 6: Wrap return in Fragment and render `ExportModal`**

The current return statement wraps a `<Tabs>` element. Change to:
```typescript
return (
  <>
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerStyle: { backgroundColor: colors.header },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      {/* all Tabs.Screen children unchanged */}
    </Tabs>
    <ExportModal visible={exportVisible} onClose={() => setExportVisible(false)} pointsOnly />
  </>
)
```

- [ ] **Step 7: Run full test suite**

```bash
npx jest --no-coverage
```

Expected: All tests PASS.

- [ ] **Step 8: Commit**

```bash
git add "app/(admin)/(admin-tabs)/_layout.tsx"
git commit -m "feat: add points export button to admin Points tab header"
```
