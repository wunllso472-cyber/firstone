const test = require('node:test');
const assert = require('node:assert/strict');
const GD = require('../shared/engine');

// helper: build a card id from "3S" style codes. copy = which deck (0/1)
const S = { S: 0, H: 1, C: 2, D: 3 };
const R = { J: 11, Q: 12, K: 13, A: 14 };
function c(code, copy = 0) {
  if (code === 'sj') return copy * 54 + 52;
  if (code === 'bj') return copy * 54 + 53;
  const suit = code.slice(-1);
  const r = code.slice(0, -1);
  const rank = R[r] || Number(r);
  return copy * 54 + S[suit] * 13 + (rank - 2);
}
const many = (...codes) => codes.map((x) => (Array.isArray(x) ? c(x[0], x[1]) : c(x)));
const types = (ids, lvl) => GD.analyze(ids, lvl).map((x) => x.type).sort();

test('card ids decode correctly', () => {
  assert.equal(GD.card(c('2S')).rank, 2);
  assert.equal(GD.card(c('AD', 1)).rank, 14);
  assert.equal(GD.card(c('AD', 1)).suit, 'D');
  assert.equal(GD.card(c('sj', 1)).rank, GD.RANK_SJ);
  assert.equal(GD.card(c('bj')).rank, GD.RANK_BJ);
  assert.equal(new Set(GD.CARDS.map((x) => x.id)).size, 108);
});

test('level card outranks ace but not jokers', () => {
  assert.equal(GD.power(14, 5), 14);
  assert.equal(GD.power(5, 5), 15);
  assert.equal(GD.power(GD.RANK_SJ, 5), 20);
  assert.equal(GD.power(14, 14), 15);
});

test('singles, pairs, triples', () => {
  assert.deepEqual(types(many('3S'), 2), ['single']);
  assert.deepEqual(types(many('3S', '3H'), 2), ['pair']);
  assert.deepEqual(types(many('3S', '4H'), 2), []);
  assert.deepEqual(types(many('3S', '3H', ['3S', 1]), 2), ['triple']);
  assert.deepEqual(types(many('sj', ['sj', 1]), 2), ['pair']);
  assert.deepEqual(types(many('sj', 'bj'), 2), []);
});

test('wild card (heart of level rank)', () => {
  const lvl = 7;
  assert.deepEqual(types(many('7H'), lvl), ['single']);
  assert.equal(GD.analyze(many('7H'), lvl)[0].key, 15);
  // wild completes a pair / triple / bomb
  assert.deepEqual(types(many('9S', '7H'), lvl), ['pair']);
  assert.deepEqual(types(many('9S', '9C', '7H'), lvl), ['triple']);
  assert.deepEqual(types(many('9S', '9C', '9D', '7H'), lvl), ['bomb']);
  // wild cannot pair with a joker
  assert.deepEqual(types(many('sj', '7H'), lvl), []);
  // second heart-7 in the other deck is wild too; two wilds form a level pair
  const two = GD.analyze(many('7H', ['7H', 1]), lvl);
  assert.equal(two.length, 1);
  assert.equal(two[0].type, 'pair');
  assert.equal(two[0].key, 15);
  // non-heart level cards are ordinary level cards
  assert.deepEqual(types(many('7S', '7C'), lvl), ['pair']);
  assert.equal(GD.analyze(many('7S', '7C'), lvl)[0].key, 15);
});

test('straights, ace low and high, no wrap', () => {
  assert.ok(types(many('AS', '2H', '3C', '4D', '5S'), 8).includes('straight'));
  assert.ok(types(many('10S', 'JH', 'QC', 'KD', 'AS'), 8).includes('straight'));
  assert.deepEqual(types(many('QS', 'KH', 'AC', '2D', '3S'), 8), []);
  assert.deepEqual(types(many('3S', '4H', '5C', '6D', '8S'), 9), []);
  const low = GD.analyze(many('AS', '2H', '3C', '4D', '5S'), 8)[0];
  const high = GD.analyze(many('10S', 'JH', 'QC', 'KD', 'AS'), 8)[0];
  assert.ok(GD.canBeat(high, low));
  assert.ok(!GD.canBeat(low, high));
  // level card uses its natural place in a straight
  assert.ok(types(many('3S', '4H', '5C', '6D', '7S'), 5).includes('straight'));
});

