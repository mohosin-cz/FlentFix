#!/usr/bin/env python3
"""Flent Holy Grail CSV → one SQL file for Pulse.

Reads a CSV export of the Holy Grail sheet's Properties tab and writes a SQL
file that hands, per PID, these and nothing else to holy_grail_ingest():
  property name · units · flat number · floor · Google Maps link · landlord name
  · the street address behind the map link, and its coordinates

    python3 scripts/holy-grail-import.py "Flent Holy Grail - Properties.csv" out.sql
    supabase db query --linked --project-ref pjetqnlvyuuejcuvkare -f out.sql

The address: each short map link is expanded (one request to Google). When the
place it points at is a full address it is used as is; when it is only a
building name or a pin, the coordinates are looked up in OpenStreetMap
(Nominatim — free, one request a second, so only links not already in the
cache are looked up). Results are cached in scripts/.holy-grail-geo.json
(git-ignored), so a nightly run only resolves new or changed links.
Pass --no-geo to skip address lookup entirely.
"""
import csv
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

COLUMNS = {                      # sheet header → field Pulse expects
    'PID': 'pid',
    'Property Name': 'property_name',
    'Units': 'units',
    'Apartment #': 'flat_no',
    'Floor #': 'floor',
    'Location': 'maps_url',
    'Landlord Name': 'landlord_name',
}
CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.holy-grail-geo.json')
UA = 'FlentPulse-holy-grail-import/1.0'


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


def expand(url):
    """Follow a maps.app.goo.gl short link one hop; return the long URL."""
    if 'google.com/maps' in url or 'maps.google.com' in url:
        return url
    opener = urllib.request.build_opener(NoRedirect)
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        opener.open(req, timeout=15)
    except urllib.error.HTTPError as e:
        if e.code in (301, 302, 303, 307, 308):
            return e.headers.get('Location') or ''
        return ''
    except Exception:
        return ''
    return ''


def parse_long(url):
    """→ (place_text or '', lat or None, lng or None) from a long Google Maps URL.
    Shapes seen in the sheet: /maps/place/<place>/…!3d<lat>!4d<lng>,
    /maps/search/<lat>,+<lng>, maps.google.com/?q=<address>, and
    /maps/search/?api=1&query=<lat>,<lng>."""
    place, lat, lng = '', None, None
    coords = re.compile(r'^\s*(-?\d+\.\d+)\s*,\s*\+?\s*(-?\d+\.\d+)\s*$')
    m = re.search(r'/maps/place/([^/?]+)', url)
    if m:
        place = PLUS_CODE.sub('', urllib.parse.unquote_plus(m.group(1)).strip())
    m = re.search(r'/maps/search/([^/?]+)', url)
    if m and not place:
        t = urllib.parse.unquote_plus(m.group(1))
        c = coords.match(t)
        if c:
            lat, lng = float(c.group(1)), float(c.group(2))
        else:
            place = PLUS_CODE.sub('', t.strip())
    qs = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
    for key in ('q', 'query'):
        if key in qs and not place and lat is None:
            t = qs[key][0]
            c = coords.match(t)
            if c:
                lat, lng = float(c.group(1)), float(c.group(2))
            else:
                place = PLUS_CODE.sub('', t.strip())
    if lat is None:
        m = re.search(r'!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)', url) or re.search(r'@(-?\d+\.\d+),(-?\d+\.\d+)', url)
        if m:
            lat, lng = float(m.group(1)), float(m.group(2))
    return place, lat, lng


def is_full_address(place):
    # an address has a 6-digit Indian pincode, or at least three comma parts
    return bool(re.search(r'\b[1-9]\d{5}\b', place)) or place.count(',') >= 3


def reverse(lat, lng):
    """Street address for a pin, in the same short shape Google uses:
    road, area, city, state pincode."""
    q = urllib.parse.urlencode({'format': 'jsonv2', 'lat': lat, 'lon': lng, 'zoom': 18, 'addressdetails': 1})
    req = urllib.request.Request('https://nominatim.openstreetmap.org/reverse?' + q, headers={'User-Agent': UA})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            a = (json.load(r) or {}).get('address', {})
    except Exception:
        return ''
    road = ' '.join(x for x in (a.get('house_number'), a.get('road')) if x)
    area = a.get('neighbourhood') or a.get('quarter') or a.get('suburb') or a.get('residential')
    city = a.get('city') or a.get('town') or a.get('village') or a.get('county')
    if city and 'City Corporation' in city:
        city = 'Bengaluru'
    tail = ' '.join(x for x in (a.get('state'), a.get('postcode')) if x)
    parts = [x for x in (road, area, city, tail) if x]
    return ', '.join(dict.fromkeys(parts))


