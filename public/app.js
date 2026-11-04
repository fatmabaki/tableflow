// TableFlow customer app. Vanilla JS, no build step.
// The menu and every order come from the backend API (/api/menu, /api/orders) and are saved in PostgreSQL.
// There is deliberately no offline/fake mode: if the backend can't be reached we show an error with a Retry button.
(async function () {
  const $app = document.getElementById('app');
  const ONLINE = true;

  // API base: ?api=https://host (explicit), window.TF_API_BASE, same origin, then http://localhost:5173 (page opened from file:// or another dev server).
  const explicit = new URLSearchParams(location.search).get('api') || window.TF_API_BASE;
  const isHttp = location.protocol === 'http:' || location.protocol === 'https:';
  const candidates = explicit ? [explicit.replace(/\/$/, '')] : [...(isHttp ? [''] : []), 'http://localhost:5173'];
  let API = candidates[0];
  const api = async (method, url, body) => {
    const res = await fetch(API + url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data.error && data.error.message) || 'Request failed (' + res.status + ')');
    return data;
  };

  async function loadMenu() {
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      for (const base of candidates) {
        try { API = base; const m = await api('GET', '/api/menu'); m.restaurant.currency = '$'; return m; } catch (e) { lastErr = e; }
      }
      await new Promise(r => setTimeout(r, 700 * (attempt + 1)));
    }
    throw lastErr;
  }

  let D;
  try {
    D = await loadMenu();
  } catch (e) {
    const where = isHttp ? location.origin : 'a local file (file://)';
    $app.innerHTML = `<div class="confirm"><h1>Can&#8217;t reach the server</h1>
      <p class="sub" style="color:var(--ink-2);margin:12px 0 20px">The TableFlow backend didn&#8217;t answer, so orders can&#8217;t be placed or saved.${isHttp ? '' : ' This page was opened from a file; open it through the server instead.'}</p>
      <p class="note" style="margin-bottom:20px">Tried: ${candidates.map(c => c || location.origin).join(', ')} &middot; page: ${where} &middot; ${String(e.message).replace(/[<>&]/g, '')}</p>
      <div class="stack"><button class="btn block" id="retry">Try again</button></div>
      <p class="note" style="margin-top:14px">Start the app with <b>npm run dev</b> (or <b>npm start</b> with your own PostgreSQL) and open <b>http://localhost:5173/?table=7</b></p></div>`;
    document.getElementById('retry').onclick = () => location.reload();
    return;
  }
  const cur = D.restaurant.currency;
  const money = n => cur + n.toFixed(2);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const byId = id => D.items.find(i => i.id === id);
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  const params = new URLSearchParams(location.search);
  const urlTable = parseInt(params.get('table'), 10);
  const validTable = n => Number.isInteger(n) && D.tables.includes(n);

  const S = {
    table: validTable(urlTable) ? urlTable : load('tf.table', null),
    view: 'welcome',
    cat: D.categories[0].id,
    query: '',
    cart: load('tf.cart', []),
    orders: load('tf.orders', []),
    activeOrder: null,
    pay: 'pay_at_table', who: '', email: '',
  };
  // Drop cached orders from older builds (they used local numeric ids, not server UUIDs).
  S.orders = S.orders.filter(o => /^[0-9a-f-]{36}$/.test(o.id));
  if (validTable(urlTable)) save('tf.table', urlTable);
  if (S.table && !validTable(S.table)) S.table = null;

  const persist = () => { save('tf.cart', S.cart); save('tf.orders', S.orders); };

  /* ---------- pricing ---------- */
  function lineUnit(l) {
    const it = byId(l.itemId);
    let p = it.price;
    (it.options || []).forEach((g, gi) => (l.sel[gi] || []).forEach(ci => { p += g.choices[ci].p; }));
    return p;
  }
  const lineTotal = l => lineUnit(l) * l.qty;
  const subtotal = () => S.cart.reduce((s, l) => s + lineTotal(l), 0);
  const cartCount = () => S.cart.reduce((s, l) => s + l.qty, 0);
  const totals = sub => { const tax = sub * D.restaurant.taxRate; return { sub, tax, total: sub + tax }; };
  function modText(l) {
    const it = byId(l.itemId);
    const parts = [];
    (it.options || []).forEach((g, gi) => (l.sel[gi] || []).forEach(ci => parts.push(g.choices[ci].n)));
    return parts.join(', ');
  }
  // Neutral monogram tile (two initials) instead of illustrative icons.
  const tile = () => '';
  const mono = it => esc(it.name.replace(/[^A-Za-z ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase());

  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 1800);
  }

  /* ---------- views ---------- */
  function render() {
    if (S.view === 'welcome') return renderWelcome();
    if (S.view === 'confirm') return renderConfirm();
    renderMenu();
  }

  function renderWelcome() {
    const r = D.restaurant;
    const body = S.table ? `
      <div class="table-badge">Table ${S.table}</div>
      <h2>Welcome</h2>
      <p class="sub">Browse the menu and order straight from your seat. No app to install.</p>
      <button class="btn block" id="start">View menu</button>
      <p class="note" style="margin-top:14px"><a href="#" id="change" style="color:inherit">Not your table? Change</a></p>`
    : `
      <div class="scan-box" aria-hidden="true"><svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M8 12h8" stroke-linecap="round"/></svg></div>
      <h2>Scan the QR code on your table</h2>
      <p class="sub">Point your phone camera at the code to open your table's menu.</p>
      <p class="note"><b>Demo shortcut</b> (simulates scanning a table's QR code):</p>
      <div class="table-grid">${D.tables.map(n => `<button data-table="${n}">${n}</button>`).join('')}</div>
      <p class="note">Real codes: <a href="qr.html">printable QR sheet</a></p>`;
    $app.innerHTML = `
      <div class="hero"><div class="logo">${esc(r.name.replace(/[^A-Za-z ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join(''))}</div><h1>${esc(r.name)}</h1><p>${esc(r.tagline)}</p></div>
      <div class="panel">${body}</div>`;
    const start = document.getElementById('start');
    if (start) start.onclick = () => go('menu');
    const ch = document.getElementById('change');
    if (ch) ch.onclick = e => { e.preventDefault(); S.table = null; save('tf.table', null); history.replaceState(null, '', location.pathname); renderWelcome(); };
    $app.querySelectorAll('[data-table]').forEach(b => b.onclick = () => {
      S.table = +b.dataset.table; save('tf.table', S.table);
      history.replaceState(null, '', `?table=${S.table}`); go('menu');
    });
  }

  function visibleItems() {
    const q = S.query.trim().toLowerCase();
    return D.items.filter(i => !q || (i.name + ' ' + i.desc).toLowerCase().includes(q));
  }

  function renderMenu() {
    const items = visibleItems();
    const n = cartCount();
    $app.innerHTML = `
      <div class="top">
        <div class="top-row"><h1>${esc(D.restaurant.name)}</h1><span class="table-badge">Table ${S.table}</span></div>
        <input class="search" id="q" type="search" placeholder="Search the menu" value="${esc(S.query)}" aria-label="Search the menu">
        <div class="chips">${D.categories.map(c => `<button class="chip ${c.id === S.cat ? 'on' : ''}" data-cat="${c.id}">${c.name}</button>`).join('')}</div>
      </div>
      <div class="menu" id="menu">${menuHtml(items)}</div>
      ${n ? `<div class="cartbar"><button class="btn" id="opencart"><span>View order ·${n} item${n > 1 ? 's' : ''}</span><span>${money(subtotal())}</span></button></div>` : ''}
      ${S.orders.some(o => o.table === S.table) && !n ? `<div class="cartbar"><button class="btn secondary" id="track">Track my order</button></div>` : ''}`;
    const q = document.getElementById('q');
    q.oninput = () => { S.query = q.value; const pos = q.selectionStart; document.getElementById('menu').innerHTML = menuHtml(visibleItems()); bindItems(); };
    $app.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => {
      S.cat = b.dataset.cat;
      $app.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c.dataset.cat === S.cat));
      const h = document.getElementById('cat-' + S.cat); if (h) h.scrollIntoView({ behavior: 'smooth' });
    });
    bindItems();
    const oc = document.getElementById('opencart'); if (oc) oc.onclick = openCart;
    const tr = document.getElementById('track');
    if (tr) tr.onclick = () => { S.activeOrder = [...S.orders].reverse().find(o => o.table === S.table).id; go('confirm'); };
  }

  function menuHtml(items) {
    if (!items.length) return `<div class="empty">No dishes match “${esc(S.query)}”.</div>`;
    return D.categories.map(c => {
      const list = items.filter(i => i.cat === c.id);
      if (!list.length) return '';
      return `<h2 id="cat-${c.id}">${c.name}</h2>` + list.map(i => {
        const inCart = S.cart.filter(l => l.itemId === i.id).reduce((s, l) => s + l.qty, 0);
        return `<button class="item" data-item="${i.id}">
          <div class="thumb" ${tile(i)}>${mono(i)}</div>
          <div class="info"><h3>${esc(i.name)}${i.tags.map(t => `<span class="tag">${t}</span>`).join('')}</h3><p>${esc(i.desc)}</p><span class="price">${money(i.price)}</span></div>
          <span class="add" aria-hidden="true">+</span>${inCart ? `<span class="qty-badge">${inCart}</span>` : ''}
        </button>`;
      }).join('');
    }).join('');
  }
  function bindItems() { $app.querySelectorAll('[data-item]').forEach(b => b.onclick = () => openItem(b.dataset.item)); }

  /* ---------- sheets ---------- */
  function sheet(html) {
    closeSheet();
    const o = document.createElement('div');
    o.className = 'overlay'; o.id = 'overlay';
    o.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
    o.addEventListener('click', e => { if (e.target === o) closeSheet(); });
    document.body.appendChild(o); document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => o.classList.add('show'));
    return o;
  }
  function closeSheet() {
    const o = document.getElementById('overlay'); if (o) o.remove();
    document.body.style.overflow = '';
  }

  function openItem(id) {
    const it = byId(id), opts = it.options || [];
    const sel = {}; let qty = 1; let note = '';
    const o = sheet('');
    const el = o.querySelector('.sheet');
    function unit() { let p = it.price; opts.forEach((g, gi) => (sel[gi] || []).forEach(ci => { p += g.choices[ci].p; })); return p; }
    function draw(showErr) {
      el.innerHTML = `<div class="grab"></div>
        <div class="big" ${tile(it)}>${mono(it)}</div>
        <h2>${esc(it.name)}</h2><p class="desc">${esc(it.desc)}</p>
        ${opts.map((g, gi) => `<div class="group"><h4>${g.name}<span>${g.required ? 'Required' : 'Optional'}${g.type === 'multi' ? ' · pick any' : ''}</span></h4>
          ${g.choices.map((c, ci) => `<button class="opt ${g.type === 'multi' ? 'multi' : ''} ${(sel[gi] || []).includes(ci) ? 'on' : ''}" data-g="${gi}" data-c="${ci}"><span class="dot"></span>${esc(c.n)}<span class="p">${c.p ? '+' + money(c.p) : ''}</span></button>`).join('')}
          ${showErr && g.required && !(sel[gi] || []).length ? `<div class="err">Please choose one.</div>` : ''}</div>`).join('')}
        <div class="group"><h4>Special requests <span>Optional</span></h4><textarea id="note" rows="2" maxlength="140" placeholder="Allergies, no onions…">${esc(note)}</textarea></div>
        <div class="sheet-foot"><div class="stepper"><button id="minus" aria-label="Less">−</button><b>${qty}</b><button id="plus" aria-label="More">+</button></div>
        <button class="btn" id="addbtn">Add · ${money(unit() * qty)}</button></div>`;
      el.querySelectorAll('.opt').forEach(b => b.onclick = () => {
        note = el.querySelector('#note').value;
        const gi = +b.dataset.g, ci = +b.dataset.c, g = opts[gi];
        const cur = sel[gi] || [];
        sel[gi] = g.type === 'multi' ? (cur.includes(ci) ? cur.filter(x => x !== ci) : [...cur, ci]) : [ci];
        draw();
      });
      el.querySelector('#minus').onclick = () => { note = el.querySelector('#note').value; qty = Math.max(1, qty - 1); draw(); };
      el.querySelector('#plus').onclick = () => { note = el.querySelector('#note').value; qty = Math.min(20, qty + 1); draw(); };
      el.querySelector('#addbtn').onclick = () => {
        note = el.querySelector('#note').value.trim();
        if (opts.some((g, gi) => g.required && !(sel[gi] || []).length)) { draw(true); return; }
        const key = id + JSON.stringify(sel) + note;
        const ex = S.cart.find(l => l.key === key);
        if (ex) ex.qty = Math.min(20, ex.qty + qty); else S.cart.push({ key, itemId: id, qty, sel, note });
        persist(); closeSheet(); renderMenu(); toast(`Added ${it.name}`);
      };
    }
    draw();
  }

  function openCart() {
    const o = sheet(''), el = o.querySelector('.sheet');
    function draw() {
      if (!S.cart.length) { closeSheet(); renderMenu(); return; }
      const t = totals(subtotal());
      el.innerHTML = `<div class="grab"></div><h2>Your order · Table ${S.table}</h2>
        ${S.cart.map((l, i) => { const it = byId(l.itemId); return `<div class="line">
          <div class="thumb" ${tile(it)}>${mono(it)}</div>
          <div class="info"><b>${esc(it.name)}</b><div class="mods">${esc(modText(l))}</div>${l.note ? `<div class="mods">“${esc(l.note)}”</div>` : ''}
            <div class="stepper" style="margin-top:6px"><button data-dec="${i}" aria-label="Less">−</button><b>${l.qty}</b><button data-inc="${i}" aria-label="More">+</button></div></div>
          <div class="right"><b>${money(lineTotal(l))}</b><button class="rm" data-rm="${i}">Remove</button></div></div>`; }).join('')}
        <div class="group"><h4>Name for the order <span>Optional</span></h4><input class="input" id="who" maxlength="30" placeholder="e.g. Sam" value="${esc(S.who || load('tf.name', ''))}"></div>
        ${ONLINE ? `<div class="group"><h4>Email me a receipt <span>Optional</span></h4><input class="input" id="email" type="email" maxlength="120" placeholder="you@example.com" value="${esc(S.email || load('tf.email', ''))}"></div>
        <div class="group"><h4>Payment <span>SIMULATED</span></h4>
          <button class="opt ${S.pay === 'pay_at_table' ? 'on' : ''}" data-pay="pay_at_table"><span class="dot"></span>Pay at the table</button>
          <button class="opt ${S.pay === 'simulated_online' ? 'on' : ''}" data-pay="simulated_online"><span class="dot"></span>Pay online (simulated)</button>
          <p class="note">No real payment is taken and no card details are collected. This is a student project with simulated payments.</p></div>` : ''}
        <div class="totals"><div><span>Subtotal</span><span>${money(t.sub)}</span></div><div><span>Tax (${D.restaurant.taxRate * 100}%)</span><span>${money(t.tax)}</span></div>
        <div class="grand"><span>Total</span><span>${money(t.total)}</span></div></div>
        <div class="stack"><button class="btn block" id="submit">Place order</button><button class="btn ghost block" id="more">Add more items</button></div>
        <p class="note" style="text-align:center;margin-top:10px">Demo: this simulates sending your order to the kitchen. You pay at the table.</p>`;
      el.querySelectorAll('[data-inc]').forEach(b => b.onclick = () => { S.cart[+b.dataset.inc].qty = Math.min(20, S.cart[+b.dataset.inc].qty + 1); persist(); draw(); });
      el.querySelectorAll('[data-dec]').forEach(b => b.onclick = () => { const l = S.cart[+b.dataset.dec]; if (l.qty > 1) l.qty--; else S.cart.splice(+b.dataset.dec, 1); persist(); draw(); });
      el.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { S.cart.splice(+b.dataset.rm, 1); persist(); draw(); });
      el.querySelector('#more').onclick = () => { closeSheet(); renderMenu(); };
      el.querySelectorAll('[data-pay]').forEach(b => b.onclick = () => { S.pay = b.dataset.pay; keep(); draw(); });
      const keep = () => { S.who = el.querySelector('#who').value; const em = el.querySelector('#email'); if (em) S.email = em.value; };
      el.querySelector('#submit').onclick = async e => {
        const btn = e.target; btn.disabled = true; btn.textContent = 'Sending to kitchen…';
        const name = el.querySelector('#who').value.trim(); save('tf.name', name);
        const email = el.querySelector('#email').value.trim(); save('tf.email', email);
        try {
          const order = await api('POST', '/api/orders', {
            table: S.table, name, email, paymentMethod: S.pay,
            lines: S.cart.map(l => ({ itemId: l.itemId, qty: l.qty, sel: l.sel, note: l.note })),
          });
          S.orders.push(order); S.cart = []; S.activeOrder = order.id; persist();
          closeSheet(); go('confirm');
        } catch (err) {
          btn.disabled = false; btn.textContent = 'Place order'; toast(err.message);
          const old = el.querySelector('.err-submit'); if (old) old.remove();
          btn.insertAdjacentHTML('beforebegin', `<div class="err err-submit">${esc(err.message)}</div>`);
        }
      };
    }
    draw();
  }

  const STAGES = [['Received', '1'], ['Preparing', '2'], ['Ready', '3'], ['Served', '4']];
  let ticker = null;
  const STATUS_KEYS = ['received', 'preparing', 'ready', 'served'];
  const stageOf = o => Math.max(0, STATUS_KEYS.indexOf(o.status));

  function renderConfirm() {
    const o = S.orders.find(x => x.id === S.activeOrder);
    if (!o) return go('menu');
    const s = stageOf(o);
    $app.innerHTML = `<div class="confirm">
      <div class="check"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div><h1>${s === 3 ? 'Enjoy your meal' : 'Order received'}</h1>
      <div class="order-no">Order #${o.number} · Table ${o.table}${o.name ? ' · ' + esc(o.name) : ''}</div>
      <p class="sub" style="color:var(--muted)">${['The kitchen has your order.', 'Your food is being prepared.', 'Your food is on its way to the table.', 'Your order has been served.'][s]}</p>
      <div class="steps">${STAGES.map((st, i) => `<div class="step ${i < s ? 'done' : ''} ${i === s && s < 3 ? 'now' : ''} ${i === s && s === 3 ? 'done' : ''}"><i>${i <= s ? (i < s || s === 3 ? '&#10003;' : st[1]) : ''}</i>${st[0]}</div>`).join('')}</div>
      <p class="note">${ONLINE ? 'Live status from the server (demo kitchen is simulated).' : 'Status progression is simulated for the demo.'}${o.paymentStatus === 'paid_simulated' ? ' Payment: SIMULATED, nothing was charged.' : ''}</p>
      <div class="recap">${o.lines.map(l => `<div><span>${l.qty}× ${esc(l.name)}${l.mods ? ` <small style="color:var(--muted)">(${esc(l.mods)})</small>` : ''}</span><span>${money(l.total)}</span></div>`).join('')}
        <div style="border-top:1px solid var(--line);margin-top:6px;padding-top:8px"><b>Total incl. tax</b><b>${money(o.total)}</b></div></div>
      <div class="stack"><button class="btn block" id="again">Order something else</button></div></div>`;
    document.getElementById('again').onclick = () => go('menu');
    clearInterval(ticker);
    if (s < 3) ticker = setInterval(async () => {
      if (S.view !== 'confirm') return clearInterval(ticker);
      if (ONLINE) {
        try {
          const fresh = await api('GET', '/api/orders/' + o.id);
          Object.assign(o, fresh); persist();
        } catch { /* keep last known status; retry next tick */ }
      }
      if (S.view === 'confirm') renderConfirm();
    }, 2000);
  }

  function go(view) { S.view = view; clearInterval(ticker); window.scrollTo(0, 0); render(); }

  // QR-entry: a valid ?table=N skips straight to the welcome screen for that table.
  render();
})();
