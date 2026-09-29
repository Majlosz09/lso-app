import { Redirect } from 'expo-router'

// Etap 2: złoty przycisk „Obecność” prowadzi do grafiku, gdzie jest meldowanie.
// Pełny ekran obecności (QR / GPS / potwierdzenie) powstaje w etapie 4 (ministrant).
export default function AttendanceScreen() {
  return <Redirect href="/(tabs)/schedule" />
}
