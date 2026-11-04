import hashlib, json, os, re, subprocess, sys, zipfile, secrets, time, collections

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.dirname(os.path.dirname(HERE))
SD = SRC + '/server-data'
args = sys.argv[1:]
MANIFEST = args[args.index('--manifest') + 1] if '--manifest' in args else None
if MANIFEST: del args[args.index('--manifest'):args.index('--manifest') + 2]
OUT = args[0] if args else '-'
DRY = OUT == '-'
ROOT = 'server-data/'
HELPER = os.path.join(HERE, 'helper.mjs')

proc = subprocess.Popen(['node', HELPER], cwd=HERE, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, encoding='utf-8', bufsize=1)
_id = [0]
def node(op, **kw):
    _id[0] += 1
    proc.stdin.write(json.dumps({'id': _id[0], 'op': op, **kw}) + '\n'); proc.stdin.flush()
    r = json.loads(proc.stdout.readline())
    if 'error' in r: raise ValueError(r['error'])
    return r

def remove_ranges(text, ranges):
    merged = []
    for s, e in sorted(ranges):
        if merged and s < merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], e)
        elif merged and '\n' not in text[merged[-1][1]:s] and not text[merged[-1][1]:s].strip():
            merged[-1][1] = e
        else:
            merged.append([s, e])
    out = []; cur = 0
    for s, e in merged:
        if s < cur: continue
        ls = text.rfind('\n', 0, s) + 1
        eol = text.find('\n', e)
        if eol < 0: eol = len(text)
        before_full = text[ls:s]; after = text[e:eol]
        if not before_full.strip(' \t') and not after.strip(' \t\r'):
            out.append(text[cur:ls]); cur = min(eol + 1, len(text))
        elif not after.strip(' \t\r'):
            out.append(text[cur:s].rstrip(' \t')); cur = e
        else:
            out.append(text[cur:s])
            if s > 0 and e < len(text) and not text[s-1].isspace() and not text[e].isspace(): out.append(' ')
            cur = e
    out.append(text[cur:])
    return ''.join(out)

LUA_RX = re.compile(r'''--\[(=*)\[|--[^\n]*|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\\n])*`|\[(=*)\[''', re.S)
def lua_ranges(t):
    rs = []; pos = 0
    while True:
        m = LUA_RX.search(t, pos)
        if not m: break
        s = m.group(0)
        if s.startswith('--[') and m.group(1) is not None:
            close = ']' + m.group(1) + ']'
            k = t.find(close, m.end()); end = len(t) if k < 0 else k + len(close)
            rs.append((m.start(), end)); pos = end
        elif s.startswith('--'):
            end = m.end()
            if t[end-1] == '\r': end -= 1
            rs.append((m.start(), end)); pos = m.end()
        elif s.startswith('[') and m.group(2) is not None:
            close = ']' + m.group(2) + ']'
            k = t.find(close, m.end()); pos = len(t) if k < 0 else k + len(close)
        else:
            pos = m.end()
    return rs

CSS_RX = re.compile(r'''/\*.*?\*/|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|url\(\s*[^'")\s][^)]*\)''', re.S)
def css_ranges(t):
    return [(m.start(), m.end()) for m in CSS_RX.finditer(t) if m.group(0).startswith('/*')]

SQL_RX = re.compile(r'''"(?:\\.|""|[^"\\])*"|'(?:\\.|''|[^'\\])*'|`[^`]*`|--(?=[ \t\r\n]|$)[^\n]*|\#[^\n]*|/\*(?![!+]|M!).*?\*/''', re.S)
def sql_ranges(t):
    out = []
    for m in SQL_RX.finditer(t):
        s = m.group(0)
        if s[0] in '"\'`': continue
        e = m.end()
        if t[e-1:e] == '\r': e -= 1
        out.append((m.start(), e))
    return out

XML_RX = re.compile(r'<!\[CDATA\[.*?\]\]>|<!--.*?-->', re.S)
def xml_ranges(t):
    return [(m.start(), m.end()) for m in XML_RX.finditer(t) if m.group(0).startswith('<!--')]

HTML_RX = re.compile(r'<!--.*?-->|<script\b([^>]*)>(.*?)</script\s*>|<style\b[^>]*>(.*?)</style\s*>', re.S | re.I)
def strip_html(t):
    rs = []; repl = []
    for m in HTML_RX.finditer(t):
        g = m.group(0)
        if g.startswith('<!--'):
            rs.append((m.start(), m.end()))
        elif g[:7].lower() == '<script':
            attrs = m.group(1) or ''
            ty = re.search(r'type\s*=\s*["\']?([^"\'\s>]+)', attrs, re.I)
            if (not ty or ty.group(1).lower() in ('module', 'text/javascript', 'application/javascript')) and m.group(2).strip():
                try: repl.append((m.start(2), m.end(2), node('strip', text=m.group(2), ext='.js')['text']))
                except ValueError: pass
        else:
            body = m.group(3)
            repl.append((m.start(3), m.end(3), remove_ranges(body, css_ranges(body))))
    for s, e, new in sorted(repl, reverse=True):
        t = t[:s] + new + t[e:]
    # offsets in rs were taken before inline replacements; recompute on the new text
    return remove_ranges(t, [(m.start(), m.end()) for m in re.finditer(r'<!--.*?-->', t, re.S)]) if rs else t

