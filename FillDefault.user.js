// ==UserScript==
// @author         SuZ-helper
// @name           IITC plugin: Draw tools - Fill default toggler (mobile-safe)
// @category       Tweaks
// @version        0.2.0
// @description    Start IITC with polygon fill ON/OFF as you prefer (Draw tools). Adds a settings dialog and a Leaflet button fallback for mobile.
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

  const mod = (window.plugin.drawtoolsFillDefault = {});
  const LS_KEY = 'plugin-drawtools-fill-default'; // 'on' | 'off'

  function getFillDefault() {
    const v = localStorage.getItem(LS_KEY);
    return v === 'off' ? 'off' : 'on';
  }
  function setFillDefault(v) {
    localStorage.setItem(LS_KEY, v === 'off' ? 'off' : 'on');
  }

  function ensureCSS() {
    const css = `
      .dt-fill-default-btn.leaflet-bar a {
        display:block; width:26px; height:26px; line-height:26px;
        text-align:center; text-decoration:none; font-weight:bold;
        cursor:pointer;
      }
      .dt-fill-default-btn a:focus { outline:none; }
    `;
    $('<style>').prop('type', 'text/css').text(css).appendTo('head');
  }

  function openSettingsDialog() {
    const curr = getFillDefault();
    const html = $(`
      <div>
        <p style="margin:0 0 8px;">Draw tools の「Fill the polygon(s)」起動時の初期値を設定します。</p>
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
      title: 'Draw tools - Fill default',
      width: 360,
      buttons: {
        'Save & Apply': function () {
          const val = html.find('input[name="dt-fill"]:checked').val();
          setFillDefault(val);
          applyToCurrentSession();
          $(this).dialog('close');
        },
        Cancel: function () { $(this).dialog('close'); },
      },
    });
  }

  function applyToCurrentSession() {
    const dt = window.plugin.drawTools;
    if (!dt) return;
    const wantFill = getFillDefault() === 'on'; // true => 塗りつぶし有効
    const shouldEDF = !wantFill; // EDFstatus=true → 塗りつぶししない

    if (typeof dt.EDFstatus === 'boolean' && dt.EDFstatus !== shouldEDF) {
      dt.EDFstatus = shouldEDF;
      if (typeof dt.toggleOpacityOpt === 'function') dt.toggleOpacityOpt();
      if (typeof dt.clearAndDraw === 'function') dt.clearAndDraw();
    }
  }

  // 1) PC向け: toolbox API（あれば）にボタン追加
  function tryToolboxButton() {
    try {
      if (window.IITC && window.IITC.toolbox && window.IITC.toolbox.addButton) {
        window.IITC.toolbox.addButton({
          label: 'Fill Default',
          title: 'Draw tools - Fill default settings',
          action: openSettingsDialog,
          accesskey: 'f',
        });
        return true;
      }
      // 旧来: #toolbox に直接追加（PCとAndroidの一部でOK、iOSは表示されないこと多し）
      const $tb = $('#toolbox');
      if ($tb.length) {
        const $btn = $('<a>')
          .attr('title', 'Draw tools - Fill default settings')
          .text('Fill Default')
          .css({ cursor: 'pointer', marginLeft: '6px' })
          .on('click', openSettingsDialog);
        $tb.append($btn);
        return true;
      }
    } catch (e) {}
    return false;
  }

  // 2) モバイルでも確実に見える Leaflet コントロールを置く（フォールバック）
  function addLeafletControlButton() {
    if (!window.map || !window.L || !L.Control) return false;

    const Ctl = L.Control.extend({
      options: { position: 'topleft' },
      onAdd: function () {
        const container = L.DomUtil.create('div', 'leaflet-bar dt-fill-default-btn');
        const link = L.DomUtil.create('a', '', container);
        link.href = '#';
        link.title = 'Draw tools - Fill default';
        link.innerHTML = 'F'; // 小さな「F」ボタン
        L.DomEvent.on(link, 'click', L.DomEvent.stop)
                  .on(link, 'click', function () { openSettingsDialog(); });
        return container;
      },
    });
    const ctl = new Ctl();
    ctl.addTo(map);
    return true;
  }

  function addUIEntryPoints() {
    ensureCSS();
    const ok = tryToolboxButton();
    if (!ok) addLeafletControlButton();
  }

  // Draw tools 出現を待って適用
  function onLoaded() {
    let tries = 0;
    const maxTries = 50; // ~5秒
    (function waitForDT() {
      if (window.plugin && window.plugin.drawTools && window.plugin.drawTools.drawnItems) {
        applyToCurrentSession();
        addUIEntryPoints();
      } else if (tries++ < maxTries) {
        setTimeout(waitForDT, 100);
      } else {
        // 最低限 UI は出す（後から設定して「Save & Apply」で反映される）
        addUIEntryPoints();
      }
    })();
  }

  // IITC フック
  if (window.bootPlugins) window.bootPlugins.push(onLoaded);
  else window.bootPlugins = [onLoaded];

  if (window.iitcLoaded) onLoaded();
}

var setup = function () {};
(function () {
  const script = document.createElement('script');
  const info = {};
  if (typeof unsafeWindow !== 'undefined' && unsafeWindow !== window) {
    script.textContent = '(' + wrapper + ')(' + JSON.stringify(info) + ');';
  } else {
    script.appendChild(document.createTextNode('(' + wrapper + ')({});'));
  }
  (document.body || document.head || document.documentElement).appendChild(script);
})();