test('wild fills a gap in a straight and can be read two ways', () => {
  const lvl = 9;
  const ids = many('3S', '4H', '5C', '6D', '9H'); // 9H is wild
  const a = GD.analyze(ids, lvl).filter((x) => x.type === 'straight');
  assert.deepEqual(a.map((x) => x.key).sort((x, y) => x - y), [2, 3]); // 2-6 or 3-7
  // against a 3-7 straight (key 3) the wild must be read as 7... no: key 3 = 3-7, needs key>3
  const last = GD.analyze(many('3S', '4H', '5C', '6D', '7S'), lvl).find((x) => x.type === 'straight');
  assert.equal(GD.resolve(ids, lvl, last), null);
  const last2 = GD.analyze(many('2S', '3H', '4C', '5D', '6S'), lvl).find((x) => x.type === 'straight');
  assert.equal(GD.resolve(ids, lvl, last2).key, 3);
});

test('straight flush is a bomb ranked between 5-bombs and 6-bombs', () => {
  const sf = GD.analyze(many('3H', '4H', '5H', '6H', '7H'), 9).find((x) => x.type === 'sflush');
  assert.ok(sf);
  const bomb4 = GD.analyze(many('AS', 'AH', 'AC', 'AD'), 9)[0];
  const bomb5 = GD.analyze(many('KS', 'KH', 'KC', 'KD', ['KS', 1]), 9)[0];
  const bomb6 = GD.analyze(many('3S', '3H', '3C', '3D', ['3S', 1], ['3H', 1]), 9)[0];
  assert.ok(GD.canBeat(sf, bomb4));
  assert.ok(GD.canBeat(sf, bomb5));
  assert.ok(!GD.canBeat(sf, bomb6));
  assert.ok(GD.canBeat(bomb6, sf));
  const plain = GD.analyze(many('9S', '10H', 'JC', 'QD', 'KS'), 2).find((x) => x.type === 'straight');
  assert.ok(GD.canBeat(sf, plain));
  const sfHigh = GD.analyze(many('4H', '5H', '6H', '7H', '8H'), 9).find((x) => x.type === 'sflush');
  assert.ok(GD.canBeat(sfHigh, sf));
});

test('four jokers beat everything', () => {
  const jb = GD.analyze(many('sj', ['sj', 1], 'bj', ['bj', 1]), 2)[0];
  assert.equal(jb.type, 'jokerbomb');
  const b8 = GD.analyze(many('3S', '3H', '3C', '3D', ['3S', 1], ['3H', 1], ['3C', 1], ['3D', 1]), 2)[0];
  assert.equal(b8.type, 'bomb');
  assert.equal(b8.n, 8);
  assert.ok(GD.canBeat(jb, b8));
  assert.ok(!GD.canBeat(b8, jb));
});

test('bombs beat any non-bomb; same-size bombs compare by rank (level card highest)', () => {
  const lvl = 6;
  const pair = GD.analyze(many('AS', 'AH'), lvl)[0];
  const bomb = GD.analyze(many('3S', '3H', '3C', '3D'), lvl)[0];
  assert.ok(GD.canBeat(bomb, pair));
  assert.ok(!GD.canBeat(pair, bomb));
  const bombA = GD.analyze(many('AS', 'AH', 'AC', 'AD'), lvl)[0];
  const bombLvl = GD.analyze(many('6S', '6H', '6C', '6D'), lvl); // includes the wild -> still a bomb of level rank
  assert.equal(bombLvl[0].type, 'bomb');
  assert.ok(GD.canBeat(bombLvl[0], bombA));
});

