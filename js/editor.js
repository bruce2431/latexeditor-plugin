/* Floria LaTeX — 编辑器卡：CodeMirror / 保存写回磁盘 / 大纲 / 点预览跳源码 */
(function () {
  'use strict';
  const F = (window.Floria = window.Floria || {});
  const $ = F.$, S = F.S, R = F.R;

  function ensureCM() {
    if (S.cm) return;
    const cm = CodeMirror.fromTextArea($('src'), {
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
        'Ctrl-Enter': () => F.pdf.pvRender(),
        'Ctrl-S': () => { if (S.local) writeLocal(); return false; },
        'Cmd-Enter': () => F.pdf.pvRender(),
        'Cmd-S': () => { if (S.local) writeLocal(); return false; },
      },
    });
    S.cm = cm;
    cm.on('change', () => { if (!S.cmReady) return; scheduleSave(); scheduleRender(); });
  }

  function flushSave() {
    if (!S.cm || !S.local) return;
    clearTimeout(S.saveTimer);
    writeLocal();
  }
  function scheduleSave() {
    if (!S.local) return;
    clearTimeout(S.saveTimer);
    S.saveTimer = setTimeout(writeLocal, 600);
  }
  /* 保存：经本地服务器 /api/write 写回磁盘真实文件 */
  async function writeLocal() {
    if (!S.local || !S.cm) return;
    const text = S.cm.getValue();
    if (text === S.local.openText) return;   // 内容没变不写盘，避免 bump mtime 让 PDF 误报过期
    try {
      const r = await fetch('api/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ book: S.local.folder, file: S.local.texName, content: S.cm.getValue() })
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || ('HTTP ' + r.status));
      S.local.openText = text;
      if (S.local.pdfInfo && S.local.pdfInfo.exists) {
        S.local.pdfInfo.fresh = false;
        F.pdf.setPdfState('stale', '● 源码已改', '点此重新编译更新 PDF');
      }
    } catch (e) {
      F.toast('保存失败：' + (e.message || e));   // 状态栏已删（2026-09-25），失败改走 toast 免得静默
    }
  }
  function scheduleRender() {
    if (F.hasBackend()) return; // 服务器模式不逐键重排版，编译走胶囊/Ctrl+Enter
    clearTimeout(S.renderTimer);
    S.renderTimer = setTimeout(renderNow, 450);
  }

  function renderNow() {
    if (!S.cm) return;
    const seq = ++S.renderSeq;
    const text = S.cm.getValue();
    const key = S.local ? S.local.folder : null;
    if (key && S.quickCache[key] && S.quickCache[key].text === text) {
      applyRender(S.quickCache[key].res, seq);
      return;
    }
    const res = R.render(text, S.local ? { images: S.local.imgMap } : undefined);
    if (key) S.quickCache[key] = { text, res };
    applyRender(res, seq);
  }

  function applyRender(res, seq) {
    $('paper').innerHTML = res.html;
    S.lastOutline = res.outline;
    buildOutline(res.outline);
    $('paper').querySelectorAll('.toc a[data-target]').forEach(a => {
      a.addEventListener('click', () => {
        const sec = $('paper').querySelector('#' + CSS.escape(a.dataset.target));
        if (sec) { sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); jumpEditor(sec.dataset.line); }
      });
    });
    if (!F.hasBackend()) {
      R.hydrate($('paper'), () => seq !== S.renderSeq); // 分块水合公式，期间页面可交互（PDF 模式跳过省 CPU）
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
    if (!S.lastOutline.length) return;
    const pane = $('preview-pane');
    const top = pane.scrollTop + 90;
    let active = null;
    for (const o of S.lastOutline) {
      const sec = $('paper').querySelector('#' + CSS.escape(o.id));
      if (sec && sec.offsetTop <= top) active = o;
    }
    $('outline-list').querySelectorAll('.ol-item').forEach(a => {
      a.classList.toggle('active', !!active && a.dataset.target === active.id);
    });
  });

  function jumpEditor(line, flash) {
    if (!S.cm || !line) return;
    const cm = S.cm;
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

  $('btn-outline-toggle').addEventListener('click', () => {
    $('outline').classList.toggle('hidden');
    setTimeout(() => { if (S.cm) S.cm.refresh(); F.panes.syncTopbar(); }, 0);
  });

  F.editor = { ensureCM, flushSave, scheduleSave, writeLocal, renderNow, applyRender, buildOutline, jumpEditor };
})();
