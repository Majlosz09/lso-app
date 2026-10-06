import { fireEvent, render as rtlRender, screen } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Text } from 'react-native'
import { Button, Chip, ListRow, ScreenHeader, Segmented, Sheet } from '../../components/ui'

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }
const render = (ui: React.ReactElement) =>
  rtlRender(<SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>)

describe('Button', () => {
  it('calls onPress', () => {
    const onPress = jest.fn()
    render(<Button label="Zapisz się" onPress={onPress} />)
    fireEvent.press(screen.getByText('Zapisz się'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('does not fire when disabled', () => {
    const onPress = jest.fn()
    render(<Button label="Zapisz" onPress={onPress} disabled />)
    fireEvent.press(screen.getByText('Zapisz'))
    expect(onPress).not.toHaveBeenCalled()
  })

  it('shows spinner instead of label while loading', () => {
    render(<Button label="Zapisz" loading />)
    expect(screen.queryByText('Zapisz')).toBeNull()
  })
})

describe('Segmented', () => {
  it('switches value', () => {
    const onChange = jest.fn()
    render(
      <Segmented
        value="my"
        onChange={onChange}
        options={[
          { value: 'my', label: 'Moje' },
          { value: 'all', label: 'Wszystkie' },
          { value: 'free', label: 'Wolne' },
        ]}
      />,
    )
    fireEvent.press(screen.getByText('Wolne'))
    expect(onChange).toHaveBeenCalledWith('free')
    expect(screen.getByRole('tab', { selected: true })).toBeTruthy()
  })
})

describe('Chip', () => {
  it('exposes selected state', () => {
    render(<Chip label="Choroba" selected />)
    expect(screen.getByRole('button', { selected: true })).toBeTruthy()
  })
})

describe('ListRow', () => {
  it('renders title/subtitle and is pressable', () => {
    const onPress = jest.fn()
    render(<ListRow title="Powiadomienia" subtitle="3 nowe" icon="bell" onPress={onPress} />)
    fireEvent.press(screen.getByText('Powiadomienia'))
    expect(onPress).toHaveBeenCalled()
    expect(screen.getByText('3 nowe')).toBeTruthy()
  })
})

describe('ScreenHeader', () => {
  it('renders eyebrow, title and back action', () => {
    const onBack = jest.fn()
    render(<ScreenHeader eyebrow="XXVI tydzień zwykły" title="Grafik" onBack={onBack} />)
    expect(screen.getByText('Grafik')).toBeTruthy()
    expect(screen.getByText('XXVI tydzień zwykły')).toBeTruthy()
    fireEvent.press(screen.getByLabelText('Wstecz'))
    expect(onBack).toHaveBeenCalled()
  })
})

describe('Sheet', () => {
  it('renders title and content when visible, closes via button', () => {
    const onClose = jest.fn()
    render(
      <Sheet visible onClose={onClose} title="Nie mogę być">
        <Text>Powód</Text>
      </Sheet>,
    )
    expect(screen.getByText('Nie mogę być')).toBeTruthy()
    expect(screen.getByText('Powód')).toBeTruthy()
    fireEvent.press(screen.getAllByLabelText('Zamknij')[1])
    expect(onClose).toHaveBeenCalled()
  })
})
