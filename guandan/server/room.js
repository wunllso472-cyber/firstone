/*
 * A Room owns 4 seats and the whole Guandan game state machine. It is authoritative: clients only send intents.
 * Seats are numbered counter-clockwise; seat s and s+2 are partners (team = seat % 2).
 */
const GD = require('../shared/engine');
const bot = require('./bot');

const team = (s) => s % 2;
const partner = (s) => (s + 2) % 4;

const DEFAULTS = {
  turnTime: 30000, // ms to act before being put on 托管
  botDelay: [800, 1700],
  tributeDelay: 1200, // bots' pause before returning tribute
  tributeShow: 2600, // how long the tribute summary stays before play begins
  returnTime: 20000,
  nextTime: 20000, // auto-continue after the round result
  graceLobby: 15000, // keep a disconnected player's lobby seat this long
  idleClose: 5 * 60 * 1000, // destroy a room with no connected humans after this
};

class Room {
  constructor(code, opts = {}, hooks = {}) {
    this.code = code;
    this.opts = Object.assign({}, DEFAULTS, opts);
    this.hooks = hooks; // { onEmpty(room) }
    this.seats = [null, null, null, null];
    this.host = -1;
    this.isPublic = true;
    this.phase = 'lobby';
    this.levels = [2, 2];
    this.aFail = [0, 0];
    this.trump = 0;
    this.round = 0;
    this.lvl = 2;
    this.hands = [[], [], [], []];
    this.finished = [];
    this.trick = this.newTrick();
    this.turnSeat = -1;
    this.deadline = 0;
    this.timer = null;
    this.tribute = null;
    this.result = null;
    this.lastRanks = null;
    this.startSeat = -1;
    this.lastChat = [0, 0, 0, 0];
    this.idleTimer = null;
    this.destroyed = false;
    this.notice = '';
    this.gameNo = 0;
    this.played = [];
  }

  // ---------- seating / lobby ----------
  humans() {
    return this.seats.filter((s) => s && s.player);
  }
  connectedHumans() {
    return this.seats.filter((s) => s && s.player && s.player.ws && s.player.ws.readyState === 1);
  }
  seatOf(player) {
    return this.seats.findIndex((s) => s && s.player === player);
  }

  join(player, wantSeat) {
    if (this.seatOf(player) >= 0) return this.seatOf(player);
    if (this.phase !== 'lobby' && this.phase !== 'gameEnd') return -1;
    let i = wantSeat >= 0 && wantSeat < 4 && !this.seats[wantSeat] ? wantSeat : this.seats.findIndex((s) => !s);
    if (i < 0) return -1;
    this.seats[i] = { player, name: player.name, avatar: player.avatar, bot: false, hosted: false, ready: false };
    if (this.host < 0) this.host = i;
    player.room = this.code;
    player.seat = i;
    this.cancelIdle();
    this.broadcast();
    return i;
  }

  leave(player) {
    const i = this.seatOf(player);
    if (i < 0) return;
    player.room = null;
    player.seat = -1;
    if (this.phase === 'lobby' || this.phase === 'gameEnd') {
      this.seats[i] = null;
    } else {
      // mid-game: the seat is taken over by a bot so the other three can carry on
      this.seats[i] = { player: null, name: player.name + '(托管)', avatar: player.avatar, bot: true, hosted: true, ready: true };
    }
    if (this.host === i) this.host = this.seats.findIndex((s) => s && s.player);
    if (!this.humans().length) return this.destroy();
    this.afterSeatChange();
    this.broadcast();
  }

  attach(player) {
    // reconnect: the player re-claims their seat
    const i = this.seatOf(player);
    if (i < 0) return;
    const s = this.seats[i];
    s.hosted = false;
    clearTimeout(s.graceTimer);
    this.cancelIdle();
    this.broadcast();
    if (this.turnSeat === i && this.phase === 'playing') this.armTurn();
  }

