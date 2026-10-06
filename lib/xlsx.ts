// Z7: minimalny generator plików .xlsx (Office Open XML) — bez ciężkich bibliotek.
// Arkusze z wierszami tekst/liczba, pogrubiony nagłówek, szerokości kolumn, zamrożony nagłówek.
import { strToU8, zipSync } from 'fflate'

export type Cell = string | number | null | undefined
export type Sheet = {
  name: string
  /** wiersze danych; pierwszy wiersz tabeli oznacz przez headerRow */
  rows: Cell[][]
  /** indeks (od 0) wiersza nagłówka tabeli — pogrubiony, granatowe tło, zamrożony */
  headerRow?: number
  /** indeksy wierszy-tytułów (pogrubione, większe) */
  titleRows?: number[]
  /** szerokości kolumn w znakach */
  widths?: number[]
  /** kolumny w formacie procentowym (wartości 0–1) */
  percentCols?: number[]
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // znaki sterujące są niedozwolone w XML
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')

/** A, B, …, Z, AA, … */
export function colName(i: number): string {
  let s = ''
  let n = i + 1
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

/** Nazwa arkusza: max 31 znaków, bez []:*?/\ */
export function sheetName(name: string): string {
  return (name.replace(/[[\]:*?/\\]/g, ' ').trim() || 'Arkusz').slice(0, 31)
}

// Style (cellXfs): 0 zwykły, 1 nagłówek, 2 tytuł, 3 procent
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="0.0%"/></numFmts>
<fonts count="3">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><b/><sz val="14"/><color rgb="FF0B2E5C"/><name val="Calibri"/></font>
</fonts>
<fills count="3">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF0B2E5C"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`

function sheetXml(sh: Sheet): string {
  const titles = new Set(sh.titleRows ?? [])
  const pct = new Set(sh.percentCols ?? [])
  const rows = sh.rows.map((row, r) => {
    const cells = row.map((v, c) => {
      if (v === null || v === undefined || v === '') return ''
      const ref = `${colName(c)}${r + 1}`
      const style = r === sh.headerRow ? 1 : titles.has(r) ? 2 : typeof v === 'number' && pct.has(c) && r > (sh.headerRow ?? -1) ? 3 : 0
      const s = style ? ` s="${style}"` : ''
      if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${s}><v>${v}</v></c>`
      return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`
    }).join('')
    return `<row r="${r + 1}">${cells}</row>`
  }).join('')
  const cols = sh.widths?.length
    ? `<cols>${sh.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : ''
  const freeze = sh.headerRow !== undefined
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sh.headerRow + 1}" topLeftCell="A${sh.headerRow + 2}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : ''
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${freeze}${cols}<sheetData>${rows}</sheetData></worksheet>`
}

/** Skoroszyt .xlsx jako bajty. */
export function buildXlsx(sheets: Sheet[]): Uint8Array {
  const names = sheets.map(s => sheetName(s.name))
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${names.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
</Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
</workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('\n')}
<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`),
    'xl/styles.xml': strToU8(STYLES),
  }
  sheets.forEach((s, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s)) })
  return zipSync(files, { level: 6 })
}

/** Base64 (do zapisu pliku na telefonie przez expo-file-system). */
export function toBase64(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2]
    out += chars[a >> 2] + chars[((a & 3) << 4) | ((b ?? 0) >> 4)]
      + (b === undefined ? '=' : chars[((b & 15) << 2) | ((c ?? 0) >> 6)])
      + (c === undefined ? '=' : chars[c & 63])
  }
  return out
}