def cfg_strip(t, hash_only=False):
    out = []; mid = 0
    for line in t.split('\n'):
        cr = line.endswith('\r'); body = line[:-1] if cr else line
        q = None; cut = None; i = 0
        while i < len(body):
            c = body[i]
            if q:
                if c == '\\' : i += 2; continue
                if c == q: q = None
            elif c == '"' or (c == "'" and hash_only): q = c
            elif c == '#' and (i == 0 or body[i-1] in ' \t'): cut = i; break
            elif not hash_only and c == '/' and body.startswith('//', i) and (i == 0 or body[i-1] in ' \t'): cut = i; break
            i += 1
        if cut is not None:
            rest = body[:cut].rstrip()
            if not rest: continue
            mid += 1; body = rest
        out.append(body + ('\r' if cr else ''))
    return '\n'.join(out), mid

PEPPER_RX = re.compile(r'(\w*Pepper\s*=\s*)"[0-9a-fA-F]{16,}"')

DOC_NAME = re.compile(r'^(readme|changelog|changes|license|licence|notice|copying|authors|contributing|security|code_of_conduct|history)(\..*)?$', re.I)
DROP_EXT = {'.md', '.markdown', '.rst', '.map', '.log', '.pid'}
DROP_NAME = {'.ds_store', 'thumbs.db', '.replxx_history', '.console-history', '.gitignore', '.gitattributes', '.gitkeep', '.editorconfig'}
DROP_DIRS = {'node_modules', '.git', '.github', 'cache', 'txdata', 'db'}
STORE_EXT = {'.png', '.jpg', '.jpeg', '.webp', '.gif', '.ogg', '.mp3', '.webm', '.mp4', '.woff', '.woff2', '.zip', '.gz', '.node'}
TS_EXT = {'.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.mts', '.cts'}

stats = collections.Counter(); problems = []; midcfg = []; luaunv = collections.Counter()

def transform(rel, path, ext, skip_strip):
    """Returns bytes or None for unchanged raw copy."""
    if skip_strip: return None
    if ext not in TS_EXT | {'.lua', '.css', '.html', '.htm', '.xml', '.meta', '.sql', '.cfg', '.yml', '.yaml'}:
        return None
    raw = open(path, 'rb').read()
    try: text = raw.decode('utf-8')
    except UnicodeDecodeError:
        stats['skipped_nonutf8'] += 1; return None
    bom = text.startswith('﻿')
    if bom: text = text[1:]
    try:
        if ext in TS_EXT:
            new = node('strip', text=text, ext=ext)['text']
        elif ext == '.lua':
            new = remove_ranges(text, lua_ranges(text))
            v = node('lua_verify', orig=text, text=new)['status']
            luaunv[v] += 1
            if v in ('mismatch', 'broken'): raise ValueError('lua verify ' + v)
        elif ext == '.css': new = remove_ranges(text, css_ranges(text))
        elif ext in ('.html', '.htm'): new = strip_html(text)
        elif ext in ('.xml', '.meta'): new = remove_ranges(text, xml_ranges(text))
        elif ext == '.sql': new = remove_ranges(text, sql_ranges(text))
        elif ext == '.cfg':
            new, mid = cfg_strip(text)
            if mid: midcfg.append((rel, mid))
        else:
            new, _ = cfg_strip(text, hash_only=True)
    except Exception as ex:
        problems.append((rel, str(ex)[:100])); stats['strip_failed_kept_raw'] += 1
        return None
    if ext in ('.lua', '.css', '.sql', '.xml', '.meta'):
        rs = {'.lua': lua_ranges, '.css': css_ranges, '.sql': sql_ranges, '.xml': xml_ranges, '.meta': xml_ranges}[ext](text)
        kept = remove_ranges(text, [])
        flat = lambda x: re.sub(r'\s+', '', x)
        pieces = []; cur = 0
        for a, b in sorted(rs):
            pieces.append(text[cur:a]); cur = b
        pieces.append(text[cur:])
        if flat(''.join(pieces)) != flat(new):
            problems.append((rel, 'remainder mismatch')); stats['strip_failed_kept_raw'] += 1; return None
    if rel.endswith('sky_phone/source/shared/config_default.lua'):
        new = PEPPER_RX.sub(r'\1""', new)
    if new == text: return None
    stats['stripped'] += 1
    return (('﻿' if bom else '') + new).encode('utf-8')

