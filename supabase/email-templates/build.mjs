// Generator szablonów maili Supabase Auth w stylu LSO App.
// Uruchom: node supabase/email-templates/build.mjs  → pliki *.html obok.
// Wklejanie: Supabase → Authentication → Emails → Templates → (szablon) → Subject + Message body.
// Zmienne Supabase: {{ .ConfirmationURL }}, {{ .Email }}, {{ .NewEmail }}.
import fs from 'node:fs'

const ICON = 'https://lsoapp.com/email-icon.png'
const NAVY = '#0D1F6B'
const NAVY_BTN = '#1A237E'
const GOLD = '#C9A55C'
const TEXT = '#374151'
const MUTED = '#6B7280'
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

function layout({ preheader, title, intro, button, after, note }) {
  return `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#F3F4F8;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F3F4F8;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(13,31,107,0.08);">
        <tr>
          <td align="center" style="background:${NAVY};padding:28px 24px 22px;">
            <img src="${ICON}" width="64" height="64" alt="LSO App" style="display:block;width:64px;height:64px;border:0;border-radius:14px;">
            <div style="font-family:${FONT};font-size:22px;font-weight:800;color:#FFFFFF;margin-top:12px;letter-spacing:0.2px;">LSO App</div>
            <div style="font-family:${FONT};font-size:13px;color:${GOLD};margin-top:4px;letter-spacing:0.4px;">Liturgiczna Służba Ołtarza</div>
          </td>
        </tr>
        <tr><td style="height:3px;line-height:3px;font-size:0;background:${GOLD};">&nbsp;</td></tr>
        <tr>
          <td style="padding:32px 32px 8px;font-family:${FONT};">
            <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:${NAVY};">${title}</h1>
            ${intro.map(p => `<p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:${TEXT};">${p}</p>`).join('\n            ')}
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:12px 32px 8px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" bgcolor="${NAVY_BTN}" style="border-radius:12px;border:2px solid ${GOLD};">
                  <a href="{{ .ConfirmationURL }}" target="_blank" style="display:inline-block;padding:14px 32px;font-family:${FONT};font-size:16px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:12px;">${button}</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px 8px;font-family:${FONT};">
            ${after.map(p => `<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:${TEXT};">${p}</p>`).join('\n            ')}
            <p style="margin:12px 0 0;font-size:12px;line-height:1.5;color:${MUTED};">Jeśli przycisk nie działa, skopiuj ten adres do przeglądarki:<br>
              <a href="{{ .ConfirmationURL }}" style="color:${NAVY_BTN};word-break:break-all;">{{ .ConfirmationURL }}</a></p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px 28px;font-family:${FONT};">
            <div style="border-top:1px solid #E5E7EB;padding-top:16px;font-size:12px;line-height:1.6;color:${MUTED};">
              ${note}<br>
              Wiadomość wysłana automatycznie przez <a href="https://lsoapp.com" style="color:${NAVY_BTN};text-decoration:none;">LSO App</a>.
              Pytania: <a href="mailto:lsoapp@parafia-borzapilski.pl" style="color:${NAVY_BTN};text-decoration:none;">lsoapp@parafia-borzapilski.pl</a>
            </div>
          </td>
        </tr>
      </table>
      <div style="font-family:${FONT};font-size:11px;color:#9CA3AF;margin-top:14px;">
        <a href="https://lsoapp.com/privacy" style="color:#9CA3AF;">Polityka prywatności</a> ·
        <a href="https://lsoapp.com/regulamin" style="color:#9CA3AF;">Regulamin</a>
      </div>
    </td>
  </tr>
</table>
</body>
</html>
`
}

const templates = {
  'confirm-signup': {
    subject: 'Potwierdź konto w LSO App',
    preheader: 'Jeszcze jeden krok — potwierdź adres e-mail i dołącz do swojej parafii.',
    title: 'Witaj w LSO App!',
    intro: [
      'Dziękujemy za rejestrację. Potwierdź, że adres <strong>{{ .Email }}</strong> należy do Ciebie — to ostatni krok zakładania konta.',
    ],
    button: 'Potwierdzam konto',
    after: [
      'Po potwierdzeniu zaloguj się w aplikacji. Jeśli dołączasz do parafii kodem, administrator (ksiądz lub opiekun grupy) musi jeszcze zatwierdzić Twoje konto — dostaniesz powiadomienie.',
    ],
    note: 'Jeśli to nie Ty zakładałeś konto, zignoruj tę wiadomość — bez potwierdzenia konto nie zostanie aktywowane.',
  },
  'reset-password': {
    subject: 'Zmiana hasła w LSO App',
    preheader: 'Ustaw nowe hasło do swojego konta w LSO App.',
    title: 'Zmiana hasła',
    intro: [
      'Otrzymaliśmy prośbę o zmianę hasła do konta <strong>{{ .Email }}</strong>. Kliknij przycisk, aby ustawić nowe hasło.',
    ],
    button: 'Ustaw nowe hasło',
    after: [
      'Link jest ważny przez ograniczony czas i działa tylko raz. Nowe hasło musi mieć co najmniej 8 znaków.',
    ],
    note: 'Jeśli nie prosiłeś o zmianę hasła, zignoruj tę wiadomość — Twoje obecne hasło pozostaje bez zmian.',
  },
  'change-email': {
    subject: 'Potwierdź nowy adres e-mail w LSO App',
    preheader: 'Potwierdź zmianę adresu e-mail przypisanego do konta.',
    title: 'Zmiana adresu e-mail',
    intro: [
      'Poproszono o zmianę adresu e-mail konta z <strong>{{ .Email }}</strong> na <strong>{{ .NewEmail }}</strong>.',
    ],
    button: 'Potwierdzam zmianę',
    after: [
      'Po potwierdzeniu będziesz logować się nowym adresem.',
    ],
    note: 'Jeśli to nie Ty prosiłeś o zmianę, nie klikaj przycisku i napisz do nas.',
  },
}

const dir = new URL('.', import.meta.url)
let readme = '# Szablony maili (Supabase Auth)\n\nWklej w: Supabase → projekt → Authentication → Emails → **Templates**.\n' +
  'Szablony generuje `node supabase/email-templates/build.mjs` (wspólny wygląd w `build.mjs`).\n\n' +
  '| Szablon w Supabase | Plik | Temat (Subject) |\n|---|---|---|\n'
const names = { 'confirm-signup': 'Confirm signup', 'reset-password': 'Reset password', 'change-email': 'Change email address' }
for (const [file, t] of Object.entries(templates)) {
  fs.writeFileSync(new URL(`${file}.html`, dir), layout(t))
  readme += `| ${names[file]} | \`${file}.html\` | ${t.subject} |\n`
}
readme += '\nIkona: `https://lsoapp.com/email-icon.png` (192 px, repo lso-landing/public).\n'
fs.writeFileSync(new URL('README.md', dir), readme)
console.log('ok:', Object.keys(templates).join(', '))
