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

Pasivní farmy (AFK ≥ 4) počítám 24 h/den, aktivní 8 h/den. U týdenních 168 / 40 h.

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
