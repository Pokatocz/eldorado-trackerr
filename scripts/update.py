#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Aktualizátor cen pro Eldorado tracker.
- Projde kategorie z data/catalog.json (všech 555 nebo jen prioritní), stáhne stránku
  a best-effort vyparsuje: počet nabídek, nejnižší cenu na 1. stránce, top prodejce + recenze.
- Výsledek zapíše do data/catalog.json (aktuální snímek) a data/history.json (časová řada).
- Když Eldorado stránku zablokuje (Cloudflare, 403, timeout), poslední známá hodnota zůstane
  a zaznamená se chyba — web pak ukáže, jak jsou data stará.
Spouští se z GitHub Actions (viz .github/workflows/update.yml). Bez botů ve hrách, jen čtení veřejných stránek.
"""
import json, re, time, sys, os, html, random
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CATALOG = os.path.join(ROOT, 'data', 'catalog.json')
HISTORY = os.path.join(ROOT, 'data', 'history.json')
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'
MAX_PER_RUN = int(os.environ.get('MAX_PER_RUN', '120'))   # kolik kategorií za běh (šetrné k Eldoradu)
DELAY = float(os.environ.get('DELAY', '2.5'))               # pauza mezi požadavky v sekundách
PRIORITY_TYPES = ['currency', 'items', 'accounts', 'boosting']  # top-upy/gift karty jsou arbitráž, netáhneme

def fetch(url):
    req = Request(url, headers={'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', 'Accept': 'text/html'})
    with urlopen(req, timeout=30) as r:
        return r.read().decode('utf-8', 'ignore')

def to_text(h):
    h = re.sub(r'<script.*?</script>|<style.*?</style>', ' ', h, flags=re.S | re.I)
    h = re.sub(r'<[^>]+>', ' ', h)
    return html.unescape(re.sub(r'\s+', ' ', h))

def parse(text):
    """Vrátí dict s listings, price_low, top_seller, reviews. Best-effort, každý údaj může být None."""
    out = {'listings': None, 'price_low': None, 'top_seller': None, 'reviews': None}
    m = re.search(r'([\d,]+)\s+items? found', text)
    if m:
        out['listings'] = int(m.group(1).replace(',', ''))
    # blok nabídek začíná za "Recommended" (výchozí řazení) a končí u stránkování / textu "Effortless" nebo "# "
    start = text.find('Recommended')
    block = text[start:start + 20000] if start >= 0 else text
    end = re.search(r'Go to page|Effortless buying|Our Community', block)
    if end:
        block = block[:end.start()]
    prices = [float(p.replace(',', '')) for p in re.findall(r'\$\s?([\d,]+(?:\.\d+)?)', block)]
    prices = [p for p in prices if 0 < p < 100000]
    if prices:
        out['price_low'] = min(prices)
    # prodejce: "Jméno 99.8% (11,120)" — vezmeme prodejce s nejvíce recenzemi v bloku
    best = None
    for m in re.finditer(r'([A-Za-z0-9_\-\.]{3,32})\s*(?:\d{1,3}(?:\.\d)?%)\s*\(([\d,]+)\)', block):
        rv = int(m.group(2).replace(',', ''))
        if best is None or rv > best[1]:
            best = (m.group(1), rv)
    if best:
        out['top_seller'], out['reviews'] = best
    # currency stránky nemají "items found", nabídky se počítají z výskytů "/ unit" nebo "per"
    if out['listings'] is None:
        n = len(re.findall(r'\(([\d,]+)\)\s*\*?\*?\s*\$', block))
        if n:
            out['listings'] = n
    return out

def main():
    cat = json.load(open(CATALOG, encoding='utf-8'))
    try:
        hist = json.load(open(HISTORY, encoding='utf-8'))
    except Exception:
        hist = {'updated_at': None, 'series': {}}
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')

    # pořadí: nejdřív kategorie s nejstarším snímkem, jen prioritní typy
    todo = [c for c in cat if c['type'] in PRIORITY_TYPES]
    todo.sort(key=lambda c: (c.get('observed_at') or ''))
    todo = todo[:MAX_PER_RUN]

    ok = err = 0
    for c in todo:
        try:
            page = fetch(c['url'])
            d = parse(to_text(page))
            if d['price_low'] is None and d['listings'] is None:
                raise ValueError('nic nevyparsováno (Cloudflare/blok?)')
            if d['price_low'] is not None: c['price_low_usd'] = d['price_low']
            if d['listings'] is not None: c['listings'] = d['listings']
            if d['top_seller']: c['top_seller'] = d['top_seller']; c['top_seller_reviews'] = d['reviews']
            c['observed_at'] = now[:10]; c['source'] = 'eldorado.gg'; c['last_error'] = None
            hist['series'].setdefault(c['id'], []).append({'t': now, 'price': c['price_low_usd'], 'listings': c['listings'], 'reviews': c['top_seller_reviews']})
            hist['series'][c['id']] = hist['series'][c['id']][-2000:]   # strop délky řady
            ok += 1
        except (HTTPError, URLError, ValueError, TimeoutError) as e:
            c['last_error'] = f'{now}: {e.__class__.__name__}: {str(e)[:120]}'
            err += 1
        time.sleep(DELAY + random.random())
    hist['updated_at'] = now
    json.dump(cat, open(CATALOG, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    json.dump(hist, open(HISTORY, 'w', encoding='utf-8'), ensure_ascii=False)
    print(f'hotovo: ok={ok} chyb={err} celkem={len(todo)} čas={now}')
    return 0

if __name__ == '__main__':
    sys.exit(main())
