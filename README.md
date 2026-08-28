# Eldorado Terminal

Živý přehled trhu Eldorado.gg z pohledu prodejce: **329 her, 555 kategorií, 380 výdělkových metod**.
Klíčová vlastnost: **$/h se nepočítá dopředu, ale z aktuální ceny** — když cena spadne, metoda v žebříčku klesne sama.

## Jak se počítá výdělek

U metody je uložený jen herní výnos, například `17 200 000 gp/h` u OSRS bossu. Dolary vzniknou až při zobrazení:

```
$/h = výnos za hodinu × cena za 1 jednotku měny × (1 − poplatek Eldorada)
```

Cenu za jednotku dává `data/units.json`, které říká, kolik základních jednotek pokrývá cena kategorie
(např. `currency-osrs-gold` → `{base:"gold", per:1000000}` = cena je za 1 milion zlata).
Když měna metody nesedí na žádnou prodejnou kategorii hry (Sollant v Throne and Liberty, syndikátní
standing ve Warframe), metoda **záměrně nedostane $/h** — takový výnos se totiž zpeněžit nedá.

Pasivní farmy (AFK ≥ 4) počítám 24 h/den, aktivní 8 h/den. U týdenních 168 / 40 h. Metody, jejichž výnos
je za kus (jeden raid, jeden totem, jeden riven), dostanou místo $/h **hodnotu jednoho výstupu** — přepočítává
se stejně živě.

Kde $/h chybí, tabulka ukazuje důvod, ne prázdnou buňku:

| Důvod | Znamená |
|---|---|
| bez číselného výnosu | research nenašel spolehlivé číslo (189 metod) |
| výnos není za čas | metoda dává kusy, ne hodinovku — vedle je hodnota za kus |
| … se neprodává | ta měna (Sollant, syndikátní standing, Favor) se na Eldoradu zpeněžit nedá |
| hra nemá cenu měny | robot pro tu hru ještě nestáhl cenu |

## Jak se metody udržují aktuální

1. **Cena** — robot ji obnovuje každé 2 hodiny, přepočet $/h je okamžitý.
2. **Historie výdělku** — `scripts/earnings.py` po každém běhu uloží žebříček do `data/earnings.json`.
   Web z toho kreslí sloupec **Trend $/h**, takže je vidět, jak se meta posouvá.
3. **Štítek „ověřit"** — když se cena od zápisu metody pohnula o víc než 25 % nebo je zdroj starší než
   9 měsíců, metoda se označí. To je signál, že text metody potřebuje nový research.

Nový text metody přidáš do `data/methods.json`:

```json
{"game_id":"11","method":"Void Cascade – relic farm","description":"…",
 "rate_value":120,"rate_unit":"relics/h","requirements":"Zariman",
 "afk_score":0,"ban_risk_note":"…","source":"https://…","source_date":"2026-08-27"}
```

`game_id` je číslo hry z adresy Eldorada (`/g/278` → `"278"`). `usd_per_hour_net` se nevyplňuje — počítá se.

## Riziko: dvě různé věci

Dřív se riziko hádalo z textu poznámky u metody. Jenže ta u skoro každé hry říká totéž — „prodej za reálné
peníze je zakázán" — takže sloupec ukazoval pořád „vysoké" a nic neříkal. Teď se rozlišuje:

- **Hraní** — je samotná činnost ve hře v pořádku? U legitimních mechanik ano. Výjimkou je boosting,
  kde se sdílí účet.
- **Riziko prodeje** — jak tvrdě vydavatel zákaz **reálně vymáhá**. Data jsou v `data/risk.json`,
  úroveň 1–5 podle doložených ban vln:

| Úroveň | Znamená | Příklady |
|---|---|---|
| 1 | legální cesta | CS2, TF2, Rust — prodej přes Steam Market (peníze zůstanou v peněžence) |
| 2 | slabé vymáhání | Elden Ring — proti ToS, ale Bandai Namco banuje výjimečně |
| 3 | běžné bany | ESO, FFXIV, Lost Ark, GW2, Tibia, Warframe |
| 4 | aktivní ban vlny | WoW, Fortnite, R6, Tarkov, PoE, EA FC, všechny Roblox hry |
| 5 | permaban / konfiskace | DonutSMP (wipe účtů), Hypixel, EVE (odebrání ISK do mínusu), Albion, OSRS, Riot, Supercell |