PLUS_CODE = re.compile(r'^[23456789CFGHJMPQRVWX]{4,8}[+ ][23456789CFGHJMPQRVWX]{2,3}\s+')


def resolve(url, cache, stats):
    """→ {address, lat, lng, source} for a map link; cached by URL."""
    if not url:
        return {}
    if url in cache:
        stats['cached'] += 1
        return cache[url]
    long_url = expand(url)
    place, lat, lng = parse_long(long_url) if long_url else ('', None, None)
    out = {'lat': lat, 'lng': lng, 'address': '', 'source': ''}
    if place and is_full_address(place):
        out.update(address=place, source='google_place')
        stats['google'] += 1
    elif lat is not None:
        time.sleep(1.1)                       # Nominatim: at most one request a second
        addr = reverse(lat, lng)
        if addr:
            # keep the building name Google gave, ahead of OSM's street address
            name = place if place and not re.match(r'^[\d°\'".NSEW\s+-]+$', place) else ''
            out.update(address=(name + ', ' + addr) if name and name.lower() not in addr.lower() else addr, source='osm')
            stats['osm'] += 1
        else:
            out.update(address=place, source='google_name' if place else '')
            stats['failed'] += 1
    else:
        stats['failed'] += 1
    cache[url] = out
    return out


def main(src, dst, geo=True):
    with open(src, encoding='utf-8-sig', newline='') as f:
        rows = list(csv.reader(f))
    try:
        h = next(i for i, r in enumerate(rows) if r and r[0].strip() == 'PID')
    except StopIteration:
        sys.exit('No header row with "PID" in the first column — is this the Properties tab?')
    header = [' '.join(c.split()) for c in rows[h]]
    idx = {field: header.index(col) for col, field in COLUMNS.items() if col in header}
    missing = [col for col in COLUMNS if col not in header]
    if 'pid' not in idx:
        sys.exit('No PID column.')

    cache = {}
    if geo and os.path.exists(CACHE):
        with open(CACHE) as f:
            cache = json.load(f)
    stats = {'cached': 0, 'google': 0, 'osm': 0, 'failed': 0}

    out, skipped, seen = [], [], set()
    for n, r in enumerate(rows[h + 1:], start=h + 2):
        pid = r[idx['pid']].strip() if len(r) > idx['pid'] else ''
        if not pid:
            continue
        if pid in seen:
            skipped.append((n, pid, 'duplicate PID — first one kept'))
            continue
        seen.add(pid)
        row = {f: (r[i].strip() if len(r) > i else '') for f, i in idx.items()}
        if geo and row.get('maps_url'):
            g = resolve(row['maps_url'], cache, stats)
            row['address_text'] = PLUS_CODE.sub('', g.get('address', '') or '')
            row['lat'] = g.get('lat')
            row['lng'] = g.get('lng')
            row['address_source'] = g.get('source', '')
        out.append(row)

    if geo:
        with open(CACHE, 'w') as f:
            json.dump(cache, f, ensure_ascii=False, indent=0)

    payload = json.dumps(out, ensure_ascii=False)
    tag = '$hg$'
    if tag in payload:
        sys.exit('Payload contains the quoting tag; refusing to write.')
    with open(dst, 'w', encoding='utf-8') as f:
        f.write('-- generated by scripts/holy-grail-import.py from ' + src.split('/')[-1] + '\n')
        f.write(f'select public.holy_grail_ingest({tag}{payload}{tag}::jsonb) as result;\n')

    print(f'{len(out)} properties written to {dst}')
    if geo:
        print(f"addresses: {stats['cached']} from cache · {stats['google']} full address in the map link · "
              f"{stats['osm']} looked up on OpenStreetMap · {stats['failed']} unresolved")
    if missing:
        print('Columns not found (sent empty):', ', '.join(missing))
    for n, pid, why in skipped:
        print(f'  row {n} · PID {pid} · {why}')


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if len(args) != 2:
        sys.exit(__doc__)
    main(args[0], args[1], geo='--no-geo' not in sys.argv)
