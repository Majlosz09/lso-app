import { ProfileView } from '../../(tabs)/profile'

// Profil rodzica — wspólny widok profilu w trybie „rodzic” (dzieci zamiast formacji i odznak)
export default function ParentProfileScreen() {
  return <ProfileView mode="parent" />
}
