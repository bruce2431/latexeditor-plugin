/* Floria LaTeX — 顶栏共线 + 三列宽度 + 视图开关（代码 / PDF / 助手）
   共线（硬要求）= 卡缘对齐列缘：每张顶栏卡 = 它下方那一列。 */
(function () {
  'use strict';
  const F = (window.Floria = window.Floria || {});
  const $ = F.$;
  const S = F.S;

  /* 每张顶栏卡 = 它下方那一列：卡宽由列的右缘反推（左上角图标是绝对定位覆盖件，不占行内宽度，
     故首卡左缘天然 = 首列左缘），于是卡宽恒 = 列宽、卡缘 = 列缘；两级缝宽都是 --gap，
     故卡缘对齐 ⇒ 顶栏缝隙中线 = 列间缝中线。末卡不再 flex:1 —— 末列右缘可能被 margin 内缩，
     flex:1 会把那段补进卡里。逐卡顺序设置（读 rect 强制回流）故一次收敛。 */
  /* PDF 段（`#tb-preview`）已删（2026-09-25）：PDF 的编译态/页码/缩放/下载全搬进 PDF 卡内浮条，
     顶栏只剩「编辑器段 + 助手段」，故配对只剩这两对。 */
  const PAIRS = [['tb-editor', 'editor-pane'], ['tb-chat', 'chat-pane']];

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
    // 列宽变了 → 悬浮卡/细条的水平锚（编辑列）跟着挪；它们不在流内，改内联几何不会反过来影响上面
    if (F.chat) F.chat.reflow();
  }

  /* 编辑器列宽上下限：助手列、预览列都有最小宽，不预留就会整行溢出（竖排 PDF 下表现为预览跑出视口）。
     助手处在浮动/细条态时不占列（S.chatMode ≠ 'side'，此时 #divider-chat 也 display:none，offsetWidth=0），
     宽度不该被它预留。 */
  function editorBounds() {
    const wsW = $('workspace').clientWidth || 1;
    let used = PANES.code ? $('divider').offsetWidth : 0;
    if (S.chatMode === 'side') used += $('chat-pane').offsetWidth + $('divider-chat').offsetWidth;
    if (PANES.pdf) used += 260;                        // #preview-pane min-width
    return { min: 18, max: Math.min(72, Math.max(18, (wsW - used) / wsW * 100)) };
  }

  /* ---------- 助手列宽（--chat-w，由 #divider-chat 拖拽；只对「收进侧栏」态有意义） ---------- */
  const CKEY = 'florialatex.chat.w';
  const CW_MIN = 240, CW_MAX = 560, CW_DEF = 340;
  /* 用户选定的宽（cwPref，存 localStorage）与「当前窗口放得下的宽」（写进 --chat-w）分开：
     窗口窄时只压低生效值，不会把用户的选择改小（否则在小窗口开一次就被永久改窄）。 */
  let cwPref = CW_DEF;
  function chatW() { return cwPref; }
  /* 上限 = 工作区剩下的地：把编辑列的实际宽、两条沟槽、预览列最小宽都扣掉 */
  function chatMaxW() {
    const wsW = $('workspace').clientWidth || innerWidth;
    let used = 0;
    if (PANES.code) used += $('editor-pane').offsetWidth + $('divider').offsetWidth;
    used += $('divider-chat').offsetWidth;             // 自己的右沟槽（算宽时它已在流内）
    if (PANES.pdf) used += 260;
    return Math.max(CW_MIN, Math.min(CW_MAX, wsW - used));
  }
  function setChatW(w) {
    cwPref = Math.round(Math.min(CW_MAX, Math.max(CW_MIN, w)));
    const applied = Math.round(Math.min(chatMaxW(), cwPref));
    document.documentElement.style.setProperty('--chat-w', applied + 'px');
    return applied;
  }
  function loadChatW() {
    let w = CW_DEF;
    try { const v = +localStorage.getItem(CKEY); if (v >= CW_MIN) w = v; } catch (e) {}
    setChatW(w);
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
  const PANE_NODES = { code: ['editor-pane', 'tb-editor', 'divider'], pdf: ['preview-pane'], ai: ['chat-pane', 'tb-chat', 'divider-chat'] };

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
    // 助手三态精修：浮动/细条态下 #tb-chat 不占位 —— 必须在 lead-pad 之前定下最终显隐
    if (F.chat) F.chat.applyMode();
    document.querySelectorAll('#panes-panel .pn-row').forEach(r => {
      r.setAttribute('aria-checked', PANES[r.dataset.pane] ? 'true' : 'false');
    });
    const first = ['tb-editor', 'tb-chat'].find(id => !$(id).classList.contains('hidden'));
    document.querySelectorAll('#topbar .tb-seg').forEach(c => c.classList.toggle('lead-pad', c.id === first));
    try { localStorage.setItem(PKEY, JSON.stringify(PANES)); } catch (e) {}
    clampEditor();
    syncTopbar();
  }

  function setPane(k, on) {
    if (PANES[k] === on) return;
    if (!on) {   // 至少保留一列，否则工作区会空掉
      const others = Object.keys(PANES).filter(x => x !== k);
      if (others.every(x => !PANES[x])) { F.toast('至少保留一栏'); return; }
    }
    PANES[k] = on;
    applyPanes();
    $('panes-panel').classList.add('hidden');
    $('btn-panes').setAttribute('aria-expanded', 'false');
    setTimeout(() => { if (PANES.code && S.cm) S.cm.refresh(); syncTopbar(); }, 0);
  }

  (function divider() {
    const editor = $('editor-pane'), ws = $('workspace');
    F.dragHandle($('divider'), e => {
      const rect = ws.getBoundingClientRect();
      const b = editorBounds();
      const pct = Math.min(b.max, Math.max(b.min, (e.clientX - rect.left) / rect.width * 100));
      editor.style.flex = `0 0 ${pct}%`;
      syncTopbar();
    }, () => { if (S.cm) S.cm.refresh(); });
    window.addEventListener('resize', () => { clampEditor(); syncTopbar(); });
  })();

  /* 第二条沟槽：拖 #divider-chat 改助手列宽（用户：「并列卡片第一个间隔和第二个间隔应该都可以调整宽度」）。
     列宽 = 分栏中线 − 助手列左缘；拖拽中编辑列是百分比、不动，故左缘稳定、不会自我反馈振荡。
     上限 chatMaxW() 已经把预览列最小宽扣掉 ⇒ 拖到顶也不会把整行挤爆，无需再动编辑列。 */
  (function chatDivider() {
    const div = $('divider-chat'), chat = $('chat-pane');
    F.dragHandle(div, e => {
      setChatW(e.clientX - chat.getBoundingClientRect().left);
      syncTopbar();
    }, () => { try { localStorage.setItem(CKEY, String(Math.round(chatW()))); } catch (e) {} });
    // 窗口变窄 → 上限跟着收；重夹一次免得助手列把预览列挤出去（这里只压低生效值，不动用户的 pref）
    window.addEventListener('resize', () => { setChatW(chatW()); syncTopbar(); });
  })();

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

  F.panes = { PANES, PKEY, PANE_NODES, PAIRS, loadPanes, applyPanes, setPane, syncTopbar, editorBounds, clampEditor,
              loadChatW, setChatW, chatW, chatMaxW };
})();
