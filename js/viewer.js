/* Floria LaTeX v2 — 编辑页：满屏 PDF（自绘查看器 = js/pdfview.js，原样复用）+ 编译 + 缩放 + 翻页
   + 工具面板。顶栏只有三枚按钮：返回上级 / 编译 / 界面调整（编译态不再单列胶囊，折在编译按钮的文案里）。
   工具 tab 不写死：本文件只往 js/toolbar.js 的注册表里登记两枚
   （'ver' 版本 = 占位 / 'log' 日志 = 本次会话的编译记录），tab 条由注册表渲染。 */
(function () {
  'use strict';
  const F = window.Floria;
  const $ = F.$, esc = F.esc;
  const T = F.toolbar;

  const S = {
    book: '',            // 当前书稿名（= /api/books 里的 name）
    pdfMtime: 0,
    busy: false,
    logs: [],            // {ok, clock, elapsed, error, log}（内存，不落盘）
    tool: '',            // 当前展开的工具 id
    state: 'none',       // 编译五态
  };

  /* ---------------- 编译五态 = 编译按钮自己的文案（不再另立胶囊） ---------------- */
  const ST = { none: '编译', busy: '编译中…', ok: '编译', stale: '重新编译', err: '重试编译' };
  function setState(st) {
    S.state = st;
    const b = $('v-compile');
    if (!b) return;
    b.textContent = ST[st] || ST.none;
    b.className = 'vt-btn primary st-' + st;
    b.disabled = st === 'busy';
  }

  /* ---------------- 工具面板卡（注册表消费方） ---------------- */
  function markTabs(id) {
    document.querySelectorAll('#tool-tabs [data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === id));
  }
  // 工具面板开合的唯一开关。面板占满整块视图区（见 css #side-card），故只需显隐——
  // 不再有「卡压在 PDF 上、卡的区域还露着 PDF」这回事。
  function setCardOpen(on) {
    $('side-card').classList.toggle('hidden', !on);
  }
  // 唯一落点：切 pane 显隐 + tab active 态 + 开关面板卡。force=true 时不吃「点同一枚收起」。
  function applyToolTab(id, force) {
    const card = $('side-card');
    if (!id) { setCardOpen(false); S.tool = ''; markTabs(''); return; }   // 空 = 收起
    const nid = T.toolNormId(id);
    if (!force && nid && nid === S.tool && !card.classList.contains('hidden')) {
      setCardOpen(false); S.tool = ''; markTabs(''); return;
    }
    S.tool = nid;
    S.lastTool = nid;           // 收起后记住：再点「工具」仍开回这一枚
    if (!nid) { setCardOpen(false); markTabs(''); return; }
    T.mountTool(nid);
    // pane 显隐按**去重后的 pane id** 收敛：先全隐，再只显示当前工具的 pane。
    // 不能按 d.id !== nid 逐条 toggle —— 两枚工具共用同一 pane 时，后一条会把前一条刚显示的又隐回去。
    const panes = new Set();
    T.toolDefs().forEach(d => { if (d.pane) panes.add(d.pane); });
    panes.forEach(p => { const el = $(p); if (el) el.classList.add('hidden'); });
    const def = T.toolDef(nid);
    if (def && def.pane) { const el = $(def.pane); if (el) el.classList.remove('hidden'); }
    $('sc-title').textContent = def ? def.title : '';
    // 卡头 tab 条（注册表渲染）在场时不必再重复一枚文字标题；被宿主接管（tab 条空）时用它兜底
    syncScTitle();
    setCardOpen(true);
    markTabs(nid);
  }
  function syncScTitle() {
    const tabs = $('tool-tabs');
    const hasTabs = !!(tabs && tabs.children.length);
    const t = $('sc-title');
    if (t) t.classList.toggle('hidden', hasTabs);
  }

  /* ---------------- 日志 pane ---------------- */
  function listEl() { return $('tool-log'); }
  function renderLogPane() {
    const el = listEl();
    if (!el) return;
    const sec = n => '<div class="pane-sec"><span class="pane-sec-title">原始日志</span>' +
      '<span class="pane-sec-note">' + n + '</span></div>';
    if (!S.logs.length) {
      el.innerHTML = sec(0) + '<div class="pane-empty"><p class="pe-title">还没有编译记录</p>' +
        '<p class="pe-hint">点上方「编译」后，每次编译的结果与报错都会记在这里。</p></div>';
      return;
    }
    el.innerHTML = sec(S.logs.length) + S.logs.map(e => `
      <div class="log-row${e.ok ? '' : ' bad'}">
        <div class="log-head">
          <span class="log-mark">${e.ok ? '✓' : '✕'}</span>
          <span class="log-time">${esc(e.clock)}</span>
          <span class="log-el">${e.elapsed}s</span>
          <span class="log-brief">${esc(e.error || '编译通过')}</span>
        </div>
        <pre class="log-body hidden">${esc(e.log || '(无输出)')}</pre>
      </div>`).join('');
    el.querySelectorAll('.log-row').forEach(r => r.addEventListener('click', () => {
      const b = r.querySelector('.log-body');
      if (b) b.classList.toggle('hidden');
    }));
  }
  function pushLog(e) {
    const d = new Date();
    const two = n => (n < 10 ? '0' : '') + n;
    S.logs.unshift({
      ok: !!e.ok,
      clock: two(d.getHours()) + ':' + two(d.getMinutes()) + ':' + two(d.getSeconds()),
      elapsed: e.elapsed,
      error: e.error || '',
      log: e.log || '',
    });
    if (listEl() && listEl().dataset.mounted) renderLogPane();
  }

  /* ---------------- PDF 载入 / 编译 ---------------- */
  // soft=true：打开书稿时的「只读本地 PDF」路径——载不到不算编译失败，只回落成未编译态
  function loadPdf(soft) {
    if (!window.PdfView) return Promise.resolve();
    const v = S.pdfMtime || Date.now();
    return PdfView.load('api/pdf?book=' + encodeURIComponent(S.book) + '&v=' + v, (cur, total) => {
      $('pdf-page-ind').textContent = cur + ' / ' + total;
    }, onPick).then(() => {
      setState('ok');
    }).catch(err => {
      if (soft) {
        setState('none');
        F.toast('这篇还没有编译好的 PDF（.build/main.pdf）——点「编译」生成');
      } else {
        setState('err');
        pushLog({ ok: false, elapsed: '0.0', error: 'PDF 载入失败：' + (err && err.message || err), log: '' });
      }
    });
  }

  async function compile() {
    if (S.busy || !S.book) return;
    S.busy = true;
    setState('busy');
    let r;
    try {
      r = await F.post('api/compile', { book: S.book });
    } catch (e) {
      r = { ok: false, error: e.message || String(e), log: '' };
    }
    S.busy = false;
    const elapsed = r.time != null ? r.time : 0;
    pushLog({ ok: !!r.ok, elapsed, error: r.error || '', log: r.log || '' });
    if (r.ok) {
      S.pdfMtime = r.mtime || Date.now();
      setState('ok');
      F.toast('编译完成（' + elapsed + 's）');
      await loadPdf();
    } else {
      setState('err');
      applyToolTab('log', true);   // 编译失败 → 自动摊开日志卡（force：已在日志上也要保留）
      F.toast('编译失败：' + (r.error || '见日志'));
    }
  }

  /* ---------------- 点 PDF → 跳源码（无编辑器，只提示行号） ---------------- */
  async function onPick(page, x, y) {
    if (!S.book) return;
    try {
      const d = await F.api('api/sync?book=' + encodeURIComponent(S.book) +
        '&page=' + page + '&x=' + x.toFixed(1) + '&y=' + y.toFixed(1));
      if (!d.ok) { F.toast(d.error || '没查到对应源码行'); return; }
      if (window.PdfView) PdfView.markAt(page, x, y);
      F.toast('→ ' + (d.texName || 'main.tex') + ' 第 ' + d.line + ' 行');
    } catch (e) {
      F.toast('查询失败：' + (e.message || e));
    }
  }

  /* ---------------- 打开 / 关闭书稿 ---------------- */
  async function open(name) {
    if (S.book === name && !$('view-viewer').classList.contains('hidden')) return;
    S.book = name;
    S.pdfMtime = 0;
    setState('none');
    applyToolTab('');
    renderLogPane();
    // 本页是「本地 PDF 显示器」：打开 = 直接读 .build/main.pdf，**从不自动编译**。
    // 先问 /api/books 要该书的 pdf 状态：有才让 pdf.js 去取（**没 PDF 就不去取**——直接让 pdf.js
    // 撞 404 会在它内部留一个没人接的 promise 拒绝，控制台报 Uncaught）。
    let info = null;
    try {
      const books = await F.api('api/books');
      info = (books.find(b => b.name === name) || {}).pdf || null;
    } catch (e) { /* 状态取不到：只当没 PDF，不弹提示（目录页已负责服务器不可达的文案） */ }
    if (info && info.exists) {
      await loadPdf(true);
      if (!info.fresh) setState('stale');   // 源码比 PDF 新 → 编译按钮改口「重新编译」
    } else {
      setState('none');
      if (info) F.toast('这篇还没有编译好的 PDF（.build/main.pdf）——点「编译」生成');
    }
  }

  function close() {
    S.book = '';
    S.busy = false;
    if (window.PdfView) PdfView.destroy();
    $('pdf-pages').innerHTML = '';
    $('pdf-page-ind').textContent = '– / –';
    applyToolTab('');
  }

  /* ---------------- 缩放 / 翻页 / 下载绑定 ---------------- */
  function markZoom() {
    const z = window.PdfView ? PdfView.getZoom() : null;
    document.querySelectorAll('#zoom-panel .zp-row button[data-zoom]').forEach(b => {
      const v = b.dataset.zoom;
      b.classList.toggle('on', (v === 'fit' && z === 'fit') || (v === 'fitpage' && z === 'fitpage') ||
        (z !== 'fit' && z !== 'fitpage' && Math.abs(parseFloat(v) - z) < 0.001));
    });
  }

  function init() {
    /* 注册两枚工具（本页工具栏的**全部** tab 来源，顺序 = 注册顺序） */
    T.registerTool({ id: 'ver', title: '版本', pane: 'tool-ver' });
    T.registerTool({ id: 'log', title: '日志', pane: 'tool-log', mount: renderLogPane });

    $('tool-tabs').addEventListener('click', e => {
      const b = e.target.closest('[data-tool]');
      if (b) applyToolTab(b.dataset.tool);
    });
    syncScTitle();
    // 宿主工具栏（Floria 「工具栏」面板）选了某枚工具 → 本页切 pane（tab 由宿主渲，不在页内）
    window.addEventListener('floria:tool-select', e => applyToolTab((e.detail && e.detail.id) || ''));
    $('sc-close').addEventListener('click', () => applyToolTab(''));
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !$('side-card').classList.contains('hidden')) applyToolTab('');
    });

    $('v-compile').addEventListener('click', compile);
    $('v-back').addEventListener('click', () => { location.hash = ''; });

    $('pdf-prev').addEventListener('click', () => { if (window.PdfView) PdfView.prev(); });
    $('pdf-next').addEventListener('click', () => { if (window.PdfView) PdfView.next(); });

    // 界面调整（缩放）面板
    $('pdf-zoom-toggle').addEventListener('click', e => {
      e.stopPropagation();
      $('zoom-panel').classList.toggle('hidden');
      markZoom();
    });
    document.addEventListener('click', e => {
      if (!e.target.closest('#zoom-panel') && !e.target.closest('#pdf-zoom-toggle')) {
        $('zoom-panel').classList.add('hidden');
      }
    });
    document.querySelectorAll('#zoom-panel .zp-row button').forEach(b => {
      b.addEventListener('click', () => {
        if (!window.PdfView) return;
        const v = b.dataset.zoom;
        if (v === 'fit') PdfView.zoomFit();
        else if (v === 'fitpage') PdfView.zoomFitPage();
        else PdfView.zoomSet(v);
        markZoom();
      });
    });
    $('pdf-zoom-range').addEventListener('input', e => {
      if (window.PdfView) PdfView.zoomSet(+e.target.value / 100);
    });
    $('pdf-zoom-range').addEventListener('change', markZoom);

    // 工具面板卡里的滚动/点击不该被「点 PDF」拾取（picker 只挂 #pdf-pages，天然隔离）
  }

  F.viewer = { init, open, close, compile, applyToolTab, S };
})();
