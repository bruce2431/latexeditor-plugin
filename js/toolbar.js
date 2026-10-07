/* 工具栏注册表（2026-10-07）：编辑页顶浮条工具 tab（#tool-tabs）的登记处。
   契约逐条对齐 Floria 的 src/gateway/web-src/sidebar/work-tools.js（其 registerWkTool）：
   任何模块可调 registerTool({ id, title, pane, mount }) 挂一枚工具 tab —— 本表只做
   「注册 → 按序渲 tab → 交调用方切内容」，不写任何工具内容。
     本页内置（viewer.js 注册）：'ver' 版本 → #tool-ver（纯占位）、'log' 日志 → #tool-log（真实编译记录）。
   契约：tab = <button class="v-tool-tab" data-tool="<id>">（点击委托挂在 viewer.js 的 #tool-tabs
   容器上，本表重渲不清事件）；active 态与 pane 互斥显隐由 viewer.js applyToolTab 唯一落。
   pane = 该工具内容所在元素 id；未注册工具的 pane 恒隐（applyToolTab 按 active id 判定）。 */
(function () {
  'use strict';
  const F = (window.Floria = window.Floria || {});
  const $ = F.$, esc = F.esc;
  const TOOL_DEFS = [];

  function registerTool(def) {
    if (!def || typeof def.id !== 'string' || !def.id) return;
    const entry = {
      id: def.id,
      title: String(def.title || def.id),
      pane: typeof def.pane === 'string' ? def.pane : '',
      mount: typeof def.mount === 'function' ? def.mount : null,
    };
    const i = TOOL_DEFS.findIndex(t => t.id === entry.id);
    if (i >= 0) TOOL_DEFS[i] = entry;
    else TOOL_DEFS.push(entry);
    renderToolTabs();
  }

  function toolDefs() { return TOOL_DEFS; }
  function toolDef(id) { return TOOL_DEFS.find(t => t.id === id) || null; }
  // 归一化 tab id：已注册则原样，否则回落首枚（无工具时空串）
  function toolNormId(id) {
    if (toolDef(id)) return id;
    return TOOL_DEFS.length ? TOOL_DEFS[0].id : '';
  }

  // tab 条渲染（唯一口）：数据源 = TOOL_DEFS 注册序。active 态由 viewer.js applyToolTab 落。
  function renderToolTabs() {
    const box = $('tool-tabs');
    if (!box) return;
    box.innerHTML = TOOL_DEFS.map(
      t => `<button type="button" class="v-tool-tab" data-tool="${esc(t.id)}">${esc(t.title)}</button>`,
    ).join('');
  }

  // 内容挂载：某工具第一次被激活时调一次 def.mount(paneEl)（靠 dataset.mounted 去重；无 mount 即静态 pane）
  function mountTool(id) {
    const def = toolDef(id);
    if (!def || !def.mount || !def.pane) return;
    const el = $(def.pane);
    if (!el || el.dataset.mounted) return;
    el.dataset.mounted = '1';
    try { def.mount(el); } catch (e) { console.error('工具挂载失败 ' + id + ':', e); }
  }

  F.toolbar = { registerTool, renderToolTabs, toolDef, toolDefs, toolNormId, mountTool };
})();
