import { useState, useEffect, useRef } from 'react'
import {
  View, Text, TouchableOpacity,
  ActivityIndicator, StyleSheet, Platform, TextInput,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Location from 'expo-location'
import { useTheme } from '../lib/ThemeContext'

const GMAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY ?? ''

interface Props {
  lat: string
  lng: string
  gpsRadius: string
  onLatChange: (v: string) => void
  onLngChange: (v: string) => void
  onGpsRadiusChange: (v: string) => void
}

// ── Web-only Google Maps component ──────────────────────────────────────────

function WebGoogleMap({ lat, lng, onPick }: {
  lat: string
  lng: string
  onPick: (lat: string, lng: string, name: string) => void
}) {
  const mapDivRef = useRef<any>(null)
  const [mapLoading, setMapLoading] = useState(true)
  // keep stable refs so Google Maps listeners don't close over stale state
  const onPickRef = useRef(onPick)
  useEffect(() => { onPickRef.current = onPick }, [onPick])

  useEffect(() => {
    function bootstrap() {
      if ((window as any).google?.maps?.places) { init(); return }
      if (document.querySelector('script[data-gmaps]')) {
        const t = setInterval(() => {
          if ((window as any).google?.maps?.places) { clearInterval(t); init() }
        }, 100)
        return
      }
      const s = document.createElement('script')
      s.setAttribute('data-gmaps', '1')
      s.src = `https://maps.googleapis.com/maps/api/js?key=${GMAPS_KEY}&libraries=places&language=pl`
      s.async = true
      s.onload = init
      document.head.appendChild(s)
    }

    function init() {
      const google = (window as any).google
      const el = mapDivRef.current
      if (!el || !google?.maps) return

      const hasCoords = lat.trim() !== '' && lng.trim() !== ''
      const center = hasCoords
        ? { lat: parseFloat(lat), lng: parseFloat(lng) }
        : { lat: 52.06, lng: 19.25 }

      const map = new google.maps.Map(el, {
        center,
        zoom: hasCoords ? 16 : 6,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      })

      // Search box injected into top-left map control
      const input = document.createElement('input')
      input.placeholder = 'Szukaj kościoła lub adresu…'
      input.style.cssText = [
        'margin:10px', 'padding:10px 14px',
        'border-radius:8px', 'border:1px solid #ddd',
        'font-size:14px', 'width:280px',
        'box-shadow:0 2px 6px rgba(0,0,0,.18)',
        'outline:none', 'font-family:inherit',
      ].join(';')
      map.controls[google.maps.ControlPosition.TOP_LEFT].push(input)

      // Marker (if coords already set)
      let marker: any = hasCoords
        ? new google.maps.Marker({ position: center, map, title: 'Kościół' })
        : null

      function placeAt(latLng: any) {
        if (marker) marker.setPosition(latLng)
        else { marker = new google.maps.Marker({ position: latLng, map, title: 'Kościół' }) }
      }

      // Click on map → place marker + reverse geocode
      map.addListener('click', (e: any) => {
        const ll = e.latLng
        placeAt(ll)
        new google.maps.Geocoder().geocode(
          { location: ll, language: 'pl' },
          (results: any, status: string) => {
            const name = status === 'OK' && results?.[0]
              ? (results[0].address_components?.[0]?.long_name ?? results[0].formatted_address.split(',')[0])
              : 'Wybrana lokalizacja'
            onPickRef.current(ll.lat().toFixed(6), ll.lng().toFixed(6), name)
          }
        )
      })

      // Places Autocomplete on injected input
      const ac = new google.maps.places.Autocomplete(input, {
        fields: ['geometry', 'name', 'formatted_address'],
      })
      ac.addListener('place_changed', () => {
        const place = ac.getPlace()
        if (!place?.geometry?.location) return
        const loc = place.geometry.location
        map.setCenter(loc)
        map.setZoom(17)
        placeAt(loc)
        const name = place.name ?? place.formatted_address?.split(',')[0] ?? 'Wybrana lokalizacja'
        onPickRef.current(loc.lat().toFixed(6), loc.lng().toFixed(6), name)
      })

      setMapLoading(false)
    }

    bootstrap()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View>
      {mapLoading && (
        <View style={styles.mapPlaceholder}>
          <ActivityIndicator size="large" color="#EA580C" />
          <Text style={styles.mapLoadingText}>Ładowanie mapy…</Text>
        </View>
      )}
      <View
        ref={mapDivRef}
        style={[styles.mapContainer, mapLoading && { height: 0, overflow: 'hidden' }]}
      />
      {!mapLoading && (
        <Text style={styles.mapHint}>Kliknij na mapie lub użyj wyszukiwarki w lewym górnym rogu</Text>
      )}
    </View>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function GpsLocationPicker({
  lat, lng, gpsRadius,
  onLatChange, onLngChange, onGpsRadiusChange,
}: Props) {
  const { colors: c } = useTheme()

  const hasCoords = lat.trim() !== '' && lng.trim() !== ''
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)
  const [locError, setLocError] = useState<string | null>(null)

  // Native fallback: search state
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<{ display_name: string; lat: string; lon: string }[]>([])
  const [searchError, setSearchError] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(!hasCoords)

  const handleUseLocation = async () => {
    setLocating(true)
    setLocError(null)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') { setLocError('Brak dostępu do lokalizacji.'); return }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
      onLatChange(loc.coords.latitude.toFixed(6))
      onLngChange(loc.coords.longitude.toFixed(6))
      setDisplayName('Twoja bieżąca lokalizacja')
      setPickerOpen(false)
    } catch {
      setLocError('Nie udało się pobrać lokalizacji.')
    } finally {
      setLocating(false)
    }
  }

  const handleClear = () => {
    onLatChange(''); onLngChange('')
    setDisplayName(null); setLocError(null)
    setPickerOpen(true); setResults([]); setQuery('')
  }

  // Native search (Nominatim fallback)
  const handleNativeSearch = async () => {
    if (!query.trim()) return
    setSearching(true); setSearchError(null); setResults([])
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query.trim())}&format=json&limit=5&accept-language=pl`
      const data = await (await fetch(url, { headers: { 'User-Agent': 'lso-app/1.0' } })).json()
      if (!data.length) setSearchError('Brak wyników. Spróbuj innego adresu.')
      else setResults(data)
    } catch { setSearchError('Błąd połączenia.') }
    finally { setSearching(false) }
  }

  const isWeb = Platform.OS === 'web'

  return (
    <View style={styles.container}>

      {/* ── WEB: interactive Google Map ── */}
      {isWeb && (
        <>
          <WebGoogleMap
            lat={lat} lng={lng}
            onPick={(latVal, lngVal, name) => {
              onLatChange(latVal); onLngChange(lngVal); setDisplayName(name)
            }}
          />

          {/* Location picked indicator */}
          {hasCoords && (
            <View style={[styles.selectedRow, { borderColor: '#10B98133', backgroundColor: '#10B98108' }]}>
              <Ionicons name="checkmark-circle" size={16} color="#10B981" />
              <Text style={[styles.selectedName, { color: c.text, flex: 1 }]} numberOfLines={1}>
                {displayName ?? 'Lokalizacja ustawiona'}
              </Text>
              <TouchableOpacity onPress={handleClear}>
                <Ionicons name="close-circle-outline" size={18} color={c.subtext} />
              </TouchableOpacity>
            </View>
          )}

          {/* Use my location button */}
          <TouchableOpacity style={styles.locationBtn} onPress={handleUseLocation} disabled={locating}>
            {locating
              ? <ActivityIndicator color="#EA580C" size="small" />
              : <Ionicons name="navigate-outline" size={16} color="#EA580C" />
            }
            <Text style={styles.locationBtnText}>Użyj mojej lokalizacji</Text>
          </TouchableOpacity>
        </>
      )}

      {/* ── NATIVE: search + GPS fallback ── */}
      {!isWeb && (
        <>
          {!pickerOpen && hasCoords ? (
            <View style={[styles.selectedRow, { borderColor: '#10B98133', backgroundColor: '#10B98108' }]}>
              <Ionicons name="checkmark-circle" size={16} color="#10B981" />
              <Text style={[styles.selectedName, { color: c.text, flex: 1 }]} numberOfLines={1}>
                {displayName ?? 'Lokalizacja ustawiona'}
              </Text>
              <TouchableOpacity onPress={() => setPickerOpen(true)} style={[styles.changeBtn, { borderColor: '#EA580C40' }]}>
                <Text style={styles.changeBtnText}>Zmień</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.searchRow}>
                <TextInput
                  style={[styles.searchInput, { backgroundColor: c.bg, borderColor: c.border, color: c.text }]}
                  placeholder="Szukaj kościoła lub adresu…"
                  placeholderTextColor={c.textTertiary}
                  value={query}
                  onChangeText={t => { setQuery(t); setSearchError(null) }}
                  onSubmitEditing={handleNativeSearch}
                  returnKeyType="search"
                />
                <TouchableOpacity style={[styles.searchBtn, { backgroundColor: c.primary }]} onPress={handleNativeSearch} disabled={searching}>
                  {searching ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="search-outline" size={18} color="#fff" />}
                </TouchableOpacity>
              </View>

              {results.length > 0 && (
                <View style={[styles.resultsList, { backgroundColor: c.surface, borderColor: c.border }]}>
                  {results.map((r, i) => (
                    <TouchableOpacity
                      key={i}
                      style={[styles.resultRow, i < results.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.border }]}
                      onPress={() => {
                        onLatChange(parseFloat(r.lat).toFixed(6))
                        onLngChange(parseFloat(r.lon).toFixed(6))
                        setDisplayName(r.display_name.split(',').slice(0, 2).join(',').trim())
                        setResults([]); setQuery(''); setPickerOpen(false)
                      }}
                    >
                      <Ionicons name="location-outline" size={14} color={c.textTertiary} style={{ marginTop: 2 }} />
                      <Text style={[styles.resultText, { color: c.text }]} numberOfLines={2}>{r.display_name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {searchError && <Text style={[styles.error, { color: c.danger }]}>{searchError}</Text>}

              {hasCoords && (
                <TouchableOpacity onPress={() => { setPickerOpen(false); setResults([]); setQuery('') }}>
                  <Text style={[styles.cancelText, { color: c.subtext }]}>Anuluj</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          <TouchableOpacity style={styles.locationBtn} onPress={handleUseLocation} disabled={locating}>
            {locating ? <ActivityIndicator color="#EA580C" size="small" /> : <Ionicons name="navigate-outline" size={16} color="#EA580C" />}
            <Text style={styles.locationBtnText}>Użyj mojej lokalizacji</Text>
          </TouchableOpacity>
        </>
      )}

      {locError && <Text style={[styles.error, { color: c.danger }]}>{locError}</Text>}

      {/* Radius — always visible */}
      <View style={styles.radiusRow}>
        <Text style={[styles.radiusLabel, { color: c.gold }]}>Promień (metry)</Text>
        <TextInput
          style={[styles.radiusInput, { backgroundColor: c.bg, borderColor: c.border, color: c.text }]}
          value={gpsRadius}
          onChangeText={onGpsRadiusChange}
          placeholder="200"
          placeholderTextColor={c.textTertiary}
          keyboardType="numeric"
        />
      </View>
      <Text style={[styles.hint, { color: c.subtext }]}>Ministrant musi być w tej odległości od kościoła.</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: 8 },

  mapPlaceholder: {
    height: 320, borderRadius: 10, backgroundColor: '#f5f5f5',
    justifyContent: 'center', alignItems: 'center', gap: 8,
  },
  mapLoadingText: { fontSize: 13, color: '#888' },
  mapContainer: { height: 320, borderRadius: 10, overflow: 'hidden' },
  mapHint: { fontSize: 11, color: '#888', marginTop: 4 },

  selectedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8,
  },
  selectedName: { fontSize: 13, fontWeight: '600' },
  changeBtn: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  changeBtnText: { fontSize: 12, fontWeight: '600', color: '#EA580C' },

  locationBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: '#EA580C40', backgroundColor: '#EA580C08',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
  },
  locationBtnText: { fontSize: 13, fontWeight: '600', color: '#EA580C' },

  searchRow: { flexDirection: 'row', gap: 8 },
  searchInput: { flex: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, borderWidth: 1 },
  searchBtn: { width: 42, height: 42, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },

  resultsList: { borderWidth: 1, borderRadius: 8, overflow: 'hidden' },
  resultRow: { flexDirection: 'row', gap: 8, padding: 10, alignItems: 'flex-start' },
  resultText: { flex: 1, fontSize: 13, lineHeight: 18 },

  error: { fontSize: 12, color: '#DC2626' },
  cancelText: { fontSize: 13, textAlign: 'center', paddingVertical: 4 },

  radiusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  radiusLabel: { fontSize: 13, fontWeight: '600', color: '#a05000' },
  radiusInput: { flex: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, borderWidth: 1 },
  hint: { fontSize: 12, color: '#a05000' },
})
