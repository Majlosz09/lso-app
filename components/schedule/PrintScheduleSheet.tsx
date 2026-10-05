import { useState } from 'react'
import { Platform } from 'react-native'
import Toast from 'react-native-toast-message'
import * as Print from 'expo-print'
import QRCodeLib from 'qrcode'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { addDays, localDateStr, shortDate, weekDays } from '../../lib/dates'
import { ensureLiturgicalYear, getLiturgicalDay } from '../../lib/liturgy'
import { buildPrintHtml, PrintService, shortPerson } from '../../lib/printSchedule'
import { publicScheduleUrl } from '../../lib/shareLinks'
import { shareFile } from '../../lib/export'
import { Button, Segmented, Sheet } from '../ui'
import { AppText } from '../ui'

type Range = 'this' | 'next' | 'month' | 'nextMonth'
const INACTIVE = ['absent', 'excused', 'confirmed', 'swapped']
const MONTHS = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień']

function range(r: Range): { from: string; to: string; title: string } {
  if (r === 'this' || r === 'next') {
    const w = weekDays(r === 'this' ? 0 : 1)
    return { from: w[0], to: w[6], title: `Grafik służby ${shortDate(w[0])} – ${shortDate(w[6])}` }
  }
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth() + (r === 'month' ? 0 : 1), 1, 12)
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0, 12)
  return { from: localDateStr(first), to: localDateStr(last), title: `Grafik służby — ${MONTHS[first.getMonth()]} ${first.getFullYear()}` }
}

/** „Drukuj grafik”: A4 do zakrystii (web: okno druku, telefon: PDF do udostępnienia). */
export function PrintScheduleSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const parish = useAuthStore(s => s.parish)
  const [r, setR] = useState<Range>('next')
  const [busy, setBusy] = useState(false)

  const print = async () => {
    if (!parish?.id) return
    setBusy(true)
    // web: okno trzeba otworzyć od razu w reakcji na kliknięcie — po pobraniu danych przeglądarka by je zablokowała
    const win = Platform.OS === 'web' ? window.open('', '_blank') : null
    if (Platform.OS === 'web') {
      if (!win) { setBusy(false); Toast.show({ type: 'error', text1: 'Przeglądarka zablokowała okno', text2: 'Zezwól na wyskakujące okna dla tej strony.' }); return }
      win.document.write('<p style="font-family:Arial;padding:24px;color:#555">Przygotowuję wydruk…</p>')
    }
    try {
      const { from, to, title } = range(r)
      const [sch, ch] = await Promise.all([
        supabase.from('schedules')
          .select('date, time, title, service_mode, church_id, schedule_assignments(status, role, profile:profiles(full_name))')
          .eq('parish_id', parish.id).gte('date', from).lte('date', to).order('date').order('time'),
        supabase.from('churches').select('id, name, short_name, is_main').eq('parish_id', parish.id),
      ])
      if (sch.error) throw new Error(sch.error.message)
      const churches = new Map(((ch.data ?? []) as any[]).map(c => [c.id, c]))
      const services: PrintService[] = ((sch.data ?? []) as any[]).map(s => {
        const c = churches.get(s.church_id)
        return {
          date: s.date, time: String(s.time).slice(0, 5), title: s.title, mode: s.service_mode,
          church: c && !c.is_main ? (c.short_name || c.name) : null,
          people: (s.schedule_assignments ?? []).filter((a: any) => !INACTIVE.includes(a.status))
            .map((a: any) => ({ name: shortPerson(a.profile?.full_name ?? ''), role: a.role && a.role !== 'ministrant' ? a.role : null })),
        }
      })
      await ensureLiturgicalYear(Number(from.slice(0, 4)))
      await ensureLiturgicalYear(Number(to.slice(0, 4)))
      const days = []
      for (let d = from; d <= to; d = addDays(d, 1)) {
        const lit = getLiturgicalDay(d)
        days.push({ date: d, liturgy: lit.name, color: lit.color ?? 'GREEN' })
      }
      const url = parish.public_token ? publicScheduleUrl(parish.public_token) : null
      const qrSvg = url ? await QRCodeLib.toString(url, { type: 'svg', margin: 0 }) : null
      const html = buildPrintHtml({ parish: parish.name, title, days, services, qrSvg, publicUrl: url })

      if (Platform.OS === 'web') {
        const bar = '<div class="no-print" style="position:sticky;top:0;background:#0B2E5C;padding:10px 16px;display:flex;justify-content:space-between;align-items:center;margin:-12mm -12mm 12px"><span style="color:#fff;font-weight:600">Podgląd wydruku</span><button onclick="window.print()" style="background:#fff;color:#0B2E5C;border:none;padding:7px 16px;border-radius:6px;font-weight:700;cursor:pointer">🖨 Drukuj / Zapisz PDF</button></div><style>@media print{.no-print{display:none!important}}</style>'
        win!.document.open()
        win!.document.write(html.replace('<body>', '<body>' + bar))
        win!.document.close()
      } else {
        const { uri } = await Print.printToFileAsync({ html })
        await shareFile(uri)
      }
      onClose()
    } catch (e: any) {
      win?.close()
      Toast.show({ type: 'error', text1: 'Nie udało się przygotować wydruku', text2: e?.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} eyebrow="Wydruk do zakrystii" title="Drukuj grafik"
      footer={<Button label={Platform.OS === 'web' ? 'Otwórz wydruk' : 'Zapisz PDF'} icon="printer" onPress={print} loading={busy} />}>
      <Segmented<Range>
        options={[{ value: 'this', label: 'Ten tydz.' }, { value: 'next', label: 'Następny' }, { value: 'month', label: 'Ten mies.' }, { value: 'nextMonth', label: 'Nast. mies.' }]}
        value={r}
        onChange={setR}
      />
      <AppText variant="small" muted>
        {`${range(r).title}. Ministranci jako imię i inicjał nazwiska.` +
          (parish?.public_token ? ' Z kodem QR do grafiku w telefonie.' : ' Włącz „Grafik dla rodziców” w ustawieniach, żeby dodać kod QR.')}
      </AppText>
    </Sheet>
  )
}
