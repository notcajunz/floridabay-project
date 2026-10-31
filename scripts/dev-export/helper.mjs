import ts from 'typescript';
import luaparse from 'luaparse';
import readline from 'node:readline';

const KIND = { '.js': ts.ScriptKind.JS, '.mjs': ts.ScriptKind.JS, '.cjs': ts.ScriptKind.JS, '.jsx': ts.ScriptKind.JSX,
  '.ts': ts.ScriptKind.TS, '.mts': ts.ScriptKind.TS, '.cts': ts.ScriptKind.TS, '.tsx': ts.ScriptKind.TSX };

function parse(text, ext) {
  return ts.createSourceFile('f' + ext, text, ts.ScriptTarget.Latest, false, KIND[ext] ?? ts.ScriptKind.JS);
}

function tokens(sf, text) {
  const out = [];
  const visit = (n) => {
    if (n.kind >= ts.SyntaxKind.FirstJSDocNode && n.kind <= ts.SyntaxKind.LastJSDocNode) return;
    const kids = n.getChildren(sf);
    if (kids.length === 0) {
      if (n.kind !== ts.SyntaxKind.EndOfFileToken) out.push(n.kind + ':' + text.slice(n.getStart(sf), n.end));
      return;
    }
    for (const k of kids) visit(k);
  };
  visit(sf);
  return out;
}

function commentRanges(sf, text) {
  const seen = new Map();
  const add = (list) => { for (const r of list ?? []) seen.set(r.pos, [r.pos, r.end]); };
  const visit = (n) => {
    if (n.kind >= ts.SyntaxKind.FirstJSDocNode && n.kind <= ts.SyntaxKind.LastJSDocNode) return;
    const kids = n.getChildren(sf);
    if (kids.length === 0) {
      add(ts.getLeadingCommentRanges(text, n.pos));
      add(ts.getTrailingCommentRanges(text, n.pos));
      return;
    }
    for (const k of kids) visit(k);
  };
  visit(sf);
  return [...seen.values()].sort((a, b) => a[0] - b[0]);
}

function removeRanges(text, ranges) {
  const merged = [];
  for (const [s, e] of ranges) {
    const last = merged[merged.length - 1];
    if (last && s < last[1]) last[1] = Math.max(last[1], e);
    else if (last && /^[ \t]*$/.test(text.slice(last[1], s)) && text.slice(last[1], s).indexOf('\n') < 0) last[1] = e;
    else merged.push([s, e]);
  }
  let out = '';
  let cur = 0;
  for (const [s, e] of merged) {
    if (s < cur) continue;
    const lineStart = text.lastIndexOf('\n', s - 1) + 1;
    let eol = text.indexOf('\n', e);
    if (eol < 0) eol = text.length;
    const before = text.slice(Math.max(lineStart, cur), s);
    const beforeFull = text.slice(lineStart, s);
    const after = text.slice(e, eol);
    if (/^[ \t]*$/.test(beforeFull) && /^[ \t\r]*$/.test(after)) {
      out += text.slice(cur, lineStart);
      cur = Math.min(eol + 1, text.length);
    } else if (/^[ \t\r]*$/.test(after)) {
      out += text.slice(cur, s).replace(/[ \t]+$/, '');
      cur = e;
    } else {
      out += text.slice(cur, s);
      const prev = text[s - 1], next = text[e];
      if (prev && next && !/\s/.test(prev) && !/\s/.test(next)) out += ' ';
      cur = e;
    }
  }
  return out + text.slice(cur);
}

function strip(text, ext) {
  const sf = parse(text, ext);
  const before = tokens(sf, text);
  const ranges = commentRanges(sf, text);
  if (!ranges.length) return { text, removed: 0 };
  const out = removeRanges(text, ranges);
  const after = tokens(parse(out, ext), out);
  if (before.length !== after.length || before.some((t, i) => t !== after[i])) throw new Error('token mismatch');
  return { text: out, removed: ranges.length };
}

function ranges(text, ext) {
  const sf = parse(text, ext);
  return commentRanges(sf, text);
}

function luaAst(text) {
  return JSON.stringify(luaparse.parse(text, { comments: false, locations: false, ranges: false, luaVersion: '5.3', scope: false }));
}

const ops = {
  strip: (r) => strip(r.text, r.ext),
  ranges: (r) => ({ ranges: ranges(r.text, r.ext) }),
  lua_verify: (r) => {
    let a;
    try { a = luaAst(r.orig); } catch { return { status: 'unparseable' }; }
    let b;
    try { b = luaAst(r.text); } catch (e) { return { status: 'broken', msg: String(e.message).slice(0, 120) }; }
    return { status: a === b ? 'ok' : 'mismatch' };
  },
};

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => {
  let id = 0;
  try {
    const r = JSON.parse(line);
    id = r.id;
    const res = ops[r.op](r);
    process.stdout.write(JSON.stringify({ id, ...res }) + '\n');
  } catch (e) {
    process.stdout.write(JSON.stringify({ id, error: String(e && e.message || e).slice(0, 200) }) + '\n');
  }
});
