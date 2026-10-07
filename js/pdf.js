/* Floria LaTeX — PDF 卡：latexmk 编译 → pdf.js 自绘查看器 + 缩放/页码/下载 + 点击跳源码 */
(function () {
  'use strict';
  const F = (window.Floria = window.Floria || {});
  const $ = F.$, S = F.S;

  function pvRender() { F.hasBackend() ? compilePdf(false) : F.editor.renderNow(); }
  // 状态胶囊：state = none | busy | ok | stale | err
  function setPdfState(state, text, tip) {
    const b = $('pdf-state');
    b.className = 'pv-state st-' + state;
    b.textContent = text;
    b.title = tip || '';
    b.disabled = state === 'busy';
  }
  function pdfUrl(mtime) { return 'api/pdf?book=' + encodeURIComponent(S.local.folder) + '&v=' + mtime; }

  function onPagePdf(cur, total) {
    $('pdf-page-ind').textContent = cur + ' / ' + total;
  }
  function loadPdfView(mtime, state, text, tip) {
    setPdfState(state, text, tip);
    S.pdfLoadedMtime = mtime;
    PdfView.load(pdfUrl(mtime), onPagePdf, pickPdf)
      .catch(e => { console.error(e); setPdfState('err', '✕ PDF 加载失败', '点击状态胶囊重编译'); });
  }

  /* 点 PDF → 查 synctex 反查源码行 → 编辑器跳过去并闪烁标记 */
  async function pickPdf(page, x, y) {
    if (!S.local) return;
    try {
      const r = await fetch('api/sync?book=' + encodeURIComponent(S.local.folder) + '&page=' + page +
                            '&x=' + x.toFixed(1) + '&y=' + y.toFixed(1));
      const j = await r.json();
      if (!j.ok) { F.toast(j.error || '该位置没有源码映射'); return; }
      PdfView.markAt(page, x, y);
      F.editor.jumpEditor(j.line, true);
      const stale = S.local.pdfInfo && !S.local.pdfInfo.fresh;
      F.toast('→ ' + j.texName + ' 第 ' + j.line + ' 行' + (stale ? '（PDF 是上次编译的版本，行号可能有偏差）' : ''));
    } catch (e) {
      F.toast('跳转失败：' + (e.message || e));
    }
  }

  async function compilePdf(auto) {
    if (!F.hasBackend() || S.compiling) return;
    S.compiling = true;
    setPdfState('busy', '编译中…', (auto ? '首次自动编译，' : '') + 'MATH 这类带 tikz 的书稿约 30–90 秒');
    try {
      const r = await fetch('api/compile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ book: S.local.folder })
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setPdfState('err', '✕ 编译失败', (j.error || '未知错误') + ' · 完整日志见浏览器控制台 · 点此重试');
        if (j.log) console.error('[LaTeX 编译日志]\n' + j.log);
        return;
      }
      S.local.pdfInfo = { exists: true, fresh: true, mtime: j.mtime };
      loadPdfView(j.mtime, 'ok', '✓ 已编译', '用时 ' + j.time + 's · 改码后点此或 Ctrl+Enter 重编 · 原始日志见控制台');
      console.log('[PDF] 编译完成，用时 ' + j.time + 's');
    } catch (e) {
      setPdfState('err', '✕ 编译失败', (e.message || e) + ' · 点此重试');
    } finally {
      S.compiling = false;
    }
  }
  function loadOrCompilePdf() {
    if (!F.hasBackend()) return;
    const info = S.local.pdfInfo;
    if (info && info.exists) {
      const text = info.fresh ? '✓ 已编译' : '● 源码已改';
      const tip = info.fresh ? '与源码同步 · 点此重新编译' : '显示的是上次编译结果 · 点此重新编译';
      if (S.pdfLoadedMtime !== info.mtime) loadPdfView(info.mtime, info.fresh ? 'ok' : 'stale', text, tip);
      else setPdfState(info.fresh ? 'ok' : 'stale', text, tip);
    } else {
      compilePdf(true); // 从未编译过 → 打开即自动编一次
    }
  }
  $('pdf-state').addEventListener('click', () => { if (!S.compiling) compilePdf(false); });
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
    if (!S.local || !S.local.pdfInfo || !S.local.pdfInfo.exists) return;
    const a = document.createElement('a');
    a.href = pdfUrl(S.local.pdfInfo.mtime);
    a.download = S.local.texName.replace(/\.tex$/i, '') + '.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
  });

  F.pdf = { pvRender, setPdfState, syncZoomUI, compilePdf, loadOrCompilePdf, loadPdfView, pickPdf, pdfUrl };
})();
