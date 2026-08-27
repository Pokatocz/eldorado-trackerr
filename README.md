# Eldorado Tracker

Živá tabule cen pro všech 555 kategorií na Eldorado.gg (currency, items, accounts, boosting, top-upy, gift karty), se skóre „jak je to teď dobré pro prodejce", historií a watchlistem.

## Jak to rozjet (10 minut, zdarma)

1. **GitHub** – založ účet, vytvoř nový repozitář (např. `eldorado-tracker`) a nahraj do něj obsah této složky (přetažením souborů ve webovém rozhraní GitHubu – i složky `data`, `scripts`, `.github`).
2. **Zapni robota** – v repozitáři klikni na záložku **Actions** → workflow „Aktualizace cen Eldorado" → **Run workflow**. Poprvé ho spusť ručně, dál poběží sám každých 6 hodin. Po každém běhu se do repozitáře uloží nová data.
3. **Netlify** – na app.netlify.com klikni *Add new site → Import an existing project → GitHub*, vyber repozitář. Build command nech prázdný, Publish directory `.` (je v `netlify.toml`). Netlify web znovu nasadí pokaždé, když robot zapíše nová data.

## Co kde je

- `index.html` – celá stránka (bez závislostí kromě fontů).
- `data/catalog.json` – 555 kategorií: hra, typ, URL, jednotka, poplatek, poslední cena, nabídky, top prodejce.
- `data/history.json` – časové řady (cena, nabídky, recenze) pro graf a výpočet změny.
- `scripts/update.py` – aktualizátor: stáhne stránky kategorií a doplní čísla. Šetrný: max 140 stránek za běh, pauza 2,5 s. Když stránka nejde načíst, nechá poslední známou hodnotu a zapíše chybu (vidíš ji v detailu řádku).
- `.github/workflows/update.yml` – rozvrh robota (`17 */6 * * *`). Pokud chceš častěji, změň cron; nedoporučuji pod 3 h – Eldorado by mohlo blokovat.

## Skóre

0–100 = 35 % cenový trend za 7 dní + 25 % hloubka trhu (log počtu nabídek) − 20 % dominance top prodejce (log recenzí) − 20 % poplatek. Vzorec je v `index.html` ve funkci `score()`, klidně si ho uprav.

## Poznámky

- Ceny jsou *nejnižší nabídky na první stránce kategorie* – to je cena, pod kterou musí jít nový prodejce, aby se vůbec zobrazil.
- Top-upy a gift karty robot nestahuje (jsou to arbitrážní produkty, ne farmovatelné) – řádky jsou v katalogu jen pro úplnost.
- Robot čte veřejné stránky; žádné API Eldorada neexistuje a žádné boty ve hrách se nepoužívají. Pokud Eldorado změní vzhled stránek, upravte regulární výrazy v `scripts/update.py` (funkce `parse`).
