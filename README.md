# Eldorado Tracker v2 – portál

Živé ceny a skóre výhodnosti pro **329 her / 555 kategorií** na Eldorado.gg. Každá hra má vlastní stránku: ceny po typech (currency / items / accounts / boosting / top-upy / gift karty), tabulku položek, výdělkové metody s AFK skóre a rizikem, graf a zdroje. Na hlavní stránce je živá tabule, karty her a žebříček 25 metod napříč hrami.

## Nasazení (jednou)

1. Nahraj obsah této složky do GitHub repozitáře (soubor `.github/workflows/update.yml` vytvoř přes *Add file → Create new file*, protože Chrome skryté složky nepřetáhne – obsah je v tomto zipu).
2. Settings → Actions → General → Workflow permissions → **Read and write** → Save.
3. Actions → „Aktualizace cen Eldorado" → Run workflow (poprvé ručně, pak sám každých 6 h).
4. Netlify → Import from GitHub → Build command prázdné, Publish directory `.` → Deploy. Netlify web znovu nasadí po každém běhu robota.

## Jak to aktualizovat

### Ceny a nabídky (automaticky)
`scripts/update.py` obejde každých 6 hodin až 150 kategorií (všech 6 typů, nejdřív ty s nejstaršími daty) a zapíše do `data/catalog.json` (aktuální hodnoty) a `data/history.json` (časové řady). Robota spustíš i ručně v záložce Actions. Když Eldorado stránku zablokuje, zůstane poslední hodnota a v detailu hry uvidíš chybu. Interval změníš v `.github/workflows/update.yml` (řádek `cron`); pod 3 hodiny nedoporučuji.

### Výdělkové metody (`data/methods.json`)
Jeden objekt = jedna metoda. Klíč `game_id` je číslo hry z URL Eldorada (např. `/g/278` → `"278"` DonutSMP, `/i/259` → `"259"` Steal a Brainrot, `/g/11-0-0` → `"11"` Warframe). Pole:
```json
{"game_id":"11","method":"Void Cascade – relic farm","description":"…","rate_value":120,"rate_unit":"relics/h","usd_per_hour_net":2.1,"requirements":"Zariman","afk_score":0,"ban_risk_note":"…","source":"https://…","source_date":"2026-08-27"}
```
Neznámé hodnoty nech `null`. `usd_per_hour_net` = výnos × cena na Eldoradu × (1 − fee).

### Položky (`data/items.json`)
```json
{"game_id":"278","name":"Elytra","category":"item","price_usd":9.14,"unit":"ks","ingame_value":"345–800M","seller":"LootNova","seller_reviews":25174,"note":"…","source":"eldorado.gg","observed_at":"2026-08-27"}
```

### Žebříček (`data/ranking.json`)
25 řádků z analýzy pro prodejce z EU; sloupce `usd_n` (číslo pro řazení), `afk`, `auto`, `ban` 0–5, `comp` kompozit.

### Nová hra na Eldoradu
Přidej řádek do `data/catalog.json` (id, game, type, url, slug, fee_pct) a do `data/games.json` (id hry, name, types, cats). Robot ji začne stahovat při dalším běhu.

### Skóre
V `assets/app.js`, funkce `score()`: 35 % trend 7 d + 25 % hloubka trhu − 20 % dominance top prodejce − 20 % poplatek.

## Soubory
- `index.html` – hlavní stránka; `game.html?g=<id>` – detail hry; `assets/style.css`, `assets/app.js` – sdílený vzhled a logika
- `data/catalog.json` (555 kategorií), `data/games.json` (329 her), `data/history.json`, `data/methods.json` (90 metod, 24 her), `data/items.json` (49 položek), `data/ranking.json` (25)
- `scripts/update.py`, `.github/workflows/update.yml`, `netlify.toml`

Prodej herních statků za reálné peníze porušuje podmínky většiny her; web je analýza trhu a neobsahuje boty, makra ani obcházení banů.
