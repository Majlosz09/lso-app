export const STATUS_COLORS: Record<string, string> = {
  assigned:  '#FFC107',   // amber — waiting/scheduled
  present:   '#16A34A',   // green — attended
  excused:   '#EA580C',   // orange — absence reported
  confirmed: '#2563EB',   // blue — absence approved
  absent:    '#DC2626',   // red — missed without excuse
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