Rozložení napříč metodami: 13 legální cesta · 5 slabé · 119 běžné · 142 ban vlny · 101 permaban.

## Ověřování dat

`data/audit.json` drží výsledek poslední nezávislé kontroly dat proti veřejným zdrojům. Web ji ukazuje
v sekci **Ověření** a u ověřených položek dává štítek „ověřeno".

Kontrola z 28. 8. 2026: **34 potvrzeno, 13 opraveno, 48 neověřeno**. Nejzávažnější nálezy:

1. **ESO metoda č. 1** — výnos 2 M zlata/h byl přiřazen k *farmení overland setů*. Podle AlcastHQ ho ale
   dává jen *překupnictví u guild traderů*; farmení setů dělá ~200k/h. Metoda rozdělena na dvě, ESO farmení
   spadlo z $10,56/h na $1,06/h.
2. **Scraper bral featured nabídku, ne nejlevnější.** Eldorado řadí podle „Recommended" a ta často není
   nejlevnější. `update.py` teď počítá minimum z rozparsovaných nabídek a featured ukládá zvlášť
   (`price_featured_usd`). Tohle způsobilo většinu cenových chyb.
3. **Šest chybných cen** — Warframe (+42 %), Albion (−21 %), FFXIV (−18 %), Diablo 4 (+16 %),
   WoW Classic Era (+13 %), Hypixel (+11 %).
4. **Delta Force** — tvrzení „statisíce sankcí týdně" nesedí; reporty Team Jade ukazují jednotky tisíc až
   ~20 000 a míří hlavně na cheaty, ne na RMT. Úroveň rizika snížena z 5 na 4.

Co se potvrdilo: celá struktura poplatků, výběrové poplatky, ban pravidla Jagexu, Riotu, Throne & Liberty
a DonutSMP, sazby Roblox DevEx, a ceny ESO, EVE, Star Citizen, PoE, Tibia i WoW retail.

## Nasazení

1. Nahraj obsah složky do GitHub repozitáře. Soubor `.github/workflows/update.yml` vytvoř přes
   **Add file → Create new file** (Chrome skryté složky nepřetáhne).
2. Settings → Actions → General → Workflow permissions → **Read and write** → Save.
3. Actions → „Aktualizace cen Eldorado" → **Run workflow**. Dál běží sám každé 2 hodiny.
4. Netlify → Import from GitHub → build command prázdný, publish directory `.` → Deploy.

## Soubory

| Soubor | Co obsahuje |
|---|---|
| `index.html` | terminál: žebřík výdělků, hry, trh, všechny metody |
| `game.html?g=<id>` | detail hry: ceny, živé nabídky, metody, graf, zdroje |
| `assets/style.css`, `assets/app.js` | vzhled a sdílená logika včetně přepočtu $/h |
| `data/catalog.json` | 555 kategorií: cena, nabídky, top prodejce, poplatek |
| `data/units.json` | kolik základních jednotek pokrývá cena (klíč pro přepočet) |
| `data/methods.json` | 380 metod s herním výnosem, AFK skóre a rizikem |
| `data/history.json` | časové řady cen |
| `data/earnings.json` | historie žebříčku $/h |
| `data/listings.json` | jednotlivé nabídky (až 40 na kategorii) |
| `data/items.json`, `data/ranking.json` | ověřené položky a žebříček metod z analýzy |
| `scripts/update.py` | stahování cen a nabídek |
| `scripts/earnings.py` | přepočet a archivace výdělků |

## Poznámka k pravidlům

Web sleduje jen legitimní herní mechaniky. Boti, makra, exploity a dupe glitche v datech nejsou.
Prodej herních statků za reálné peníze porušuje podmínky většiny her; legální cesty jsou pouze
WoW Token, EVE PLEX, Roblox DevEx a Steam Market.
