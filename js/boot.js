/* Floria LaTeX — 通用绑定 + 启动序（必须最后加载） */
(function () {
  'use strict';
  const F = (window.Floria = window.Floria || {});
  const $ = F.$, S = F.S;

  /* ---------- 全局绑定 ---------- */
  $('btn-theme').addEventListener('click', F.toggleTheme);
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); if (S.local) F.editor.writeLocal(); }
    if (e.key === 'Escape') F.books.closeMenu();
  });
  document.addEventListener('click', () => F.books.closeMenu());
  // 只认入口页自己的滚动容器：挂 window 捕获会收到 #pdf-scroll 等隐藏容器的滚动（编辑器隐藏时它仍会滚），
  // 一开菜单就被误关
  document.querySelector('.dash-body').addEventListener('scroll', F.books.closeMenu);
  window.addEventListener('resize', F.books.closeMenu);
  window.addEventListener('hashchange', () => {
    if (location.hash !== '#local' && S.local) F.books.backToDash();
  });

  /* ---------- 启动 ---------- */
  F.applyTheme();
  F.books.applyDashView();
  F.panes.loadChatW();       // --chat-w（助手列宽），必须在 applyPanes 之前定下来
  F.panes.loadPanes();
  F.panes.applyPanes();      // 内含 F.chat.applyMode()（助手三态）
  F.books.refreshBookList();
})();