  detach(player) {
    const i = this.seatOf(player);
    if (i < 0) return;
    const s = this.seats[i];
    if (this.phase === 'lobby' || this.phase === 'gameEnd') {
      clearTimeout(s.graceTimer);
      s.graceTimer = setTimeout(() => this.leave(player), this.opts.graceLobby);
    } else {
      s.hosted = true;
      if (this.turnSeat === i) this.armTurn();
    }
    if (!this.connectedHumans().length) this.scheduleIdle();
    this.broadcast();
  }

  scheduleIdle() {
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.destroy(), this.opts.idleClose);
  }
  cancelIdle() {
    clearTimeout(this.idleTimer);
  }

  addBot(bySeat, seat) {
    if (this.phase !== 'lobby' && this.phase !== 'gameEnd') return 'game already started';
    if (bySeat !== this.host) return 'only the host can do that';
    if (seat < 0 || seat > 3 || this.seats[seat]) return 'seat taken';
    const names = ['小明机器人', '阿福机器人', '小美机器人', '大壮机器人', '老王机器人', '花花机器人'];
    this.seats[seat] = { player: null, name: names[(seat + this.gameNo + this.round) % names.length], avatar: 6 + ((seat + 3) % 6), bot: true, hosted: false, ready: true };
    this.broadcast();
    return null;
  }

  removeSeat(bySeat, seat) {
    if (this.phase !== 'lobby' && this.phase !== 'gameEnd') return 'game already started';
    if (bySeat !== this.host) return 'only the host can do that';
    const s = this.seats[seat];
    if (!s || seat === bySeat) return 'invalid seat';
    if (s.player) {
      s.player.send({ type: 'kicked', msg: '你被房主请出了房间' });
      s.player.room = null;
      s.player.seat = -1;
    }
    this.seats[seat] = null;
    this.broadcast();
    return null;
  }

  moveSeat(player, seat) {
    if (this.phase !== 'lobby' && this.phase !== 'gameEnd') return;
    const i = this.seatOf(player);
    if (i < 0 || seat < 0 || seat > 3 || this.seats[seat]) return;
    this.seats[seat] = this.seats[i];
    this.seats[i] = null;
    if (this.host === i) this.host = seat;
    player.seat = seat;
    this.broadcast();
  }

  setReady(seat, on) {
    const s = this.seats[seat];
    if (!s) return;
    if (this.phase === 'roundEnd' || this.phase === 'gameEnd' || this.phase === 'lobby') s.ready = on !== false;
    if (this.phase === 'roundEnd') {
      if (this.allReady()) this.schedule(() => this.startRound(), 500);
    } else if (this.phase === 'gameEnd') {
      if (this.allReady() && this.seats.every(Boolean)) this.schedule(() => this.startGame(), 500);
    }
    this.broadcast();
  }

  allReady() {
    return this.seats.every((s) => s && (s.bot || s.ready || s.hosted));
  }

  startGame(bySeat) {
    if (bySeat !== undefined && bySeat !== this.host) return 'only the host can start';
    if (!this.seats.every(Boolean)) return 'need four players';
    if (bySeat !== undefined && !this.seats.every((s) => s.bot || s.ready || s === this.seats[this.host])) return 'not everyone is ready';
    clearTimeout(this.timer);
    this.gameNo++;
    this.levels = [2, 2];
    this.aFail = [0, 0];
    this.trump = 0;
    this.round = 0;
    this.lastRanks = null;
    this.result = null;
    for (const s of this.seats) s.ready = false;
    this.startRound();
    return null;
  }

  // ---------- timers ----------
  schedule(fn, ms) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (!this.destroyed) fn();
    }, ms);
  }

  destroy() {
    this.destroyed = true;
    clearTimeout(this.timer);
    clearTimeout(this.idleTimer);
    for (const s of this.seats) if (s) clearTimeout(s.graceTimer);
    if (this.hooks.onEmpty) this.hooks.onEmpty(this);
  }

  afterSeatChange() {
    if (this.phase === 'roundEnd' && this.allReady()) this.schedule(() => this.startRound(), 500);
  }

  // ---------- round flow ----------
  newTrick() {
    return { plays: [null, null, null, null], last: null, passed: new Set(), over: false, jiefeng: false };
  }

  startRound() {
    this.round++;
    this.lvl = this.levels[this.trump];
    const deck = GD.shuffledDeck();
    this.hands = [0, 1, 2, 3].map((i) => GD.sortHand(deck.slice(i * 27, i * 27 + 27), this.lvl, 'rank'));
    this.finished = [];
    this.played = [];
    this.trick = this.newTrick();
    this.turnSeat = -1;
    this.result = null;
    this.tribute = null;
    this.notice = '';
    for (const s of this.seats) s.ready = false;
    this.emit({ type: 'ev', name: 'deal' });
    if (this.lastRanks && this.round > 1) return this.startTribute();
    this.startSeat = Math.floor(Math.random() * 4);
    this.notice = `第一局随机由 ${this.seats[this.startSeat].name} 先出牌`;
    this.beginPlay(this.startSeat);
  }

  startTribute() {
    const rk = this.lastRanks;
    const dbl = team(rk[0]) === team(rk[1]);
    const givers = dbl ? [rk[3], rk[2]] : [rk[3]];
    const receivers = dbl ? [rk[0], rk[1]] : [rk[0]];
    const bigJokers = givers.reduce((n, g) => n + this.hands[g].filter((id) => GD.card(id).rank === GD.RANK_BJ).length, 0);
    if (bigJokers === 2) {
      // 抗贡: nobody pays; the previous 头游 leads
      this.tribute = { resist: true, givers, items: [], stage: 'show' };
      this.phase = 'tribute';
      this.turnSeat = -1;
      this.notice = '抗贡！双方无需进贡';
      this.emit({ type: 'ev', name: 'tribute', resist: true, givers });
      this.broadcast();
      return this.schedule(() => this.beginPlay(rk[0]), this.opts.tributeShow);
    }
    const pick = (g) => {
      const cand = this.hands[g].filter((id) => !GD.isWild(GD.card(id), this.lvl));
      cand.sort((a, b) => GD.cardPower(b, this.lvl) - GD.cardPower(a, this.lvl) || a - b);
      return cand[0];
    };
    const items = givers.map((g) => ({ from: g, card: pick(g), to: -1, back: null }));
    if (dbl) {
      // the bigger tribute goes to 头游
      const big = GD.cardPower(items[1].card, this.lvl) > GD.cardPower(items[0].card, this.lvl) ? 1 : 0;
      items[big].to = receivers[0];
      items[1 - big].to = receivers[1];
      this.startSeat = items[big].from;
    } else {
      items[0].to = receivers[0];
      this.startSeat = items[0].from;
    }
    for (const it of items) {
      this.hands[it.from] = this.hands[it.from].filter((id) => id !== it.card);
      this.hands[it.to].push(it.card);
      this.hands[it.to] = GD.sortHand(this.hands[it.to], this.lvl, 'rank');
    }
    this.tribute = { resist: false, givers, items, stage: 'return' };
    this.phase = 'tribute';
    this.notice = '进贡完成，请头游/二游还贡';
    this.emit({ type: 'ev', name: 'tribute', items: items.map((i) => ({ from: i.from, to: i.to, card: i.card })) });
    this.deadline = Date.now() + this.opts.returnTime;
    this.broadcast();
    this.schedule(() => this.autoReturn(), this.opts.returnTime);
    for (const it of items) {
      const s = this.seats[it.to];
      if (s.bot || s.hosted) setTimeout(() => !this.destroyed && this.doReturn(it.to, bot.chooseReturn(this.hands[it.to], this.lvl)), this.opts.tributeDelay);
    }
  }

  autoReturn() {
    if (this.phase !== 'tribute' || !this.tribute) return;
    for (const it of this.tribute.items) {
      if (it.back === null) this.doReturn(it.to, bot.chooseReturn(this.hands[it.to], this.lvl));
    }
  }

  returnTribute(seat, cardId) {
    if (this.phase !== 'tribute' || !this.tribute || this.tribute.stage !== 'return') return '现在不能还贡';
    const it = this.tribute.items.find((x) => x.to === seat && x.back === null);
    if (!it) return '你不需要还贡';
    if (!this.hands[seat].includes(cardId)) return '没有这张牌';
    const c = GD.card(cardId);
    const hasLow = this.hands[seat].some((id) => !GD.isWild(GD.card(id), this.lvl) && GD.cardPower(id, this.lvl) <= 10);
    if (GD.isWild(c, this.lvl) || (GD.cardPower(cardId, this.lvl) > 10 && hasLow)) return '还贡的牌必须是不大于10的牌';
    this.doReturn(seat, cardId);
    return null;
  }

  doReturn(seat, cardId) {
    if (this.phase !== 'tribute' || !this.tribute) return;
    const it = this.tribute.items.find((x) => x.to === seat && x.back === null);
    if (!it || !this.hands[seat].includes(cardId)) return;
    it.back = cardId;
    this.hands[seat] = this.hands[seat].filter((id) => id !== cardId);
    this.hands[it.from].push(cardId);
    this.hands[it.from] = GD.sortHand(this.hands[it.from], this.lvl, 'rank');
    this.emit({ type: 'ev', name: 'return', from: seat, to: it.from, card: cardId });
    if (this.tribute.items.every((x) => x.back !== null)) {
      this.tribute.stage = 'show';
      this.notice = '还贡完成';
      this.schedule(() => this.beginPlay(this.startSeat), this.opts.tributeShow);
    }
    this.broadcast();
  }

  beginPlay(leader) {
    this.phase = 'playing';
    this.trick = this.newTrick();
    this.setTurn(leader);
  }

  setTurn(seat) {
    this.turnSeat = seat;
    this.armTurn();
    this.broadcast();
  }

  armTurn() {
    if (this.phase !== 'playing' || this.turnSeat < 0) return;
    const seat = this.turnSeat;
    const s = this.seats[seat];
    if (s.bot || s.hosted) {
      this.deadline = 0;
      const [a, b] = this.opts.botDelay;
      this.schedule(() => this.botAct(seat), a + Math.random() * (b - a));
    } else {
      this.deadline = Date.now() + this.opts.turnTime;
      this.schedule(() => {
        // out of time: the server takes over for this player (托管)
        s.hosted = true;
        this.emit({ type: 'ev', name: 'timeout', seat });
        this.botAct(seat);
      }, this.opts.turnTime);
    }
  }

  setHosted(seat, on) {
    const s = this.seats[seat];
    if (!s || s.bot) return;
    s.hosted = !!on;
    this.broadcast();
    if (this.phase === 'playing' && this.turnSeat === seat) this.armTurn();
    if (this.phase === 'tribute' && on && this.tribute) {
      for (const it of this.tribute.items) if (it.to === seat && it.back === null) this.doReturn(seat, bot.chooseReturn(this.hands[seat], this.lvl));
    }
  }

  botAct(seat) {
    if (this.phase !== 'playing' || this.turnSeat !== seat) return;
    const last = this.trick.over ? null : this.trick.last;
    const d = bot.decide({
      hand: this.hands[seat],
      lvl: this.lvl,
      seat,
      last: last ? { seat: last.seat, combo: last.combo } : null,
      counts: this.hands.map((h) => h.length),
    });
    let err = null;
    if (d.play) err = this.play(seat, d.play);
    else err = this.pass(seat);
    if (err) {
      // should not happen; fall back to something legal so the game never stalls
      const legal = GD.hints(this.hands[seat], this.lvl, last ? last.combo : null);
      if (legal.length) this.play(seat, legal[0].ids);
      else this.pass(seat);
    }
  }

  nextActive(s) {
    for (let i = 1; i <= 3; i++) {
      const t = (s + i) % 4;
      if (this.hands[t].length > 0) return t;
    }
    return -1;
  }

  play(seat, ids) {
    if (this.phase !== 'playing') return '现在不能出牌';
    if (this.turnSeat !== seat) return '还没轮到你';
    if (!Array.isArray(ids) || !ids.length || ids.length > 8) return '牌型不符';
    const hand = this.hands[seat];
    if (new Set(ids).size !== ids.length || !ids.every((id) => Number.isInteger(id) && hand.includes(id))) return '牌不在手中';
    const last = this.trick.over ? null : this.trick.last;
    const combo = GD.resolve(ids, this.lvl, last ? last.combo : null);
    if (!combo) return GD.analyze(ids, this.lvl).length ? '打不过上家' : '牌型不符';
    if (this.trick.over) this.trick = this.newTrick();
    const played = new Set(combo.ids);
    this.hands[seat] = hand.filter((id) => !played.has(id));
    this.played.push(...combo.ids);
    this.trick.plays[seat] = { ids: combo.ids, type: combo.type, tier: combo.tier, n: combo.n, key: combo.key };
    this.trick.last = { seat, combo };
    this.trick.passed = new Set();
    this.trick.jiefeng = false;
    this.emit({ type: 'ev', name: 'play', seat, ctype: combo.type, tier: combo.tier, n: combo.n, ids: combo.ids });
    if (this.hands[seat].length === 0) {
      this.finished.push(seat);
      this.emit({ type: 'ev', name: 'out', seat, place: this.finished.length });
    }
    if (this.roundOver()) return this.endRound(), null;
    this.setTurn(this.nextActive(seat));
    return null;
  }

  pass(seat) {
    if (this.phase !== 'playing') return '现在不能操作';
    if (this.turnSeat !== seat) return '还没轮到你';
    if (this.trick.over || !this.trick.last) return '首家不能不出';
    this.trick.plays[seat] = { pass: true };
    this.trick.passed.add(seat);
    this.emit({ type: 'ev', name: 'pass', seat });
    const next = this.nextActive(seat);
    const lastSeat = this.trick.last.seat;
    if (next === lastSeat || this.trick.passed.has(next)) return this.endTrick(), null;
    this.setTurn(next);
    return null;
  }

  endTrick() {
    const winner = this.trick.last.seat;
    let leader = winner;
    if (this.hands[winner].length === 0) {
      // 接风: the finished player's partner takes the lead (else the next player in turn)
      leader = this.hands[partner(winner)].length ? partner(winner) : this.nextActive(winner);
      this.trick.jiefeng = true;
    }
    this.trick.over = true;
    this.setTurn(leader);
  }

  roundOver() {
    const f = this.finished;
    return f.length >= 3 || (f.length === 2 && team(f[0]) === team(f[1]));
  }

  endRound() {
    clearTimeout(this.timer);
    const f = this.finished.slice();
    const rest = [0, 1, 2, 3].filter((s) => !f.includes(s));
    if (rest.length === 2) {
      // fewer cards left = better place; tie broken by seat order after the last player out
      const lastOut = f[f.length - 1];
      rest.sort((a, b) => this.hands[a].length - this.hands[b].length || ((a - lastOut + 4) % 4) - ((b - lastOut + 4) % 4));
    }
    const ranks = f.concat(rest);
    const winnerTeam = team(ranks[0]);
    const partnerPos = ranks.indexOf(partner(ranks[0]));
    const up = partnerPos === 1 ? 3 : partnerPos === 2 ? 2 : 1;
    const before = this.levels.slice();
    const played = this.trump; // team that was "playing" this round's level
    let gameWon = null;
    let resetA = null;
    if (this.levels[played] === 14) {
      if (winnerTeam === played && partnerPos !== 3) gameWon = played;
      else {
        this.aFail[played]++;
        if (this.aFail[played] >= 3) {
          this.levels[played] = 2;
          this.aFail[played] = 0;
          resetA = played;
        }
      }
    }
    if (!gameWon && !(winnerTeam === played && this.levels[played] === 14) && winnerTeam !== resetA) {
      this.levels[winnerTeam] = Math.min(14, this.levels[winnerTeam] + up);
    }
    this.trump = winnerTeam;
    this.lastRanks = ranks;
    this.result = { ranks, winnerTeam, up, before, after: this.levels.slice(), gameWon, resetA, lvl: this.lvl, aFail: this.aFail.slice(), round: this.round };
    for (const s of this.seats) s.ready = false;
    this.turnSeat = -1;
    this.phase = gameWon !== null ? 'gameEnd' : 'roundEnd';
    this.deadline = Date.now() + this.opts.nextTime;
    this.emit({ type: 'ev', name: gameWon !== null ? 'gameEnd' : 'roundEnd', winnerTeam });
    this.broadcast();
    if (this.phase === 'roundEnd') this.schedule(() => this.startRound(), this.opts.nextTime);
    else this.deadline = 0;
  }

  // ---------- chat ----------
  chat(seat, kind, v) {
    const now = Date.now();
    if (now - this.lastChat[seat] < 600) return;
    this.lastChat[seat] = now;
    if (kind !== 'emoji' && kind !== 'text' && kind !== 'phrase' && kind !== 'prop') return;
    v = String(v || '').slice(0, 40);
    if (!v) return;
    if (kind === 'prop') {
      const [prop, to] = v.split('>');
      if (!['flower', 'egg', 'bomb', 'beer', 'kiss', 'tomato'].includes(prop) || !this.seats[Number(to)]) return;
    }
    this.emit({ type: 'chat', seat, kind, v });
  }

  // ---------- output ----------
  emit(msg) {
    for (let i = 0; i < 4; i++) this.sendSeat(i, msg);
  }

  sendSeat(i, msg) {
    const s = this.seats[i];
    if (s && s.player) s.player.send(msg);
  }

  view(me) {
    const remain = this.deadline ? Math.max(0, this.deadline - Date.now()) : null;
    const t = this.trick;
    return {
      type: 'state',
      code: this.code,
      phase: this.phase,
      me,
      host: this.host,
      round: this.round,
      lvl: this.lvl,
      trump: this.trump,
      levels: this.levels,
      aFail: this.aFail,
      notice: this.notice,
      seats: this.seats.map((s, i) =>
        s
          ? {
              name: s.name,
              avatar: s.avatar,
              bot: s.bot,
              connected: s.bot || !!(s.player && s.player.ws && s.player.ws.readyState === 1),
              hosted: s.hosted,
              ready: s.ready,
              count: this.phase === 'lobby' ? 0 : this.hands[i].length,
            }
          : null
      ),
      hand: me >= 0 ? this.hands[me] : [],
      played: this.phase === 'playing' ? this.played : [],
      // once you are out you may watch your partner's cards
      partnerHand: me >= 0 && this.phase === 'playing' && this.hands[me].length === 0 ? this.hands[partner(me)] : null,
      turn: this.turnSeat,
      remain: this.turnSeat >= 0 || this.phase === 'tribute' || this.phase === 'roundEnd' ? remain : null,
      trick: {
        plays: t.plays,
        lastSeat: t.last ? t.last.seat : -1,
        over: t.over,
        jiefeng: t.jiefeng,
      },
      canPass: this.phase === 'playing' && !t.over && !!t.last && this.turnSeat === me,
      finished: this.finished,
      tribute: this.tribute
        ? { resist: this.tribute.resist, stage: this.tribute.stage, items: this.tribute.items.map((x) => ({ from: x.from, to: x.to, card: x.card, back: x.back })) }
        : null,
      result: this.result,
      lastCombo: t.last && !t.over ? { type: t.last.combo.type, key: t.last.combo.key, tier: t.last.combo.tier, n: t.last.combo.n } : null,
    };
  }

  broadcast() {
    if (this.destroyed) return;
    for (let i = 0; i < 4; i++) {
      const s = this.seats[i];
      if (s && s.player) s.player.send(this.view(i));
    }
  }
}

module.exports = { Room, team, partner };
