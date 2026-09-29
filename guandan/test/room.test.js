const test = require('node:test');
const assert = require('node:assert/strict');
const GD = require('../shared/engine');
const { Room } = require('../server/room');

const FAST = { turnTime: 50, botDelay: [0, 1], tributeDelay: 1, tributeShow: 1, returnTime: 20, nextTime: 1, graceLobby: 10, idleClose: 10000 };

function fakePlayer(name) {
  return { name, avatar: 0, ws: { readyState: 1 }, msgs: [], send(m) { this.msgs.push(m); } };
}

function checkCards(room) {
  if (room.phase === 'lobby') return;
  const all = [].concat(...room.hands);
  for (const p of room.trick.plays) if (p && p.ids) all.push(...p.ids);
  assert.equal(new Set(all).size, all.length, 'no card is duplicated');
}

test('four bots play complete games to the end', async () => {
  for (let g = 0; g < 3; g++) {
    const host = fakePlayer('host');
    const room = new Room('T' + g, FAST);
    room.join(host, 0);
    for (let i = 1; i < 4; i++) room.addBot(0, i);
    room.setHosted(0, true);
    assert.equal(room.startGame(0), null);
    room.seats[0].hosted = true;
    room.armTurn();
    let rounds = 0;
    const seen = new Set();
    const deadline = Date.now() + 60000;
    while (room.phase !== 'gameEnd' && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 5));
      checkCards(room);
      if (room.phase === 'playing' || room.phase === 'tribute') seen.add(room.phase);
      if (room.result && room.result.round !== rounds) {
        rounds = room.result.round;
        const r = room.result;
        assert.equal(new Set(r.ranks).size, 4);
        assert.ok(r.up >= 1 && r.up <= 3);
      }
      if (room.phase === 'playing') room.seats[0].hosted = true;
    }
    assert.equal(room.phase, 'gameEnd', 'game finishes');
    assert.ok(room.result.gameWon === 0 || room.result.gameWon === 1);
    assert.equal(room.levels[room.result.gameWon], 14);
    assert.ok(seen.has('tribute'));
    room.destroy();
  }
});

test('level progression: double win +3, 1-3 +2, 1-4 +1', () => {
  const room = new Room('L', FAST);
  const host = fakePlayer('h');
  room.join(host, 0);
  for (let i = 1; i < 4; i++) room.addBot(0, i);
  const fin = (order) => {
    room.phase = 'playing';
    room.finished = order.slice(0, order.length);
    room.hands = [0, 1, 2, 3].map((s) => (order.includes(s) ? [] : [1, 2]));
    room.endRound();
    clearTimeout(room.timer);
  };
  room.levels = [2, 2];
  room.trump = 0;
  fin([0, 2]);
  assert.deepEqual(room.levels, [5, 2]);
  fin([1, 0, 3]);
  assert.deepEqual(room.levels, [5, 4]);
  fin([3, 0, 2]);
  assert.deepEqual(room.levels, [5, 5]);
  assert.equal(room.trump, 1);
  // team 0 at A, must win as trump without partner last
  room.levels = [14, 5];
  room.trump = 0;
  fin([0, 1, 3]); // partner (2) last -> not a win
  assert.equal(room.result.gameWon, null);
  assert.equal(room.aFail[0], 1);
  fin([2, 1, 0]);
  assert.equal(room.result.gameWon, 0);
  room.destroy();
});

test('A fails three times resets to 2', () => {
  const room = new Room('A', FAST);
  const host = fakePlayer('h');
  room.join(host, 0);
  for (let i = 1; i < 4; i++) room.addBot(0, i);
  const fin = (order) => {
    room.phase = 'playing';
    room.finished = order;
    room.hands = [0, 1, 2, 3].map((s) => (order.includes(s) ? [] : [1]));
    room.endRound();
    clearTimeout(room.timer);
  };
  room.levels = [14, 3];
  for (let k = 0; k < 3; k++) {
    room.trump = 0;
    fin([0, 1, 3]);
  }
  assert.equal(room.levels[0], 2);
  room.destroy();
});

test('illegal plays are rejected by the server', () => {
  const room = new Room('X', { ...FAST, turnTime: 100000, botDelay: [100000, 100001] });
  const ps = [0, 1, 2, 3].map((i) => fakePlayer('p' + i));
  ps.forEach((p, i) => room.join(p, i));
  ps.forEach((p, i) => room.setReady(i, true));
  assert.equal(room.startGame(0), null);
  const t = room.turnSeat;
  const other = (t + 1) % 4;
  assert.ok(room.play(other, [room.hands[other][0]]));
  assert.ok(room.play(t, [room.hands[other][0]]));
  assert.ok(room.pass(t), 'leader cannot pass');
  const single = room.hands[t][room.hands[t].length - 1];
  assert.equal(room.play(t, [single]), null);
  assert.equal(room.hands[t].length, 26);
  const nxt = room.turnSeat;
  const smaller = room.hands[nxt].find((id) => GD.cardPower(id, room.lvl) <= GD.cardPower(single, room.lvl));
  if (smaller !== undefined) assert.ok(room.play(nxt, [smaller]));
  assert.equal(room.pass(nxt), null);
  room.destroy();
});

test('jiefeng: partner leads after a player goes out and everyone passes', () => {
  const room = new Room('J', { ...FAST, turnTime: 100000, botDelay: [100000, 100001] });
  const ps = [0, 1, 2, 3].map((i) => fakePlayer('p' + i));
  ps.forEach((p, i) => room.join(p, i));
  room.startGame(0);
  room.phase = 'playing';
  room.hands = [[53], [0, 1], [2, 3], [4, 5]];
  room.finished = [];
  room.trick = room.newTrick();
  room.setTurn(0);
  assert.equal(room.play(0, [53]), null);
  assert.deepEqual(room.finished, [0]);
  assert.equal(room.turnSeat, 1);
  room.pass(1);
  room.pass(2);
  room.pass(3);
  assert.equal(room.turnSeat, 2);
  assert.ok(room.trick.jiefeng);
  room.destroy();
});
