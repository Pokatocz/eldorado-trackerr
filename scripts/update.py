#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Aktualizátor Eldorado trackeru.

Co dělá při každém běhu:
 1) projde kategorie z data/catalog.json (všech 6 typů, nejdřív ty s nejstaršími daty),
 2) z každé stránky vyparsuje: počet nabídek, nejnižší cenu, top prodejce a jeho recenze,
 3) navíc uloží až 24 jednotlivých NABÍDEK (název položky, cena, prodejce) do data/listings.json
    -> z toho web skládá "živé ceny položek" u každé hry,
 4) zapíše časovou řadu do data/history.json.

Když Eldorado stránku zablokuje, zůstane poslední známá hodnota a zapíše se chyba (web ji ukáže).
Žádné boty ve hrách - skript jen čte veřejné stránky.
"""
import json, re, time, sys, os, html, random
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = lambda n: os.path.join(ROOT, 'data', n)
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'
MAX_PER_RUN = int(os.environ.get('MAX_PER_RUN', '190'))
DELAY = float(os.environ.get('DELAY', '1.8'))
TYPES = ['currency', 'items', 'accounts', 'boosting', 'topups', 'giftcards']
MAX_LISTINGS = 40          # kolik nabídek si u kategorie pamatovat
HISTORY_CAP = 2000         # max bodů v jedné časové řadě

def fetch(url):
    req = Request(url, headers={'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', 'Accept': 'text/html'})
    with urlopen(req, timeout=30) as r:
        return r.read().decode('utf-8', 'ignore')

def to_text(h):
    h = re.sub(r'<script.*?</script>|<style.*?</style>', ' ', h, flags=re.S | re.I)
    h = re.sub(r'<[^>]+>', ' ', h)
    return html.unescape(re.sub(r'\s+', ' ', h))

# Jedna nabídka na stránce vypadá zhruba takto:
#   "<popis položky> <Prodejce> 99.9% (143,204) $2.90 / unit 20 min"
OFFER = re.compile(
    r'([A-Za-z0-9_\-\.\'\| ]{2,90}?)\s+'        # popis položky (zleva ořízneme níže)
    r'([A-Za-z0-9_\-\.]{3,32})\s+'               # prodejce
    r'(\d{1,3}(?:\.\d)?)%\s*\(([\d,]+)\)\s*'    # rating a počet recenzí
    r'\$\s?([\d,]+(?:\.\d+)?)'                   # cena
)
# Ořez smetí, které se do názvu připojí zleva z konce předchozí nabídky
# (typicky "... / unit 20 min", "Recommended", "Instant").
JUNK_WORDS = ('recommended', 'min', 'unit', 'instant', 'hours', 'hour', 'days', 'day', 'm', 'k', 'b')

def clean_name(raw):
    words = re.sub(r'\s+', ' ', raw).strip(' |-/').split(' ')
    while words and words[0].strip('/').lower() in JUNK_WORDS or (words and words[0].isdigit()):
        words.pop(0)
    return ' '.join(words).strip(' |-/')

def parse(text):
    """Vrátí souhrn kategorie + seznam jednotlivých nabídek."""
    out = {'listings': None, 'price_low': None, 'price_featured': None, 'top_seller': None, 'reviews': None, 'offers': []}
    m = re.search(r'([\d,]+)\s+items? found', text)
    if m:
        out['listings'] = int(m.group(1).replace(',', ''))
    start = text.find('Recommended')
    block = text[start:start + 30000] if start >= 0 else text
    end = re.search(r'Go to page|Effortless buying|Our Community', block)
    if end:
        block = block[:end.start()]

    for mm in OFFER.finditer(block):
        name = clean_name(mm.group(1))
        price = float(mm.group(5).replace(',', ''))
        if not (0 < price < 100000):
            continue
        out['offers'].append({
            'name': name[:70] or None,
            'seller': mm.group(2),
            'rating': float(mm.group(3)),
            'reviews': int(mm.group(4).replace(',', '')),
            'price': price,
        })
        if len(out['offers']) >= MAX_LISTINGS:
            break

    # POZOR: Eldorado řadí podle "Recommended", takže první (featured) nabídka
    # často NENÍ nejlevnější. Bereme proto minimum ze všech rozparsovaných nabídek,
    # a teprve když se žádná neparsuje, spadneme na hrubý sken cen na stránce.
    if out['offers']:
        out['price_low'] = min(o['price'] for o in out['offers'])
        out['price_featured'] = out['offers'][0]['price']
    else:
        prices = [float(p.replace(',', '')) for p in re.findall(r'\$\s?([\d,]+(?:\.\d+)?)', block)]
        prices = [p for p in prices if 0 < p < 100000]
        if prices:
            out['price_low'] = min(prices)
    best = None
    for mm in re.finditer(r'([A-Za-z0-9_\-\.]{3,32})\s*(?:\d{1,3}(?:\.\d)?%)\s*\(([\d,]+)\)', block):
        rv = int(mm.group(2).replace(',', ''))
        if best is None or rv > best[1]:
            best = (mm.group(1), rv)
    if best:
        out['top_seller'], out['reviews'] = best
    if out['listings'] is None and out['offers']:
        out['listings'] = len(out['offers'])
    return out

def load(name, default):
    try:
        return json.load(open(D(name), encoding='utf-8'))
    except Exception:
        return default

def main():
    cat = load('catalog.json', [])
    hist = load('history.json', {'updated_at': None, 'series': {}})
    lst = load('listings.json', {'updated_at': None, 'by_category': {}})
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')

    todo = [c for c in cat if c['type'] in TYPES]
    todo.sort(key=lambda c: (c.get('observed_at') or ''))
    todo = todo[:MAX_PER_RUN]

    ok = err = offers_total = 0
    for c in todo:
        try:
            d = parse(to_text(fetch(c['url'])))
            if d['price_low'] is None and d['listings'] is None:
                raise ValueError('nic nevyparsováno (Cloudflare/blok?)')
            if d['price_low'] is not None: c['price_low_usd'] = d['price_low']
            if d.get('price_featured') is not None: c['price_featured_usd'] = d['price_featured']
            if d['listings'] is not None:  c['listings'] = d['listings']
            if d['top_seller']:
                c['top_seller'] = d['top_seller']; c['top_seller_reviews'] = d['reviews']
            c['observed_at'] = now[:10]; c['source'] = 'eldorado.gg'; c['last_error'] = None
            if d['offers']:
                lst['by_category'][c['id']] = {'t': now, 'offers': d['offers']}
                offers_total += len(d['offers'])
            s = hist['series'].setdefault(c['id'], [])
            s.append({'t': now, 'price': c['price_low_usd'], 'listings': c['listings'], 'reviews': c['top_seller_reviews']})
            hist['series'][c['id']] = s[-HISTORY_CAP:]
            ok += 1
        except (HTTPError, URLError, ValueError, TimeoutError) as e:
            c['last_error'] = f'{now}: {e.__class__.__name__}: {str(e)[:120]}'
            err += 1
        time.sleep(DELAY + random.random())

    hist['updated_at'] = now
    lst['updated_at'] = now
    json.dump(cat,  open(D('catalog.json'),  'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    json.dump(hist, open(D('history.json'),  'w', encoding='utf-8'), ensure_ascii=False)
    json.dump(lst,  open(D('listings.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    print(f'hotovo: ok={ok} chyb={err} nabídek={offers_total} z {len(todo)} kategorií, čas={now}')
    return 0

if __name__ == '__main__':
    sys.exit(main())
