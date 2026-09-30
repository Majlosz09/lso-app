export const STATUS_COLORS: Record<string, string> = {
  assigned:  '#8A6A1F',   // ciemne złoto — zapisany
  present:   '#2F7D4F',   // green — attended
  excused:   '#B8741A',   // orange — absence reported
  confirmed: '#0E7490',   // blue — absence approved
  absent:    '#B3261E',   // red — missed without excuse
  swapped:   '#6B7280',   // gray — swapped out
}

export const STATUS_LABELS: Record<string, string> = {
  assigned:  'Zapisany',
  present:   'Obecny',
  excused:   'Nieobecność zgłoszona',
  confirmed: 'Nieobecność usprawiedliwiona',
  absent:    'Nieobecny',
  swapped:   'Zamieniony',
}
