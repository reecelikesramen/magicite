import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Finds every sfx id the code base can emit, by scanning source text:
 *  1. `{ type: 'sfx', id: <expr> }` — string literals inside <expr> (covers `a ? 'x' : 'y'`);
 *  2. helper functions that forward one of their parameters as the sfx id (e.g.
 *     `emitAt(world, e, id)` or `fail(..., sfx)`) — the literals passed at that position at call sites;
 *  3. content data fields `sfx: 'id'`.
 * Template ids with a static prefix are reported as `prefix*`.
 */

export interface SourceFile {
  path: string;
  text: string;
}

export function readSources(root: string, skip: (rel: string) => boolean): SourceFile[] {
  const out: SourceFile[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const rel = relative(root, full).split('\\').join('/');
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(name) && !name.endsWith('.d.ts') && !name.endsWith('.test.ts') && !skip(rel)) out.push({ path: rel, text: readFileSync(full, 'utf8') });
    }
  };
  walk(root);
  return out;
}

/** Top-level string literals ('…' or "…") of an expression, ignoring template literal contents. */
export function stringLiterals(expr: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < expr.length) {
    const c = expr[i]!;
    if (c === "'" || c === '"') {
      const end = expr.indexOf(c, i + 1);
      if (end < 0) break;
      // Skip comparison operands (`tool === 'axe' ? 'chop' : 'mine'` → chop, mine).
      if (!/[=!]=\s*$/.test(expr.slice(0, i))) out.push(expr.slice(i + 1, end));
      i = end + 1;
    } else if (c === '`') {
      i = skipTemplate(expr, i);
    } else i++;
  }
  return out.filter((s) => /^[a-z0-9_]+$/.test(s));
}

function skipTemplate(s: string, start: number): number {
  let i = start + 1;
  let depth = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (depth === 0 && c === '`') return i + 1;
    if (c === '$' && s[i + 1] === '{') {
      depth++;
      i += 2;
      continue;
    }
    if (c === '}' && depth > 0) depth--;
    i++;
  }
  return i;
}

/** Index just past the bracket matching the one at `open` (handles strings/templates). */
function matchBracket(s: string, open: number): number {
  const pairs: Record<string, string> = { '(': ')', '{': '}', '[': ']' };
  const stack: string[] = [];
  let i = open;
  while (i < s.length) {
    const c = s[i]!;
    if (c === "'" || c === '"') {
      const end = s.indexOf(c, i + 1);
      i = end < 0 ? s.length : end + 1;
      continue;
    }
    if (c === '`') {
      i = skipTemplate(s, i);
      continue;
    }
    if (pairs[c]) stack.push(pairs[c]!);
    else if (c === stack[stack.length - 1]) {
      stack.pop();
      if (stack.length === 0) return i + 1;
    }
    i++;
  }
  return s.length;
}

/** Split a call's argument list (text between the parens) at top-level commas. */
export function splitArgs(s: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let cur = '';
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (c === "'" || c === '"') {
      const end = s.indexOf(c, i + 1);
      const stop = end < 0 ? s.length : end + 1;
      cur += s.slice(i, stop);
      i = stop;
      continue;
    }
    if (c === '`') {
      const stop = skipTemplate(s, i);
      cur += s.slice(i, stop);
      i = stop;
      continue;
    }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    if (c === ',' && depth === 0) {
      args.push(cur.trim());
      cur = '';
    } else cur += c;
    i++;
  }
  if (cur.trim() !== '') args.push(cur.trim());
  return args;
}

export function scanSfxIds(files: readonly SourceFile[]): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const add = (id: string, where: string): void => {
    const list = found.get(id) ?? [];
    list.push(where);
    found.set(id, list);
  };
  for (const f of files) {
    const t = f.text;
    // 1. direct emits with literal ids
    for (const m of t.matchAll(/type:\s*'sfx',\s*id:\s*([^,}]+)/g)) {
      for (const id of stringLiterals(m[1]!)) add(id, f.path);
      // Ids built at runtime from a static prefix: `skill_${def.id}` → 'skill_*'.
      for (const tm of m[1]!.matchAll(/`([a-z0-9_]+)\$\{/g)) add(`${tm[1]}*`, f.path);
    }
    // 2. helpers forwarding a parameter as the id
    for (const m of t.matchAll(/(?:function\s+(\w+)\s*|(?:const|let)\s+(\w+)\s*=\s*)\(/g)) {
      const name = m[1] ?? m[2]!;
      const parenAt = m.index! + m[0].length - 1;
      const close = matchBracket(t, parenAt);
      const params = splitArgs(t.slice(parenAt + 1, close - 1)).map((p) => p.replace(/[?:=].*$/s, '').trim());
      const bodyOpen = t.indexOf('{', close);
      if (bodyOpen < 0) continue;
      const between = t.slice(close, bodyOpen);
      if (!/^\s*(:\s*[\w<>[\]| ]+)?\s*(=>)?\s*$/.test(between)) continue;
      const body = t.slice(bodyOpen, matchBracket(t, bodyOpen));
      params.forEach((p, idx) => {
        if (!p || !/^\w+$/.test(p)) return;
        const re = p === 'id' ? /type:\s*'sfx',\s*id\s*[,}]|type:\s*'sfx',\s*id:\s*id\b/ : new RegExp(`type:\\s*'sfx',\\s*id:\\s*${p}\\b`);
        if (!re.test(body)) return;
        // Calls of this helper anywhere in the file.
        for (const c of t.matchAll(new RegExp(`\\b${name}\\(`, 'g'))) {
          const open = c.index! + c[0].length - 1;
          if (open === parenAt) continue;
          const args = splitArgs(t.slice(open + 1, matchBracket(t, open) - 1));
          const arg = args[idx];
          if (arg) for (const id of stringLiterals(arg)) add(id, `${f.path} (${name})`);
        }
      });
    }
    // 3. content data
    for (const m of t.matchAll(/\bsfx:\s*'([a-z0-9_]+)'/g)) add(m[1]!, f.path);
  }
  return found;
}
