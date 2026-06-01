// lib/wiedza.ts

export interface WiedzaItem {
  id: string
  title: string
  subtitle?: string   // np. "łac. Calix" dla Słowniczka
  content: string
  tag?: string        // np. "Naczynia" — filtr w Słowniczku
}

export interface WiedzaSection {
  id: string
  title: string
  items: WiedzaItem[]
}

export interface WiedzaCategory {
  id: string
  title: string
  emoji: string
  itemCount: number   // suma wszystkich items we wszystkich sections
  sections: WiedzaSection[]
  searchable?: boolean  // true tylko dla Słowniczka
}

export const WIEDZA_DATA: WiedzaCategory[] = [
  {
    id: 'modlitwy',
    title: 'Modlitwy',
    emoji: '🙏',
    itemCount: 13,
    sections: [
      {
        id: 'modlitwy-podstawowe',
        title: 'Modlitwy podstawowe',
        items: [
          {
            id: 'modlitwa-przed-msza',
            title: 'Modlitwa przed Mszą Świętą',
            content: 'Oto za chwilę przystąpię do Ołtarza Bożego, do Boga, który rozwesela młodość moją. Do świętej przystępuję służby. Chcę ją pełnić dobrze, pobożnie i radośnie. Proszę Cię, Panie Jezu, o łaskę skupienia, aby myśli moje były zwrócone do Ciebie, oczy na ołtarz, a serce oddane tylko Tobie. Amen.',
          },
          {
            id: 'modlitwa-po-mszy',
            title: 'Modlitwa po Mszy Świętej',
            content: 'Boże, którego dobroć powołała mnie do Twej służby, spraw, bym uświęcony uczestnictwem w Twych tajemnicach, przez ten dzień (noc) i całe me życie szedł tylko drogą zbawienia. Przez Chrystusa, Pana naszego. Amen.',
          },
        ],
      },
      {
        id: 'modlitwy-funkcje',
        title: 'Dla funkcji i stopni',
        items: [
          {
            id: 'modlitwa-lektora-przed',
            title: 'Modlitwa Lektora (przed czytaniem)',
            content: 'Panie, oto stoję wobec wielkiej tajemnicy Twojego Słowa, które mam przekazywać innym. Pomóż mi być najpierw dobrym słuchaczem i świadkiem tego Słowa. Oczyść moje wargi od wszelkiej nieczystości, uczyń z nich swoje narzędzie, by mogło przez nie dotrzeć do serc ludzkich Twoje Słowo i przynieść obfity owoc. Amen.',
          },
          {
            id: 'modlitwa-lektora-po',
            title: 'Modlitwa Lektora (po czytaniu)',
            content: 'Panie, dziękuję Ci za łaskę, że mogłem czytać Twoje Święte Słowo. Spraw, by wydało ono owoc w moim sercu i w sercach tych, którzy je słyszeli. Amen.',
          },
          {
            id: 'modlitwa-psalmisty',
            title: 'Modlitwa Psalmisty (Kantora)',
            content: 'Daj mi, o Panie, czyste wargi i serce, abym godnie wyśpiewywał Twoją chwałę. Spraw, aby śpiew zjednoczył nasze serca i przybliżył nas do Ciebie. Amen.',
          },
          {
            id: 'modlitwa-ceremoniarza',
            title: 'Modlitwa Ceremoniarza',
            content: 'Panie Jezu, Ty wiesz, jak wielka spoczywa na mnie odpowiedzialność za piękno liturgii. Daj mi mądrość, cierpliwość i zmysł modlitwy, abym nie tylko sprawnie kierował asystą, ale sam też modlił się w czasie świętych obrzędów. Amen.',
          },
        ],
      },
      {
        id: 'modlitwy-szaty',
        title: 'Przy zakładaniu szat',
        items: [
          {
            id: 'modlitwa-komzy',
            title: 'Przy zakładaniu komży (lub alby)',
            content: 'Wybiel mnie, Panie, i oczyść serce moje, abym we Krwi Baranka wybielony mógł się cieszyć radością wieczną. Amen.',
          },
          {
            id: 'modlitwa-cingulum',
            title: 'Przy przepasywaniu się cingulum',
            content: 'Przepasz mnie, Panie, sznurem czystości i zgaś w moim sercu wszelkie złe pragnienia, aby pozostała we mnie cnota powściągliwości i czystości. Amen.',
          },
        ],
      },
      {
        id: 'modlitwy-patroni',
        title: 'Do Patronów LSO',
        items: [
          {
            id: 'modlitwa-tarsycjusz',
            title: 'Do św. Tarsycjusza',
            content: 'Święty Tarsycjuszu, Patronie i wzorze nasz, Ty nosiłeś Pana Jezusa w swym sercu i w swych rękach. Cześć i miłość dla Niego przypłaciłeś własnym życiem. Wyproś nam u Boga łaskę, abyśmy z największym poszanowaniem i czcią odnosili się do Najświętszego Sakramentu i do wszystkich rzeczy poświęconych oraz byśmy w Jego obronie nie szczędzili żadnych trudów. Amen.',
          },
          {
            id: 'modlitwa-dominik',
            title: 'Do św. Dominika Savio',
            content: 'Święty Dominiku Savio, który w tak młodym wieku osiągnąłeś doskonałość chrześcijańską, uproś nam łaskę, abyśmy za Twoim przykładem umiłowali czystość, mieli wstręt do grzechu i często przyjmowali Sakramenty święte, a przez to osiągnęli zbawienie. Amen.',
          },
          {
            id: 'modlitwa-berchmans',
            title: 'Do św. Jana Berchmansa',
            content: 'Święty Janie Berchmansie, serdeczny przyjacielu Jezusa i Maryi. Ty widziałeś wielkość w małych i zwyczajnych rzeczach. Uproś nam łaskę pilności i sumienności w wypełnianiu naszych codziennych obowiązków przy ołtarzu i w szkole. Amen.',
          },
        ],
      },
      {
        id: 'modlitwy-zbiorki',
        title: 'Na zbiórki formacyjne',
        items: [
          {
            id: 'modlitwa-przed-zbiórką',
            title: 'Modlitwa przed zbiórką',
            content: 'Duchu Święty, który oświecasz serca i umysły nasze, dodaj nam ochoty i zdolności, aby ta zbiórka przyniosła nam dobre owoce, a nasza praca przyczyniła się do Twojej chwały. Amen.',
          },
          {
            id: 'modlitwa-po-zbiorce',
            title: 'Modlitwa po zbiórce',
            content: 'Dziękujemy Ci, Boże, za ten wspólny czas. Spraw, abyśmy to, czego się nauczyliśmy, potrafili wykorzystać w naszej służbie i w codziennym życiu. Przez Chrystusa, Pana naszego. Amen.',
          },
        ],
      },
    ],
  },
  {
    id: 'slowniczek',
    title: 'Słowniczek',
    emoji: '📖',
    itemCount: 40,
    searchable: true,
    sections: [
      {
        id: 'naczynia',
        title: 'Naczynia Liturgiczne',
        items: [
          { id: 'kielich', title: 'Kielich', subtitle: 'łac. Calix', tag: 'Naczynia', content: 'Najważniejsze naczynie liturgiczne, w którym w czasie Mszy Świętej wino przemienia się w Krew Chrystusa. Zazwyczaj bogato zdobiony, a jego wnętrze musi być pozłacane.' },
          { id: 'patena', title: 'Patena', subtitle: 'łac. Patena', tag: 'Naczynia', content: 'Patena kielichowa: Płaskie naczynie w kształcie talerzyka, na którym spoczywa Hostia (chleb do konsekracji). Patena komunijna (głęboka): Używana przez ministrantów podczas rozdawania Komunii Świętej, aby uchronić przed upadkiem na ziemię najmniejszych cząstek konsekrowanej Hostii.' },
          { id: 'cyborium', title: 'Puszka / Cyborium', subtitle: 'łac. Ciborium', tag: 'Naczynia', content: 'Naczynie podobne do kielicha, ale z zamykaną pokrywką. Służy do przechowywania konsekrowanych komunikantów w tabernakulum.' },
          { id: 'monstrancja', title: 'Monstrancja', subtitle: 'łac. Monstrantia', tag: 'Naczynia', content: 'Ozdobne naczynie liturgiczne służące do publicznego wystawiania Najświętszego Sakramentu (np. podczas adoracji czy procesji). Centralną jej częścią jest melchizedek – uchwyt w kształcie półksiężyca, w którym umieszcza się Hostię.' },
          { id: 'kustodia', title: 'Kustodia', subtitle: 'łac. Custodia', tag: 'Naczynia', content: 'Małe naczynie, w którym przechowuje się Najświętszy Sakrament (wraz z melchizedkiem) w tabernakulum, gdy nie jest on wystawiony w monstrancji.' },
          { id: 'ampulki', title: 'Ampułki', subtitle: 'łac. Ampullae', tag: 'Naczynia', content: 'Dwa małe dzbanuszki (szklane, rzadziej metalowe) zawierające wodę i wino, przynoszone na ołtarz podczas przygotowania darów.' },
          { id: 'lawabo', title: 'Lawabo i Ręczniczek', subtitle: 'łac. Lavabo', tag: 'Naczynia', content: 'Zestaw składający się z dzbanuszka na wodę oraz misy. Służy kapłanowi do obmycia rąk (obrzęd lavabo). Używa się go zawsze razem z manutergiem – małym ręczniczkiem do wytarcia dłoni.' },
          { id: 'trybularz', title: 'Trybularz / Kadzielnica', subtitle: 'łac. Thuribulum', tag: 'Naczynia', content: 'Metalowe naczynie zawieszone na łańcuszkach, w którym na rozżarzonych węgielkach spala się ziarna kadzidła.' },
          { id: 'lodka', title: 'Łódka', subtitle: 'łac. Navicula', tag: 'Naczynia', content: 'Naczynie w kształcie łódeczki, w którym przechowuje się ziarna kadzidła. Wyposażona jest w małą łyżeczkę do nakładania kadzidła.' },
          { id: 'kropidlo', title: 'Kropidło i Kociołek', subtitle: 'łac. Aspergillum', tag: 'Naczynia', content: 'Przyrząd służący do kropienia wodą święconą (często metalowa kula z otworami na rączce) oraz dedykowane naczynie na wodę.' },
          { id: 'puryfikaterz', title: 'Puryfikaterz', subtitle: 'łac. Purificatorium', tag: 'Naczynia', content: 'Prostokątny, biały kawałek lnianego materiału. Służy do wycierania (puryfikowania) kielicha, pateny oraz brzegów puszek po rozdzieleniu Komunii.' },
          { id: 'palka', title: 'Palka', subtitle: 'łac. Palla', tag: 'Naczynia', content: 'Sztywny, kwadratowy kawałek materiału, używany do przykrywania kielicha podczas Mszy (chroni zawartość przed zanieczyszczeniami).' },
          { id: 'korporal', title: 'Korporał', subtitle: 'łac. Corporale', tag: 'Naczynia', content: 'Kwadratowy obrus, na którym stawia się kielich, patenę i puszki. Zawsze składa się go do wewnątrz, aby okruchy Hostii pozostały w środku.' },
        ],
      },
      {
        id: 'kosciol',
        title: 'Elementy kościoła',
        items: [
          { id: 'oltarz', title: 'Ołtarz', subtitle: 'łac. Altare', tag: 'Kościół', content: 'Centralne miejsce w kościele, stół, na którym sprawowana jest Ofiara Mszy Świętej.' },
          { id: 'ambona', title: 'Ambona', subtitle: 'łac. Ambo', tag: 'Kościół', content: 'Miejsce (podwyższenie, mównica), z którego czytane jest Słowo Boże, śpiewany psalm i głoszona homilia.' },
          { id: 'tabernakulum', title: 'Tabernakulum', subtitle: 'łac. Tabernaculum', tag: 'Kościół', content: 'Zamykana (często pancerna) szafka, w której przechowuje się Najświętszy Sakrament. Zawsze musi palić się przy nim wieczna lampka.' },
          { id: 'kredencja', title: 'Kredencja', subtitle: 'łac. Credentia', tag: 'Kościół', content: 'Mały stolik z boku ołtarza, na którym przygotowane są dary oraz przedmioty potrzebne podczas liturgii.' },
          { id: 'dzwonki', title: 'Dzwonki i Gong', subtitle: 'łac. Tintinnabula', tag: 'Kościół', content: 'Używane przez ministrantów podczas najważniejszych momentów Mszy Świętej.' },
          { id: 'kolatki', title: 'Kołatki', subtitle: 'łac. Crotalum', tag: 'Kościół', content: 'Drewniane przyrządy wydające głuchy, stukający dźwięk, używane zamiast dzwonków podczas Triduum Paschalnego.' },
        ],
      },
      {
        id: 'szaty',
        title: 'Szaty liturgiczne',
        items: [
          { id: 'alba', title: 'Alba', subtitle: 'łac. Alba', tag: 'Szaty', content: 'Długa, biała szata sięgająca kostek. Podstawowa szata dla wszystkich usługujących w liturgii. Symbolizuje łaskę chrztu i czystość.' },
          { id: 'komza', title: 'Komża', subtitle: 'łac. Cotta', tag: 'Szaty', content: 'Skrócona wersja alby. Nakładana na sutannę lub sutanelę.' },
          { id: 'cingulum', title: 'Cingulum', subtitle: 'łac. Cingulum', tag: 'Szaty', content: 'Sznur służący do przewiązania alby w pasie. Symbolizuje wstrzemięźliwość i gotowość do pracy.' },
          { id: 'ornat', title: 'Ornat', subtitle: 'łac. Casula', tag: 'Szaty', content: 'Wierzchnia, główna szata liturgiczna kapłana. Jej kolor zależy od okresu liturgicznego.' },
          { id: 'stula', title: 'Stuła', subtitle: 'łac. Stola', tag: 'Szaty', content: 'Długa wstęga materiału noszona na szyi. Jest najważniejszym symbolem władzy kapłańskiej, zakładana obowiązkowo do sprawowania sakramentów.' },
        ],
      },
      {
        id: 'kolory',
        title: 'Kolory liturgiczne',
        items: [
          { id: 'bialy', title: 'Biały / Złoty', subtitle: 'łac. Albus / Aureus', tag: 'Kolory', content: 'Radość, chwała, triumf, niewinność. Stosowany w: Boże Narodzenie, Wielkanoc, wspomnienia Pańskie i świętych niemęczenników.' },
          { id: 'czerwony', title: 'Czerwony', subtitle: 'łac. Ruber', tag: 'Kolory', content: 'Krew, ogień, miłość, męczeństwo. Stosowany w: Niedziela Palmowa, Wielki Piątek, Zesłanie Ducha Świętego, wspomnienia męczenników.' },
          { id: 'zielony', title: 'Zielony', subtitle: 'łac. Viridis', tag: 'Kolory', content: 'Nadzieja, życie, codzienność. Stosowany w: Okres zwykły.' },
          { id: 'fioletowy', title: 'Fioletowy', subtitle: 'łac. Violaceus', tag: 'Kolory', content: 'Pokuta, żałoba, pokora. Stosowany w: Adwent, Wielki Post, msze za zmarłych.' },
          { id: 'rozowy', title: 'Różowy', subtitle: 'łac. Rosaceus', tag: 'Kolory', content: 'Radość pośród trudów pokuty. Stosowany w III niedzielę Adwentu (Gaudete) i IV Wielkiego Postu (Laetare).' },
        ],
      },
    ],
  },
  {
    id: 'patroni',
    title: 'Patroni',
    emoji: '✨',
    itemCount: 4,
    sections: [
      {
        id: 'sylwetki',
        title: 'Sylwetki Patronów',
        items: [
          {
            id: 'tarsycjusz',
            title: 'Św. Tarsycjusz',
            subtitle: 'Męczennik Eucharystii · wspomnienie: 15 sierpnia',
            content: 'Patron całej Liturgicznej Służby Ołtarza. Był młodym chłopcem (prawdopodobnie akolitą) żyjącym w Rzymie w III wieku.\n\nGdy chrześcijanie byli masowo wtrącani do więzień przed egzekucją, potajemnie noszono im Wiatyk (Komunię Świętą). Pewnego dnia zadanie to powierzono młodemu Tarsycjuszowi. W drodze został zaczepiony przez grupę pogańskich rówieśników, którzy chcieli zobaczyć, co ukrywa na piersi. Gdy odmówił wydania Najświętszego Sakramentu, został ukamienowany i pobity na śmierć. Komunię obronił.\n\nCzego uczy? Ogromnego szacunku do Najświętszego Sakramentu, odwagi w wyznawaniu wiary i odpowiedzialności za powierzone zadanie.',
          },
          {
            id: 'dominik-savio',
            title: 'Św. Dominik Savio',
            subtitle: 'Święty z podwórka · wspomnienie: 6 maja',
            content: 'Patron ministrantów i młodzieży, wychowanek słynnego pedagoga św. Jana Bosko. Zwykły, ale niezwykle radosny chłopiec z Włoch (XIX wiek). Zmarł z powodu choroby płuc, mając zaledwie 15 lat.\n\nBył bardzo pomocny w oratorium ks. Bosko. Założył wśród kolegów "Towarzystwo Niepokalanej" – grupę chłopców, którzy pomagali sobie w nauce.\n\nJego postanowienia z Pierwszej Komunii:\n1. Będę spowiadał się bardzo często.\n2. Będę święcił dni święte.\n3. Moimi przyjaciółmi będą Jezus i Maryja.\n4. Raczej umrę, niż zgrzeszę.\n\nCzego uczy? Prawdziwa świętość polega na bardzo radosnym i sumiennym wypełnianiu codziennych, małych obowiązków.',
          },
          {
            id: 'jan-berchmans',
            title: 'Św. Jan Berchmans',
            subtitle: 'Mistrz codzienności · wspomnienie: 26 listopada',
            content: 'Patron ministrantów, studentów i młodzieży uczącej się. Belgijski jezuita z XVII wieku. Zmarł mając zaledwie 22 lata.\n\nNie zrobił nic nadzwyczajnego – nie był męczennikiem, nie założył zakonu. Słynął z absolutnej punktualności, pracowitości i perfekcyjnego przestrzegania regulaminu. Był zawsze uśmiechnięty, choć wymagał od siebie bardzo wiele.\n\nJego maksyma: "Największą pokutą jest dla mnie życie wspólne" – cierpliwe znoszenie wad innych ludzi każdego dnia jest trudniejsze niż wielkie posty.\n\nCzego uczy? Punktualności przychodzenia na zbiórki i dyżury, dokładności w przygotowywaniu ołtarza oraz cierpliwości dla innych ministrantów w zakrystii.',
          },
          {
            id: 'stanislaw-kostka',
            title: 'Św. Stanisław Kostka',
            subtitle: 'Do wyższych rzeczy stworzony · wspomnienie: 18 września',
            content: 'Jeden z głównych patronów Polski, często stawiany za wzór dla młodych służących przy ołtarzu. Polski szlachcic z XVI wieku, który sprzeciwił się woli potężnych rodziców, by pójść za głosem powołania. Zmarł w wieku 18 lat w Rzymie.\n\nUczył się w Wiedniu, gdzie doznał objawienia. Postanowił wstąpić do jezuitów, ale jego ojciec kategorycznie się na to nie zgodził. Stanisław, w przebraniu żebraka, uciekł z Wiednia i przeszedł pieszo przez Alpy aż do Rzymu, by zrealizować swój cel.\n\nJego maksyma: "Do wyższych rzeczy zostałem stworzony i dla nich winienem żyć."\n\nCzego uczy? Wytrwałości, niezniechęcania się trudnościami i dążenia do wielkich celów wbrew niesprzyjającym okolicznościom.',
          },
        ],
      },
    ],
  },
  {
    id: 'postawy',
    title: 'Postawy i Gesty',
    emoji: '🤲',
    itemCount: 10,
    sections: [
      {
        id: 'postawy-liturgiczne',
        title: 'Postawy liturgiczne',
        items: [
          {
            id: 'postawa-stojaca',
            title: 'Postawa stojąca',
            content: 'Znaczenie: Znak szacunku, gotowości do działania i radości z faktu zmartwychwstania. To postawa ludzi wolnych.\n\nKiedy: Podczas procesji wejścia, aktu pokutnego, śpiewu "Chwała na wysokości Bogu", modlitwy dnia (Kolekty), głoszenia Ewangelii, wyznania wiary, modlitwy powszechnej, Modlitwy Eucharystycznej (z wyjątkiem Przeistoczenia), modlitwy "Ojcze nasz", błogosławieństwa i rozesłania.',
          },
          {
            id: 'postawa-siedzaca',
            title: 'Postawa siedząca',
            content: 'Znaczenie: Postawa skupienia, słuchania i rozważania.\n\nKiedy: Podczas czytań (I i II czytanie), psalmu responsoryjnego, homilii (kazania), przygotowania darów na ołtarzu oraz podczas ciszy po Komunii Świętej.',
          },
          {
            id: 'postawa-kleczaca',
            title: 'Postawa klęcząca',
            content: 'Znaczenie: Znak adoracji (oddania czci Bogu), pokory i pokuty.\n\nKiedy: Podczas modlitwy epiklezy i przeistoczenia (gdy kapłan wyciąga ręce nad darami aż do aklamacji po podniesieniu), podczas słów "Oto Baranek Boży", w trakcie wystawienia Najświętszego Sakramentu, a także przed spowiedzią i w jej trakcie.',
          },
          {
            id: 'prostracja',
            title: 'Leżenie krzyżem (Prostracja)',
            content: 'Znaczenie: Znak najgłębszego uniżenia, całkowitego oddania się Bogu i modlitwy w wielkim utrapieniu.\n\nKiedy: Używana bardzo rzadko – podczas Liturgii Męki Pańskiej w Wielki Piątek (główny celebrans) oraz w trakcie święceń diakonatu, prezbiteratu i episkopatu.',
          },
        ],
      },
      {
        id: 'gesty',
        title: 'Gesty liturgiczne',
        items: [
          {
            id: 'zlozenie-rak',
            title: 'Złożenie rąk',
            content: 'Jak wykonać: Dłonie przylegają do siebie na wysokości piersi, palce skierowane lekko w górę, prawy kciuk nałożony na lewy w kształt krzyża.\n\nZnaczenie: Znak wzniesienia duszy do Boga, skupienia i oddania. Ręce składa się zawsze, gdy nie wykonuje się innej czynności (np. niesienia ampułek czy mszału).',
          },
          {
            id: 'znak-krzyza',
            title: 'Znak krzyża',
            content: 'Mały: Kciukiem prawej ręki na czole, ustach i piersi (przed Ewangelią – znak, że chcemy Słowo Boże zrozumieć, głosić i zachować w sercu).\n\nDuży: Od czoła do piersi, od lewego do prawego ramienia. Znak przynależności do Chrystusa.',
          },
          {
            id: 'bicie-piersi',
            title: 'Bicie się w piersi',
            content: 'Jak wykonać: Lekkie uderzenie prawą dłonią w pierś (nie pięścią!).\n\nZnaczenie: Znak skruchy, przyznania się do winy. Wykonuje się podczas aktu pokutnego na słowa: "Moja wina, moja wina, moja bardzo wielka wina".',
          },
        ],
      },
      {
        id: 'sklony',
        title: 'Skłony i przyklęknięcia',
        items: [
          {
            id: 'przyklekniecie',
            title: 'Przyklęknięcie (Genufleksja)',
            content: 'Jak wykonać: Dotknięcie prawym kolanem ziemi (blisko pięty lewej nogi), tułów wyprostowany.\n\nDla kogo: Zawsze i wyłącznie dla Pana Boga (przed tabernakulum, w którym jest Najświętszy Sakrament, lub przed wystawioną monstrancją – wtedy klęka się na oba kolana).',
          },
          {
            id: 'gleboki-uklon',
            title: 'Głęboki ukłon (Skłon ciała)',
            content: 'Jak wykonać: Pochylenie całego tułowia. Prawidłowy ukłon jest wtedy, gdy w czasie pochylenia można dotknąć rękami kolan.\n\nDla kogo: Dla Ołtarza (jako symbolu Chrystusa), krzyża. Jeśli w prezbiterium nie ma tabernakulum, przechodząc przed ołtarzem wykonuje się skłon ciała, a nie przyklęknięcie.',
          },
          {
            id: 'pochylenie-glowy',
            title: 'Pochylenie głowy',
            content: 'Kiedy: Gdy wymawia się imię Jezus, imię Najświętszej Maryi Panny lub świętego, którego wspomnienie danego dnia się obchodzi. Również podczas przyjmowania błogosławieństwa.',
          },
        ],
      },
    ],
  },
  {
    id: 'msza',
    title: 'Msza Święta',
    emoji: '⛪',
    itemCount: 5,
    sections: [
      {
        id: 'czesci-mszy',
        title: 'Części Mszy Świętej',
        items: [
          {
            id: 'obrzedy-wstepne',
            title: 'I. Obrzędy Wstępne',
            content: 'Cel: Zawiązanie wspólnoty oraz przygotowanie wiernych do słuchania Słowa Bożego i godnego sprawowania Eucharystii.\n\n• Procesja wejścia i śpiew: Wejście asysty i celebransa. Zakończone oddaniem czci ołtarzowi.\n• Znak krzyża i pozdrowienie wiernych\n• Akt pokutny: Zakończony uderzeniem się w pierś.\n• Panie, zmiłuj się (Kyrie eleison)\n• Chwała na wysokości Bogu (Gloria): Hymn uwielbienia – w niedziele i święta, nie w Adwencie i Wielkim Poście.\n• Kolekta (Modlitwa dnia)\n\n🔔 Wskazówka dla asysty: To jest moment dla ministranta Księgi (librariusza), aby podszedł do celebransa i podał mu Mszał Rzymski.',
          },
          {
            id: 'liturgia-slowa',
            title: 'II. Liturgia Słowa',
            content: 'Głównym elementem tej części jest słuchanie Słowa Bożego.\n\n• Pierwsze czytanie: Zazwyczaj fragment Starego Testamentu.\n• Psalm responsoryjny: Odpowiedź ludu na Słowo Boże.\n• Drugie czytanie: Fragment Nowego Testamentu (w niedziele i uroczystości).\n• Aklamacja przed Ewangelią (Alleluja)\n• Ewangelia: Kulminacyjny punkt Liturgii Słowa.\n• Homilia (Kazanie): Wszyscy siedzą.\n• Wyznanie Wiary (Credo): W niedziele i uroczystości.\n• Modlitwa Powszechna\n\n🔔 Wskazówka dla asysty: Wszyscy stoją podczas Ewangelii. Ceroferariusze mogą stać ze świecami obok ambonki.',
          },
          {
            id: 'liturgia-eucharystyczna',
            title: 'III. Liturgia Eucharystyczna',
            content: 'To serce całej Mszy Świętej, uobecnienie ofiary Jezusa Chrystusa.\n\n• Przygotowanie darów (Offertorium): Przyniesienie chleba, wina i wody na ołtarz.\n• Modlitwa Eucharystyczna:\n  - Prefacja: Modlitwa dziękczynna\n  - Sanctus: Aklamacja śpiewana przez wiernych\n  - Epikleza i Przeistoczenie (Konsekracja): Chleb i wino stają się Ciałem i Krwią Chrystusa\n  - Aklamacja po przeistoczeniu\n  - Doksologia i "Amen"\n\n🔔 Wskazówka dla asysty: Czas intensywnej pracy ministrantów ołtarza. Przynoszą kielich, podają ampułki, asystują przy obmyciu rąk (Lawabo). Podczas Przeistoczenia: dzwonki i gong, asysta klęczy.',
          },
          {
            id: 'obrzedy-komunii',
            title: 'IV. Obrzędy Komunii',
            content: 'Przygotowanie do przyjęcia Ciała Chrystusa i sama Komunia.\n\n• Modlitwa Pańska (Ojcze nasz)\n• Znak pokoju\n• Baranku Boży (Agnus Dei)\n• Komunia Święta\n• Puryfikacja: Oczyszczenie naczyń przez kapłana.\n• Uwielbienie: Cisza lub pieśń dziękczynna.\n• Modlitwa po Komunii\n\n🔔 Wskazówka dla asysty: Ministranci z patenami komunijnymi towarzyszą szafarzom, uważając, aby żadna cząstka Hostii nie upadła na ziemię.',
          },
          {
            id: 'obrzedy-zakonczenia',
            title: 'V. Obrzędy Zakończenia',
            content: 'Pożegnanie z wiernymi i posłanie ich do codziennego życia.\n\n• Ogłoszenia duszpasterskie (opcjonalnie)\n• Błogosławieństwo\n• Rozesłanie: "Idźcie w pokoju Chrystusa"\n• Ucałowanie ołtarza i wyjście: Asysta wykonuje skłon lub przyklęka przed tabernakulum i w procesji wraca do zakrystii.',
          },
        ],
      },
    ],
  },
  {
    id: 'stopnie',
    title: 'Stopnie i Posługi',
    emoji: '🏅',
    itemCount: 13,
    sections: [
      {
        id: 'funkcje',
        title: 'Funkcje ministranckie',
        items: [
          { id: 'kandydat', title: 'Kandydat', content: 'Chłopiec przygotowujący się do służby przy ołtarzu. Uczy się podstawowych postaw, gestów oraz topografii kościoła. Zazwyczaj nie nosi jeszcze pełnego stroju liturgicznego, a jego głównym zadaniem jest obserwacja i wdrażanie się w dyscyplinę.' },
          { id: 'dzwonki', title: 'Choralista / Ministrant Dzwonków', content: 'Ministrant odpowiedzialny za dawanie sygnałów dźwiękowych w czasie liturgii. Używa dzwonków i gongu, aby podkreślić najważniejsze momenty, takie jak epikleza czy przeistoczenie, oraz wezwać wiernych do zmiany postawy.' },
          { id: 'ceroferariusz', title: 'Ministrant Światła / Ceroferariusz', subtitle: 'łac. Ceroferarius', content: 'Odpowiada za niesienie świec (akolitek) w procesji wejścia i wyjścia, a także podczas uroczystego odczytywania Ewangelii. Światło, które niesie, symbolizuje obecność Chrystusa.' },
          { id: 'krucyferariusz', title: 'Ministrant Krzyża / Krucyferariusz', subtitle: 'łac. Cruciferarius', content: 'Posługujący, który niesie krzyż procesyjny na czele procesji wejścia i wyjścia. Idzie zazwyczaj w asyście dwóch ceroferariuszy.' },
          { id: 'librariusz', title: 'Ministrant Księgi / Librariusz', subtitle: 'łac. Librarius', content: 'Odpowiada za podawanie Mszału Rzymskiego głównemu celebransowi (np. podczas modlitwy zwanej kolektą i modlitwy po Komunii). Dba również o odpowiednie ułożenie ksiąg na ołtarzu i ambonie.' },
          { id: 'ampulkowy', title: 'Ministrant Ołtarza (Ampułkowy, Patenowy)', content: 'Usługuje bezpośrednio przy stole eucharystycznym. Przynosi na ołtarz dary (chleb, wino i wodę w ampułkach), asystuje przy obmyciu rąk kapłana (lawabo) oraz trzyma patenę komunijną podczas rozdzielania Komunii Świętej.' },
          { id: 'aspersorzysta', title: 'Ministrant Wody / Aspersorzysta', content: 'Odpowiada za kociołek z wodą święconą i kropidło. Asystuje kapłanowi podczas obrzędu pokropienia wiernych (aspersji) lub święcenia przedmiotów.' },
          { id: 'turyferariusz', title: 'Ministrant Kadzidła / Turyferariusz', subtitle: 'łac. Thuriferarius', content: 'Obsługuje trybularz (kadzielnicę). Odpowiada za rozpalenie węgielków i podawanie trybularza kapłanowi do okadzenia ołtarza, darów, krzyża oraz wiernych w trakcie uroczystych Mszy Świętych.' },
          { id: 'nawikulariusz', title: 'Ministrant Łódki / Nawikulariusz', subtitle: 'łac. Navicularius', content: 'Towarzyszy turyferariuszowi. Niesie łódkę z ziarenkami kadzidła (mirrą) i podaje ją kapłanowi, aby ten mógł zasypać kadzidło do trybularza.' },
          { id: 'lektor', title: 'Lektor', subtitle: 'łac. Lector', content: 'Posiada specjalne błogosławieństwo do odczytywania Słowa Bożego (z wyjątkiem Ewangelii) z ambony. Może również podawać intencje Modlitwy Powszechnej oraz śpiewać psalm responsoryjny, jeśli nie ma psalmisty.' },
          { id: 'psalterzysta', title: 'Psałterzysta / Kantor', subtitle: 'łac. Psalmista', content: 'Funkcja muzyczna. Odpowiada za wykonanie psalmu responsoryjnego pomiędzy czytaniami oraz intonowanie aklamacji przed Ewangelią (Alleluja).' },
          { id: 'akolita', title: 'Akolita', subtitle: 'łac. Acolythus', content: 'Starszy stopień posługi. Ustanowiony do pomocy kapłanowi i diakonowi. Może przygotowywać ołtarz i naczynia liturgiczne (purfikacja), a jako szafarz nadzwyczajny – udzielać wiernym Komunii Świętej oraz zanosić ją chorym.' },
          { id: 'ceremoniarz', title: 'Ceremoniarz', subtitle: 'łac. Caeremoniarius', content: 'Najwyższa funkcja w zespole liturgicznym. Odpowiada za przygotowanie całej asysty i dbanie o prawidłowy, piękny i zgrany przebieg liturgii. Kieruje pozostałymi ministrantami, podaje im sygnały do działania i czuwa nad poprawnością obrzędów.' },
        ],
      },
    ],
  },
]

// Helper: znajdź kategorię po id
export function findCategory(id: string): WiedzaCategory | undefined {
  return WIEDZA_DATA.find(c => c.id === id)
}

// Helper: znajdź sekcję i item
export function findItem(categoryId: string, itemId: string): {
  category: WiedzaCategory
  section: WiedzaSection
  item: WiedzaItem
  allItems: WiedzaItem[]   // wszystkie items tej sekcji (do nav prev/next)
} | undefined {
  const category = findCategory(categoryId)
  if (!category) return undefined
  for (const section of category.sections) {
    const item = section.items.find(i => i.id === itemId)
    if (item) return { category, section, item, allItems: section.items }
  }
  return undefined
}

// Helper: wszystkie items Słowniczka płasko (do wyszukiwania)
export function getAllSlowniczekItems(): WiedzaItem[] {
  const cat = findCategory('slowniczek')
  if (!cat) return []
  return cat.sections.flatMap(s => s.items)
}

// Helper: unikalne tagi w Słowniczku
export function getSlowniczekTags(): string[] {
  return ['Naczynia', 'Kościół', 'Szaty', 'Kolory']
}
