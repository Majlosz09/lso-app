import { Stack } from 'expo-router'
import { useNavHeaderOptions } from '../../components/layout/navOptions'

export default function WiedzaLayout() {
  const headerOptions = useNavHeaderOptions()
  return <Stack screenOptions={headerOptions} />
}
