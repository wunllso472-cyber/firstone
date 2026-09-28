"""Find and download freely licensed photos from Wikimedia Commons for each shot.

For every request in photo_plan.json it searches Commons, keeps only files whose license
allows reuse (CC0 / public domain / CC BY / CC BY-SA), downloads a 2560px rendition,
records author + license for on-screen credits, and writes a contact sheet per shot so
the best candidate can be picked by hand.

  python3 fetch_photos.py            # search + download candidates
  python3 fetch_photos.py --pick     # write photos.js from choices in picks.json
"""
import json, os, re, sys, html, urllib.parse, urllib.request

API = 'https://commons.wikimedia.org/w/api.php'
UA = 'ThreeYearsDocumentary/2.0 (educational video render; python-urllib)'
OK_LICENSE = re.compile(r'^(cc0|public domain|pd|cc by(-sa)? ?\d(\.\d)?( [a-z]+)?)', re.I)
BAD = re.compile(r'\b(nc|nd|non-?commercial|no ?deriv|fair use|copyrighted)\b', re.I)
os.makedirs('photos/cand', exist_ok=True)

def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()

def clean(s):
    s = re.sub(r'<[^>]+>', '', html.unescape(s or ''))
    return re.sub(r'\s+', ' ', s).strip()

def search(query, limit=14, min_w=1400):
    params = {
        'action': 'query', 'format': 'json', 'generator': 'search', 'gsrnamespace': 6,
        'gsrsearch': f'{query} filetype:bitmap', 'gsrlimit': limit,
        'prop': 'imageinfo', 'iiprop': 'url|size|mime|extmetadata', 'iiurlwidth': 2560,
    }
    data = json.loads(get(API + '?' + urllib.parse.urlencode(params)))
    out = []
    for page in (data.get('query', {}).get('pages', {}) or {}).values():
        ii = (page.get('imageinfo') or [{}])[0]
        md = ii.get('extmetadata', {})
        lic = clean(md.get('LicenseShortName', {}).get('value', ''))
        if not lic or BAD.search(lic) or not OK_LICENSE.search(lic): continue
        if ii.get('width', 0) < min_w or ii.get('mime') not in ('image/jpeg', 'image/png'): continue
        out.append({
            'title': page['title'], 'url': ii.get('thumburl') or ii['url'], 'w': ii['width'], 'h': ii['height'],
            'license': lic, 'licenseUrl': clean(md.get('LicenseUrl', {}).get('value', '')),
            'artist': clean(md.get('Artist', {}).get('value', ''))[:80] or 'Unknown',
            'page': ii.get('descriptionurl', ''), 'index': page.get('index', 99),
        })
    return sorted(out, key=lambda c: c['index'])

def fetch_all():
    plan = json.load(open('photo_plan.json'))
    found = {}
    for key, spec in plan.items():
        cands = []
        for q in spec['queries']:
            try: cands += search(q)
            except Exception as e: print('  search failed', q, e)
        seen, uniq = set(), []
        for c in cands:
            if c['title'] not in seen: seen.add(c['title']); uniq.append(c)
        uniq = uniq[:spec.get('keep', 6)]
        for i, c in enumerate(uniq):
            fn = f'photos/cand/{key}_{i}.jpg'
            if not os.path.exists(fn):
                try: open(fn, 'wb').write(get(c['url']))
                except Exception as e: print('  download failed', c['title'], e); continue
            c['file'] = fn
        found[key] = [c for c in uniq if 'file' in c]
        print(f'{key:14s} {len(found[key])} candidates')
    json.dump(found, open('photos/candidates.json', 'w'), indent=1)

def write_photos_js():
    cands = json.load(open('photos/candidates.json'))
    picks = json.load(open('picks.json'))
    out = {}
    for key, p in picks.items():
        c = cands[key][p['i']]
        out[key] = {'src': c['file'], 'focus': p.get('focus', [0.5, 0.4]),
                    'credit': f"{c['artist']} · {c['license']} · Wikimedia Commons", 'page': c['page']}
    open('photos.js', 'w').write('window.PHOTOS = ' + json.dumps(out, indent=1) + ';\n')
    print('photos.js written with', len(out), 'photos')

if __name__ == '__main__':
    write_photos_js() if '--pick' in sys.argv else fetch_all()
