/* 欢乐掼蛋 client */
(function () {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const stage = $('#stage');

  // ============ stage scaling (landscape, rotates on portrait phones) ============
  let rotated = false;
  function fit() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    rotated = H > W * 1.05;
    let s;
    if (rotated) {
      s = Math.min(H / 1280, W / 720);
      stage.style.transform = `translate(${(W + 720 * s) / 2}px, ${(H - 1280 * s) / 2}px) rotate(90deg) scale(${s})`;
    } else {
      s = Math.min(W / 1280, H / 720);
      stage.style.transform = `translate(${(W - 1280 * s) / 2}px, ${(H - 720 * s) / 2}px) scale(${s})`;
    }
  }
  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', () => setTimeout(fit, 200));
  fit();

  // ============ helpers ============
  const PLACE = ['头游', '二游', '三游', '末游'];
  const lvlLabel = (r) => (r === 14 ? 'A' : r === 13 ? 'K' : r === 12 ? 'Q' : r === 11 ? 'J' : String(r));
  const VOICE_RANK = { 2: '二', 3: '三', 4: '四', 5: '五', 6: '六', 7: '七', 8: '八', 9: '九', 10: '十', 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 20: '小王', 21: '大王' };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const PHRASES = [
    '大家好，很高兴见到各位！',
    '快点吧，我等到花儿都谢了！',
    '你的牌打得也太好了！',
    '和你合作真是太愉快了！',
    '不要走，决战到天亮！',
    '搭档，稳住，我们能赢！',
    '又断线了，网络怎么这么差啊！',
    '不要吵了，专心玩游戏吧！',
    '炸得好！',
    '各位，真不好意思，我要离开一会儿。',
  ];
  const EMOJI = ['😀', '😂', '😎', '😍', '🤔', '😭', '😡', '😱', '👍', '👏', '🙏', '💪', '🎉', '🌹', '💣', '🍺'];
  const FEMALE_AV = new Set([1, 3, 7, 9]);

  function toast(msg, ms = 1800) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.remove('show');
    void t.offsetWidth;
    t.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => t.classList.remove('show'), ms);
  }

  // ============ profile ============
  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem('gd.' + k);
        return v === null ? d : JSON.parse(v);
      } catch (e) {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem('gd.' + k, JSON.stringify(v));
      } catch (e) {}
    },
  };
  const me = {
    token: store.get('token', null),
    name: store.get('name', null) || '玩家' + Math.floor(1000 + Math.random() * 9000),
    avatar: store.get('avatar', Math.floor(Math.random() * 6)),
  };
  store.set('name', me.name);
  store.set('avatar', me.avatar);

  function renderProfile() {
    $('#homeAvatar').innerHTML = ART.avatarSVG(me.avatar);
    $('#homeName').textContent = me.name;
  }
  renderProfile();

  // ============ network ============
  let ws = null;
  let retry = 0;
  let connected = false;
  let replaced = false; // this tab was superseded by another tab with the same account
  const outbox = [];
  function connect() {
    const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
    ws = new WebSocket(url);
    ws.onopen = () => {
      connected = true;
      retry = 0;
      $('#connBar').classList.remove('show');
      ws.send(JSON.stringify({ type: 'hello', token: me.token, name: me.name, avatar: me.avatar }));
      while (outbox.length) ws.send(outbox.shift());
    };
    ws.onmessage = (e) => {
      let m;
      try {
        m = JSON.parse(e.data);
      } catch (err) {
        return;
      }
      onMessage(m);
    };
    ws.onclose = () => {
      connected = false;
      if (replaced) return;
      $('#connBar').textContent = '网络连接中断，正在重连…';
      $('#connBar').classList.add('show');
      setTimeout(connect, Math.min(8000, 800 * Math.pow(1.6, retry++)));
    };
  }
  function send(m) {
    const s = JSON.stringify(m);
    if (connected && ws.readyState === 1) ws.send(s);
    else outbox.push(s);
  }

  // ============ app state ============
  let S = null; // latest room state
  let prevS = null;
  let screen = 'home';
  let deadlineAt = 0;
  const sel = new Set();
  let groups = store.get('groups', []); // custom 理牌 columns
  let sortMode = store.get('sortMode', 'rank');
  let hintList = null;
  let hintIdx = 0;
  let hintKey = '';
  let sfIdx = 0;
  let dealAnim = false;
  let resultShownFor = '';
  let lastTickSec = -1;
  const playSig = ['', '', '', ''];

  function show(name) {
    screen = name;
    $$('.screen').forEach((s) => s.classList.toggle('active', s.id === 'scr-' + name));
    if (name === 'home') {
      S = null;
      closeModal();
      send({ type: 'list' });
    }
  }

  function onMessage(m) {
    switch (m.type) {
      case 'welcome':
        me.token = m.token;
        store.set('token', m.token);
        maybeAutoJoin();
        break;
      case 'rooms':
        renderRooms(m.rooms);
        if (m.online) $('#onlineCount').textContent = m.online;
        if (screen === 'game' && !S) show('home');
        break;
      case 'state':
        prevS = S;
        S = m;
        deadlineAt = m.remain !== null && m.remain !== undefined ? Date.now() + m.remain : 0;
        if (screen !== 'game') {
          show('game');
          for (let i = 0; i < 4; i++) playSig[i] = '';
        }
        render();
        break;
      case 'ev':
        onEvent(m);
        break;
      case 'chat':
        onChat(m);
        break;
      case 'error':
        toast(m.msg);
        break;
      case 'left':
        show('home');
        break;
      case 'kicked':
        if (m.dup) {
          replaced = true;
          $('#connBar').textContent = '账号已在其他页面登录，刷新页面可在此继续';
          $('#connBar').classList.add('show');
        }
        toast(m.msg || '你已离开房间', 2500);
        show('home');
        break;
    }
  }

  function maybeAutoJoin() {
    const code = new URLSearchParams(location.search).get('room');
    if (code && /^\d{6}$/.test(code)) {
      history.replaceState(null, '', location.pathname);
      send({ type: 'join', code });
    }
  }

  // ============ hall ============
  function renderRooms(list) {
    const el = $('#roomList');
    if (!list || !list.length) {
      el.innerHTML = '<div class="rl-empty">暂时没有房间<br>快去创建一个，邀请好友一起玩吧</div>';
      return;
    }
    el.innerHTML = list
      .map(
        (r) => `<div class="rl-item" data-code="${r.code}">
        <div><div class="rl-code">${r.code}</div><div class="rl-host">房主：${esc(r.host)}</div></div>
        <div style="flex:1"></div>
        <div class="rl-n">${[0, 1, 2, 3].map((i) => `<i class="${i < r.n ? 'on' : ''}"></i>`).join('')}</div>
        <span class="rl-state ${r.phase === 'lobby' ? '' : 'busy'}">${r.phase === 'lobby' ? (r.n < 4 ? '可加入' : '已满') : '游戏中'}</span>
      </div>`
      )
      .join('');
  }
  $('#roomList').addEventListener('click', (e) => {
    const it = e.target.closest('.rl-item');
    if (it) send({ type: 'join', code: it.dataset.code });
  });

  // ============ seat geometry ============
  const posOf = (seat) => (S ? (seat - S.me + 4) % 4 : seat);
  const seatAt = (pos) => (S.me + pos) % 4;
  const SEAT_XY = [
    [69, 434],
    [1207, 248],
    [640, 50],
    [73, 248],
  ];
  const THROW_FROM = [
    [0, 260],
    [160, 10],
    [0, -90],
    [-160, 10],
  ];

  // ============ rendering ============
  function render() {
    if (!S) return;
    const st = S;
    const myTeam = st.me % 2;
    $('#roomTag').textContent = '房间 ' + st.code;
    // level board
    const lvlNow = st.phase === 'lobby' ? st.levels[st.trump] : st.lvl;
    $('#lbCur').textContent = lvlLabel(lvlNow);
    $('#centerLvl').textContent = '打 ' + lvlLabel(lvlNow);
    $('#lbUs').textContent = lvlLabel(st.levels[myTeam]);
    $('#lbThem').textContent = lvlLabel(st.levels[1 - myTeam]);
    $('.lb-team.us').classList.toggle('trump', st.trump === myTeam && st.phase !== 'lobby');
    $('.lb-team.them').classList.toggle('trump', st.trump !== myTeam && st.phase !== 'lobby');
    const af = st.aFail[st.trump] ? `  A级失败 ${st.aFail[st.trump]}/3` : '';
    $('#lbRound').innerHTML = `<span>${st.phase === 'lobby' ? '等待开局' : '第 ' + st.round + ' 局'}</span><span>${af}</span>`;

    renderSeats();
    renderPlays();
    renderHand();
    renderControls();
    renderTribute();
    renderCounter();
    renderPartnerHand();
    renderResult();
  }

  function renderCounter() {
    const el = $('#counter');
    const on = store.get('counter', true) && (S.phase === 'playing' || S.phase === 'tribute');
    el.classList.toggle('show', on);
    if (!on) return;
    const lvl = S.lvl;
    const seen = {};
    for (const id of S.hand.concat(S.played || [])) {
      const r = GD.card(id).rank;
      seen[r] = (seen[r] || 0) + 1;
    }
    const order = [21, 20, lvl].concat([14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2].filter((r) => r !== lvl));
    const html =
      '<span class="cc-t">记牌器</span>' +
      order
        .map((r) => {
          const left = (r >= 20 ? 2 : 8) - (seen[r] || 0);
          const label = r === 21 ? '大' : r === 20 ? '小' : lvlLabel(r);
          const cls = ['cc', r >= 20 ? 'jk' : '', r === lvl ? 'lv' : '', left === 0 ? 'zero' : '', left >= 4 && r < 20 ? 'hot' : ''].join(' ');
          return `<div class="${cls}"><b>${label}</b><i>${left}</i></div>`;
        })
        .join('');
    if (el._html !== html) {
      el.innerHTML = html;
      el._html = html;
    }
  }

  function renderPartnerHand() {
    const el = $('#partnerHand');
    const ph = S.partnerHand;
    el.classList.toggle('show', !!(ph && ph.length));
    if (!ph || !ph.length) return (el._html = '');
    const ids = GD.sortHand(ph, S.lvl, 'rank');
    const step = Math.min(30, 900 / ids.length);
    const html = `<div class="ph-t">队友 ${esc(S.seats[(S.me + 2) % 4].name)} 的手牌（${ids.length} 张）</div><div class="ph-cards" style="width:${step * (ids.length - 1) + 58}px">${ids
      .map((id, i) => ART.cardHTML(id, S.lvl).replace('class="card', `style="left:${i * step}px" class="card`))
      .join('')}</div>`;
    if (el._html !== html) {
      el.innerHTML = html;
      el._html = html;
    }
  }

  function renderSeats() {
    const st = S;
    for (let pos = 0; pos < 4; pos++) {
      const seat = seatAt(pos);
      const s = st.seats[seat];
      const el = $(`.seat.pos${pos}`);
      let html;
      const inLobby = st.phase === 'lobby' || st.phase === 'gameEnd';
      if (!s) {
        el.className = `seat pos${pos} empty`;
        const btns = [];
        if (inLobby && st.me === st.host) btns.push(`<button data-act="addBot" data-seat="${seat}">+电脑</button>`);
        if (inLobby) btns.push(`<button data-act="sit" data-seat="${seat}">坐这里</button>`);
        html = `<div class="avatar">+</div><div class="nm">等待加入</div><div class="seat-btns">${btns.join('')}</div>`;
      } else {
        const place = st.finished.indexOf(seat);
        const cls = [`seat`, `pos${pos}`, seat % 2 === st.me % 2 ? 'team-us' : 'team-them'];
        if (st.turn === seat && st.phase === 'playing') cls.push('turn');
        if (!s.connected) cls.push('offline');
        el.className = cls.join(' ');
        let tag = '';
        if (s.bot && !s.hosted) tag = '<span class="tag bot">电脑</span>';
        else if (!s.connected && !s.bot) tag = '<span class="tag off">离线</span>';
        else if (s.hosted) tag = '<span class="tag hosted">托管</span>';
        else if (seat === st.host && inLobby) tag = '<span class="tag host">房主</span>';
        const warn = s.count > 0 && s.count <= 10;
        const cnt = st.phase === 'playing' || st.phase === 'tribute' ? `<div class="cnt ${warn ? 'warn' : ''}">${s.count}</div>` : '';
        const ready = inLobby && (s.ready || s.bot) && seat !== st.host ? '<div class="ready-mark">✔ 已准备</div>' : '';
        const placeHtml = place >= 0 && place < 3 && st.phase === 'playing' ? `<div class="place p${place + 1}">${PLACE[place]}</div>` : '';
        const btns = inLobby && st.me === st.host && seat !== st.me ? `<div class="seat-btns"><button data-act="kick" data-seat="${seat}">移出</button></div>` : '';
        html = `${tag}<div class="avatar" data-act="avatar" data-seat="${seat}">${ART.avatarSVG(s.avatar)}</div>${placeHtml}${ready}${cnt}<div class="nm"><span class="tm"></span>${esc(s.name)}</div>${btns}`;
      }
      if (el._html !== html) {
        el.innerHTML = html;
        el._html = html;
      }
    }
  }

  function renderPlays() {
    const st = S;
    const t = st.trick;
    for (let pos = 0; pos < 4; pos++) {
      const seat = seatAt(pos);
      const el = $(`.play-area.pa${pos}`);
      let p = t.plays[seat];
      const hideForTurn = st.phase === 'playing' && st.turn === seat;
      if (st.phase !== 'playing' || hideForTurn) p = null;
      if (t.over && p && p.pass) p = null;
      const sig = !p ? '' : p.pass ? 'pass' : p.ids.join(',');
      el.classList.toggle('winning', !!p && !p.pass && t.lastSeat === seat);
      el.style.opacity = t.over && p ? '0.55' : '1';
      if (sig === playSig[pos]) continue;
      const isNew = sig && sig !== playSig[pos];
      playSig[pos] = sig;
      if (!p) {
        el.innerHTML = '';
        continue;
      }
      if (p.pass) {
        el.innerHTML = `<div class="pass-word">不出</div>`;
        continue;
      }
      const step = 25;
      const w = step * (p.ids.length - 1) + 61;
      const label = p.n >= 5 || p.tier ? `<div class="ctype">${GD.TYPE_NAME[p.type]}</div>` : '';
      el.innerHTML = `<div class="pcards" style="width:${w}px">${p.ids
        .map((id, i) => ART.cardHTML(id, st.lvl).replace('class="card', `style="left:${i * step}px" class="card`))
        .join('')}${label}</div>`;
      if (isNew) {
        const pc = el.firstChild;
        pc.animate(
          [
            { transform: `translate(${THROW_FROM[pos][0]}px, ${THROW_FROM[pos][1]}px) scale(0.5)`, opacity: 0.3 },
            { transform: 'translate(0,0) scale(1.06)', opacity: 1, offset: 0.75 },
            { transform: 'translate(0,0) scale(1)', opacity: 1 },
          ],
          { duration: 300, easing: 'cubic-bezier(.2,.9,.3,1)' }
        );
      }
    }
  }

  // ----- hand layout -----
  const CW = 84;
  const CH = 116;
  const DY = 31;
  const handEls = new Map();

  function buildColumns(hand, lvl) {
    const inHand = new Set(hand);
    groups = groups.map((g) => g.filter((id) => inHand.has(id))).filter((g) => g.length);
    const grouped = new Set([].concat(...groups));
    const rest = hand.filter((id) => !grouped.has(id));
    const byRank = new Map();
    for (const id of rest) {
      const c = GD.card(id);
      const key = GD.cardPower(id, lvl) * 100 + (c.rank === 21 ? 1 : 0);
      if (!byRank.has(key)) byRank.set(key, []);
      byRank.get(key).push(id);
    }
    const suitO = { H: 0, S: 1, C: 2, D: 3, J: 4 };
    let cols = [...byRank.entries()].map(([k, ids]) => ({
      k,
      ids: ids.sort((a, b) => (GD.isWild(GD.card(b), lvl) ? 1 : 0) - (GD.isWild(GD.card(a), lvl) ? 1 : 0) || suitO[GD.card(a).suit] - suitO[GD.card(b).suit] || a - b),
    }));
    if (sortMode === 'count') cols.sort((a, b) => Math.min(b.ids.length, 4) - Math.min(a.ids.length, 4) || b.k - a.k);
    else cols.sort((a, b) => b.k - a.k);
    const out = groups.map((g) => ({ ids: g.slice(), group: true })).concat(cols.map((c) => ({ ids: c.ids })));
    return out;
  }

  function renderHand() {
    const st = S;
    const hand = st.phase === 'lobby' ? [] : st.hand;
    const box = $('#hand');
    for (const id of [...sel]) if (!hand.includes(id)) sel.delete(id);
    const cols = buildColumns(hand, st.lvl);
    store.set('groups', groups);
    const n = cols.length;
    const left = 128;
    const right = 1140;
    const avail = right - left;
    const step = n > 1 ? Math.min(CW + 6, (avail - CW) / (n - 1)) : 0;
    const total = n ? step * (n - 1) + CW : 0;
    const x0 = Math.max(left, 640 - total / 2 - 10);
    const bottom = 712;
    const seen = new Set();
    const returning = st.phase === 'tribute' && myReturnItem();
    box.classList.toggle('returning', !!returning);
    let order = 0;
    cols.forEach((col, ci) => {
      col.ids.forEach((id, k) => {
        seen.add(id);
        let el = handEls.get(id);
        const fresh = !el;
        if (!el) {
          const tmp = document.createElement('div');
          tmp.innerHTML = ART.cardHTML(id, st.lvl);
          el = tmp.firstElementChild;
          el._lvl = st.lvl;
          handEls.set(id, el);
          box.appendChild(el);
        } else if (el._lvl !== st.lvl) {
          const tmp = document.createElement('div');
          tmp.innerHTML = ART.cardHTML(id, st.lvl);
          const nel = tmp.firstElementChild;
          nel._lvl = st.lvl;
          box.replaceChild(nel, el);
          handEls.set(id, nel);
          el = nel;
        }
        const x = x0 + ci * step + (col.group ? 0 : 0);
        const y = bottom - CH - (col.ids.length - 1 - k) * DY - (sel.has(id) ? 22 : 0);
        el.style.transform = `translate(${x}px, ${y}px)`;
        el.style.zIndex = String(100 + ci * 20 + k);
        el.classList.toggle('sel', sel.has(id));
        el.classList.toggle('grouped', !!col.group);
        if (returning) el.classList.toggle('bad', !validReturn(id));
        else el.classList.remove('bad');
        if (fresh && dealAnim) {
          el.classList.add('enter');
          el.style.animationDelay = order * 22 + 'ms';
          if (order % 3 === 0) setTimeout(() => SND.play('deal'), order * 22);
        } else if (fresh && prevS && prevS.phase !== 'lobby') {
          el.classList.add('enter');
          el.style.animationDelay = '0ms';
        }
        order++;
      });
    });
    for (const [id, el] of handEls) {
      if (!seen.has(id)) {
        el.remove();
        handEls.delete(id);
      }
    }
    if (dealAnim) {
      dealAnim = false;
      setTimeout(() => $$('#hand .card.enter').forEach((e) => e.classList.remove('enter')), 1500);
    }
  }

  function myReturnItem() {
    if (!S || !S.tribute || S.tribute.stage !== 'return') return null;
    return S.tribute.items.find((x) => x.to === S.me && x.back === null) || null;
  }
  function validReturn(id) {
    const c = GD.card(id);
    if (GD.isWild(c, S.lvl)) return false;
    if (GD.cardPower(id, S.lvl) <= 10) return true;
    return !S.hand.some((h) => !GD.isWild(GD.card(h), S.lvl) && GD.cardPower(h, S.lvl) <= 10);
  }

  // ----- controls / clock / panels -----
  function myTurn() {
    return S && S.phase === 'playing' && S.turn === S.me && !S.seats[S.me].hosted;
  }
  function leading() {
    return !S.lastCombo;
  }
  function ensureHints() {
    const key = [S.round, S.turn, S.trick.lastSeat, S.hand.length, JSON.stringify(S.lastCombo)].join('|');
    if (key !== hintKey) {
      hintKey = key;
      hintList = GD.hints(S.hand, S.lvl, S.lastCombo);
      hintIdx = 0;
    }
    return hintList;
  }

  function renderControls() {
    const st = S;
    const mine = myTurn();
    const acts = $('#actions');
    acts.classList.toggle('show', mine);
    if (mine) {
      const hs = ensureHints();
      const passBtn = $('.act-pass', acts);
      const playBtn = $('.act-play', acts);
      const hintBtn = $('.act-hint', acts);
      passBtn.style.display = leading() ? 'none' : '';
      passBtn.textContent = !leading() && !hs.length ? '要不起' : '不 出';
      hintBtn.style.display = hs.length ? '' : 'none';
      playBtn.style.display = hs.length || leading() ? '' : 'none';
      updatePlayBtn();
      if (prevS && (prevS.turn !== st.me || prevS.phase !== 'playing')) {
        SND.play('turn');
        if (!leading() && !hs.length) showNotice('没有牌大过上家', 1600);
      }
    }
    const inLobby = st.phase === 'lobby' || (st.phase === 'gameEnd' && !$('#modal').classList.contains('show'));
    $('#waitPanel').classList.toggle('show', inLobby);
    if (inLobby) {
      $('#wpCode').textContent = st.code;
      const n = st.seats.filter(Boolean).length;
      const isHost = st.me === st.host;
      const others = st.seats.filter((s, i) => s && i !== st.host);
      const allReady = others.every((s) => s.ready || s.bot);
      $('#wpTip').textContent = n < 4 ? `还差 ${4 - n} 人，可邀请好友或让电脑补位` : isHost ? (allReady ? '人齐了，点击开始游戏' : '等待其他玩家准备…') : '等待房主开始游戏…';
      const rb = $('#btnReady');
      if (isHost) {
        rb.textContent = '开始游戏';
        rb.classList.toggle('disabled', !(n === 4 && allReady));
      } else {
        const r = st.seats[st.me] && st.seats[st.me].ready;
        rb.textContent = r ? '取消准备' : '准 备';
        rb.classList.remove('disabled');
      }
      $('[data-act="fillBots"]').style.display = isHost && n < 4 ? '' : 'none';
    }
    const hosted = st.seats[st.me] && st.seats[st.me].hosted && st.phase !== 'lobby' && st.phase !== 'gameEnd' && st.hand.length > 0;
    $('#hostedMask').classList.toggle('show', !!hosted);
    $('#btnHosted').classList.toggle('on', !!hosted);
    $('#btnHosted').style.display = st.phase === 'playing' || st.phase === 'tribute' ? '' : 'none';
    $('#sideTools').style.display = st.phase === 'lobby' ? 'none' : '';
    $('#arrLabel').textContent = sel.size ? '理牌' : groups.length ? '恢复' : '理牌';
    $('#tributeActs').classList.toggle('show', !!myReturnItem() && !hosted);
    if (st.notice && (!prevS || prevS.notice !== st.notice) && st.phase !== 'lobby') showNotice(st.notice, 2200);
    if (st.phase === 'playing' && st.trick.jiefeng && st.trick.over && prevS && !prevS.trick.jiefeng) {
      showNotice(`${st.seats[st.turn].name} 接风`, 1800);
    }
    updateClock();
  }

  function updatePlayBtn() {
    if (!S || !myTurn()) return;
    const ok = sel.size && GD.resolve([...sel], S.lvl, S.lastCombo);
    $('.act-play').classList.toggle('disabled', !ok);
  }

  function showNotice(text, ms) {
    const n = $('#notice');
    n.textContent = text;
    n.classList.remove('show');
    void n.offsetWidth;
    n.classList.add('show');
    clearTimeout(showNotice.t);
    showNotice.t = setTimeout(() => n.classList.remove('show'), ms || 2000);
  }

  function updateClock() {
    const c = $('#clock');
    if (!S || S.phase !== 'playing' || S.turn < 0 || !deadlineAt) {
      c.classList.remove('show');
      return;
    }
    const pos = posOf(S.turn);
    const sec = Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000));
    c.className = `clock show at${pos}${sec <= 5 ? ' hurry' : ''}`;
    c.firstElementChild.textContent = sec;
    if (S.turn === S.me && sec <= 5 && sec > 0 && sec !== lastTickSec) {
      lastTickSec = sec;
      SND.play('tick');
    }
  }
  setInterval(() => {
    updateClock();
    updateResultTimer();
  }, 250);

  // ----- tribute panel -----
  function renderTribute() {
    let el = $('#tribShow');
    if (!el) {
      el = document.createElement('div');
      el.id = 'tribShow';
      el.className = 'trib-show';
      $('#scr-game').appendChild(el);
    }
    const t = S.tribute;
    const showIt = S.phase === 'tribute' && t;
    el.classList.toggle('show', !!showIt);
    if (!showIt) return (el._html = '');
    let html;
    const nm = (s) => esc(s === S.me ? '我' : S.seats[s].name);
    const mc = (id) => `<div class="mc">${ART.cardHTML(id, S.lvl)}</div>`;
    if (t.resist) html = `<h4>抗 贡</h4><div>末游方持有两张大王，本局免进贡，由头游先出牌</div>`;
    else {
      html = `<h4>进贡 · 还贡</h4><div class="trib-rows">${t.items
        .map(
          (it) => `<div class="trib-row"><span class="who">${nm(it.from)}</span>${mc(it.card)}<span class="arrow">➜</span><span class="who">${nm(it.to)}</span>
            <span style="width:10px"></span>${it.back !== null ? `<span class="who">还</span>${mc(it.back)}` : `<span class="who" style="opacity:.7">等待还贡…</span>`}</div>`
        )
        .join('')}</div>`;
    }
    if (el._html !== html) {
      el.innerHTML = html;
      el._html = html;
    }
  }

  // ----- result -----
  function renderResult() {
    const st = S;
    if ((st.phase !== 'roundEnd' && st.phase !== 'gameEnd') || !st.result) return;
    const key = st.code + ':' + st.round + ':' + st.phase;
    if (resultShownFor === key) {
      const btn = $('#resReady');
      if (btn) {
        const r = st.seats[st.me] && st.seats[st.me].ready;
        btn.classList.toggle('disabled', !!r);
        btn.dataset.base = r ? '等待其他玩家' : st.phase === 'gameEnd' ? '再来一局' : '继续游戏';
        updateResultTimer();
      }
      return;
    }
    resultShownFor = key;
    const r = st.result;
    const myTeam = st.me % 2;
    const won = r.winnerTeam === myTeam;
    const gameOver = st.phase === 'gameEnd';
    const rows = r.ranks
      .map((seat, p) => {
        const s = st.seats[seat];
        const team = seat % 2;
        const us = team === myTeam;
        return `<tr class="${seat === st.me ? 'mine' : ''}">
          <td><span class="res-place p${p + 1}">${PLACE[p]}</span></td>
          <td><div class="avatar">${ART.avatarSVG(s ? s.avatar : 0)}</div></td>
          <td style="width:40%"><span class="team-dot ${us ? 'us' : 'them'}"></span>${esc(s ? s.name : '')}</td>
          <td>${us ? '我方' : '对方'}</td>
          <td class="lv-change">${lvlLabel(r.before[team])} → <span class="${r.after[team] !== r.before[team] ? 'up' : ''}">${lvlLabel(r.after[team])}</span></td>
        </tr>`;
      })
      .join('');
    const upTxt = ['', '升 1 级', '升 2 级', '升 3 级'][r.up];
    let sum;
    if (gameOver) sum = r.gameWon === myTeam ? '恭喜我方 <b>过 A</b>，赢得整场比赛！' : '对方率先 <b>过 A</b>，再接再厉！';
    else if (r.after[r.winnerTeam] === r.before[r.winnerTeam]) sum = `${won ? '我方' : '对方'}获胜，但打 A 须队友不是末游，下一局继续打 <b>A</b>`;
    else sum = `${won ? '我方' : '对方'} <b>${upTxt}</b>，下一局打 <b>${lvlLabel(r.after[r.winnerTeam])}</b>`;
    let note = '';
    if (r.resetA !== null && r.resetA !== undefined) note = `${r.resetA === myTeam ? '我方' : '对方'}打A三次未过，级牌退回 2`;
    const aF = r.aFail || [0, 0];
    if (!note && (aF[0] || aF[1]) && !gameOver) note = `打A失败次数：我方 ${aF[myTeam]}/3，对方 ${aF[1 - myTeam]}/3`;
    const title = gameOver ? (r.gameWon === myTeam ? '胜 利' : '失 败') : won ? '胜 利' : '失 败';
    const good = gameOver ? r.gameWon === myTeam : won;
    openModal(
      `<div class="res">
        <div class="res-banner ${good ? '' : 'lose'}"><span>${title}</span></div>
        <div class="res-sum">${sum}</div>
        <table class="res-table">${rows}</table>
        ${note ? `<div class="res-note">${note}</div>` : ''}
        <div class="m-foot">
          <button class="btn btn-gray" data-act="exit">离开房间</button>
          <button class="btn btn-orange" id="resReady" data-act="resReady" data-base="${gameOver ? '再来一局' : '继续游戏'}">${gameOver ? '再来一局' : '继续游戏'}</button>
        </div>
      </div>`,
      { noClose: true, delay: 900 }
    );
    setTimeout(() => SND.play(good ? 'win' : 'lose'), 900);
    if (good) setTimeout(() => confetti(), 950);
  }
  function updateResultTimer() {
    const b = $('#resReady');
    if (!b || !S) return;
    const base = b.dataset.base;
    if (S.phase === 'roundEnd' && deadlineAt) {
      const sec = Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000));
      b.textContent = `${base} (${sec})`;
    } else b.textContent = base;
  }

  // ============ events ============
  function onEvent(e) {
    if (!S) return;
    const pos = e.seat !== undefined ? posOf(e.seat) : 0;
    switch (e.name) {
      case 'deal':
        dealAnim = true;
        sel.clear();
        groups = [];
        closeModal();
        break;
      case 'play': {
        SND.play('play');
        fxForPlay(e, pos);
        voiceForPlay(e);
        break;
      }
      case 'pass':
        SND.play('pass');
        if (SND.prefs.voice) SND.say(['不要', '过', '要不起'][Math.floor(Math.random() * 3)], isFemale(e.seat));
        break;
      case 'out':
        setTimeout(() => {
          SND.play('out');
          banner(`${e.seat === S.me ? '恭喜你' : S.seats[e.seat].name} 获得${PLACE[e.place - 1]}！`);
        }, 400);
        break;
      case 'timeout':
        if (e.seat === S.me) toast('操作超时，已进入托管');
        break;
      case 'tribute':
        SND.play('tribute');
        if (e.resist) fxText('抗 贡', 'blue');
        else fxText('进 贡', 'sm');
        break;
      case 'return':
        SND.play('tribute');
        if (e.to === S.me) toast(`${S.seats[e.from].name} 还给你一张牌`);
        break;
      case 'roundEnd':
      case 'gameEnd':
        break;
    }
  }

  function isFemale(seat) {
    const s = S && S.seats[seat];
    return !!s && FEMALE_AV.has(s.avatar);
  }

  function voiceForPlay(e) {
    if (!SND.prefs.voice) return;
    const ids = e.ids || [];
    let txt;
    const natural = ids.map((id) => GD.card(id)).find((c) => !GD.isWild(c, S.lvl));
    const r = natural ? natural.rank : S.lvl;
    switch (e.ctype) {
      case 'single':
        txt = VOICE_RANK[r];
        break;
      case 'pair':
        txt = '对' + VOICE_RANK[r];
        break;
      case 'triple':
        txt = '三个' + VOICE_RANK[r];
        break;
      case 'bomb':
        txt = e.n >= 6 ? '炸弹！炸弹！' : '炸弹';
        break;
      default:
        txt = GD.TYPE_NAME[e.ctype];
    }
    if (txt) SND.say(txt, isFemale(e.seat));
  }

  // ============ effects ============
  const fx = $('#fx');
  function fxText(text, cls, ms = 1700) {
    const d = document.createElement('div');
    d.className = 'fx-text ' + (cls || '');
    d.textContent = text;
    fx.appendChild(d);
    setTimeout(() => d.remove(), ms);
  }
  function banner(text) {
    const d = document.createElement('div');
    d.className = 'fx-banner';
    d.textContent = text;
    fx.appendChild(d);
    setTimeout(() => d.remove(), 2300);
  }
  function burst(x, y, n = 18, color) {
    const ring = document.createElement('div');
    ring.className = 'fx-ring';
    ring.style.left = x + 'px';
    ring.style.top = y + 'px';
    fx.appendChild(ring);
    setTimeout(() => ring.remove(), 900);
    for (let i = 0; i < n; i++) {
      const s = document.createElement('div');
      s.className = 'fx-spark';
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.3;
      const d = 120 + Math.random() * 180;
      s.style.left = x + 'px';
      s.style.top = y + 'px';
      s.style.setProperty('--dx', Math.cos(a) * d + 'px');
      s.style.setProperty('--dy', Math.sin(a) * d + 'px');
      if (color) s.style.background = color;
      fx.appendChild(s);
      setTimeout(() => s.remove(), 1000);
    }
  }
  function flash(x, y) {
    const f = document.createElement('div');
    f.className = 'fx-flash';
    f.style.setProperty('--x', (x / 1280) * 100 + '%');
    f.style.setProperty('--y', (y / 720) * 100 + '%');
    fx.appendChild(f);
    setTimeout(() => f.remove(), 800);
  }
  function shakeTable() {
    const g = $('#scr-game');
    g.classList.remove('shake');
    void g.offsetWidth;
    g.classList.add('shake');
    setTimeout(() => g.classList.remove('shake'), 550);
  }
  const PA_CENTER = [
    [640, 385],
    [960, 268],
    [640, 162],
    [320, 268],
  ];
  function fxForPlay(e, pos) {
    const [x, y] = PA_CENTER[pos];
    if (e.ctype === 'jokerbomb') {
      SND.play('rocket');
      const r = document.createElement('div');
      r.className = 'fx-rocket';
      r.textContent = '🚀';
      fx.appendChild(r);
      setTimeout(() => r.remove(), 800);
      setTimeout(() => {
        flash(640, 300);
        burst(640, 260, 30);
        burst(400, 200, 16, '#ff6a6a');
        burst(880, 200, 16, '#7fd8ff');
        shakeTable();
        fxText('天王炸');
      }, 600);
    } else if (e.ctype === 'sflush') {
      SND.play('sflush');
      for (let i = 0; i < 3; i++) {
        const b = document.createElement('div');
        b.className = 'fx-bolt';
        b.style.left = x - 90 + i * 60 + 'px';
        b.style.animationDelay = i * 0.08 + 's';
        fx.appendChild(b);
        setTimeout(() => b.remove(), 800);
      }
      flash(x, y);
      burst(x, y, 20, '#9fe6ff');
      fxText('同花顺', 'blue');
    } else if (e.ctype === 'bomb') {
      SND.play('bomb');
      flash(x, y);
      burst(x, y, 22);
      shakeTable();
      fxText(e.n >= 6 ? `${['', '', '', '', '', '', '六', '七', '八'][e.n]}炸` : '炸 弹');
    } else if (e.ctype === 'straight' || e.ctype === 'tube' || e.ctype === 'plate') {
      SND.play('swoosh');
      const s = document.createElement('div');
      s.className = 'fx-swoosh';
      s.style.top = y + 'px';
      fx.appendChild(s);
      setTimeout(() => s.remove(), 600);
      fxText(GD.TYPE_NAME[e.ctype], 'sm', 1300);
    } else if (e.ctype === 'fullhouse') {
      fxText('三带二', 'sm', 1200);
    }
  }
  function confetti() {
    const colors = ['#ffd35a', '#ff6a6a', '#7fd8ff', '#7de57a', '#d7b0ff'];
    for (let i = 0; i < 70; i++) {
      const c = document.createElement('div');
      c.style.cssText = `position:absolute;left:${Math.random() * 1280}px;top:-20px;width:10px;height:16px;background:${colors[i % 5]};border-radius:2px;z-index:150;pointer-events:none`;
      $('#stage').appendChild(c);
      c.animate(
        [
          { transform: `translate(0,0) rotate(0)` },
          { transform: `translate(${(Math.random() - 0.5) * 300}px, 780px) rotate(${Math.random() * 1080}deg)` },
        ],
        { duration: 1800 + Math.random() * 1600, delay: Math.random() * 500, easing: 'cubic-bezier(.3,.6,.6,1)' }
      ).onfinish = () => c.remove();
    }
  }

  // ============ chat / props ============
  function onChat(m) {
    if (!S) return;
    const pos = posOf(m.seat);
    if (m.kind === 'prop') {
      const [prop, to] = m.v.split('>');
      return throwProp(pos, posOf(Number(to)), prop);
    }
    const b = document.createElement('div');
    b.className = 'bubble' + (m.kind === 'emoji' ? ' emoji' : '');
    b.textContent = m.v;
    const [x, y] = SEAT_XY[pos];
    if (pos === 1) {
      b.style.right = 1280 - x + 50 + 'px';
      b.style.top = y - 30 + 'px';
    } else if (pos === 2) {
      b.style.left = x + 70 + 'px';
      b.style.top = y - 10 + 'px';
    } else if (pos === 3) {
      b.style.left = x + 60 + 'px';
      b.style.top = y - 30 + 'px';
    } else {
      b.style.left = x + 44 + 'px';
      b.style.top = y - 90 + 'px';
    }
    fx.appendChild(b);
    setTimeout(() => b.remove(), 3200);
    if (m.kind === 'phrase' && SND.prefs.voice) SND.say(m.v, isFemale(m.seat));
    else SND.play('ding');
  }
  const HIT = { flower: '💐', egg: '🍳', bomb: '💥', beer: '🍻', kiss: '💖', tomato: '🥫' };
  function throwProp(fromPos, toPos, prop) {
    const P = ART.PROPS[prop];
    if (!P) return;
    const [x0, y0] = SEAT_XY[fromPos];
    const [x1, y1] = SEAT_XY[toPos];
    const d = document.createElement('div');
    d.className = 'fx-prop';
    d.textContent = P.e;
    d.style.left = x0 + 'px';
    d.style.top = y0 + 'px';
    fx.appendChild(d);
    d.animate(
      [
        { transform: 'translate(0,0) rotate(0) scale(.8)' },
        { transform: `translate(${(x1 - x0) / 2}px, ${(y1 - y0) / 2 - 120}px) rotate(360deg) scale(1.2)`, offset: 0.5 },
        { transform: `translate(${x1 - x0}px, ${y1 - y0}px) rotate(720deg) scale(1)` },
      ],
      { duration: 750, easing: 'ease-in-out' }
    ).onfinish = () => {
      d.remove();
      const h = document.createElement('div');
      h.className = 'fx-hit';
      h.textContent = HIT[prop];
      h.style.left = x1 + 'px';
      h.style.top = y1 + 'px';
      fx.appendChild(h);
      setTimeout(() => h.remove(), 1250);
      SND.play(prop === 'bomb' ? 'bomb' : prop === 'egg' || prop === 'tomato' ? 'splat' : 'ding');
      if (prop === 'bomb') burst(x1, y1, 14);
    };
  }

  // ============ hand input: tap / swipe / double-tap ============
  const handBox = $('#hand');
  let sweeping = null;
  function cardAt(x, y) {
    const el = document.elementFromPoint(x, y);
    const c = el && el.closest && el.closest('#hand .card');
    return c ? Number(c.dataset.id) : null;
  }
  handBox.addEventListener('pointerdown', (e) => {
    const c = e.target.closest('.card');
    if (!c || !S) return;
    e.preventDefault();
    SND.unlock();
    sweeping = { ids: [Number(c.dataset.id)], set: new Set([Number(c.dataset.id)]) };
    c.classList.add('sweep');
  });
  window.addEventListener('pointermove', (e) => {
    if (!sweeping) return;
    const id = cardAt(e.clientX, e.clientY);
    if (id !== null && !sweeping.set.has(id)) {
      sweeping.set.add(id);
      sweeping.ids.push(id);
      const el = handEls.get(id);
      if (el) el.classList.add('sweep');
    }
  });
  window.addEventListener('pointerup', () => {
    if (!sweeping) return;
    const ids = sweeping.ids;
    sweeping = null;
    $$('#hand .card.sweep').forEach((el) => el.classList.remove('sweep'));
    const returning = !!myReturnItem();
    if (returning) {
      const id = ids[ids.length - 1];
      sel.clear();
      if (validReturn(id)) sel.add(id);
      else toast('还贡的牌必须是 10 及以下（不能是红桃级牌）');
    } else if (ids.length === 1) {
      const id = ids[0];
      const now = Date.now();
      if (lastTap.id === id && now - lastTap.t < 320) {
        // double tap: select the whole column
        const col = colOf(id);
        const allSel = col.every((x) => sel.has(x));
        col.forEach((x) => (allSel ? sel.delete(x) : sel.add(x)));
        lastTap = { id: -1, t: 0 };
      } else {
        if (sel.has(id)) sel.delete(id);
        else sel.add(id);
        lastTap = { id, t: now };
      }
    } else {
      const allSel = ids.every((x) => sel.has(x));
      ids.forEach((x) => (allSel ? sel.delete(x) : sel.add(x)));
    }
    SND.play('select');
    renderHand();
    updatePlayBtn();
    $('#arrLabel').textContent = sel.size ? '理牌' : groups.length ? '恢复' : '理牌';
  });
  let lastTap = { id: -1, t: 0 };
  function colOf(id) {
    const cols = buildColumns(S.hand, S.lvl);
    const c = cols.find((col) => col.ids.includes(id));
    return c ? c.ids : [id];
  }
  // right-click = play, double click on felt = clear
  $('#scr-game').addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (myTurn()) doPlay();
  });
  $('.table-bg').addEventListener('dblclick', () => {
    sel.clear();
    renderHand();
    updatePlayBtn();
  });
  window.addEventListener('keydown', (e) => {
    if (!S || screen !== 'game' || $('#modal').classList.contains('show')) return;
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (myTurn()) doPlay();
      else if (myReturnItem()) act('returnTribute');
    } else if (e.key === 'h' || e.key === 'H') act('hint');
    else if (e.key === 'p' || e.key === 'P' || e.key === 'Backspace') act('pass');
    else if (e.key === 'Escape') {
      sel.clear();
      renderHand();
      updatePlayBtn();
    }
  });

  function doPlay() {
    if (!myTurn()) return;
    if (!sel.size) return toast('请先选择要出的牌');
    const c = GD.resolve([...sel], S.lvl, S.lastCombo);
    if (!c) return toast(GD.analyze([...sel], S.lvl).length ? '你选的牌打不过上家' : '不符合出牌规则');
    send({ type: 'play', ids: c.ids });
    sel.clear();
  }

  // ============ actions ============
  function act(a, el) {
    SND.unlock();
    switch (a) {
      case 'quick':
        send({ type: 'quick' });
        break;
      case 'create':
        send({ type: 'create' });
        break;
      case 'practice':
        send({ type: 'create', fillBots: true, public: false });
        break;
      case 'joinCode':
        openJoin();
        break;
      case 'refresh':
        send({ type: 'list' });
        break;
      case 'rules':
        openRules();
        break;
      case 'settings':
        openSettings();
        break;
      case 'profile':
        openProfile();
        break;
      case 'sound':
        SND.prefs.sfx = !SND.prefs.sfx;
        SND.prefs.voice = SND.prefs.sfx;
        SND.save();
        renderSoundIcon();
        toast(SND.prefs.sfx ? '声音已开启' : '声音已关闭');
        break;
      case 'exit':
        if (S && (S.phase === 'playing' || S.phase === 'tribute')) {
          confirmBox('游戏正在进行中，离开后将由电脑托管，确定要离开吗？', () => {
            send({ type: 'leave' });
          });
        } else send({ type: 'leave' });
        break;
      case 'invite': {
        const link = `${location.origin}${location.pathname}?room=${S.code}`;
        const done = () => toast('邀请链接已复制，发给好友即可加入');
        if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(link).then(done, () => prompt('复制邀请链接', link));
        else {
          prompt('复制邀请链接发给好友', link);
        }
        break;
      }
      case 'fillBots':
        for (let i = 0; i < 4; i++) if (!S.seats[i]) send({ type: 'addBot', seat: i });
        break;
      case 'addBot':
        send({ type: 'addBot', seat: Number(el.dataset.seat) });
        break;
      case 'kick':
        send({ type: 'kick', seat: Number(el.dataset.seat) });
        break;
      case 'sit':
        send({ type: 'sit', seat: Number(el.dataset.seat) });
        break;
      case 'ready':
        if (S.me === S.host) {
          if (el.classList.contains('disabled')) return toast(S.seats.filter(Boolean).length < 4 ? '需要四名玩家才能开始' : '还有玩家未准备');
          send({ type: 'start' });
        } else send({ type: 'ready', on: !(S.seats[S.me] && S.seats[S.me].ready) });
        break;
      case 'resReady':
        if (el.classList.contains('disabled')) return;
        send({ type: 'ready', on: true });
        if (S.phase === 'gameEnd') closeModal();
        break;
      case 'pass':
        if (!myTurn() || leading()) return;
        send({ type: 'pass' });
        sel.clear();
        renderHand();
        break;
      case 'play':
        doPlay();
        break;
      case 'hint': {
        if (!myTurn()) return;
        const hs = ensureHints();
        if (!hs.length) {
          toast('没有牌能大过上家');
          return;
        }
        const h = hs[hintIdx % hs.length];
        hintIdx++;
        sel.clear();
        h.ids.forEach((id) => sel.add(id));
        renderHand();
        updatePlayBtn();
        break;
      }
      case 'returnTribute': {
        const it = myReturnItem();
        if (!it) return;
        if (sel.size !== 1) return toast('请选择一张牌还贡');
        send({ type: 'return', card: [...sel][0] });
        sel.clear();
        break;
      }
      case 'sflush': {
        if (!S || !S.hand.length) return;
        const sfs = GD.enumerate(S.hand, S.lvl)
          .filter((c) => c.type === 'sflush')
          .sort((a, b) => a.ids.filter((id) => GD.isWild(GD.card(id), S.lvl)).length - b.ids.filter((id) => GD.isWild(GD.card(id), S.lvl)).length || a.key - b.key);
        if (!sfs.length) return toast('手中没有同花顺');
        const c = sfs[sfIdx++ % sfs.length];
        sel.clear();
        c.ids.forEach((id) => sel.add(id));
        renderHand();
        updatePlayBtn();
        break;
      }
      case 'arrange':
        if (sel.size) {
          const ids = [...sel];
          groups = groups.map((g) => g.filter((id) => !sel.has(id))).filter((g) => g.length);
          groups.push(GD.sortHand(ids, S.lvl, 'rank'));
          sel.clear();
          toast('已将选中的牌理成一组');
        } else if (groups.length) {
          groups = [];
          toast('已恢复默认排列');
        } else toast('先选择几张牌，再点理牌可将它们放在一起');
        renderHand();
        updatePlayBtn();
        $('#arrLabel').textContent = groups.length ? '恢复' : '理牌';
        break;
      case 'sortMode':
        sortMode = sortMode === 'rank' ? 'count' : 'rank';
        store.set('sortMode', sortMode);
        toast(sortMode === 'rank' ? '按大小排序' : '按张数排序（炸弹优先）');
        renderHand();
        break;
      case 'chat':
        openChat();
        break;
      case 'hosted':
        send({ type: 'hosted', on: !(S.seats[S.me] && S.seats[S.me].hosted) });
        break;
      case 'unhost':
        send({ type: 'hosted', on: false });
        break;
      case 'avatar': {
        const seat = Number(el.dataset.seat);
        if (seat === S.me) return;
        openProps(seat);
        break;
      }
      case 'close':
        closeModal();
        break;
    }
  }
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    SND.play('click');
    act(el.dataset.act, el);
  });
  $('#homeProfile').addEventListener('click', () => act('profile'));

  // ============ modals ============
  let modalCb = null;
  function openModal(html, opts = {}) {
    const run = () => {
      $('#modalBox').innerHTML = (opts.title ? `<div class="m-title">${opts.title}</div>` : '') + (opts.noClose ? '' : '<button class="m-close" data-act="close">×</button>') + html;
      $('#modal').classList.add('show');
      if (opts.onOpen) opts.onOpen($('#modalBox'));
    };
    clearTimeout(openModal.t);
    if (opts.delay) openModal.t = setTimeout(run, opts.delay);
    else run();
  }
  function closeModal() {
    clearTimeout(openModal.t);
    $('#modal').classList.remove('show');
    $('#modalBox').innerHTML = '';
    if (modalCb) modalCb();
    modalCb = null;
    if (S) renderControls();
  }
  function confirmBox(text, ok) {
    openModal(`<div class="m-body" style="text-align:center;min-width:420px;padding:10px 20px">${esc(text)}</div><div class="m-foot"><button class="btn btn-gray small" data-act="close">取消</button><button class="btn btn-orange small" id="cfOk">确定</button></div>`, {
      title: '提示',
      onOpen: (b) => {
        $('#cfOk', b).onclick = () => {
          closeModal();
          ok();
        };
      },
    });
  }
  function openJoin() {
    openModal(
      `<div class="m-body" style="width:420px"><input class="code-input" id="joinInput" type="text" inputmode="numeric" maxlength="6" placeholder="······" autocomplete="off"></div>
      <div class="m-foot"><button class="btn btn-orange" id="joinGo">加入房间</button></div>`,
      {
        title: '加入房间',
        onOpen: (b) => {
          const inp = $('#joinInput', b);
          setTimeout(() => inp.focus(), 50);
          const go = () => {
            const code = inp.value.replace(/\D/g, '');
            if (code.length !== 6) return toast('请输入六位房间号');
            closeModal();
            send({ type: 'join', code });
          };
          $('#joinGo', b).onclick = go;
          inp.onkeydown = (e) => e.key === 'Enter' && go();
        },
      }
    );
  }
  function openProfile() {
    let av = me.avatar;
    openModal(
      `<div class="m-body" style="width:520px">
        <div class="field"><label>昵称</label><input type="text" id="pfName" maxlength="10" value="${esc(me.name)}"></div>
        <div class="field" style="align-items:flex-start"><label>头像</label><div class="av-grid" id="pfAv">${Array.from({ length: 12 }, (_, i) => `<div class="avatar ${i === av ? 'on' : ''}" data-i="${i}">${ART.avatarSVG(i)}</div>`).join('')}</div></div>
      </div><div class="m-foot"><button class="btn btn-orange" id="pfSave">保 存</button></div>`,
      {
        title: '个人资料',
        onOpen: (b) => {
          $('#pfAv', b).onclick = (e) => {
            const a = e.target.closest('.avatar');
            if (!a) return;
            av = Number(a.dataset.i);
            $$('#pfAv .avatar', b).forEach((x) => x.classList.toggle('on', x === a));
          };
          $('#pfSave', b).onclick = () => {
            const n = $('#pfName', b).value.trim().slice(0, 10);
            if (!n) return toast('昵称不能为空');
            me.name = n;
            me.avatar = av;
            store.set('name', n);
            store.set('avatar', av);
            send({ type: 'profile', name: n, avatar: av });
            renderProfile();
            closeModal();
            toast('资料已保存');
          };
        },
      }
    );
  }
  function renderSoundIcon() {
    const b = $('#btnSound .ico');
    b.innerHTML = SND.prefs.sfx ? ART.ICONS.sound : ART.ICONS.mute;
  }
  function openSettings() {
    const row = (k, label) => `<div class="toggle-row"><span>${label}</span><button class="switch ${SND.prefs[k] ? 'on' : ''}" data-k="${k}"></button></div>`;
    openModal(
      `<div class="m-body" style="width:460px">${row('sfx', '游戏音效')}${row('voice', '语音播报（出牌报牌）')}
        <div class="toggle-row"><span>记牌器</span><button class="switch ${store.get('counter', true) ? 'on' : ''}" data-k="counter"></button></div>
        <div class="toggle-row"><span>个人资料</span><button class="mini-btn" style="background:#e56a1a;color:#fff" id="stProf">修改昵称 / 头像</button></div>
        <div class="toggle-row" style="border:0;font-size:15px;color:#8a4a10">快捷键：回车/空格 出牌 · P 不出 · H 提示 · Esc 取消选择 · 右键 出牌 · 双击 选中整列</div>
      </div>`,
      {
        title: '设 置',
        onOpen: (b) => {
          $$('.switch', b).forEach(
            (s) =>
              (s.onclick = () => {
                const k = s.dataset.k;
                if (k === 'counter') {
                  store.set('counter', !store.get('counter', true));
                  s.classList.toggle('on', store.get('counter', true));
                  if (S) renderCounter();
                  return;
                }
                SND.prefs[k] = !SND.prefs[k];
                s.classList.toggle('on', SND.prefs[k]);
                SND.save();
                renderSoundIcon();
              })
          );
          $('#stProf', b).onclick = () => {
            closeModal();
            openProfile();
          };
        },
      }
    );
  }
  function openChat() {
    openModal(
      `<div class="m-body" style="width:640px">
        <div class="chat-tabs"><button class="on" data-tab="ph">常用语</button><button data-tab="em">表情</button></div>
        <div id="chPh" class="phrases">${PHRASES.map((p) => `<button data-p="${esc(p)}">${esc(p)}</button>`).join('')}</div>
        <div id="chEm" class="emojis" style="display:none">${EMOJI.map((e) => `<button data-e="${e}">${e}</button>`).join('')}</div>
        <div class="chat-send"><input id="chIn" type="text" maxlength="30" placeholder="说点什么…"><button class="btn btn-orange small" id="chGo">发送</button></div>
      </div>`,
      {
        title: '聊 天',
        onOpen: (b) => {
          $$('.chat-tabs button', b).forEach(
            (t) =>
              (t.onclick = () => {
                $$('.chat-tabs button', b).forEach((x) => x.classList.toggle('on', x === t));
                $('#chPh', b).style.display = t.dataset.tab === 'ph' ? '' : 'none';
                $('#chEm', b).style.display = t.dataset.tab === 'em' ? '' : 'none';
              })
          );
          $('#chPh', b).onclick = (e) => {
            const p = e.target.closest('[data-p]');
            if (!p) return;
            send({ type: 'chat', kind: 'phrase', v: p.dataset.p });
            closeModal();
          };
          $('#chEm', b).onclick = (e) => {
            const p = e.target.closest('[data-e]');
            if (!p) return;
            send({ type: 'chat', kind: 'emoji', v: p.dataset.e });
            closeModal();
          };
          const go = () => {
            const v = $('#chIn', b).value.trim();
            if (!v) return;
            send({ type: 'chat', kind: 'text', v });
            closeModal();
          };
          $('#chGo', b).onclick = go;
          $('#chIn', b).onkeydown = (e) => e.key === 'Enter' && go();
        },
      }
    );
  }
  function openProps(seat) {
    const s = S.seats[seat];
    if (!s) return;
    openModal(
      `<div class="m-body" style="width:440px">
        <div class="prof-top"><div class="avatar">${ART.avatarSVG(s.avatar)}</div><div><div class="pn">${esc(s.name)}</div><div>${seat % 2 === S.me % 2 ? '我的搭档' : '对手'} · ${s.bot ? '电脑玩家' : '在线玩家'}</div></div></div>
        <div class="prop-grid">${Object.entries(ART.PROPS)
          .map(([k, p]) => `<button data-prop="${k}"><span>${p.e}</span>${p.name}</button>`)
          .join('')}</div>
      </div>`,
      {
        title: '互动道具',
        onOpen: (b) => {
          $('.prop-grid', b).onclick = (e) => {
            const p = e.target.closest('[data-prop]');
            if (!p) return;
            send({ type: 'chat', kind: 'prop', v: `${p.dataset.prop}>${seat}` });
            closeModal();
          };
        },
      }
    );
  }
  function openRules() {
    openModal(
      `<div class="m-body m-scroll" style="width:720px">
        <h3>基本规则</h3>
        <p>四人两副牌（108张），对家为队友。每人27张，按逆时针方向出牌。一方率先从 2 打到 A 并在打 A 时获胜（且队友不是末游）即赢得整场比赛。</p>
        <h3>级牌与逢人配</h3>
        <ul><li>当前打几，几就是级牌，级牌大小仅次于大小王（大于 A）。</li><li><b>红桃级牌</b>为“逢人配”（百搭），可以替代除大小王以外的任意牌组成牌型；单出时按级牌大小计算。</li></ul>
        <h3>牌型</h3>
        <ul>
          <li>单张、对子、三条</li>
          <li>三带二：三张相同 + 一对（如 55599）</li>
          <li>顺子：5张连续单牌（A 可做 1 或 14，不可循环，最长 5 张，如 A2345、10JQKA）</li>
          <li>三连对：3个连续的对子（如 334455，AA2233）</li>
          <li>钢板：2个连续的三条（如 333444，AAA222）</li>
          <li>炸弹：4张及以上相同点数；同花顺：5张同花色的顺子；天王炸：四张王</li>
        </ul>
        <h3>大小比较</h3>
        <p>非炸弹牌型须牌型、张数相同才能压制。炸弹可压任何非炸弹牌型，炸弹之间：<b>天王炸 &gt; 8张炸 &gt; 7张炸 &gt; 6张炸 &gt; 同花顺 &gt; 5张炸 &gt; 4张炸</b>；张数相同比点数。</p>
        <h3>接风</h3>
        <p>某玩家出完最后一手牌后，若其他人都不要，由其队友接风获得出牌权。</p>
        <h3>升级</h3>
        <ul><li>双上（头游和二游同队）：升 3 级</li><li>头游 + 三游：升 2 级</li><li>头游 + 末游：升 1 级</li><li>打 A 时需头游且队友非末游才算过 A；打 A 连续三次未过，退回打 2。</li></ul>
        <h3>进贡与还贡</h3>
        <ul><li>上局末游向头游进贡手中最大的牌（红桃级牌除外）；双下时两名输家各进贡一张，大的给头游。</li><li>收到贡牌的玩家需还一张 10 及以下的牌。</li><li>进贡方若共持有两张大王，可“抗贡”，由上局头游先出。</li><li>进贡后由进贡者（双下时进贡较大者）先出牌。</li></ul>
        <h3>操作</h3>
        <ul><li>点击选牌，在手牌上滑动可连续选牌，双击选中整列。</li><li>“提示”循环给出可出的牌；“同花顺”帮你快速找出同花顺；“理牌”可把选中的牌放成一组。</li><li>超时未出牌将自动托管，点击“取消托管”即可恢复。</li><li>点击其他玩家头像可以送出互动道具。</li></ul>
      </div>`,
      { title: '游戏规则' }
    );
  }

  // ============ init ============
  $$('.ico').forEach((i) => {
    const k = [...i.classList].find((c) => c.startsWith('ico-'));
    if (k && ART.ICONS[k.slice(4)]) i.innerHTML = ART.ICONS[k.slice(4)];
  });
  renderSoundIcon();
  document.addEventListener('pointerdown', () => SND.unlock(), { once: true });
  connect();

  // debug hook for automated tests
  window.__gd = { get S() { return S; }, sel, send, act };
})();