def walk():
    for dp, dn, fn in os.walk(SD, followlinks=False):
        rel_dir = os.path.relpath(dp, SD)
        dn[:] = sorted(d for d in dn if d.lower() not in DROP_DIRS and not d.endswith('.pre-game-mount'))
        top = rel_dir.split(os.sep)
        skip_strip = 'corevia_ac' in top or any(
            os.path.exists(os.path.join(SD, *top[:j], '.fxap')) for j in range(1, len(top) + 1) if top[0] != '.')
        for f in sorted(fn):
            lf = f.lower(); ext = os.path.splitext(lf)[1]
            if lf in DROP_NAME or ext in DROP_EXT or DOC_NAME.match(f): stats['dropped'] += 1; continue
            if rel_dir == '.' and lf in ('secrets.cfg', 'secrets.cfg.example', 'server.cfg'): continue
            if rel_dir == '.' and ext in ('.cfg',) : continue
            p = os.path.join(dp, f)
            if not os.path.isfile(p) or os.path.islink(p): continue
            yield os.path.relpath(p, SD), p, ext, skip_strip

def snapshot_cfg():
    t = open(SRC + '/snapshots/server.cfg.sanitized', encoding='utf-8').read()
    t, _ = cfg_strip(t)
    drop = re.compile(r'^\s*(endpoint_add_(tcp|udp)\b|set corevia_token\b|set corevia_api_url\b|sets? ?onesync|set onesync)', re.I)
    lines = [l for l in t.split('\n') if not drop.match(l)]
    s = '\n'.join(lines)
    s = s.replace('sv_hostname "Florida Bay Roleplay"', 'sv_hostname "Florida Bay Roleplay DEV"')
    s = s.replace('sets sv_projectName "Florida Bay Roleplay"', 'sets sv_projectName "Florida Bay Roleplay DEV"')
    s = re.sub(r'(ensure fbrp_core\n)', r'\1ensure fbrp_multichar\nensure fbrp_dpclothing\n', s, 1)
    s = re.sub(r'(ensure \[eup\]\n)', r'\1ensure paradise_vehmenu\nexec config/phone.cfg\n', s, 1)
    s = s.rstrip('\n') + '\n'
    s = s.replace('ensure corevia_ac', 'set corevia_api_url ""\nset corevia_token ""\nensure corevia_ac')
    return s

HASHED_EXT = TS_EXT | {'.lua', '.css', '.html', '.htm', '.xml', '.meta', '.sql', '.cfg', '.yml', '.yaml', '.json', '.txt', '.vue', '.jst', '.def', '.rel', '.flow', '.lock', '.example'}
def manifest_entry(p, ext, data):
    if ext in HASHED_EXT:
        raw = data if data is not None else open(p, 'rb').read()
        return {'size': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
    return {'size': os.path.getsize(p)}

def secrets_cfg():
    r = lambda: secrets.token_hex(32)
    return '\n'.join([
        'set mysql_connection_string "mysql://DB_USER:DB_PASSWORD@DB_HOST:3306/DB_NAME?charset=utf8mb4"',
        'set fbrp_serviceToken ""',
        'set fbrp_discordInvite "https://discord.gg/floridabay"',
        'set fbrp_mainGuild ""',
        'set sky_phone_passcode_pepper "%s"' % r(),
        'set sky_phone_crewlink_pepper "%s"' % r(),
        'set sky_phone_fliptok_pepper "%s"' % r(),
        'set sky_phone_picstagram_pepper "%s"' % r(),
        'set sky_phone_fivemanage_token ""', ''])

def main():
    zf = None if DRY else zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=3, allowZip64=True)
    def put_bytes(name, data):
        if zf: zf.writestr(zipfile.ZipInfo(ROOT + name, (2026, 10, 23, 0, 0, 0)), data, zipfile.ZIP_DEFLATED)
    put_bytes('server.cfg', snapshot_cfg().encode()); put_bytes('secrets.cfg', secrets_cfg().encode())
    n = 0; t0 = time.time(); changed = []; manifest = {}
    for rel, p, ext, skip in walk():
        n += 1
        data = transform(rel, p, ext, skip)
        if data is not None: changed.append(rel)
        if MANIFEST: manifest[rel.replace(os.sep, '/')] = manifest_entry(p, ext, data)
        if zf:
            zi = zipfile.ZipInfo.from_file(p, ROOT + rel)
            zi.compress_type = zipfile.ZIP_STORED if ext in STORE_EXT else zipfile.ZIP_DEFLATED
            zi._compresslevel = 3
            if data is not None:
                zi.file_size = len(data); zf.writestr(zi, data)
            else:
                with open(p, 'rb') as src, zf.open(zi, 'w', force_zip64=True) as dst:
                    while True:
                        b = src.read(1 << 20)
                        if not b: break
                        dst.write(b)
        if n % 500 == 0: print(f'{n} files, {time.time()-t0:.0f}s', flush=True)
    if zf: zf.close()
    print('files', n, dict(stats), 'lua', dict(luaunv))
    print('PROBLEMS', json.dumps(problems, indent=0))
    print('MIDCFG', midcfg)
    if MANIFEST:
        json.dump({'generatedAt': int(time.time() * 1000), 'files': manifest}, open(MANIFEST, 'w'))
        os.chmod(MANIFEST, 0o600)

main()
proc.stdin.close()
