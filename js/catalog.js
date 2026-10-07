/* Floria LaTeX v2 — 目录页：论文项目列表（数据唯一来源 = 本地服务器扫盘 /api/books）
   行 = 书稿目录：名称 + 一行 meta（主 .tex · N 图 · 编译态 · 修改时间）+ ›。
   三态：读取中 / 空 / 连不上服务器。点行交给 start.js 落 hash（→ 编辑页）。 */
(function () {
  'use strict';
  const F = window.Floria;
  const $ = F.$, esc = F.esc, fmtRel = F.fmtRel;

  const DOC_ICON =
    '<svg viewBox="0 0 18 18" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true">' +
    '<path d="M4.5 1.8h6L14 5.3v10.9H4.5z"/><path d="M10.3 1.8v3.7h3.7"/><path d="M6.6 8.6h5M6.6 11.2h5M6.6 13.8h3"/></svg>';

  let busy = false;

  function setState(title, hint, isErr) {
    const el = $('cat-state');
    el.className = 'cat-state' + (isErr ? ' err' : '');
    el.innerHTML = `<p class="cs-title">${esc(title)}</p>` + (hint ? `<p class="cs-hint">${esc(hint)}</p>` : '');
    el.classList.remove('hidden');
  }
  function clearState() { $('cat-state').classList.add('hidden'); }

  function metaOf(b) {
    const parts = [b.texName || 'main.tex'];
    const n = (b.images || []).length;
    if (n) parts.push(n + ' 图');
    const pdf = b.pdf || {};
    parts.push(pdf.exists ? (pdf.fresh ? '已编译' : '源码已改') : '未编译');
    if (b.mtime) parts.push(fmtRel(b.mtime));
    return parts.join(' · ');
  }

  async function refresh() {
    if (busy) return;
    busy = true;
    $('cat-list').innerHTML = '';
    $('cat-count').textContent = '';
    setState('读取中…', '正在扫描项目目录');
    try {
      const books = await F.api('api/books');
      render(books);
    } catch (e) {
      setState('没连上本地服务器',
        '双击 .claude/preview/启动.bat，或从 Floria 网页的项目 tab 打开本页（file:// 只读）', true);
    } finally {
      busy = false;
    }
  }

  function render(books) {
    $('cat-count').textContent = books.length + ' 个项目';
    if (!books.length) {
      $('cat-list').innerHTML = '';
      setState('还没有论文项目',
        '点右上角「＋ 新建书稿」，或把「main.tex + 配图」的目录拷进项目根目录后点「刷新」');
      return;
    }
    clearState();
    $('cat-list').innerHTML = books.map(b => `
      <button type="button" class="cat-row" data-book="${esc(b.name)}">
        <span class="cat-icon">${DOC_ICON}</span>
        <span class="cat-name">${esc(b.name)}</span>
        <span class="cat-meta">${esc(metaOf(b))}</span>
        <span class="cat-arrow">›</span>
      </button>`).join('');
  }

  /* 新建书稿：在项目根下建「名字/main.tex」（随后即被扫描到） */
  async function newBook() {
    const d = new Date();
    const two = n => (n < 10 ? '0' : '') + n;
    const stamp = '' + d.getFullYear() + two(d.getMonth() + 1) + two(d.getDate());
    const name = prompt('新书稿名字（将在项目目录下建「名字/main.tex」）：', '未命名书稿-' + stamp);
    if (name === null) return;
    try {
      await F.post('api/newbook', { name });
    } catch (e) {
      F.toast('新建失败：' + (e.message || e));
      return;
    }
    F.toast('已新建「' + name.trim() + '」');
    refresh();
  }

  F.catalog = { refresh, newBook };
})();
