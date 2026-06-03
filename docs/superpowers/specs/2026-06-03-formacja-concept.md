# Moduł Formacji — Koncepcja (odłożona)

**Status:** Koncepcja — czeka na materiały formacyjne  
**Data:** 2026-06-03  
**Do wdrożenia:** kiedy będą dostępne gotowe konspekty/materiały

---

## Wizja

Ustrukturyzowany program formacyjny powiązany z rangami ministranta. Trzy obszary treści:
1. Formacja posługi (jak służyć przy ołtarzu)
2. Formacja duchowa (relacja z Bogiem, Kościołem)
3. Poszerzanie wiedzy i duchowości

---

## Role i widoki

### Admin / Animator
- Biblioteka konspektów (systemowe od twórcy aplikacji + własne parafii)
- Prowadzi sesję formacyjną, odhacza temat jako zrealizowany
- Opcjonalnie linkuje sesję do zbiórki z grafiku (bez obowiązku)
- Dodaje własne materiały/konspekty dla swojej parafii

### Ministrant
- Widzi podsumowanie z poprzedniej zbiórki (o czym było + krótkie notatki)
- Ma zadania/zadania na najbliższy tydzień do odhaczenia
- Widzi swój postęp na ścieżce formacyjnej (powiązanej z rangą)

### Rodzic
- Widzi postęp formacyjny dziecka
- Widzi niezrealizowane zadania (z możliwością przypomnienia dziecku)

---

## Architektura danych (szkic)

```
formation_paths         — ścieżki per ranga (kandydat, ministrant, lektor, ceremoniarz)
formation_topics        — tematy/konspekty (source: system | parish, powiązane ze ścieżką)
formation_sessions      — zrealizowane sesje (admin odhacza, opcjonalne schedule_id)
formation_tasks         — zadania dla ministranta przypisane po sesji
formation_task_completions — odhaczenia zadań przez ministranta
```

---

## Treść — problem do rozwiązania przed wdrożeniem

Aplikacja potrzebuje gotowych materiałów formacyjnych (konspekty, tematy, ćwiczenia).  
Źródła do rozważenia:
- Istniejące podręczniki formacyjne dla ministrantów (np. materiały diecezjalne)
- Materiały od innych twórców / animatorów
- Własne opracowanie

**Blokada wdrożenia: brak treści. UI można zbudować wcześniej jako "pustą powłokę" z systemem zarządzania treścią dla admina.**
