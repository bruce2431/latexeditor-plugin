/* Floria LaTeX — 渲染器：LaTeX 源码 → 论文 HTML（结构 + KaTeX 数学）
   边界见项目 CLAUDE.md「渲染器边界」。 */
window.FloriaRender = (function () {
  'use strict';

  /* ---------- 基础工具 ---------- */
  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, '&quot;');
  }
  function escapeReg(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function makeLineMap(text) {
    const pos = [0];
    for (let i = 0; i < text.length; i++) if (text[i] === '\n') pos.push(i + 1);
    return {
      lineAt(off) {
        let lo = 0, hi = pos.length - 1;
        while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (pos[mid] <= off) lo = mid; else hi = mid - 1; }
        return lo + 1;
      },
    };
  }

  function stripComments(text) {
    return text.split('\n').map(line => {
      let out = '';
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '\\' && i + 1 < line.length) { out += c + line[i + 1]; i++; continue; }
        if (c === '%') break;
        out += c;
      }
      return out;
    }).join('\n');
  }

  /* 从 s 的第 i 位起抓一个平衡 {..}（跳过转义），返回 {content, end} 或 null */
  function grabGroup(s, i) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (s[i] !== '{') return null;
    let depth = 0;
    for (let j = i; j < s.length; j++) {
      const c = s[j];
      if (c === '\\') { j++; continue; }
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (!depth) return { content: s.slice(i + 1, j), end: j + 1 }; }
    }
    return null;
  }
  /* 跳过空白与 [..] 可选参数 */
  function skipOpt(s, i) {
    while (i < s.length && /\s/.test(s[i])) i++;
    while (s[i] === '[') {
      let d = 1; i++;
      while (i < s.length && d) { if (s[i] === '[') d++; else if (s[i] === ']') d--; i++; }
      while (i < s.length && /\s/.test(s[i])) i++;
    }
    return i;
  }

  /* 数学不再在构建期逐个调 KaTeX（2745 条公式同步渲染会卡死主线程 10s+）——
     先输出占位符，插入 DOM 后由 hydrate() 分块异步水合，页面全程可交互 */
  function katexHtml(tex, displayMode) {
    if (typeof window.katex === 'undefined') {
      return '<code>' + escapeHtml(tex) + '</code>';
    }
    return '<span class="kx" data-tex="' + encodeURIComponent(tex) + '" data-dm="' + (displayMode ? 1 : 0) + '"></span>';
  }

  /* ---------- 行内处理 ---------- */
  function cleanMath(t, ctx) {
    return t.replace(/\\label\{[^}]*\}/g, '').replace(/\\nonumber|\\notag/g, '').trim();
  }

  const NOARG_CMDS = new Set(('centering noindent indent par smallskip medskip bigskip clearpage newpage ' +
    'pagebreak linebreak nolinebreak raggedright raggedleft hfill vfill protect relax ' +
    'normalsize small footnotesize scriptsize tiny large Large LARGE huge Huge ' +
    'itshape bfseries mdseries upshape slshape scshape ttfamily rmfamily sffamily ' +
    'raggedbottom flushbottom sloppy fussy arraystretch').split(' '));
  const GROUPDROP_CMDS = new Set(('setlength addtolength setcounter addtocounter renewcommand ' +
    'providecommand newcommand usepackage graphicspath vspace hspace vskip hskip vglue hglue ' +
    'baselineskiparry libystyle hyphenpenalty emergencystretch').split(' '));

  function inline(raw, ctx, depth) {
    if (depth > 20) return escapeHtml(raw);
    let s = raw;

    /* 数学与 verb 先stash为占位符（占位符只含控制字符与数字，安全） */
    const stash = [];
    const keep = html => { stash.push(html); return '\x00' + (stash.length - 1) + '\x00'; };
    s = s.replace(/\\verb\|([^|\n]*)\|/g, (_, v) => keep('<code>' + escapeHtml(v) + '</code>'));
    s = s.replace(/\\\(([\s\S]*?)\\\)/g, (_, t) => keep(katexHtml(t, false)));
    s = s.replace(/(?<!\\)\\\[([\s\S]*?)\\\]/g, (_, t) => keep(katexHtml(cleanMath(t, ctx), true)));
    s = s.replace(/(?<!\\)\$\$([\s\S]*?)\$\$/g, (_, t) => keep(katexHtml(cleanMath(t, ctx), true)));
    s = s.replace(/(?<!\\)\$((?:[^$\\]|\\[\s\S])*?)\$/g, (_, t) => keep(katexHtml(t, false)));

    let out = '', i = 0;
    const esc = c => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c);

    while (i < s.length) {
      const c = s[i];
      if (c === '\\') {
        const m = /^\\([a-zA-Z]+)(\*)?/.exec(s.slice(i, i + 44));
        if (m) {
          const cmd = m[1];
          const star = m[2] || '';
          let j = skipOpt(s, i + m[0].length);
          const g = grabGroup(s, j);
          const arg = g ? g.content : '';
          const r = dispatchCmd(cmd, star, arg, s, j, g, ctx, depth);
          if (r !== null) { out += r.html; i = r.end; continue; }
          out += `<span class="unknown-cmd" title="渲染器暂不支持该命令">\\${cmd}${star}</span>`;
          if (g) { out += inline(arg, ctx, depth + 1); i = g.end; } else i = j;
          continue;
        }
        const n = s[i + 1];
        if (n === '\\') { out += '<br>'; i += 2; continue; }
        if (n && '&%_$#{}|'.indexOf(n) >= 0) {
          out += n === '&' ? '&amp;' : n;
          i += 2; continue;
        }
        out += '\\'; i++; continue;
      }
      if (c === '~') { out += '&nbsp;'; i++; continue; }
      if (c === '\n') { out += ' '; i++; continue; }
      out += esc(c); i++;
    }

    out = out.replace(/``([\s\S]*?)''/g, '“$1”').replace(/---/g, '—').replace(/--/g, '–');
    out = out.replace(/\x00(\d+)\x00/g, (_, n) => stash[+n] || '');
    return out;
  }

  function dispatchCmd(cmd, star, arg, s, j, g, ctx, depth) {
    const end = g ? g.end : j;
    const wrap = tag => ({ html: `<${tag}>${inline(arg, ctx, depth + 1)}</${tag}>`, end });
    switch (cmd) {
      case 'textbf': case 'bf': return wrap('strong');
      case 'textit': case 'emph': case 'em': return wrap('em');
      case 'underline': case 'uline': return wrap('u');
      case 'texttt': return wrap('code');
      case 'textsuperscript': return wrap('sup');
      case 'textsubscript': return wrap('sub');
      case 'textsc': case 'textrm': case 'textsf': case 'textup':
      case 'textnormal': case 'mbox': case 'text': case 'hbox': case 'texorpdfstring':
        return wrap('span');
      case 'footnote': {
        ctx.footnotes.push(inline(arg, ctx, depth + 1));
        return { html: `<sup class="fn-mark" title="脚注">${ctx.footnotes.length}</sup>`, end };
      }
      case 'cite': {
        const keys = arg.split(',').map(k => k.trim()).filter(Boolean);
        const html = '[' + keys.map(k => {
          const n = ctx.bib[k];
          return `<span class="cite" title="引用 ${escapeAttr(k)}">${n || escapeHtml(k)}</span>`;
        }).join(', ') + ']';
        return { html, end };
      }
      case 'ref': return { html: `\x02r:${arg.trim()}\x03`, end };
      case 'eqref': case 'autoref': return { html: `\x02e:${arg.trim()}\x03`, end };
      case 'label': {
        const k = arg.trim();
        if (k) ctx.labels[k] = ctx.curNum || '0';
        return { html: '', end };
      }
      case 'includegraphics': {
        return { html: imgTag(arg, ctx), end };
      }
      case 'url': {
        return { html: `<a href="${escapeAttr(arg)}" target="_blank" rel="noopener">${escapeHtml(arg)}</a>`, end };
      }
      case 'href': {
        const g2 = g ? grabGroup(s, g.end) : null;
        return {
          html: `<a href="${escapeAttr(arg)}" target="_blank" rel="noopener">${g2 ? inline(g2.content, ctx, depth + 1) : escapeHtml(arg)}</a>`,
          end: g2 ? g2.end : end,
        };
      }
      case 'caption': return wrap('strong');
      case 'LaTeX': return { html: 'LaTeX', end: j };
      case 'TeX': return { html: 'TeX', end: j };
      case 'today': {
        const d = new Date();
        return { html: `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`, end: j };
      }
      case 'and': return { html: '<span class="au-sep">·</span>', end: j };
      case 'item': return { html: '', end };
      case 'input': case 'include': {
        return { html: `<span class="bib-note">[子文件 ${escapeHtml(arg)} 未并入预览：暂不支持多文件工程]</span>`, end };
      }
      default:
        if (NOARG_CMDS.has(cmd)) return { html: '', end: j };
        if (GROUPDROP_CMDS.has(cmd)) return { html: '', end };
        return null;
    }
  }

  /* ---------- 环境定位 ---------- */
  function findEnvEnd(text, startIdx, name) {
    const beginTokEnd = text.indexOf('}', startIdx) + 1;
    const re = new RegExp('\\\\(begin|end)\\s*\\{' + escapeReg(name) + '\\}', 'g');
    re.lastIndex = beginTokEnd;
    let depth = 1, m;
    while ((m = re.exec(text))) {
      depth += m[1] === 'begin' ? 1 : -1;
      if (!depth) return { innerStart: beginTokEnd, innerEnd: m.index, endAfter: re.lastIndex };
    }
    return { innerStart: beginTokEnd, innerEnd: text.length, endAfter: text.length };
  }

  /* ---------- 块级解析 ---------- */
  const SPECIAL = /\n[ \t]*\n|\\begin\s*\{|\\(?:sub){0,2}section\*?[ \t]*[{\[]|\\paragraph\*?[ \t]*[{\[]|\\chapter\*?[ \t]*[{\[]|\\maketitle\b|\\tableofcontents\b|\\bibliographystyle\b|\\bibliography\b|\\appendix\b|\\newpage\b|\\clearpage\b|\\title[ \t]*\{|\\author[ \t]*\{|\\date[ \t]*\{|(?<!\\)\\\[/g;

  function parseBlocks(text, ctx, depth) {
    if (depth > 12) return `<div class="verbatim">${escapeHtml(text)}</div>`;
    const out = [];
    let i = 0, para = '', paraLine = 1;
    const lineOf = off => ctx.lineMap.lineAt(off);
    /* 段落行号取首个非空白字符所在行（跳过块间前导换行） */
    const paraLineAt = off => {
      let j = off;
      while (j < text.length && /\s/.test(text[j])) j++;
      return lineOf(j);
    };
    const flush = () => {
      const t = para.replace(/\s+/g, ' ').trim();
      if (t) out.push(`<p data-line="${paraLine}">${inline(t, ctx, 0)}</p>`);
      para = '';
    };

    while (i < text.length) {
      SPECIAL.lastIndex = i;
      const m = SPECIAL.exec(text);
      if (!m) {
        if (!para) paraLine = paraLineAt(i);
        para += text.slice(i);
        break;
      }
      const tok = m[0];
      /* \begin{ 先过行内 $ 守卫（判据 = 上一个数学边界 \] \[ \end{ 之后未转义 $ 计数为奇数；
         按"最后 $ 的位置"判断会被段落成对 $x$ 误触发，两书实测 120 处）。
         命中时 token 必须连同前文一起留在当前段落——若先 flush，成对 $ 会被拆进两个段落各自悬空 */
      let inDollar = false;
      if (tok.startsWith('\\begin')) {
        const gb = Math.max(
          text.lastIndexOf('\\]', m.index - 1),
          text.lastIndexOf('\\[', m.index - 1),
        );
        /* 注意边界只取块级显示公式定界符：\end{ 也算边界会把同行第二个
           $...含\begin{矩阵}...$ 行内公式判成块外（其 \end{bmatrix} 重置了计数） */
        let dollars = 0;
        for (let p = gb + 1; p < m.index; p++) {
          if (text[p] === '$' && text[p - 1] !== '\\') dollars++;
        }
        inDollar = dollars % 2 === 1;
      }
      if (m.index > i) { if (!para) paraLine = paraLineAt(i); para += text.slice(i, m.index); }
      if (tok.charAt(0) === '\n') { flush(); i = m.index + tok.length; continue; }
      if (inDollar) { para += tok; i = m.index + tok.length; continue; }
      flush();
      i = m.index + tok.length;

      if (tok.startsWith('\\begin')) {
        const nm = /^\\begin\s*\{([a-zA-Z*]+)\}/.exec(text.slice(m.index));
        if (!nm) { para += tok; continue; }
        const span = findEnvEnd(text, m.index, nm[1]);
        out.push(renderEnv(nm[1], text.slice(span.innerStart, span.innerEnd), lineOf(m.index), ctx, depth));
        i = span.endAfter;
      } else if (tok === '\\[') {
        /* \[...\] 显示公式整体切出（内部 \begin{aligned|cases|...} 交 KaTeX，不再被环境扫描打断） */
        const close = text.indexOf('\\]', i);
        if (close === -1) { para += tok; continue; }
        out.push(mathBlock('displaymath', text.slice(i, close), lineOf(m.index), ctx));
        i = close + 2;
      } else if (/^\\(?:chapter|(?:sub){0,2}section)|^\\paragraph/.test(tok)) {
        const hm = /^\\(chapter|(?:sub){0,2}section|paragraph)(\*)?/.exec(text.slice(m.index));
        const kind = hm[1], star = !!hm[2];
        let j = skipOpt(text, m.index + hm[0].length);
        const g = grabGroup(text, j);
        const titleRaw = g ? g.content : '';
        if (g) i = g.end;
        out.push(headingHtml(kind, star, titleRaw, lineOf(m.index), ctx));
      } else if (tok.startsWith('\\maketitle')) {
        out.push(titleHtml(ctx, lineOf(m.index)));
      } else if (tok.startsWith('\\tableofcontents')) {
        out.push(tocHtml(ctx, lineOf(m.index)));
      } else if (tok.startsWith('\\bibliographystyle')) {
        const g = grabGroup(text, skipOpt(text, i));
        if (g) i = g.end;
      } else if (tok.startsWith('\\bibliography')) {
        const g = grabGroup(text, skipOpt(text, i));
        if (g) i = g.end;
        out.push('<p class="bib-note">[.bib 参考文献库不在纯前端预览范围内，编译时由 BibTeX 生成]</p>');
      } else if (tok.startsWith('\\appendix')) {
        ctx.appendix = true;
      } else if (tok.startsWith('\\newpage') || tok.startsWith('\\clearpage')) {
        out.push('<hr class="newpage">');
      } else {
        const key = /^\\(title|author|date)/.exec(tok)[1];
        const g = grabGroup(text, skipOpt(text, i));
        if (g) { ctx.meta[key] = g.content; i = g.end; }
      }
    }
    flush();
    return out.join('\n');
  }

  /* ---------- 标题 / 大纲 ---------- */
  function plainText(s) {
    let t = s.replace(/\\label\{[^}]*\}/g, '');
    let prev;
    do { prev = t; t = t.replace(/\\[a-zA-Z]+\*?(\[[^\]]*\])?(\{(([^{}]|\{[^{}]*\})*)\})?/g, '$3'); } while (t !== prev);
    return t.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
  }

  function headingHtml(kind, star, titleRaw, line, ctx) {
    const c = ctx.c;
    let num = '';
    if (!star) {
      if (kind === 'chapter') {
        c.ch++; c.s = 0; c.ss = 0; c.sss = 0;
        num = ctx.appendix ? String.fromCharCode(64 + c.ch) : String(c.ch);
      } else if (kind === 'section') {
        c.s++; c.ss = 0; c.sss = 0;
        num = ctx.appendix ? String.fromCharCode(64 + c.s) : String(c.s);
      } else if (kind === 'subsection') {
        c.ss++; c.sss = 0;
        const base = ctx.appendix ? String.fromCharCode(64 + Math.max(c.s, 1)) : String(c.s);
        num = base + '.' + c.ss;
      } else if (kind === 'subsubsection') {
        c.sss++;
        const base = ctx.appendix ? String.fromCharCode(64 + Math.max(c.s, 1)) : String(c.s);
        num = base + '.' + c.ss + '.' + c.sss;
      } else { /* paragraph 不编号 */ }
    }
    ctx.curNum = num;

    const id = 'sec' + (++ctx.secId);
    const lm = /\\label\{([^}]*)\}/.exec(titleRaw);
    if (lm && num) ctx.labels[lm[1].trim()] = num;
    const titleClean = titleRaw.replace(/\\label\{[^}]*\}/g, '');
    const lv = kind === 'chapter' ? 1 : kind === 'section' ? 2 : kind === 'subsection' ? 3 : kind === 'subsubsection' ? 4 : 5;
    ctx.outline.push({ lv, num, text: plainText(titleClean), id, line });
    const tag = lv <= 4 ? 'h' + lv : 'p';
    const cls = lv <= 4 ? 'sec' : 'sec para-head';
    return `<${tag} class="${cls}" id="${id}" data-line="${line}">` +
      (num ? `<span class="sec-no">${num}</span>` : '') +
      inline(titleClean, ctx, 0) + `</${tag}>`;
  }

  function titleHtml(ctx, line) {
    const m = ctx.meta;
    const authors = (m.author || '').split(/\\and\b/).map(a => inline(a.trim(), ctx, 0)).filter(Boolean);
    const auSep = '<span class="au-sep">·</span>';
    return `<div class="doc-title" data-line="${line}">${inline(m.title || '', ctx, 0) || '未命名'}</div>` +
      `<div class="doc-author">${authors.join(auSep)}</div>` +
      `<div class="doc-date">${m.date ? inline(m.date, ctx, 0) : ''}</div>`;
  }

  function tocHtml(ctx, line) {
    /* 目录在章节解析前渲染，先落占位，render() 末尾回填（ctx.tocPlaceholders） */
    ctx.tocPlaceholders.push(line);
    return `<div class="toc" data-line="${line}"><div class="toc-h">${ctx.meta.isCtex ? '目录' : 'Contents'}</div><div class="toc-body"></div></div>`;
  }

  /* ---------- 环境 ---------- */
  function splitItems(inner) {
    const items = [];
    let depth = 0, cur = { term: '', text: '' }, started = false;
    for (let i = 0; i < inner.length; i++) {
      const m = /^\\(begin|end)\s*\{([a-zA-Z*]+)\}/.exec(inner.slice(i));
      if (m) {
        depth += m[1] === 'begin' ? 1 : -1;
        cur.text += m[0]; i += m[0].length - 1; continue;
      }
      if (depth === 0 && /^\\item\b/.test(inner.slice(i))) {
        if (started) items.push(cur);
        cur = { term: '', text: '' }; started = true;
        i += 5;
        let j = i; while (j < inner.length && /\s/.test(inner[j])) j++;
        if (inner[j] === '[') {
          let d = 1, k = j + 1;
          while (k < inner.length && d) { if (inner[k] === '[') d++; else if (inner[k] === ']') d--; k++; }
          cur.term = inner.slice(j + 1, k - 1);
          i = k - 1;
        }
        continue;
      }
      cur.text += inner[i];
    }
    if (started) items.push(cur);
    return items;
  }

  function listHtml(env, inner, line, ctx, depth) {
    const items = splitItems(inner);
    if (!items.length) return '';
    if (env === 'description') {
      return `<dl data-line="${line}">` + items.map(it =>
        `<dt style="font-weight:700">${inline(it.term, ctx, depth + 1)}</dt><dd>${parseBlocks(it.text, ctx, depth + 1)}</dd>`
      ).join('') + '</dl>';
    }
    const type = ['decimal', 'lower-alpha', 'lower-roman'][Math.min(ctx.enumDepth, 2)];
    const tag = env === 'enumerate' ? 'ol' : 'ul';
    const attr = env === 'enumerate' ? ` style="list-style-type:${type}"` : '';
    return `<${tag}${attr} data-line="${line}">` + items.map(it =>
      `<li>${parseBlocks(it.text, ctx, depth + 1)}</li>`).join('') + `</${tag}>`;
  }

  function mathBlock(env, inner, line, ctx) {
    const starred = /\*$/.test(env) || env === 'displaymath' || env === 'math';
    let body = inner;
    let numbered = !starred;
    const labels = [];
    body = body.replace(/\\label\{([^}]*)\}/g, (_, k) => { labels.push(k.trim()); return ''; });
    if (/\\nonumber|\\notag/.test(body)) numbered = false;
    body = body.replace(/\\nonumber|\\notag/g, '').trim();

    /* KaTeX 顶层表达式不认 & 对齐：多对齐环境包成 aligned/gathered */
    const base = env.replace(/\*$/, '');
    let tex = body;
    if (base === 'align' || base === 'flalign' || base === 'eqnarray' || base === 'alignat' || base === 'split') {
      tex = '\\begin{aligned}' + body + '\\end{aligned}';
    } else if (base === 'gather' || base === 'multline') {
      tex = '\\begin{gathered}' + body + '\\end{gathered}';
    }

    let num = '';
    if (numbered && body) {
      ctx.c.eq++;
      num = String(ctx.c.eq);
      labels.forEach(k => { ctx.labels[k] = num; });
    }
    const html = katexHtml(tex, true);
    return `<div class="eq-wrap" data-line="${line}">${html}${num ? `<span class="eq-no">(${num})</span>` : ''}</div>`;
  }

  function figCaption(inner, ctx, kind) {
    const m = /\\caption(\*)?\s*(\[[^\]]*\])?\s*\{/.exec(inner);
    if (!m) return { cap: '', endIdx: -1 };
    const g = grabGroup(inner, m.index + m[0].length - 1);
    return g ? { cap: inline(g.content, ctx, 0), endIdx: g.end } : { cap: '', endIdx: -1 };
  }

  function figureHtml(inner, line, ctx) {
    const { cap } = figCaption(inner, ctx);
    ctx.c.fig++;
    const label = /\\label\{([^}]*)\}/.exec(inner);
    if (label) ctx.labels[label[1].trim()] = String(ctx.c.fig);
    const files = [];
    let m;
    const re = /\\includegraphics(?:\[[^\]]*\])?\s*\{([^}]*)\}/g;
    while ((m = re.exec(inner))) files.push(m[1].trim());
    const word = ctx.meta.isCtex ? '图' : 'Fig.';
    const body = files.length
      ? files.map(f => `<div class="gfx">${imgTag(f, ctx)}</div>`).join('')
      : '<div class="gfx">（无图形内容）</div>';
    return `<figure data-line="${line}">${body}${cap ? `<figcaption>${word} ${ctx.c.fig}：${cap}</figcaption>` : ''}</figure>`;
  }

  /* \includegraphics 图片解析：ctx.images = {小写文件名: URL}（本地文件夹模式传 blob URL），
     命中出真图，否则回退占位框。路径含子目录时按文件名匹配 */
  function imgTag(name, ctx) {
    const base = String(name).split(/[\\/]/).pop().toLowerCase();
    if (ctx && ctx.images && ctx.images[base]) {
      return `<img class="gfx-img" src="${escapeAttr(ctx.images[base])}" alt="${escapeHtml(name)}">`;
    }
    return `<code class="gfx-name" title="图片占位（未在项目图片中找到该文件）">[图：${escapeHtml(name)}]</code>`;
  }

  function tabularHtml(raw, ctx) {
    let i = 0; while (i < raw.length && /\s/.test(raw[i])) i++;
    const spec = grabGroup(raw, i);
    const body = spec ? raw.slice(spec.end) : raw;
    const colspec = spec ? spec.content : '';
    const cols = (colspec.replace(/[pmb]\{[^}]*\}/g, '').replace(/@\{[^}]*\}/g, '').match(/[lcrX]/g) || []).length || 1;

    const tokens = [];
    let buf = '', j = 0;
    while (j < body.length) {
      const mr = /^\\(hline|midrule|toprule|bottomrule|cline\{[^}]*\})/.exec(body.slice(j));
      if (mr) {
        if (buf.trim()) { tokens.push({ t: 'row', s: buf }); buf = ''; }
        tokens.push({ t: 'rule' }); j += mr[0].length; continue;
      }
      if (body[j] === '\\' && body[j + 1] === '\\') {
        tokens.push({ t: 'row', s: buf }); buf = ''; j += 2; continue;
      }
      if (/^\\end\{tabular\}/.test(body.slice(j))) break;
      buf += body[j++];
    }
    if (buf.trim()) tokens.push({ t: 'row', s: buf });

    let html = '', prevWasRow = false, rowIndex = 0;
    for (let k = 0; k < tokens.length; k++) {
      const tk = tokens[k];
      if (tk.t === 'rule') {
        if (prevWasRow && rowIndex === 1) html += '<tr class="tline tchead">';
        else if (prevWasRow) html += '<tr class="tline">';
        continue;
      }
      rowIndex++;
      const cells = tk.s.split('&');
      let isHead = false;
      if (tokens[k + 1] && tokens[k + 1].t === 'rule' && rowIndex === 1) isHead = true;
      html += '<tr' + (isHead ? ' class="tchead"' : '') + '>' + cells.map(cell => {
        const mc = /^\s*\\multicolumn\{(\d+)\}\s*\{[^}]*\}\s*\{([\s\S]*)\}\s*$/.exec(cell);
        if (mc) return `<td colspan="${mc[1]}">${inline(mc[2].replace(/\\\\$/, '').trim(), ctx, 0)}</td>`;
        return `<td>${inline(cell.replace(/\s+$/, '').trim(), ctx, 0)}</td>`;
      }).join('') + '</tr>';
      prevWasRow = true;
    }
    return `<table class="ltab"><thead></thead><tbody>${html}</tbody></table>`;
  }

  function tableEnvHtml(inner, line, ctx) {
    const { cap } = figCaption(inner, ctx);
    ctx.c.tab++;
    const label = /\\label\{([^}]*)\}/.exec(inner);
    if (label) ctx.labels[label[1].trim()] = String(ctx.c.tab);
    const tm = /\\begin\{tabular\}/.exec(inner);
    let tbl = '<p class="bib-note">[空表格]</p>';
    if (tm) {
      const span = findEnvEnd(inner, tm.index, 'tabular');
      tbl = tabularHtml(inner.slice(span.innerStart, span.innerEnd), ctx);
    }
    const word = ctx.meta.isCtex ? '表' : 'Table';
    const capHtml = cap ? `<caption>${word} ${ctx.c.tab}：${cap}</caption>` : '';
    tbl = tbl.replace('<thead></thead>', capHtml + '<thead></thead>');
    return `<div data-line="${line}" style="overflow-x:auto">${tbl}</div>`;
  }

  function bibHtml(inner, line, ctx) {
    const items = [];
    let depth = 0, cur = null, buf = '';
    for (let i = 0; i < inner.length; i++) {
      const m = /^\\(begin|end)\s*\{([a-zA-Z*]+)\}/.exec(inner.slice(i));
      if (m) { depth += m[1] === 'begin' ? 1 : -1; buf += m[0]; i += m[0].length - 1; continue; }
      if (depth === 0 && /^\\bibitem\s*(\[[^\]]*\])?\s*\{/.test(inner.slice(i))) {
        if (cur) { cur.text = buf; items.push(cur); }
        const km = /^\\bibitem\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/.exec(inner.slice(i));
        cur = { key: km[1].trim(), text: '' };
        i += km[0].length - 1; buf = '';
        continue;
      }
      buf += inner[i];
    }
    if (cur) { cur.text = buf; items.push(cur); }
    return `<ol class="bib-list" data-line="${line}">` + items.map(it =>
      `<li>${inline(it.text.trim(), ctx, 0)}</li>`).join('') + '</ol>';
  }

  function renderEnv(env, inner, line, ctx, depth) {
    switch (env) {
      case 'document':
        return parseBlocks(inner, ctx, depth + 1);
      case 'abstract':
        return `<section class="abstract" data-line="${line}"><h3>${ctx.meta.isCtex ? '摘　要' : 'Abstract'}</h3>${parseBlocks(inner, ctx, depth + 1)}</section>`;
      case 'itemize': case 'enumerate': case 'description': {
        ctx.enumDepth++;
        const h = listHtml(env, inner, line, ctx, depth);
        ctx.enumDepth--;
        return h;
      }
      case 'equation': case 'equation*': case 'align': case 'align*': case 'gather': case 'gather*':
      case 'multline': case 'multline*': case 'eqnarray': case 'eqnarray*': case 'flalign': case 'flalign*':
        return mathBlock(env, inner, line, ctx);
      case 'displaymath': case 'math':
        return mathBlock('displaymath', inner, line, ctx);
      case 'figure': case 'figure*':
        return figureHtml(inner, line, ctx);
      case 'table': case 'table*':
        return tableEnvHtml(inner, line, ctx);
      case 'tabular': case 'tabular*':
        return `<div data-line="${line}" style="overflow-x:auto">${tabularHtml(inner, ctx)}</div>`;
      case 'center':
        return `<div style="text-align:center" data-line="${line}">${parseBlocks(inner, ctx, depth + 1)}</div>`;
      case 'quote': case 'quotation':
        return `<blockquote data-line="${line}">${parseBlocks(inner, ctx, depth + 1)}</blockquote>`;
      case 'verbatim': case 'verbatim*': case 'lstlisting':
        return `<div class="verbatim" data-line="${line}">${escapeHtml(inner)}</div>`;
      case 'thebibliography':
        return bibHtml(inner, line, ctx);
      default:
        return `<div class="env-unknown" data-line="${line}"><span class="env-tag">\\begin{${escapeHtml(env)}} — 未支持的环境，以下为原文内容</span>${parseBlocks(inner, ctx, depth + 1)}</div>`;
    }
  }

  /* ---------- 主入口 ---------- */
  function render(src, opts) {
    let text = String(src).replace(/\r\n/g, '\n');
    const userMacros = {};
    text = text.replace(/\\(?:re)?newcommand\s*\{\\([a-zA-Z]+)\}\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g,
      (_, name, def) => { userMacros[name] = def.trim(); return ''; });
    text = stripComments(text);
    if (Object.keys(userMacros).length) {
      const re = new RegExp('\\\\(' + Object.keys(userMacros).map(escapeReg).join('|') + ')\\b', 'g');
      text = text.replace(re, (_, n) => userMacros[n]);
    }
    const lineMap = makeLineMap(text);

    let preamble = '', body = text;
    const dm = /\\begin\s*\{document\}/.exec(text);
    const de = /\\end\s*\{document\}/.exec(text);
    if (dm && de && de.index > dm.index) {
      preamble = text.slice(0, dm.index);
      body = text.slice(dm.index + dm[0].length, de.index);
    } else if (dm) {
      preamble = text.slice(0, dm.index);
      body = text.slice(dm.index + dm[0].length);
    }

    function grabMeta(source, key) {
      /* 兼容可选参数：\documentclass[UTF8]{ctexbook}、\title[短]{长} */
      const m = new RegExp('\\\\' + key + '(?:\\s*\\[[^\\]]*\\])?\\s*\\{').exec(source);
      if (!m) return '';
      const g = grabGroup(source, m.index + m[0].length - 1);
      return g ? g.content : '';
    }
    const docclass = grabMeta(preamble, 'documentclass') || grabMeta(body, 'documentclass');

    const ctx = {
      lineMap, meta: {
        title: grabMeta(preamble, 'title') || grabMeta(body, 'title'),
        author: grabMeta(preamble, 'author') || grabMeta(body, 'author'),
        date: grabMeta(preamble, 'date') || grabMeta(body, 'date'),
        isCtex: /ctex/i.test(docclass),
      },
      labels: {}, bib: {}, footnotes: [], outline: [],
      images: (opts && opts.images) || null,
      c: { ch: 0, s: 0, ss: 0, sss: 0, fig: 0, tab: 0, eq: 0 },
      enumDepth: 0, secId: 0, curNum: '', appendix: false, _eqLabels: [], tocPlaceholders: [],
    };
    /* 参考文献键预收集（cite 可出现在 thebibliography 之前） */
    let bn = 0;
    body.replace(/\\bibitem\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g, (_, k) => { ctx.bib[k.trim()] = ++bn; return ''; });

    let html = parseBlocks(body, ctx, 0);

    /* 目录回填（\tableofcontents 常出现在章节之前，此时大纲已解析完） */
    if (ctx.tocPlaceholders.length) {
      const items = ctx.outline.filter(o => o.lv <= 4).map(o =>
        `<a class="lv${o.lv - 1}" data-target="${o.id}">${o.num ? o.num + '&nbsp;&nbsp;' : ''}${escapeHtml(o.text)}</a>`);
      html = html.replace('<div class="toc-body"></div>',
        items.join('') || '<p class="bib-note">（暂无章节）</p>');
    }

    /* 前向引用解析 */
    html = html.replace(/\x02e:([^\x03]*)\x03/g, (_, k) => `(${ctx.labels[k] != null ? ctx.labels[k] : '?'})`);
    html = html.replace(/\x02r:([^\x03]*)\x03/g, (_, k) => (ctx.labels[k] != null ? ctx.labels[k] : '[?]'));

    if (ctx.footnotes.length) {
      html += '<div class="footnotes">' + ctx.footnotes.map((f, i) =>
        `<div><span class="fn-no">${i + 1}</span>${f}</div>`).join('') + '</div>';
    }

    const plain = html.replace(/<[^>]+>/g, '');
    const cjk = (plain.match(/[\u4e00-\u9fff]/g) || []).length;
    const latin = (plain.match(/[A-Za-z]+/g) || []).length;
    const mathCount = (html.match(/class="kx"/g) || []).length;

    return { html, outline: ctx.outline, stats: { chars: cjk + latin, cjk, latin, math: mathCount } };
  }

  /* 分块异步水合：把 .kx 占位符逐块替换成 KaTeX 渲染结果，每块让出主线程 */
  async function hydrate(root, isStale) {
    const nodes = Array.prototype.slice.call(root.querySelectorAll('.kx'));
    const CH = 80;
    for (let i = 0; i < nodes.length; i += CH) {
      if (isStale && isStale()) return i;
      for (let j = i; j < Math.min(i + CH, nodes.length); j++) {
        const el = nodes[j];
        const tex = decodeURIComponent(el.getAttribute('data-tex'));
        const dm = el.getAttribute('data-dm') === '1';
        let html;
        try {
          html = window.katex.renderToString(tex, { displayMode: dm, throwOnError: false, strict: 'ignore' });
        } catch (e) {
          html = '<code>' + escapeHtml(tex) + '</code>';
        }
        el.outerHTML = html;
      }
      await new Promise(r => setTimeout(r, 0));
    }
    return nodes.length;
  }

  return { render, hydrate };
})();