test('full house, plate, tube', () => {
  assert.deepEqual(types(many('5S', '5H', '5C', '9D', '9S'), 2), ['fullhouse']);
  assert.deepEqual(types(many('5S', '5H', '5C', 'sj', ['sj', 1]), 2), ['fullhouse']);
  assert.deepEqual(types(many('5S', '5H', '5C', 'sj', 'bj'), 2), []);
  const fh = GD.analyze(many('5S', '5H', '5C', '9D', '9S'), 2)[0];
  const fh2 = GD.analyze(many('6S', '6H', '6C', '3D', '3S'), 2)[0];
  assert.ok(GD.canBeat(fh2, fh));
  assert.deepEqual(types(many('5S', '5H', '5C', '6D', '6S', '6H'), 2), ['plate']);
  assert.deepEqual(types(many('AS', 'AH', 'AC', '2D', '2S', '2H'), 3), ['plate']);
  assert.deepEqual(types(many('KS', 'KH', 'KC', 'AD', 'AS', 'AH'), 3), ['plate']);
  assert.deepEqual(types(many('QS', 'QH', 'QC', 'AD', 'AS', 'AH'), 3), []);
  assert.deepEqual(types(many('5S', '5H', '6C', '6D', '7S', '7H'), 2), ['tube']);
  assert.deepEqual(types(many('QS', 'QH', 'KC', 'KD', 'AS', 'AH'), 2), ['tube']);
  assert.deepEqual(types(many('5S', '5H', '6C', '6D', '8S', '8H'), 2), []);
  // wild helps
  assert.ok(types(many('5S', '5H', '6C', '6D', '7S', '9H'), 9).includes('tube'));
  assert.ok(types(many('5S', '5H', '5C', '6D', '6S', '9H'), 9).includes('plate'));
});

test('type mismatch and length mismatch cannot beat', () => {
  const pair = GD.analyze(many('3S', '3H'), 2)[0];
  const single = GD.analyze(many('AS'), 2)[0];
  assert.ok(!GD.canBeat(single, pair));
  const tube = GD.analyze(many('5S', '5H', '6C', '6D', '7S', '7H'), 2)[0];
  const plate = GD.analyze(many('9S', '9H', '9C', '10D', '10S', '10H'), 2)[0];
  assert.ok(!GD.canBeat(plate, tube));
});

test('resolve rejects duplicates and unknown shapes', () => {
  assert.equal(GD.resolve([1, 1], 2, null), null);
  assert.equal(GD.resolve(many('3S', '5H', '9C'), 2, null), null);
});

test('hints only return moves that beat the table, and every hint resolves', () => {
  for (let trial = 0; trial < 300; trial++) {
    const deck = GD.shuffledDeck();
    const lvl = 2 + (trial % 13);
    const hand = deck.slice(0, 27);
    // choose a random table combo from another hand
    const other = GD.enumerate(deck.slice(27, 54), lvl);
    const last = trial % 3 === 0 ? null : other[Math.floor(Math.random() * other.length)];
    const hs = GD.hints(hand, lvl, last);
    for (const h of hs) {
      assert.ok(h.ids.every((id) => hand.includes(id)));
      assert.equal(new Set(h.ids).size, h.ids.length);
      const r = GD.resolve(h.ids, lvl, last);
      assert.ok(r, `hint ${h.type} should resolve (lvl ${lvl})`);
      assert.ok(GD.canBeat(r, last));
    }
    // brute force: no legal same-size play was missed for singles
    if (last && last.type === 'single') {
      const legal = hand.filter((id) => GD.canBeat(GD.analyze([id], lvl)[0], last));
      const hinted = new Set(hs.filter((h) => h.type === 'single').map((h) => GD.cardPower(h.ids[0], lvl)));
      for (const id of legal) assert.ok(hinted.has(GD.cardPower(id, lvl)));
    }
  }
});

test('sortHand puts big cards first and wild before other level cards', () => {
  const lvl = 5;
  const ids = many('3S', '5H', '5S', 'AS', 'bj', 'sj');
  const sorted = GD.sortHand(ids, lvl, 'rank');
  assert.deepEqual(sorted.map((id) => GD.card(id).rank), [21, 20, 5, 5, 14, 3]);
  assert.equal(GD.card(sorted[2]).suit, 'H');
});
