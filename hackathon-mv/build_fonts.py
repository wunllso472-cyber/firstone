"""Collect only the font files the film needs.

Chinese fonts come from @fontsource packages (split by unicode-range). This keeps just
the chunks that cover characters used in film.js and lyrics.js and writes fonts/fonts.css
plus fonts/alltext.js, which the page uses to preload every glyph before rendering.
Latin fonts are shared with ../three-years-film.

  npm i --prefix /tmp/fs @fontsource/noto-serif-sc @fontsource/noto-sans-sc @fontsource/ma-shan-zheng
  python3 build_fonts.py /tmp/fs/node_modules/@fontsource
"""
import json, os, re, shutil, sys

SRC = sys.argv[1] if len(sys.argv) > 1 else 'node_modules/@fontsource'
WANT = [('noto-serif-sc', [900]), ('noto-sans-sc', [400, 500, 700, 900]), ('ma-shan-zheng', [400])]
LATIN = [('Instrument Serif', 'italic', '400', 'InstrumentSerif-400-italic.woff2'),
         ('JetBrains Mono', 'normal', '100 800', 'JetBrainsMono-400-normal.woff2'),
         ('Inter Tight', 'normal', '100 900', 'InterTight-800-normal.woff2')]

text = open('film.js', encoding='utf-8').read() + open('lyrics.js', encoding='utf-8').read()
used = {ord(ch) for ch in text if ord(ch) > 32} | set(range(33, 127))


def ranges(spec):
    for part in spec.split(','):
        part = part.strip()[2:]
        a, _, b = part.partition('-')
        yield int(a, 16), int(b or a, 16)


os.makedirs('fonts', exist_ok=True)
for f in os.listdir('fonts'):
    if f.endswith('.woff2'): os.remove(os.path.join('fonts', f))
css = []
for pkg, weights in WANT:
    for w in weights:
        src = open(f'{SRC}/{pkg}/{w}.css').read()
        for block in re.findall(r'@font-face\s*{[^}]+}', src):
            fam = re.search(r"font-family: '([^']+)'", block).group(1)
            url = re.search(r'url\(\./files/([^)]+\.woff2)\)', block).group(1)
            ur = re.search(r'unicode-range: ([^;]+);', block).group(1)
            if not any(a <= cp <= b for a, b in ranges(ur) for cp in used): continue
            shutil.copy(f'{SRC}/{pkg}/files/{url}', f'fonts/{url}')
            css.append(f"@font-face {{ font-family: '{fam}'; font-weight: {w}; font-style: normal; src: url({url}) format('woff2'); unicode-range: {ur}; }}")
for fam, style, weight, file in LATIN:
    shutil.copy(f'../three-years-film/fonts/{file}', f'fonts/{file}')
    css.append(f"@font-face {{ font-family: '{fam}'; font-weight: {weight}; font-style: {style}; src: url({file}) format('woff2'); }}")
open('fonts/fonts.css', 'w').write('\n'.join(css) + '\n')
chars = ''.join(sorted(chr(c) for c in used))
open('fonts/alltext.js', 'w', encoding='utf-8').write('window.ALLTEXT = ' + json.dumps(chars, ensure_ascii=False) + ';\n')
size = sum(os.path.getsize('fonts/' + f) for f in os.listdir('fonts'))
print(f'{len(css)} faces, {size / 1e6:.1f} MB')
