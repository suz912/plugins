// ==UserScript==
// @author         SuZ-helper
// @name           IITC plugin: Draw tools - Fill default toggler
// @category       Tweaks
// @version        0.1.0
// @description    Start IITC with polygon fill ON/OFF as you prefer (for Draw tools). Adds a small settings dialog.
// @id             drawtools-fill-default
// @namespace      https://example.com/iitc/drawtools-fill-default
// @match          https://intel.ingress.com/*
// @match          https://intel-x.ingress.com/*
// @grant          none
// ==/UserScript==

function wrapper(plugin_info) {
  if (typeof window.plugin !== 'function') window.plugin = function () {};

  plugin_info.buildName = 'local';
  plugin_info.dateTimeVersion = '2025-09-27-000000';
  plugin_info.pluginId = 'drawtools-fill-default';

  window.plugin.drawtoolsFillDefault = {};
  const mod = window.plugin.drawtoolsFillDefault;
  const LS_KEY = 'plugin-drawtools-fill-default'; // 'on' | 'off'

  /** returns 'on' or 'off' (meaning "Fill polygons" default) */
  function getFillDefault() {
    const v = localStorage.getItem(LS_KEY);
    return v === 'off' ? 'off' : 'on';
  }

  /** persist 'on' or 'off' */
  function setFillDefault(v) {
    localStorage.setItem(LS_KEY, v === 'off' ? 'off' : 'on');
  }

  /** apply desired default immediately to current Draw tools state */
  function applyToCurrentSession() {
    // Draw tools must be present
    const dt = window.plugin.drawTools;
    if (!dt) return;

    const wantFill = getFillDefault() === 'on'; // true => 塗りつぶし有効
    // Draw tools の仕様:
    // EDFstatus = true  => Empty Drawn Fields (塗りつぶし しない)
    // EDFstatus = false => 塗りつぶし する
    const shouldEDF = !wantFill;

    if (typeof dt.EDFstatus === 'boolean' && dt.EDFstatus !== shouldEDF) {
      dt.EDFstatus = shouldEDF;
      // 反映（drawtools側のトグル処理を模倣）
      if (typeof dt.toggleOpacityOpt === 'function') dt.toggleOpacityOpt();
      if (typeof dt.clearAndDraw === 'function') dt.clearAndDraw();
    }
  }

  /** simple dialog to pick default */
  function openSettingsDialog() {
    const curr = getFillDefault(); // 'on'|'off'
    const html = $(`
      <div>
        <p style="margin:0 0 8px;">Draw tools の「Fill the polygon(s)」の<strong>起動時の初期値</strong>を選びます。</p>
        <label style="display:block;margin:6px 0;">
          <input type="radio" name="dt-fill" value="on" ${curr === 'on' ? 'checked' : ''}>
          Fill ON（塗りつぶしあり）
        </label>
        <label style="display:block;margin:6px 0;">
          <input type="radio" name="dt-fill" value="off" ${curr === 'off' ? 'checked' : ''}>
          Fill OFF（塗りつぶしなし）
        </label>
      </div>
    `);

    window.dialog({
      html,
      title: 'Draw tools ? Fill default',
      width: 360,
      buttons: {
        'Save & Apply': function () {
          const val = html.find('input[name="dt-fill"]:checked').val();
          setFillDefault(val);
          applyToCurrentSession();
          $(this).dialog('close');
        },
        Cancel: function () {
          $(this).dialog('close');
        },
      },
    });
  }

  function addToolbarButton() {
    if (!window.IITC || !window.IITC.toolbox || !window.IITC.toolbox.addButton) return;
    window.IITC.toolbox.addButton({
      label: 'Fill Default',
      title: 'Draw tools ? Fill default settings',
      action: openSettingsDialog,
      accesskey: 'f',
    });
  }

  /**
   * タイミング調整：
   * - draw-tools は setup.priority='high' で起動するため、本プラグインは
   *   iitcLoaded 後に drawTools の存在を待ち、反映します
   */
  function onLoaded() {
    // できるだけ早く適用（drawToolsがまだなら少し待つ）
    let tries = 0;
    const maxTries = 30; // ~3秒
    (function waitForDrawTools() {
      if (window.plugin && window.plugin.drawTools && window.plugin.drawTools.drawnItems) {
        applyToCurrentSession();
        addToolbarButton();
      } else if (tries++ < maxTries) {
        setTimeout(waitForDrawTools, 100);
      } else {
        // 最低限ボタンだけは置いておく（後から押せば適用される）
        addToolbarButton();
      }
    })();
  }

  // hook
  if (window.bootPlugins) {
    window.bootPlugins.push(onLoaded);
  } else {
    window.bootPlugins = [onLoaded];
  }
  // if IITC already loaded
  if (window.iitcLoaded && typeof onLoaded === 'function') {
    onLoaded();
  }
}

var setup = function () {};
// inject
(function () {
  const script = document.createElement('script');
  const info = {};
  if (typeof unsafeWindow !== 'undefined' && unsafeWindow !== window) {
    const wrapper = [
      '(',
      wrapper.toString(),
      ')(',
      JSON.stringify({
        buildName: 'local',
        dateTimeVersion: '2025-09-27-000000',
        pluginId: 'drawtools-fill-default',
      }),
      ');',
    ].join('');
    script.textContent = wrapper;
  } else {
    script.appendChild(document.createTextNode('(' + wrapper + ')({});'));
  }
  (document.body || document.head || document.documentElement).appendChild(script);
})();
