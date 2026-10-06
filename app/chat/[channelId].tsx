// app/chat/[channelId].tsx — rozmowa (telefon i wąskie okno). Na webie ≥ 1024 px czat otwiera się obok listy.
import { useLocalSearchParams } from 'expo-router'
import { ChatThread } from '../../components/chat/ChatThread'

export default function ChannelScreen() {
  const { channelId } = useLocalSearchParams<{ channelId: string }>()
  return <ChatThread channelId={channelId} />
}
