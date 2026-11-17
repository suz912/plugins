// ==UserScript==
// @id           iitc-plugin-mu-calculator
// @name         IITC plugin: MU Calculator (InvestigateXM)
// @version      1.0.0
// @namespace    suz912.iitc.mu-calculator
// @description  Calculate CF MU from three portals or Draw Tools triangles using InvestigateXM.
// @match        https://intel.ingress.com/*
// @match        https://intel-x.ingress.com/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';
  function wrapper() {
    if (typeof window.plugin !== 'function') window.plugin = function () {};
    if (window.plugin.muCalculator) return;
    const p = window.plugin.muCalculator = {};
    const DEFAULT_API = 'https://api.investigatexm.com';
    const KEY = 'iitc-mu-calculator-api-v1';
    p.points = []; p.results = []; p.cache = new Map(); p.busy = false;
    p.api = DEFAULT_API;
    try { p.api = localStorage.getItem(KEY) || DEFAULT_API; } catch (_) {}
    const el = (tag, text, parent) => {
      const node = document.createElement(tag);
      if (text !== undefined) node.textContent = text;
      if (parent) parent.appendChild(node);
      return node;
    };
    const fmt = n => n.toLocaleString('ja-JP', {maximumFractionDigits: 3});
    p.endpoint = value => {
      const u = new URL(value.trim());
      if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash)
        throw new Error('APIには認証情報・クエリを含まないHTTPSのURLを指定してください。');
      return u.href.replace(/\/+$/, '');
    };
    p.triangle = points => {
      if (!Array.isArray(points) || points.length !== 3) throw new Error('頂点は3つ必要です。');
      const out = points.map(v => {
        if (!Number.isFinite(v.lat) || !Number.isFinite(v.lng) || Math.abs(v.lat) > 90 || Math.abs(v.lng) > 180)
          throw new Error('緯度・経度の範囲が正しくありません。');
        return {lat: v.lat, lng: v.lng};
      });
      if (new Set(out.map(v => `${v.lat},${v.lng}`)).size !== 3) throw new Error('同じ頂点が含まれています。');
      // API performs the authoritative E6 rounding and spherical degeneracy check.
      return out;
    };
    p.parse = text => p.triangle(text.trim().split(/\n+/).map(line => {
      const parts = line.trim().split(',');
      if (parts.length !== 2 || parts.some(v => !v.trim())) throw new Error('1行に「緯度,経度」を入力してください。');
      return {lat: Number(parts[0]), lng: Number(parts[1])};
    }));
    p.ring = layer => {
      let pts = layer.getLatLngs();
      while (Array.isArray(pts[0])) {
        if (pts.length !== 1) throw new Error('穴や複数の輪郭を含む図形は対象外です。');
        pts = pts[0];
      }
      pts = pts.slice();
      if (pts.length === 4 && pts[0].lat === pts[3].lat && pts[0].lng === pts[3].lng) pts.pop();
      return p.triangle(pts);
    };
    p.cacheKey = (api, c) => api + '|' + c.map(v => `${v.lat},${v.lng}`).sort().join('|');
    p.request = async (api, fields) => {
      const controller = new AbortController(); p.controller = controller;
      const timer = setTimeout(() => controller.abort(), 30000);
      try {
        const response = await fetch(api + '/getMUbulk', {
          method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({fields: fields.map(f => ({coordinates: f.coordinates})), detail: false}),
          signal: controller.signal
        });
        let data;
        try { data = await response.json(); } catch (_) { throw new Error(`HTTP ${response.status}: APIがJSONを返しませんでした。`); }
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${data.error || 'APIエラー'}`);
        if (!Array.isArray(data.results) || data.results.length !== fields.length || typeof data.model !== 'string')
          throw new Error('API応答の形式が正しくありません。');
        return data.results.map((r, i) => {
          if (r.index !== i || typeof r.ok !== 'boolean') throw new Error('API応答の順序・形式が正しくありません。');
          if (r.ok && (!Number.isSafeInteger(r.mu) || r.mu < 1 || !Number.isFinite(r.area_km2) || r.area_km2 <= 0))
            throw new Error('API応答のMU・面積が正しくありません。');
          return {...r, model: data.model};
        });
      } finally { clearTimeout(timer); p.controller = null; }
    };
    p.status = text => { if (p.statusNode) p.statusNode.textContent = text; };
    p.calculate = async fields => {
      if (p.busy) return;
      if (!fields.length) { p.status('計算対象の三角形がありません。'); return; }
      let api;
      try { api = p.endpoint(p.apiInput.value); } catch (e) { p.status(e.message); return; }
      p.api = api;
      try { localStorage.setItem(KEY, api); } catch (_) {}
      p.busy = true; p.cancelled = false; p.results = fields.map(f => ({...f, pending: true}));
      p.renderResults();
      const pending = new Map();
      fields.forEach((f, i) => {
        const key = p.cacheKey(api, f.coordinates), cached = p.cache.get(key);
        if (cached && Date.now() - cached.time < 600000) p.results[i] = {...f, ...cached.result};
        else { if (!pending.has(key)) pending.set(key, {key, coordinates: f.coordinates, indexes: []}); pending.get(key).indexes.push(i); }
      });
      const tasks = [...pending.values()];
      try {
        // Sequential, conservative batches: API limit is 50; 10 reduces deadline failures.
        for (let start = 0; start < tasks.length; start += 10) {
          if (p.cancelled) break;
          p.status(`計算中… ${Math.min(start + 10, tasks.length)}/${tasks.length} 種類のCF`);
          const batch = tasks.slice(start, start + 10);
          const results = await p.request(api, batch);
          results.forEach((r, j) => {
            if (r.ok) {
              if (p.cache.size >= 1000) p.cache.delete(p.cache.keys().next().value);
              p.cache.set(batch[j].key, {time: Date.now(), result: r});
            }
            batch[j].indexes.forEach(i => { p.results[i] = {...fields[i], ...r}; });
          });
          p.renderResults();
        }
        p.status(p.cancelled ? '中止しました。未計算分は合計に含みません。' : '計算完了（キャッシュ有効期間：10分）。');
      } catch (e) {
        p.status(e.name === 'AbortError' ? '中止または30秒のタイムアウト。未計算分は合計に含みません。' : `計算を停止しました：${e.message} 接続・CORS・API稼働状況を確認してください。`);
      } finally { p.busy = false; p.renderResults(); }
    };
    p.renderResults = () => {
      if (!p.output) return;
      p.output.replaceChildren();
      const good = p.results.filter(r => r.ok);
      const sum = good.reduce((n, r) => n + r.mu, 0);
      el('h3', `合計 ${fmt(sum)} MU（成功 ${good.length}/${p.results.length} CF）`, p.output);
      el('p', '重なりもCFごとに加算します。同一三角形を複数描いた場合も枚数分加算します。', p.output);
      const table = el('table', undefined, p.output); table.style.width = '100%';
      const head = el('tr', undefined, table);
      ['CF', 'MU', '面積 km²'].forEach(t => el('th', t, head));
      p.results.forEach((r, i) => {
        const row = el('tr', undefined, table);
        const cell = el('td', undefined, row);
        const b = el('button', r.name || `CF ${i + 1}`, cell);
        b.onclick = () => p.preview(r.coordinates);
        el('td', r.ok ? fmt(r.mu) : (r.error || '未計算'), row);
        el('td', r.ok ? fmt(r.area_km2) : '—', row);
      });
      const models = [...new Set(good.map(r => r.model))];
      if (models.length) el('p', `計算モデル：${models.join(', ')}`, p.output);
    };
    p.preview = points => {
      p.previewLayer.clearLayers();
      const poly = (L.geodesicPolygon || L.polygon)(points, {color: '#ffce47', weight: 3, fillOpacity: 0.12});
      p.previewLayer.addLayer(poly);
      if (!map.hasLayer(p.previewLayer)) p.previewLayer.addTo(map);
      map.fitBounds(poly.getBounds());
    };
    p.refreshPoints = () => {
      if (!p.pointList) return;
      p.pointList.replaceChildren();
      p.points.forEach((v, i) => {
        const li = el('li', `${v.name} (${v.lat}, ${v.lng}) `, p.pointList);
        const b = el('button', '削除', li);
        b.onclick = () => { p.points.splice(i, 1); p.refreshPoints(); };
      });
    };
    p.addSelected = () => {
      const marker = window.portals && window.portals[window.selectedPortal];
      if (!marker) { p.status('先に地図上のポータルを選択してください。'); return; }
      if (p.points.length >= 3) { p.status('頂点は3つまでです。削除して入れ替えてください。'); return; }
      const ll = marker.getLatLng();
      if (p.points.some(v => v.lat === ll.lat && v.lng === ll.lng)) { p.status('このポータルは追加済みです。'); return; }
      p.points.push({lat: ll.lat, lng: ll.lng, name: marker.options.data?.title || 'ポータル'});
      p.refreshPoints(); p.status(`${p.points.length}/3 ポータルを選択しました。`);
    };
    p.drawFields = () => {
      const group = window.plugin.drawTools?.drawnItems;
      if (!group) throw new Error('Draw Toolsプラグインを有効にしてください。');
      const fields = []; let skipped = 0;
      group.eachLayer(layer => {
        if (!(layer instanceof L.Polygon)) { skipped++; return; }
        try { fields.push({name: `Draw ${fields.length + 1}`, coordinates: p.ring(layer)}); } catch (_) { skipped++; }
      });
      return {fields, skipped};
    };
    p.open = () => {
      if (p.root?.isConnected) { window.dialog({id: 'mu-calculator', title: 'MU Calculator', html: p.root, width: 580}); return; }
      const root = p.root = el('div'); root.className = 'mu-calculator';
      el('p', 'InvestigateXMの非公式再現モデルによる推定MUです。実測値を保証するものではありません。', root);
      const label = el('label', '送信先API（HTTPS）：', root);
      p.apiInput = el('input', undefined, label); p.apiInput.value = p.api; p.apiInput.style.width = '100%';
      el('p', '「計算」を押すと、対象CFの3頂点の座標を上記APIへ送信します。ポータル名・AG名は送りません。自前APIも指定できます。自動送信はしません。', root);
      const button = (text, action) => {
        const b = el('button', text, root); b.style.margin = '4px';
        b.onclick = () => { try { action(); } catch (e) { p.status(e.message); } }; return b;
      };
      el('h3', '3ポータルで計算', root);
      p.pointList = el('ol', undefined, root); p.refreshPoints();
      button('選択中のポータルを追加', p.addSelected);
      button('頂点をクリア', () => { p.points = []; p.refreshPoints(); });
      button('3頂点のMUを計算', () => p.calculate([{name: '選択したCF', coordinates: p.triangle(p.points)}]));
      const detail = el('details', undefined, root); el('summary', '座標を直接入力する', detail);
      p.coordsInput = el('textarea', undefined, detail); p.coordsInput.rows = 3; p.coordsInput.style.width = '100%';
      p.coordsInput.placeholder = '35.000000,139.000000\n35.100000,139.000000\n35.000000,139.100000';
      const manual = el('button', '入力座標のMUを計算', detail);
      manual.onclick = () => { try { p.calculate([{name: '入力したCF', coordinates: p.parse(p.coordsInput.value)}]); } catch (e) { p.status(e.message); } };
      el('h3', 'Draw ToolsのCFを一括計算', root);
      el('p', '保存された三角形ポリゴンが対象です。線3本からの自動検出や四角形の分割はしません。画面外・非表示の描画も含みます。', root);
      button('Draw ToolsのMUを計算', () => {
        const {fields, skipped} = p.drawFields();
        p.drawNote.textContent = `対象 ${fields.length} CF ／ 対象外 ${skipped} 図形`;
        p.calculate(fields);
      });
      p.drawNote = el('p', '', root);
      button('通信を中止', () => { p.cancelled = true; p.controller?.abort(); });
      button('キャッシュを削除', () => { p.cache.clear(); p.status('キャッシュを削除しました。'); });
      button('プレビューを消す', () => p.previewLayer.clearLayers());
      p.statusNode = el('p', '計算する対象を選んでください。', root); p.statusNode.setAttribute('role', 'status');
      p.output = el('div', undefined, root); p.renderResults();
      el('p', '計算：InvestigateXM / Gordon Ludlow。人口データ：GRUMP v1 (2000), CIESIN / IFPRI / World Bank / CIAT, NASA SEDAC。', root);
      const a = el('a', '計算原理・出典', root); a.href = 'https://mu.investigatexm.com/method.html'; a.target = '_blank'; a.rel = 'noopener noreferrer';
      window.dialog({id: 'mu-calculator', title: 'MU Calculator', html: root, width: 580});
    };
    function setup() {
      p.previewLayer = L.layerGroup();
      window.addLayerGroup('MU Calculator preview', p.previewLayer, false);
      if (window.IITC?.toolbox?.addButton) window.IITC.toolbox.addButton({id: 'mu-calculator', label: 'MU Calculator', action: p.open});
      else {
        const a = el('a', 'MU Calculator', document.getElementById('toolbox'));
        a.href = '#'; a.onclick = e => { e.preventDefault(); p.open(); };
      }
    }
    setup.info = {pluginId: 'mu-calculator', script: {name: 'MU Calculator', version: '1.0.0', description: 'InvestigateXM MU calculator'}};
    window.bootPlugins = window.bootPlugins || []; window.bootPlugins.push(setup);
    if (window.iitcLoaded) setup();
  }
  const script = document.createElement('script');
  script.textContent = '(' + wrapper.toString() + ')();';
  (document.body || document.head || document.documentElement).appendChild(script);
  script.remove();
})();
