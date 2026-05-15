import { Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

const TIMES: string[] = []
for (let h = 6; h <= 22; h++) {
  TIMES.push(`${String(h).padStart(2, '0')}:00`)
  TIMES.push(`${String(h).padStart(2, '0')}:30`)
}

interface Props {
  visible: boolean
  value: string       // "HH:MM" or ""
  onConfirm: (time: string) => void
  onClose: () => void
}

export function TimePickerModal({ visible, value, onConfirm, onClose }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.sheet} activeOpacity={1}>
          <View style={styles.header}>
            <Text style={styles.title}>Wybierz godzinę</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
            {TIMES.map(t => (
              <TouchableOpacity
                key={t}
                style={[styles.chip, value === t && styles.chipActive]}
                onPress={() => { onConfirm(t); onClose() }}
              >
                <Text style={[styles.chipText, value === t && styles.chipTextActive]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '65%', paddingBottom: 16,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 20, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  title: { fontSize: 17, fontWeight: '700', color: '#1a1a1a' },
  grid: {
    flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 8,
  },
  chip: {
    width: '22%', paddingVertical: 12, borderRadius: 10,
    backgroundColor: '#f5f5f5', alignItems: 'center',
    borderWidth: 1, borderColor: '#ebebeb',
  },
  chipActive: { backgroundColor: '#534AB7', borderColor: '#534AB7' },
  chipText: { fontSize: 14, fontWeight: '600', color: '#444' },
  chipTextActive: { color: '#fff' },
})
