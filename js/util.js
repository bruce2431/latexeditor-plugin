/* Floria LaTeX v2 — 基础设施：$ / toast / 相对时间 / HTML 转义 / api() 取数
   全局命名空间 window.Floria（classic script，零构建、file:// 可开）。 */
(function () {
  'use strict';
  const F = (window.Floria = window.Floria || {});
  const $ = id => document.getElementById(id);

  let toastTimer = null;
  function toast(text) {
    const t = $('toast');
    if (!t) return;
    t.textContent = text;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 2200);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

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

  /* 取数封装：解析 JSON 后按 HTTP 状态抛错；业务失败（200 + ok:false）不抛，交调用方判 ok。
     网络不通抛「连不上本地服务器」——目录页的错误态据此出启动提示。 */
  async function api(url, opts) {
    let r;
    try {
      r = await fetch(url, opts);
    } catch (e) {
      const err = new Error('连不上本地服务器');
      err.net = true;
      throw err;
    }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || ('HTTP ' + r.status));
    return d;
  }

  function post(url, body) {
    return api(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
  }

  F.$ = $;
  F.toast = toast;
  F.esc = esc;
  F.fmtRel = fmtRel;
  F.api = api;
  F.post = post;
})();
