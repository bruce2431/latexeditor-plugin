/* Floria LaTeX — 助手卡（三态：悬浮卡 / 收敛细条 / 侧栏列卡）
   聊天本体 = iframe 整个 Floria UI（不再自己写聊天）：只有经 Floria 网关同源反代
   （/backend/<label>/）时才嵌，本地直开时给说明、绝不嵌 —— 那会嵌到本页自己。
   同一节点三态、iframe 永不 reparent（iframe 一旦离开文档再插回来会重新加载，会话与草稿全丢）。 */
(function () {
  'use strict';
  const F = (window.Floria = window.Floria || {});
  const $ = F.$, S = F.S;

  const MKEY = 'florialatex.chat.mode';     // 用户上次选的三态（悬浮/细条/侧栏）
  const SKEY = 'florialatex.chat.size';     // 浮卡高度 {h}（宽不可调，见下）
  const DEF_H = 430, MIN_W = 240, MIN_H = 200;

  /* 宽恒 = 编辑列宽 − 2*PAD（2026-09-25 定案：用户「悬浮 chat 宽度根据编辑区大小决定」
     → 选「恒等于编辑列宽−16，拖拽只改高度」）。故不再有默认宽/最大宽，也不读旧存的 w。
     高仍可拖、可记。 */
  let size = { h: DEF_H };
  try {
    const s = JSON.parse(localStorage.getItem(SKEY) || '{}');
    if (+s.h > 0) size.h = +s.h;
  } catch (_) {}
  try {
    const m = localStorage.getItem(MKEY);
    if (m === 'float' || m === 'slim' || m === 'side') S.chatPref = m;
  } catch (_) {}

  const pane = () => $('chat-pane');

  /* ---------- 内嵌真 Floria ---------- */
  /* 本页在网关反代下形如 /backend/<label>/index.html → origin 就是网关 origin，
     故 / 下就是 Floria SPA 本身（同源、cookie 通门、contentDocument 可写）。
     本地 8765 / file:// 下 / 就是本页自己 → 一律不嵌。 */
  const inGateway = location.pathname.indexOf('/backend/') === 0;
  const projLabel = inGateway ? decodeURIComponent(location.pathname.split('/')[2] || '') : '';

  function hint(text) {
    const box = $('chat-body');
    const d = document.createElement('div');
    d.className = 'chat-hint';
    d.textContent = text;
    box.appendChild(d);
  }

  /* 复用本项目最近一个 Floria 会话（不主动 spawn）；取不到 / 没有 → 开新对话 */
  async function pickSrc() {
    try {
      const j = await fetch('/gateway/sessions', { credentials: 'same-origin' }).then(r => r.json());
      const hit = (j.sessions || []).find(s => s.projectLabel === projLabel && s.projectScope === 'project');
      if (hit && hit.file) return '/session/' + hit.file.replace(/\.jsonl$/, '');
    } catch (_) { /* 网关没通 → 新对话 */ }
    return '/';
  }

  /* 同源修妆：① 压掉 Floria 的侧栏入口与遮罩；② 抹平它自己的「底板 + 大圆角卡」
     （body padding 1px + --plane 底色 + #app radius 22 + .view-card margin 2px → 嵌进来会在
     我们的卡里再画一张白卡，读出「两张卡摞着」的缝）。会话卡（消息 + 输入栏）原样用真 UI。 */
  function dress(f) {
    let d = null;
    try { d = f.contentDocument; } catch (_) { return; }
    if (!d || !d.head || d.getElementById('floria-embed-fit')) return;
    const st = d.createElement('style');
    st.id = 'floria-embed-fit';
    st.textContent =
      '#sidebar,#rail,#menu-btn,#scrim,#search-overlay,#bubble-pop{display:none!important}' +
      '#sidebar{width:0!important;visibility:hidden!important}' +
      // 底板透掉 → 露出的就是本卡自己的背景，宿主卡与内嵌 UI 读作同一张
      ':root{--plane:transparent!important}' +
      'html,body{background:transparent!important;padding:0!important}' +
      '#app{background:transparent!important;border-radius:0!important;box-shadow:none!important}' +
      '#chat-area>.view-card{margin:0!important;border-radius:0!important}';
    d.head.appendChild(st);
  }

  function ensureEmbed() {
    if (S.chatBooted) return;
    S.chatBooted = true;
    const box = $('chat-body');
    box.textContent = '';
    if (!inGateway) {
      hint('助手要在 Floria 网页的「项目」预览里才能用：本地直开（启动.bat / file://）没有会话后端。');
      return;
    }
    const f = document.createElement('iframe');
    f.setAttribute('title', 'Floria 助手');
    f.addEventListener('load', () => dress(f));
    box.appendChild(f);
    pickSrc().then(src => { f.src = src; });
  }

  /* ---------- 三态 ---------- */
  /* 底距 BOT：状态栏已删（2026-09-25），工作区底缘 = 视口底 − --gap(10)，故 24 让浮卡/胶囊
     比编辑列底边再抬 14px，不压住列的圆角。 */
  const BOT = 24;
  const PAD = 8;                                        // 浮卡与编辑列左右边的最小留白

  /* 水平锚 = **编辑列**（浮卡恒在编辑区上，不是视口正中）。关掉「代码」列时没有编辑列可锚，
     退到工作区整体；工作区还没量到宽（仪表盘态）返回 null，调用方跳过、保持现状。 */
  function anchor() {
    const ws = $('workspace');
    const ed = $('editor-pane');
    const use = (F.panes.PANES.code && ed.getBoundingClientRect().width > 80) ? ed : ws;
    const r = use.getBoundingClientRect();
    if (r.width < 120) return null;
    return { left: r.left, w: r.width, cx: r.left + r.width / 2 };
  }
  /* 唯一宽度公式：编辑列宽 − 两侧留白（列很窄时退回 MIN_W） */
  function paneW(a) { return Math.max(MIN_W, a.w - PAD * 2); }

  function placeFloat() {
    const el = pane(), vh = innerHeight;
    const a = anchor();
    if (!a) return;
    const w = paneW(a);
    const h = Math.max(MIN_H, Math.min(size.h, Math.round(vh * 0.7)));
    el.style.width = w + 'px';
    el.style.height = h + 'px';
    el.style.left = Math.round(a.left + (a.w - w) / 2) + 'px';
    el.style.top = Math.round(vh - h - BOT) + 'px';
    el.style.marginRight = '0';
  }
  /* 收敛态 = 一条输入栏，跟着锚在编辑列中线上（CSS 的 translateX(-50%) 负责自居中）；
     跟浮卡同一条宽度公式（都是「编辑区的那条」） */
  function placeSlim() {
    const el = pane();
    const a = anchor();
    clearBox();
    if (!a) return;
    el.style.left = Math.round(a.cx) + 'px';
    el.style.width = paneW(a) + 'px';
  }
  function clearBox() {
    const el = pane();
    el.style.left = el.style.top = el.style.width = el.style.height = el.style.marginRight = '';
  }
  /* 列宽变了（拖 #divider / 开关栏 / 改窗口）→ 重锚一次 */
  function reflow() {
    if (S.chatMode === 'float') placeFloat();
    else if (S.chatMode === 'slim') placeSlim();
  }

  /* 当前生效态：助手关着 = 'off'；否则 = 用户上次选的态（S.chatPref） */
  function applyMode() {
    const on = F.panes.PANES.ai;
    if (!S.chatPref) S.chatPref = 'float';
    S.chatMode = on ? S.chatPref : 'off';

    const el = pane();
    el.classList.toggle('hidden', !on);
    el.classList.toggle('float', on && S.chatMode === 'float');
    el.classList.toggle('slim', on && S.chatMode === 'slim');
    // 顶栏那张卡只在「收进侧栏」时占位：浮动/细条下助手不占列，共线自然跳过它
    $('tb-chat').classList.toggle('hidden', !(on && S.chatMode === 'side'));
    // 助手右沟槽同理：浮动/细条下助手不在流内，留着会在预览列左侧多出一条空缝
    $('divider-chat').classList.toggle('hidden', !(on && S.chatMode === 'side'));
    $('chat-slim-btn').classList.toggle('hidden', S.chatMode !== 'float');
    $('chat-dock-btn').classList.toggle('hidden', S.chatMode !== 'float');
    $('chat-undock-btn').classList.toggle('hidden', S.chatMode !== 'side');

    if (!on) { clearBox(); return; }
    ensureEmbed();
    if (S.chatMode === 'float') placeFloat();
    else if (S.chatMode === 'slim') placeSlim();
    else clearBox();                       // 侧栏列卡在流内，不吃内联尺寸
  }

  function setMode(m) {
    if (S.chatPref === m && S.chatMode === m) return;
    S.chatPref = m;
    try { localStorage.setItem(MKEY, m); } catch (_) {}
    F.panes.PANES.ai = true;               // 三态都属于「助手开着」
    applyMode();
    F.panes.clampEditor();                 // 占不占列变了 → 编辑器上限跟着变
    F.panes.syncTopbar();
  }

  $('chat-slim-btn').addEventListener('click', () => setMode('slim'));
  $('chat-dock-btn').addEventListener('click', () => setMode('side'));
  $('chat-undock-btn').addEventListener('click', () => setMode('float'));
  $('chat-pill').addEventListener('click', () => setMode('float'));
  $('chat-close-btn').addEventListener('click', () => F.panes.setPane('ai', false));

  /* 悬浮卡左上角把手：**只改高度**（宽由编辑列宽给定，2026-09-25 定案）。
     高跟手 = vh − BOT − 光标y，夹 [MIN_H, vh×0.7]；底边不动（top 反算），拖起来像拉伸上沿。
     收尾规矩（含「mouseup 落在内嵌 iframe 上就卡住」）走 F.dragHandle。 */
  (function grip() {
    F.dragHandle($('chat-grip'), e => {
      const vh = innerHeight;
      const h = Math.max(MIN_H, Math.min(vh - BOT - e.clientY, Math.round(vh * 0.7)));
      size = { h: Math.round(h) };
      placeFloat();
    }, () => { try { localStorage.setItem(SKEY, JSON.stringify(size)); } catch (_) {} },
       () => S.chatMode === 'float');
    window.addEventListener('resize', reflow);
  })();

  F.chat = { applyMode, setMode, reflow, paneInFlow: () => S.chatMode === 'side', inGateway, projLabel };
})();
