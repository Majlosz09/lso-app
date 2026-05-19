import { useMemo } from 'react'
import { Modal, View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { Calendar } from 'react-native-calendars'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../lib/ThemeContext'
import { Colors } from '../lib/theme'

interface Props {
  visible: boolean
  value: string       // "YYYY-MM-DD" or ""
  onConfirm: (date: string) => void
  onClose: () => void
  minDate?: string
  maxDate?: string
}

export function DatePickerModal({ visible, value, onConfirm, onClose, minDate, maxDate }: Props) {
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.sheet} activeOpacity={1}>
          <View style={styles.header}>
            <Text style={styles.title}>Wybierz datę</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={24} color={c.subtext} />
            </TouchableOpacity>
          </View>
          <Calendar
            onDayPress={(day) => { onConfirm(day.dateString); onClose() }}
            markedDates={value ? { [value]: { selected: true, selectedColor: c.primary } } : {}}
            minDate={minDate}
            maxDate={maxDate}
            theme={{
              todayTextColor: c.primary,
              arrowColor: c.primary,
              selectedDayBackgroundColor: c.primary,
              selectedDayTextColor: '#fff',
              textSectionTitleColor: c.subtext,
              dayTextColor: c.text,
              monthTextColor: c.text,
              textMonthFontWeight: '700',
              calendarBackground: c.surface,
            }}
          />
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    overlay: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
      paddingBottom: 24,
    },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      padding: 20, paddingBottom: 8,
    },
    title: { fontSize: 17, fontWeight: '700', color: c.text },
  })
}
