/* Floria LaTeX — 基础设施：$ / toast / 主题 / 跨模块共享态
   全站 `window.Floria` 命名空间（classic script，零构建）。 */
(function () {
  'use strict';
  const F = (window.Floria = window.Floria || {});
  const $ = id => document.getElementById(id);
  const R = window.FloriaRender;

  /* 跨模块共享态：模块之间只共享这一个对象引用，各自读写它的字段。
     （拆分成多文件后若把字段拷进各模块局部变量，写入就再也传不出去。） */
  const S = {
    /* 编辑器 */
    cm: null,
    cmReady: false,          // setValue 引发的 change 不算用户编辑（避免打开即写盘 bump mtime）
    saveTimer: null, renderTimer: null, toastTimer: null,
    lastOutline: [], renderSeq: 0, quickCache: {},
    /* 书稿 / 后端 */
    serverOK: false,         // 后端可达（/api/books 通）
    local: null,             // 当前打开的书稿：{folder, texName, imgMap, pdfInfo, openText}
    /* PDF */
    compiling: false, pdfLoadedMtime: 0,
    /* 入口页书库列表 */
    booksCache: [], dashQuery: '', sortKey: 'name', sortDir: 1, dashView: 'list', menuBook: '',
    /* 助手卡：chatPref = 用户上次选的三态（'float'|'slim'|'side'，持久化）；
       chatMode = 当前生效态（助手关时为 'off'） */
    chatPref: '', chatMode: 'off', chatBooted: false,
  };
  try { if (localStorage.getItem('florialatex.view') === 'grid') S.dashView = 'grid'; } catch (_) {}

  function toast(text) {
    const t = $('toast');
    t.textContent = text;
    t.classList.remove('hidden');
    clearTimeout(S.toastTimer);
    S.toastTimer = setTimeout(() => t.classList.add('hidden'), 2200);
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

  /* 服务器模式（真文件 + 真 PDF）与否 —— 编辑器渲染与编译都看它 */
  function hasBackend() { return S.serverOK && !!S.local; }

  /* ---------- 拖拽会话（#divider / #divider-chat / 助手卡 #chat-grip 共用） ----------
     三条规矩，各自都对应一个真踩过的坑：
     ① 只认左键，且必须真的移动过（>3px）才算拖 —— 贴着缝误点一下不该改尺寸；
     ② 收尾看 e.buttons 而不只等 mouseup：mouseup 若落在内嵌 iframe 上（事件不跨文档冒泡）
        或窗口外，window 就永远收不到，drag 会一直是真 —— 此后鼠标随便一动就跟着改尺寸
        （用户报「鼠标只要接近那个边界就会触发位置调整」）。
     ③ 拖拽期间给 body 挂 .dragging（CSS 让 iframe 不吃鼠标）—— 从源头保证 mouseup 落在本文档。 */
  function dragHandle(el, onMove, onDone, canStart) {
    let drag = false, sx = 0, sy = 0;
    el.addEventListener('mousedown', e => {
      if (e.button !== 0 || (canStart && !canStart())) return;
      drag = true; sx = e.clientX; sy = e.clientY;
      document.body.classList.add('dragging');
      e.preventDefault();
    });
    window.addEventListener('mousemove', e => {
      if (!drag) return;
      if (!e.buttons) return end();                                  // ② 按键已松开（可能在 iframe 里松的）
      if (Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) < 3) return;   // ① 抖动/误点
      onMove(e);
    });
    window.addEventListener('mouseup', end);
    function end() {
      if (!drag) return;
      drag = false;
      document.body.classList.remove('dragging');
      window.dispatchEvent(new Event('floria:dragend'));   // 拖拽期间被压掉的昂贵重算在此时补做（见 pdfview.js）
      if (onDone) onDone();
    }
  }

  F.$ = $;
  F.R = R;
  F.S = S;
  F.toast = toast;
  F.applyTheme = applyTheme;
  F.toggleTheme = toggleTheme;
  F.hasBackend = hasBackend;
  F.dragHandle = dragHandle;
})();
