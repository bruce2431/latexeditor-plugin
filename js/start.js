/* Floria LaTeX v2 — 启动序 + hash 路由（#/p/<书稿名> → 编辑页；其余 → 目录页）
   必须最后加载：此时 util / toolbar / catalog / viewer 都已就位。 */
(function () {
  'use strict';
  const F = window.Floria;
  const $ = F.$;

  function route() {
    const m = /^#\/p\/(.+)$/.exec(location.hash || '');
    if (m) {
      $('view-catalog').classList.add('hidden');
      $('view-viewer').classList.remove('hidden');
      F.viewer.open(decodeURIComponent(m[1]));
    } else {
      F.viewer.close();
      $('view-viewer').classList.add('hidden');
      $('view-catalog').classList.remove('hidden');
      F.catalog.refresh();
    }
  }

  F.viewer.init();

  $('cat-refresh').addEventListener('click', () => F.catalog.refresh());
  $('cat-new').addEventListener('click', () => F.catalog.newBook());
  $('cat-list').addEventListener('click', e => {
    const row = e.target.closest('.cat-row');
    if (row) location.hash = '#/p/' + encodeURIComponent(row.dataset.book);
  });

  window.addEventListener('hashchange', route);
  route();
})();
