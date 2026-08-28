#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Přepočte výdělkové metody z AKTUÁLNÍCH cen a uloží snímek do data/earnings.json.

Web si to počítá i sám v prohlížeči (aby bylo číslo vždy čerstvé), tenhle skript
navíc zapisuje historii: díky ní je vidět, jak se pořadí "co vydělává nejvíc"
mění v čase, a co dělá meta v jednotlivých hrách.

Spouští se hned po update.py ve stejném běhu robota.
"""
import json, os, re, sys
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = lambda n: os.path.join(ROOT, 'data', n)
load = lambda n, d: json.load(open(D(n), encoding='utf-8')) if os.path.exists(D(n)) else d

MAG = {'k':1e3,'tis':1e3,'m':1e6,'mil':1e6,'b':1e9,'mld':1e9,'bil':1e9,'t':1e12}
SYN = {'gp':'gold','gold':'gold','zlat':'gold','meso':'meso','mesos':'meso','noah':'noah','gb':'noah',
       'coin':'coin','coins':'coin','isk':'isk','plat':'platinum','platinum':'platinum',
       'kredit':'credit','credits':'credit','credit':'credit','silver':'silver',
       'kamas':'kamas','yang':'yang','flux':'flux','money':'money','gil':'gil','pansun':'pansun',
       'rubl':'rouble','roubles':'rouble','caps':'cap','cap':'cap','auec':'auec','alloy':'alloy',
       'lucent':'lucent','rune':'rune','runes':'rune','gem':'gem','gems':'gem','token':'token',
       'tokens':'token','robux':'robux','divine':'divine','lock':'lock'}

def norm(w):
    if not w: return ''
    w = re.sub(r'[^a-záčďéěíňóřšťúůýž]', '', w.lower())
    if w in SYN: return SYN[w]
    for k, v in SYN.items():
        if w.startswith(k): return v
    return re.sub(r'(ů|y|u|e|a)$', '', w)

def parse_rate(m):
    if m.get('rate_value') is None or not m.get('rate_unit'): return None
    u = str(m['rate_unit']).lower()
    if re.search(r'nenalezeno|variabiln|claim|odhad|rng|dle |bonus|recenz|nabíd|%', u): return None
    per = 'h' if re.search(r'/\s*(h|hod|hour|hr)\b', u) else \
          'den' if re.search(r'/\s*(den|day)\b', u) else \
          'týden' if re.search(r'/\s*(týden|tyden|week)\b', u) else None
    if not per: return None
    head = u.split('/')[0]
    mm = re.search(r'(?:^|\s)(mld|bil|mil|tis|[kmbt])\s', head)
    mag = MAG.get(mm.group(1), 1) if mm else 1
    words = [w for w in re.sub(r'[0-9]|\b(mld|bil|mil|tis|[kmbt])\b', ' ', head).split() if len(w) > 1]
    return {'units': m['rate_value'] * mag, 'per': per, 'base': norm(words[0] if words else '')}

def hours_in(per, afk):
    if per == 'h': return 1
    passive = (afk or 0) >= 4
    return (24 if passive else 8) if per == 'den' else (168 if passive else 40)

def main():
    cat = load('catalog.json', [])
    units = load('units.json', {})
    methods = load('methods.json', [])
    games = {g['id']: g['name'] for g in load('games.json', [])}
    hist = load('earnings.json', {'updated_at': None, 'snapshots': [], 'series': {}})
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')

    prices = {}
    for c in cat:
        u = units.get(c['id'])
        if not u or c.get('price_low_usd') is None: continue
        prices.setdefault(c['game_id'], []).append(
            {'cat': c, 'base': norm(u['base']), 'unit_price': c['price_low_usd'] / u['per']})

    rows = []
    for m in methods:
        r = parse_rate(m)
        if not r or not r['base']: continue
        opts = prices.get(m['game_id'])
        if not opts: continue
        pick = next((o for o in opts if o['base'] == r['base']), None)
        if not pick: continue
        uph = r['units'] / hours_in(r['per'], m.get('afk_score'))
        usd = uph * pick['unit_price'] * (1 - (pick['cat'].get('fee_pct') or 0) / 100)
        if usd <= 0: continue
        rows.append({'game_id': m['game_id'], 'game': games.get(m['game_id'], '?'),
                     'method': m['method'], 'usd_per_hour': round(usd, 4),
                     'units_per_hour': round(uph, 2), 'base': r['base'],
                     'price': pick['cat']['price_low_usd'], 'unit': pick['cat'].get('unit'),
                     'afk': m.get('afk_score')})
    rows.sort(key=lambda x: -x['usd_per_hour'])

    # historie: pro každou metodu časová řada $/h, ať je vidět posun mety
    for r in rows:
        key = r['game_id'] + '|' + r['method']
        s = hist['series'].setdefault(key, [])
        if not s or s[-1]['usd'] != r['usd_per_hour']:
            s.append({'t': now, 'usd': r['usd_per_hour']})
        hist['series'][key] = s[-500:]
    hist['snapshots'] = (hist.get('snapshots', []) + [{'t': now, 'top': rows[:20]}])[-200:]
    hist['updated_at'] = now
    hist['current'] = rows
    json.dump(hist, open(D('earnings.json'), 'w', encoding='utf-8'), ensure_ascii=False)

    print(f'earnings: {len(rows)} metod s živým $/h, nejvyšší '
          f'${rows[0]["usd_per_hour"]:.2f}/h ({rows[0]["game"]} – {rows[0]["method"]})' if rows else 'earnings: 0')
    return 0

if __name__ == '__main__':
    sys.exit(main())
