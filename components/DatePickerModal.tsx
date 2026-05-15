import { Modal, View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { Calendar } from 'react-native-calendars'
import { Ionicons } from '@expo/vector-icons'

interface Props {
  visible: boolean
  value: string       // "YYYY-MM-DD" or ""
  onConfirm: (date: string) => void
  onClose: () => void
  minDate?: string
  maxDate?: string
}

export function DatePickerModal({ visible, value, onConfirm, onClose, minDate, maxDate }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.sheet} activeOpacity={1}>
          <View style={styles.header}>
            <Text style={styles.title}>Wybierz datę</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>
          <Calendar
            onDayPress={(day) => { onConfirm(day.dateString); onClose() }}
            markedDates={value ? { [value]: { selected: true, selectedColor: '#534AB7' } } : {}}
            minDate={minDate}
            maxDate={maxDate}
            theme={{
              todayTextColor: '#534AB7',
              arrowColor: '#534AB7',
              selectedDayBackgroundColor: '#534AB7',
              selectedDayTextColor: '#fff',
              textSectionTitleColor: '#888',
              dayTextColor: '#1a1a1a',
              monthTextColor: '#1a1a1a',
              textMonthFontWeight: '700',
            }}
          />
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
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 20, paddingBottom: 8,
  },
  title: { fontSize: 17, fontWeight: '700', color: '#1a1a1a' },
})
