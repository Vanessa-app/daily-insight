#!/usr/bin/env python3
"""Bundle the stage-five demo into one offline-reviewable HTML file.

The resulting file has no server dependency and uses explicitly fictional
sources. It is not a deployment or a copy of live user data.
"""
from __future__ import annotations

import pathlib
import re


ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'preview' / 'stage5.html'
DEST = ROOT / 'preview' / 'stage5-standalone.html'


def main():
    html = SOURCE.read_text(encoding='utf-8')
    css = (ROOT / 'style.css').read_text(encoding='utf-8')
    # Remote fonts are optional; the standalone preview uses fallback system fonts.
    css = re.sub(r'^@import url\([^\n]+?\);', '', css, count=1)
    js = (ROOT / 'trends.js').read_text(encoding='utf-8')
    css_tag = '<link rel="stylesheet" href="../style.css?v=trends3-stage5">'
    js_tag = '<script src="../trends.js?v=trends3-stage5" defer></script>'
    if html.count(css_tag) != 1 or html.count(js_tag) != 1:
        raise ValueError('Preview template changed: expected one CSS and JS reference')
    html = html.replace(css_tag, '<style>\n' + css + '\n</style>')
    html = html.replace(js_tag, '<script>\n' + js + '\n</script>')
    DEST.write_text(html, encoding='utf-8')
    print(f'Offline review preview: {DEST} ({DEST.stat().st_size:,} bytes)')


if __name__ == '__main__':
    main()
