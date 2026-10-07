/* Floria LaTeX — 应用装配：仪表盘 / 编辑器 / 大纲 / 同步 / 主题
   单模式：本地服务器（或 Floria 网关）扫描项目目录发现书稿，数据全在磁盘。 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const R = window.FloriaRender;

  let cm = null;
  let cmReady = false; // setValue 引发的 change 不算用户编辑（避免打开即写盘 bump mtime）
  let saveTimer = null, renderTimer = null, toastTimer = null;
  let serverOK = false;   // 后端可达（/api/books 通）
  let local = null;       // 当前打开的书稿：{folder, texName, imgMap, pdfInfo, openText}

  /* ---------- 通用 ---------- */
  function toast(text) {
    const t = $('toast');
    t.textContent = text;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 2200);
  }

  function applyTheme() {
    const theme = localStorage.getItem('florialatex.theme') || 'light';
    document.documentElement.dataset.theme = theme;
    $('btn-theme').textContent = theme === 'dark' ? '☀' : '☾';
  }
  function toggleTheme() {
    const cur = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('florialatex.theme', cur);
    applyTheme();
  }

  /* ---------- 编辑器 ---------- */
  function ensureCM() {
    if (cm) return;
    cm = CodeMirror.fromTextArea($('src'), {
      mode: 'stex',
      theme: 'floria',
      lineNumbers: true,
      styleActiveLine: true,
      autoCloseBrackets: true,
      matchBrackets: true,
      lineWrapping: true,
      indentUnit: 2,
      tabSize: 2,
      extraKeys: {
        'Ctrl-Enter': () => pvRender(),
        'Ctrl-S': () => { if (local) writeLocal(); return false; },
        'Cmd-Enter': () => pvRender(),
        'Cmd-S': () => { if (local) writeLocal(); return false; },
      },
    });
    cm.on('change', () => { if (!cmReady) return; scheduleSave(); scheduleRender(); });
    cm.on('cursorActivity', () => {
      const c = cm.getCursor();
      $('st-pos').textContent = `行 ${c.line + 1}，列 ${c.ch + 1}`;
    });
  }

  function backToDash() {
    flushSave();
    local = null;
    $('view-editor').classList.add('hidden');
    $('pdf-wrap').classList.add('hidden');
    $('tb-pdf').classList.add('hidden');
    $('preview-pane').classList.remove('mode-pdf');
    if (window.PdfView) PdfView.destroy();
    pdfLoadedMtime = 0;
    $('view-dashboard').classList.remove('hidden');
    location.hash = '';
    refreshBookList();
  }

  function flushSave() {
    if (!cm || !local) return;
    clearTimeout(saveTimer);
    writeLocal();
  }
  function scheduleSave() {
    if (!local) return;
    $('st-save').textContent = '编辑中…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(writeLocal, 600);
  }
  /* 保存：经本地服务器 /api/write 写回磁盘真实文件 */
  async function writeLocal() {
    if (!local || !cm) return;
    const t = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    const text = cm.getValue();
    if (text === local.openText) { // 内容没变不写盘，避免 bump mtime 让 PDF 误报过期
      $('st-save').textContent = '无改动 ' + t;
      return;
    }
    try {
      const r = await fetch('api/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ book: local.folder, file: local.texName, content: cm.getValue() })
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || ('HTTP ' + r.status));
      $('st-save').textContent = '已写入磁盘 ' + t;
      local.openText = text;
      if (local.pdfInfo && local.pdfInfo.exists) {
        local.pdfInfo.fresh = false;
        setPdfState('stale', '● 源码已改', '点此重新编译更新 PDF');
      }
    } catch (e) {
      $('st-save').textContent = '保存失败：' + (e.message || e);
    }
  }
  function scheduleRender() {
    if (hasBackend()) return; // 服务器模式不逐键重排版，编译走胶囊/Ctrl+Enter
    clearTimeout(renderTimer);
    renderTimer = setTimeout(renderNow, 450);
  }

  let lastOutline = [];
  let renderSeq = 0;
  const quickCache = {}; // 文件夹名 → {text, res}：重进秒开（结构缓存，公式仍异步水合）

  function renderNow() {
    if (!cm) return;
    const seq = ++renderSeq;
    const text = cm.getValue();
    const key = local ? local.folder : null;
    if (key && quickCache[key] && quickCache[key].text === text) {
      applyRender(quickCache[key].res, seq);
      return;
    }
    const res = R.render(text, local ? { images: local.imgMap } : undefined);
    if (key) quickCache[key] = { text, res };
    applyRender(res, seq);
  }

  function applyRender(res, seq) {
    $('paper').innerHTML = res.html;
    lastOutline = res.outline;
    buildOutline(res.outline);
    const s = res.stats;
    $('st-words').textContent = `${s.chars} 字`;
    $('st-math').textContent = `${s.math} 公式`;
    $('paper').querySelectorAll('.toc a[data-target]').forEach(a => {
      a.addEventListener('click', () => {
        const sec = $('paper').querySelector('#' + CSS.escape(a.dataset.target));
        if (sec) { sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); jumpEditor(sec.dataset.line); }
      });
    });
    if (!hasBackend()) {
      R.hydrate($('paper'), () => seq !== renderSeq); // 分块水合公式，期间页面可交互（PDF 模式跳过省 CPU）
    }
  }

  function buildOutline(outline) {
    const box = $('outline-list');
    box.innerHTML = '';
    for (const o of outline) {
      const a = document.createElement('a');
      a.className = 'ol-item lv' + o.lv;
      a.dataset.target = o.id;
      a.dataset.line = o.line;
      a.textContent = (o.num ? o.num + '  ' : '') + o.text;
      a.addEventListener('click', () => {
        const sec = $('paper').querySelector('#' + CSS.escape(o.id));
        if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
        jumpEditor(o.line);
      });
      box.appendChild(a);
    }
  }

  /* 预览滚动 → 大纲高亮 */
  $('preview-pane').addEventListener('scroll', () => {
    if (!lastOutline.length) return;
    const pane = $('preview-pane');
    const top = pane.scrollTop + 90;
    let active = null;
    for (const o of lastOutline) {
      const sec = $('paper').querySelector('#' + CSS.escape(o.id));
      if (sec && sec.offsetTop <= top) active = o;
    }
    $('outline-list').querySelectorAll('.ol-item').forEach(a => {
      a.classList.toggle('active', !!active && a.dataset.target === active.id);
    });
  });

  function jumpEditor(line, flash) {
    if (!cm || !line) return;
    const ln = Math.max(0, Math.min(line - 1, cm.lineCount() - 1));
    cm.focus();
    cm.setCursor({ line: ln, ch: 0 });
    // 目标行滚到编辑器纵向中间，便于看清上下文
    const h = cm.getWrapperElement().clientHeight;
    cm.scrollIntoView({ line: ln, ch: 0 }, Math.max(60, Math.round(h / 2) - 20));
    if (flash) {
      cm.addLineClass(ln, 'background', 'cm-flash');
      setTimeout(() => cm.removeLineClass(ln, 'background', 'cm-flash'), 1500);
    }
  }

  /* 预览点击 → 回跳源码行 */
  $('paper').addEventListener('click', e => {
    const block = e.target.closest('[data-line]');
    if (block) jumpEditor(+block.dataset.line);
  });

  /* ---------- 顶栏 / 列卡共线 ---------- */
  /* 每张顶栏卡 = 它下方那一列：卡宽由列的右缘反推（左上角图标是绝对定位覆盖件，不占行内宽度，
     故首卡左缘天然 = 首列左缘），于是卡宽恒 = 列宽、卡缘 = 列缘；两级缝宽都是 --gap，
     故卡缘对齐 ⇒ 顶栏缝隙中线 = 列间缝中线。末卡不再 flex:1 —— 末列右缘可能被 margin 内缩，
     flex:1 会把那段补进卡里。逐卡顺序设置（读 rect 强制回流）故一次收敛。 */
  const PAIRS = [['tb-editor', 'editor-pane'], ['tb-chat', 'chat-pane'], ['tb-preview', 'preview-pane']];

  function syncTopbar() {
    const bar = $('topbar');
    if (!bar) return;
    const gap = parseFloat(getComputedStyle(bar).columnGap) || 0;
    PAIRS.forEach(([cid, pid]) => {
      const card = $(cid);
      if (!card || card.classList.contains('hidden')) return;
      const x = $(pid).getBoundingClientRect().right + gap / 2;
      const w = x - card.getBoundingClientRect().left - gap / 2;
      card.style.flex = '0 0 auto';
      if (w > 0) card.style.width = w + 'px';
    });
  }

  /* 编辑器列宽上下限：助手列固定宽、预览列有最小宽，不预留就会整行溢出（竖排 PDF 下表现为预览跑出视口） */
  function editorBounds() {
    const wsW = $('workspace').clientWidth || 1;
    let used = PANES.code ? (parseFloat(getComputedStyle($('divider')).width) || 0) : 0;
    if (PANES.ai) used += $('chat-pane').offsetWidth + (parseFloat(getComputedStyle($('chat-pane')).marginRight) || 0);
    if (PANES.pdf) used += 260;                        // #preview-pane min-width
    return { min: 18, max: Math.min(72, Math.max(18, (wsW - used) / wsW * 100)) };
  }

  function clampEditor() {
    const ed = $('editor-pane'), ws = $('workspace');
    if (!ws.clientWidth) return;                       // 编辑器视图还没显示 → 量不到宽，别夹（否则按 0 宽算出 18%）
    const m = /([\d.]+)%/.exec(ed.style.flex || '');
    const pct = m ? parseFloat(m[1]) : 44;
    const b = editorBounds();
    const next = Math.min(b.max, Math.max(b.min, pct));
    if (Math.abs(next - pct) > 0.01) ed.style.flex = '0 0 ' + next.toFixed(4) + '%';
  }

  /* ---------- 视图开关（代码 / PDF / 助手） ---------- */
  const PANES = { code: true, pdf: true, ai: false };   // ai 默认关（与 Prism 一致：助手按需打开）
  const PKEY = 'florialatex.panes';
  /* #divider 随代码列一起隐藏：它只服务于「拖编辑器宽度」，代码列不在时留着会在最左占掉一条缝、
     把首列整体右推（顶栏没有对应沟槽，共线即断） */
  const PANE_NODES = { code: ['editor-pane', 'tb-editor', 'divider'], pdf: ['preview-pane', 'tb-preview'], ai: ['chat-pane', 'tb-chat'] };

  function loadPanes() {
    try {
      const s = JSON.parse(localStorage.getItem(PKEY) || '{}');
      for (const k of Object.keys(PANES)) if (typeof s[k] === 'boolean') PANES[k] = s[k];
    } catch (e) { /* 坏值 → 用默认 */ }
    if (!PANES.code && !PANES.pdf && !PANES.ai) PANES.pdf = true;
  }

  function applyPanes() {
    for (const [k, ids] of Object.entries(PANE_NODES)) {
      for (const id of ids) $(id).classList.toggle('hidden', !PANES[k]);
    }
    document.querySelectorAll('#panes-panel .pn-row').forEach(r => {
      r.setAttribute('aria-checked', PANES[r.dataset.pane] ? 'true' : 'false');
    });
    const first = ['tb-editor', 'tb-chat', 'tb-preview'].find(id => !$(id).classList.contains('hidden'));
    document.querySelectorAll('#topbar .tb-seg').forEach(c => c.classList.toggle('lead-pad', c.id === first));
    try { localStorage.setItem(PKEY, JSON.stringify(PANES)); } catch (e) {}
    clampEditor();
    syncTopbar();
  }

  function setPane(k, on) {
    if (PANES[k] === on) return;
    if (!on) {   // 至少保留一列，否则工作区会空掉
      const others = Object.keys(PANES).filter(x => x !== k);
      if (others.every(x => !PANES[x])) { toast('至少保留一栏'); return; }
    }
    PANES[k] = on;
    applyPanes();
    $('panes-panel').classList.add('hidden');
    $('btn-panes').setAttribute('aria-expanded', 'false');
    setTimeout(() => { if (PANES.code && cm) cm.refresh(); syncTopbar(); }, 0);
  }
  (function divider() {
    const div = $('divider'), editor = $('editor-pane'), ws = $('workspace');
    let drag = false;
    div.addEventListener('mousedown', e => { drag = true; e.preventDefault(); });
    window.addEventListener('mousemove', e => {
      if (!drag) return;
      const rect = ws.getBoundingClientRect();
      const b = editorBounds();
      const pct = Math.min(b.max, Math.max(b.min, (e.clientX - rect.left) / rect.width * 100));
      editor.style.flex = `0 0 ${pct}%`;
      syncTopbar();
    });
    window.addEventListener('mouseup', () => { drag = false; if (cm) cm.refresh(); });
    window.addEventListener('resize', () => { clampEditor(); syncTopbar(); });
  })();

  /* ---------- 书稿操作（数据全在磁盘：服务器读盘 + 扫描发现） ---------- */
  async function openBook(cfg) {
    const imgMap = {};
    for (const [name, url] of Object.entries(cfg.images || {})) imgMap[name.toLowerCase()] = url;
    local = { texName: cfg.texName, imgMap, folder: cfg.folder, pdfInfo: cfg.pdfInfo || null, openText: cfg.text };
    $('proj-title').textContent = `${cfg.folder} / ${cfg.texName}`;
    ensureCM();
    cmReady = false;
    cm.setValue(cfg.text);
    cmReady = true;
    $('view-dashboard').classList.add('hidden');
    $('view-editor').classList.remove('hidden');
    pdfLoadedMtime = 0;
    $('preview-pane').classList.add('mode-pdf');
    $('pdf-wrap').classList.remove('hidden');
    $('tb-pdf').classList.remove('hidden');
    clampEditor();
    syncTopbar();
    loadOrCompilePdf();
    setTimeout(() => { cm.refresh(); renderNow(); clampEditor(); syncTopbar(); }, 0);
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
      toast('已打开「' + name + '」（Ctrl+S 写回磁盘）');
    } catch (e) {
      toast('打开失败：' + (e.message || e));
    }
  }

  /* ---------- 书库列表（唯一入口来源：磁盘上含 .tex 的目录） ---------- */
  let booksCache = [];                        // /api/books 原始返回
  let dashQuery = '';                         // 搜索词（纯前端过滤，不重新取数）
  let sortKey = 'name', sortDir = 1;          // 列表视图排序：同列再点翻向
  let dashView = 'list';                      // 'list' 表格 | 'grid' 卡片
  let menuBook = '';
  try { if (localStorage.getItem('florialatex.view') === 'grid') dashView = 'grid'; } catch (_) {}

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
      serverOK = true;
      booksCache = list;
      $('srv-section').classList.remove('hidden');
      // 复位空态文案：catch 分支会改写这两段，服务器恢复后必须改回来（否则一直显示「没连上」）
      $('dash-empty').querySelector('p').textContent = '书库里还没有书稿';
      $('dash-empty').querySelector('.empty-hint').textContent =
        '点右上角「＋ 新建书稿」建一篇，或把「main.tex + 配图」的目录拷进项目根目录后点「刷新书库」';
      renderBooks();
    } catch (_) {
      // 没有后端（file:// 直开）→ 书稿读写无从谈起，明确提示怎么起来
      serverOK = false;
      booksCache = [];
      $('srv-section').classList.add('hidden');
      $('dash-empty').classList.remove('hidden');
      $('dash-empty').querySelector('p').textContent = '没连上本地服务器';
      $('dash-empty').querySelector('.empty-hint').textContent =
        '本页的书稿全部来自磁盘扫描，需要本地服务：双击 .claude/preview/启动.bat，或从 Floria 网页「项目」tab 打开本项目的预览';
    }
  }

  /* 搜索 + 排序 + 渲染（视图二选一；所有数据一律 textContent 写入，不拼 innerHTML） */
  function renderBooks() {
    const q = dashQuery.trim().toLowerCase();
    const rows = booksCache
      .filter(b => !q || b.name.toLowerCase().includes(q))
      .slice()
      .sort((a, b) => {
        const v = sortKey === 'mtime'
          ? (a.mtime || 0) - (b.mtime || 0)
          : a.name.localeCompare(b.name, 'zh');
        return v * sortDir;
      });

    const box = $('srv-books');
    box.textContent = '';
    box.classList.toggle('project-grid', dashView === 'grid');
    const none = $('dl-none');
    const noHit = rows.length === 0 && booksCache.length > 0;
    none.textContent = q ? '没有匹配「' + dashQuery.trim() + '」的书稿' : '没有匹配的书稿';
    none.classList.toggle('hidden', !noHit);
    $('dash-empty').classList.toggle('hidden', booksCache.length > 0);
    if (!rows.length) return;

    if (dashView === 'grid') {
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
      el.className = 'bt-sort' + (sortKey === key ? ' on' : '');
      el.appendChild(document.createTextNode(label));
      const ar = document.createElement('span');
      ar.className = 'bt-arrow';
      ar.textContent = sortKey === key ? (sortDir > 0 ? '↑' : '↓') : '⇅';
      el.appendChild(ar);
      el.addEventListener('click', () => {
        if (sortKey === key) sortDir = -sortDir; else { sortKey = key; sortDir = 1; }
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
    if (!menuBook) return;
    menuBook = '';
    $('dl-menu').classList.add('hidden');
  }
  function openMenu(btn) {
    const menu = $('dl-menu');
    menuBook = btn.dataset.book;
    menu.dataset.book = menuBook;
    menu.classList.remove('hidden');
    const r = btn.getBoundingClientRect(), m = menu.getBoundingClientRect();
    let top = r.bottom + 6;
    if (top + m.height > innerHeight - 8) top = r.top - m.height - 6;
    menu.style.left = Math.max(8, Math.min(r.right - m.width, innerWidth - m.width - 8)) + 'px';
    menu.style.top = Math.max(8, top) + 'px';
  }

  function applyDashView() {
    $('dl-view-list').classList.toggle('on', dashView === 'list');
    $('dl-view-grid').classList.toggle('on', dashView === 'grid');
    $('dl-view-list').setAttribute('aria-pressed', String(dashView === 'list'));
    $('dl-view-grid').setAttribute('aria-pressed', String(dashView === 'grid'));
  }
  function setDashView(v) {
    dashView = v;
    try { localStorage.setItem('florialatex.view', v); } catch (_) {}
    applyDashView();
    renderBooks();
  }

  /* 新建书稿：在项目根下建目录 + main.tex 模板（随后即被扫描到） */
  async function newBook() {
    if (!serverOK) { toast('需要本地服务器：双击 .claude/preview/启动.bat 或从 Floria 网页项目 tab 打开'); return; }
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
      toast('已新建「' + j.name + '」');
      await refreshBookList();
      openServerBook(j.name);
    } catch (e) {
      toast('新建失败：' + (e.message || e));
    }
  }

  function renameProject() {
    toast(local ? '标题跟随磁盘目录名（改目录名即改名）' : '未打开书稿');
  }

  /* ---------- PDF 编译预览（latexmk 编译 → pdf.js 自绘查看器，Prism 风格） ---------- */
  let compiling = false, pdfLoadedMtime = 0;

  function hasBackend() { return serverOK && !!local; }
  function pvRender() { hasBackend() ? compilePdf(false) : renderNow(); }
  // 状态胶囊：state = none | busy | ok | stale | err
  function setPdfState(state, text, tip) {
    const b = $('pdf-state');
    b.className = 'pv-state st-' + state;
    b.textContent = text;
    b.title = tip || '';
    b.disabled = state === 'busy';
  }
  function pdfUrl(mtime) { return 'api/pdf?book=' + encodeURIComponent(local.folder) + '&v=' + mtime; }

  function onPagePdf(cur, total) {
    $('pdf-page-ind').textContent = cur + ' / ' + total;
  }
  function loadPdfView(mtime, state, text, tip) {
    setPdfState(state, text, tip);
    pdfLoadedMtime = mtime;
    PdfView.load(pdfUrl(mtime), onPagePdf, pickPdf)
      .catch(e => { console.error(e); setPdfState('err', '✕ PDF 加载失败', '点击状态胶囊重编译'); });
  }

  /* 点 PDF → 查 synctex 反查源码行 → 编辑器跳过去并闪烁标记 */
  async function pickPdf(page, x, y) {
    if (!local) return;
    try {
      const r = await fetch('api/sync?book=' + encodeURIComponent(local.folder) + '&page=' + page +
                            '&x=' + x.toFixed(1) + '&y=' + y.toFixed(1));
      const j = await r.json();
      if (!j.ok) { toast(j.error || '该位置没有源码映射'); return; }
      PdfView.markAt(page, x, y);
      jumpEditor(j.line, true);
      const stale = local.pdfInfo && !local.pdfInfo.fresh;
      toast('→ ' + j.texName + ' 第 ' + j.line + ' 行' + (stale ? '（PDF 是上次编译的版本，行号可能有偏差）' : ''));
    } catch (e) {
      toast('跳转失败：' + (e.message || e));
    }
  }

  async function compilePdf(auto) {
    if (!hasBackend() || compiling) return;
    compiling = true;
    setPdfState('busy', '编译中…', (auto ? '首次自动编译，' : '') + 'MATH 这类带 tikz 的书稿约 30–90 秒');
    try {
      const r = await fetch('api/compile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ book: local.folder })
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setPdfState('err', '✕ 编译失败', (j.error || '未知错误') + ' · 完整日志见浏览器控制台 · 点此重试');
        if (j.log) console.error('[LaTeX 编译日志]\n' + j.log);
        return;
      }
      local.pdfInfo = { exists: true, fresh: true, mtime: j.mtime };
      loadPdfView(j.mtime, 'ok', '✓ 已编译', '用时 ' + j.time + 's · 改码后点此或 Ctrl+Enter 重编 · 原始日志见控制台');
      console.log('[PDF] 编译完成，用时 ' + j.time + 's');
    } catch (e) {
      setPdfState('err', '✕ 编译失败', (e.message || e) + ' · 点此重试');
    } finally {
      compiling = false;
    }
  }
  function loadOrCompilePdf() {
    if (!hasBackend()) return;
    const info = local.pdfInfo;
    if (info && info.exists) {
      const text = info.fresh ? '✓ 已编译' : '● 源码已改';
      const tip = info.fresh ? '与源码同步 · 点此重新编译' : '显示的是上次编译结果 · 点此重新编译';
      if (pdfLoadedMtime !== info.mtime) loadPdfView(info.mtime, info.fresh ? 'ok' : 'stale', text, tip);
      else setPdfState(info.fresh ? 'ok' : 'stale', text, tip);
    } else {
      compilePdf(true); // 从未编译过 → 打开即自动编一次
    }
  }
  $('pdf-state').addEventListener('click', () => { if (!compiling) compilePdf(false); });
  $('pdf-prev').addEventListener('click', () => PdfView.prev());
  $('pdf-next').addEventListener('click', () => PdfView.next());

  /* 缩放折叠胶囊：展开面板（预设档位 / 自动缩放 / 底部自由滑杆），点外部收起 */
  function syncZoomUI() {
    if (!window.PdfView || !PdfView.getZoom) return;
    const z = String(PdfView.getZoom());
    document.querySelectorAll('#zoom-panel button[data-zoom]').forEach(b => {
      b.classList.toggle('on', b.dataset.zoom === z);
    });
  }
  $('pdf-zoom-toggle').addEventListener('click', e => {
    e.stopPropagation();
    const p = $('zoom-panel');
    p.classList.toggle('hidden');
    if (!p.classList.contains('hidden')) syncZoomUI();
  });
  document.addEventListener('click', e => {
    if (e.target.closest('#zoom-panel') || e.target.closest('#pdf-zoom-toggle')) return;
    $('zoom-panel').classList.add('hidden');
  });
  $('zoom-panel').addEventListener('click', e => {
    const b = e.target.closest('button[data-zoom]');
    if (!b) return;
    const v = b.dataset.zoom;
    if (v === 'fit') PdfView.zoomFit();
    else if (v === 'fitpage') PdfView.zoomFitPage();
    else PdfView.zoomSet(parseFloat(v));
    syncZoomUI();
  });
  $('pdf-zoom-range').addEventListener('input', e => {
    PdfView.zoomSet(parseInt(e.target.value, 10) / 100);
    syncZoomUI();
  });
  $('pdf-download').addEventListener('click', () => {
    if (!local || !local.pdfInfo || !local.pdfInfo.exists) return;
    const a = document.createElement('a');
    a.href = pdfUrl(local.pdfInfo.mtime);
    a.download = local.texName.replace(/\.tex$/i, '') + '.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
  });

  /* ---------- 视图开关浮层（照 #zoom-panel 的惯用法：点按钮展开、点外部收起） ---------- */
  $('btn-panes').addEventListener('click', e => {
    e.stopPropagation();
    const p = $('panes-panel');
    p.classList.toggle('hidden');
    $('btn-panes').setAttribute('aria-expanded', p.classList.contains('hidden') ? 'false' : 'true');
  });
  document.addEventListener('click', e => {
    if (e.target.closest('#panes-panel') || e.target.closest('#btn-panes')) return;
    $('panes-panel').classList.add('hidden');
    $('btn-panes').setAttribute('aria-expanded', 'false');
  });
  $('panes-panel').addEventListener('click', e => {
    const row = e.target.closest('.pn-row');
    if (row) setPane(row.dataset.pane, !PANES[row.dataset.pane]);
  });

  /* ---------- 助手列卡（UI 壳：后端未接入，发送只回占位文本） ---------- */
  const chatMsgs = $('chat-msgs');
  const chatInput = $('chat-input');
  const chatSend = $('chat-send');

  function chatScrollEnd() { const s = $('chat-scroll'); s.scrollTop = s.scrollHeight; }

  function chatPush(kind, text) {
    const row = document.createElement('div');
    row.className = 'chat-row ' + kind;
    const bub = document.createElement('div');
    bub.className = 'chat-bubble';
    bub.textContent = text;                 // 只写文本，不碰 innerHTML
    row.appendChild(bub);
    chatMsgs.appendChild(row);
    $('chat-empty').classList.add('hidden');
    chatScrollEnd();
  }

  function chatReset() {
    chatMsgs.textContent = '';
    $('chat-empty').classList.remove('hidden');
  }

  function chatGrow() {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 96) + 'px';
    chatSend.classList.toggle('off', !chatInput.value.trim());
  }

  function chatSubmit() {
    const t = chatInput.value.trim();
    if (!t) return;
    chatPush('user', t);
    chatInput.value = '';
    chatGrow();
    setTimeout(() => {
      chatPush('bot', '（占位回复）助手后端尚未接入 —— 本轮只做界面。连接方式定了之后在这里接流式输出。');
    }, 350);
  }

  chatInput.addEventListener('input', chatGrow);
  chatInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); chatSubmit(); }
  });
  chatSend.addEventListener('click', chatSubmit);
  $('chat-attach').addEventListener('click', () => toast('附件功能未接入'));
  $('chat-refresh').addEventListener('click', () => { chatReset(); toast('已清空对话'); });
  $('chat-collapse').addEventListener('click', () => setPane('ai', false));

  /* ---------- 事件绑定 ---------- */
  $('btn-new').addEventListener('click', newBook);
  $('btn-refresh').addEventListener('click', () => { refreshBookList(); toast('已刷新书库'); });
  $('btn-back').addEventListener('click', backToDash);

  /* 入口页：搜索 / 视图切换 / 行内 ⋯ 菜单 */
  $('dl-search').addEventListener('input', e => { dashQuery = e.target.value; renderBooks(); });
  $('dl-view-list').addEventListener('click', () => setDashView('list'));
  $('dl-view-grid').addEventListener('click', () => setDashView('grid'));
  $('srv-books').addEventListener('click', e => {
    const mb = e.target.closest('.dl-more');
    if (!mb) return;
    e.stopPropagation();                     // 别让整行点击把书打开
    const menu = $('dl-menu');
    const same = menuBook === mb.dataset.book && !menu.classList.contains('hidden');
    closeMenu();
    if (!same) openMenu(mb);
  });
  $('dl-menu').addEventListener('click', async e => {
    const mi = e.target.closest('.dl-mi');
    if (!mi || !menuBook) return;
    const book = menuBook;
    closeMenu();
    if (mi.dataset.act === 'open') {
      openServerBook(book);
    } else if (mi.dataset.act === 'copy') {
      try { await navigator.clipboard.writeText(book); toast('已复制书稿名'); }
      catch (_) { toast('复制失败，请手动选择'); }
    }
  });
  $('proj-title').addEventListener('click', renameProject);
  $('btn-outline-toggle').addEventListener('click', () => {
    $('outline').classList.toggle('hidden');
    setTimeout(() => { cm && cm.refresh(); syncTopbar(); }, 0);
  });
  $('btn-theme').addEventListener('click', toggleTheme);
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); if (local) writeLocal(); }
    if (e.key === 'Escape') closeMenu();
  });
  document.addEventListener('click', () => closeMenu());
  // 只认入口页自己的滚动容器：挂 window 捕获会收到 #pdf-scroll 等隐藏容器的滚动（编辑器隐藏时它仍会滚），
  // 一开菜单就被误关
  document.querySelector('.dash-body').addEventListener('scroll', closeMenu);
  window.addEventListener('resize', closeMenu);
  window.addEventListener('hashchange', () => {
    if (location.hash !== '#local' && local) backToDash();
  });

  /* ---------- 启动 ---------- */
  applyTheme();
  applyDashView();
  loadPanes();
  applyPanes();
  chatGrow();
  refreshBookList();
})();
