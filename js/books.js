/* Floria LaTeX — 入口页/书库卡：列表·网格·排序·搜索·行内 ⋯ + 打开书稿 + 新建
   数据唯一来源 = 本地服务器扫盘（/api/books · /api/read · /api/newbook）。 */
(function () {
  'use strict';
  const F = (window.Floria = window.Floria || {});
  const $ = F.$, S = F.S;

  function backToDash() {
    F.editor.flushSave();
    S.local = null;
    $('view-editor').classList.add('hidden');
    $('pdf-wrap').classList.add('hidden');
    $('tb-pdf').classList.add('hidden');
    $('preview-pane').classList.remove('mode-pdf');
    if (window.PdfView) PdfView.destroy();
    S.pdfLoadedMtime = 0;
    $('view-dashboard').classList.remove('hidden');
    location.hash = '';
    refreshBookList();
  }

  /* ---------- 打开书稿 ---------- */
  async function openBook(cfg) {
    const imgMap = {};
    for (const [name, url] of Object.entries(cfg.images || {})) imgMap[name.toLowerCase()] = url;
    S.local = { texName: cfg.texName, imgMap, folder: cfg.folder, pdfInfo: cfg.pdfInfo || null, openText: cfg.text };
    $('proj-title').textContent = `${cfg.folder} / ${cfg.texName}`;
    F.editor.ensureCM();
    S.cmReady = false;
    S.cm.setValue(cfg.text);
    S.cmReady = true;
    $('view-dashboard').classList.add('hidden');
    $('view-editor').classList.remove('hidden');
    S.pdfLoadedMtime = 0;
    $('preview-pane').classList.add('mode-pdf');
    $('pdf-wrap').classList.remove('hidden');
    $('tb-pdf').classList.remove('hidden');
    F.panes.clampEditor();
    F.panes.syncTopbar();
    F.pdf.loadOrCompilePdf();
    setTimeout(() => { S.cm.refresh(); F.editor.renderNow(); F.panes.clampEditor(); F.panes.syncTopbar(); }, 0);
    location.hash = 'local';
  }

  async function openServerBook(name) {
    try {
      const r = await fetch('api/read?book=' + encodeURIComponent(name));
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || ('HTTP ' + r.status));
      const images = {};
      (d.images || []).forEach(n => { images[n.toLowerCase()] = 'img/' + encodeURIComponent(name) + '/' + encodeURIComponent(n); });
      await openBook({ folder: name, texName: d.texName, text: d.text, images, pdfInfo: d.pdf || null });
      F.toast('已打开「' + name + '」（Ctrl+S 写回磁盘）');
    } catch (e) {
      F.toast('打开失败：' + (e.message || e));
    }
  }

  /* ---------- 书库列表（唯一入口来源：磁盘上含 .tex 的目录） ---------- */
  /* 相对时间：刚刚 / N分钟前 / N小时前 / N天前 / YYYY/M/D；ms 取不到给「—」 */
  function fmtRel(ms) {
    if (!ms || ms < 0) return '—';
    const d = Date.now() - ms;
    if (d < 60e3) return '刚刚';
    if (d < 3600e3) return Math.floor(d / 60e3) + '分钟前';
    if (d < 86400e3) return Math.floor(d / 3600e3) + '小时前';
    if (d < 7 * 86400e3) return Math.floor(d / 86400e3) + '天前';
    const t = new Date(ms);
    return t.getFullYear() + '/' + (t.getMonth() + 1) + '/' + t.getDate();
  }
  const fmtFull = ms => (ms ? new Date(ms).toLocaleString('zh-CN', { hour12: false }) : '');

  /* 扫描项目目录 → 书库（取数只在这里，渲染全在 renderBooks） */
  async function refreshBookList() {
    try {
      const r = await fetch('api/books');
      const list = await r.json();
      if (!r.ok || !Array.isArray(list)) throw new Error('HTTP ' + r.status);
      S.serverOK = true;
      S.booksCache = list;
      $('srv-section').classList.remove('hidden');
      // 复位空态文案：catch 分支会改写这两段，服务器恢复后必须改回来（否则一直显示「没连上」）
      $('dash-empty').querySelector('p').textContent = '书库里还没有书稿';
      $('dash-empty').querySelector('.empty-hint').textContent =
        '点右上角「＋ 新建书稿」建一篇，或把「main.tex + 配图」的目录拷进项目根目录后点「刷新书库」';
      renderBooks();
    } catch (_) {
      // 没有后端（file:// 直开）→ 书稿读写无从谈起，明确提示怎么起来
      S.serverOK = false;
      S.booksCache = [];
      $('srv-section').classList.add('hidden');
      $('dash-empty').classList.remove('hidden');
      $('dash-empty').querySelector('p').textContent = '没连上本地服务器';
      $('dash-empty').querySelector('.empty-hint').textContent =
        '本页的书稿全部来自磁盘扫描，需要本地服务：双击 .claude/preview/启动.bat，或从 Floria 网页「项目」tab 打开本项目的预览';
    }
  }

  /* 搜索 + 排序 + 渲染（视图二选一；所有数据一律 textContent 写入，不拼 innerHTML） */
  function renderBooks() {
    const q = S.dashQuery.trim().toLowerCase();
    const rows = S.booksCache
      .filter(b => !q || b.name.toLowerCase().includes(q))
      .slice()
      .sort((a, b) => {
        const v = S.sortKey === 'mtime'
          ? (a.mtime || 0) - (b.mtime || 0)
          : a.name.localeCompare(b.name, 'zh');
        return v * S.sortDir;
      });

    const box = $('srv-books');
    box.textContent = '';
    box.classList.toggle('project-grid', S.dashView === 'grid');
    const none = $('dl-none');
    const noHit = rows.length === 0 && S.booksCache.length > 0;
    none.textContent = q ? '没有匹配「' + S.dashQuery.trim() + '」的书稿' : '没有匹配的书稿';
    none.classList.toggle('hidden', !noHit);
    $('dash-empty').classList.toggle('hidden', S.booksCache.length > 0);
    if (!rows.length) return;

    if (S.dashView === 'grid') {
      rows.forEach(b => box.appendChild(gridCard(b)));
    } else {
      box.appendChild(bookTable(rows));
    }
  }

  /* 网格视图：沿用卡片观感 */
  function gridCard(b) {
    const card = document.createElement('button');
    card.className = 'project-card srv-card';
    const title = document.createElement('div');
    title.className = 'pc-title';
    const dot = document.createElement('span'); dot.className = 'srv-dot';
    const nm = document.createElement('span'); nm.textContent = b.name;
    title.append(dot, nm);
    const meta = document.createElement('div');
    meta.className = 'pc-meta';
    const m1 = document.createElement('span');
    m1.textContent = b.texName + ' · ' + (b.images || []).length + ' 图';
    const m2 = document.createElement('span');
    m2.textContent = fmtRel(b.mtime);
    meta.append(m1, m2);
    card.append(title, meta);
    card.addEventListener('click', () => openServerBook(b.name));
    return card;
  }

  /* 列表视图：可排序表格。名称/修改时间两列可点，同列再点翻向 */
  function bookTable(rows) {
    const table = document.createElement('table');
    table.className = 'book-table';

    const sortTh = (label, key) => {
      const el = document.createElement('th');
      el.className = 'bt-sort' + (S.sortKey === key ? ' on' : '');
      el.appendChild(document.createTextNode(label));
      const ar = document.createElement('span');
      ar.className = 'bt-arrow';
      ar.textContent = S.sortKey === key ? (S.sortDir > 0 ? '↑' : '↓') : '⇅';
      el.appendChild(ar);
      el.addEventListener('click', () => {
        if (S.sortKey === key) S.sortDir = -S.sortDir; else { S.sortKey = key; S.sortDir = 1; }
        renderBooks();
      });
      return el;
    };

    const hr = document.createElement('tr');
    hr.append(sortTh('名称', 'name'));
    const thFile = document.createElement('th'); thFile.textContent = '主文件';
    const thImg = document.createElement('th'); thImg.className = 'num'; thImg.textContent = '配图';
    const thTime = sortTh('修改时间', 'mtime'); thTime.className += ' num';
    const thMore = document.createElement('th'); thMore.className = 'bt-cmore';
    hr.append(thFile, thImg, thTime, thMore);
    const thead = document.createElement('thead'); thead.appendChild(hr);
    table.appendChild(thead);

    const tb = document.createElement('tbody');
    rows.forEach(b => {
      const tr = document.createElement('tr');
      tr.className = 'book-row';
      // ⋯ 按钮在行内，它的 click 先于 #srv-books 上的委托到达这里（后者在外层），
      // 那里再 stopPropagation 已经晚了 —— 必须在这里主动让路
      tr.addEventListener('click', e => { if (!e.target.closest('.dl-more')) openServerBook(b.name); });

      const tdName = document.createElement('td');
      const nameWrap = document.createElement('div');
      nameWrap.className = 'bt-name';
      const dot = document.createElement('span'); dot.className = 'srv-dot';
      const nm = document.createElement('span'); nm.className = 'bt-name-t'; nm.textContent = b.name;
      nameWrap.append(dot, nm);
      tdName.appendChild(nameWrap);

      const tdFile = document.createElement('td');
      tdFile.className = 'bt-file'; tdFile.textContent = b.texName;
      const tdImg = document.createElement('td');
      tdImg.className = 'num'; tdImg.textContent = (b.images || []).length;
      const tdTime = document.createElement('td');
      tdTime.className = 'num'; tdTime.textContent = fmtRel(b.mtime); tdTime.title = fmtFull(b.mtime);

      const tdMore = document.createElement('td');
      tdMore.className = 'bt-more';
      const mb = document.createElement('button');
      mb.className = 'icon-btn dl-more'; mb.textContent = '⋯'; mb.title = '更多';
      mb.dataset.book = b.name;
      tdMore.appendChild(mb);

      tr.append(tdName, tdFile, tdImg, tdTime, tdMore);
      tb.appendChild(tr);
    });
    table.appendChild(tb);
    return table;
  }

  /* 行内 ⋯ 菜单：position:fixed，被夹在视口内 */
  function closeMenu() {
    if (!S.menuBook) return;
    S.menuBook = '';
    $('dl-menu').classList.add('hidden');
  }
  function openMenu(btn) {
    const menu = $('dl-menu');
    S.menuBook = btn.dataset.book;
    menu.dataset.book = S.menuBook;
    menu.classList.remove('hidden');
    const r = btn.getBoundingClientRect(), m = menu.getBoundingClientRect();
    let top = r.bottom + 6;
    if (top + m.height > innerHeight - 8) top = r.top - m.height - 6;
    menu.style.left = Math.max(8, Math.min(r.right - m.width, innerWidth - m.width - 8)) + 'px';
    menu.style.top = Math.max(8, top) + 'px';
  }

  function applyDashView() {
    $('dl-view-list').classList.toggle('on', S.dashView === 'list');
    $('dl-view-grid').classList.toggle('on', S.dashView === 'grid');
    $('dl-view-list').setAttribute('aria-pressed', String(S.dashView === 'list'));
    $('dl-view-grid').setAttribute('aria-pressed', String(S.dashView === 'grid'));
  }
  function setDashView(v) {
    S.dashView = v;
    try { localStorage.setItem('florialatex.view', v); } catch (_) {}
    applyDashView();
    renderBooks();
  }

  /* 新建书稿：在项目根下建目录 + main.tex 模板（随后即被扫描到） */
  async function newBook() {
    if (!S.serverOK) { F.toast('需要本地服务器：双击 .claude/preview/启动.bat 或从 Floria 网页项目 tab 打开'); return; }
    const name = prompt('新书稿名字（将在项目目录下建「名字/main.tex」）：',
                        '未命名书稿-' + new Date().toLocaleDateString('zh-CN').replace(/\//g, ''));
    if (name === null) return;
    try {
      const r = await fetch('api/newbook', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || ('HTTP ' + r.status));
      F.toast('已新建「' + j.name + '」');
      await refreshBookList();
      openServerBook(j.name);
    } catch (e) {
      F.toast('新建失败：' + (e.message || e));
    }
  }

  function renameProject() {
    F.toast(S.local ? '标题跟随磁盘目录名（改目录名即改名）' : '未打开书稿');
  }

  /* ---------- 入口页与书库绑定 ---------- */
  $('btn-new').addEventListener('click', newBook);
  $('btn-refresh').addEventListener('click', () => { refreshBookList(); F.toast('已刷新书库'); });
  $('btn-back').addEventListener('click', backToDash);
  $('proj-title').addEventListener('click', renameProject);

  /* 入口页：搜索 / 视图切换 / 行内 ⋯ 菜单 */
  $('dl-search').addEventListener('input', e => { S.dashQuery = e.target.value; renderBooks(); });
  $('dl-view-list').addEventListener('click', () => setDashView('list'));
  $('dl-view-grid').addEventListener('click', () => setDashView('grid'));
  $('srv-books').addEventListener('click', e => {
    const mb = e.target.closest('.dl-more');
    if (!mb) return;
    e.stopPropagation();                     // 别让整行点击把书打开
    const menu = $('dl-menu');
    const same = S.menuBook === mb.dataset.book && !menu.classList.contains('hidden');
    closeMenu();
    if (!same) openMenu(mb);
  });
  $('dl-menu').addEventListener('click', async e => {
    const mi = e.target.closest('.dl-mi');
    if (!mi || !S.menuBook) return;
    const book = S.menuBook;
    closeMenu();
    if (mi.dataset.act === 'open') {
      openServerBook(book);
    } else if (mi.dataset.act === 'copy') {
      try { await navigator.clipboard.writeText(book); F.toast('已复制书稿名'); }
      catch (_) { F.toast('复制失败，请手动选择'); }
    }
  });

  F.books = { backToDash, openBook, openServerBook, refreshBookList, renderBooks, newBook, renameProject, closeMenu, openMenu, applyDashView, setDashView, fmtRel };
})();
