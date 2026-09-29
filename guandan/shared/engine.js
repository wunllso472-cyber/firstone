/*
 * Guandan (掼蛋) rules engine — shared by the server (authoritative) and the browser (hints / button state).
 *
 * Cards: two 54-card decks => ids 0..107.  id % 54: 0..51 = suit*13 + (rank-2), 52 = small joker, 53 = big joker.
 * Ranks: 2..14 (J=11 Q=12 K=13 A=14), small joker = 20, big joker = 21.
 * Level card ("打几"): natural rank == lvl. It outranks A but not the jokers. The heart of the level rank is the wild (逢人配).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GD = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SUITS = ['S', 'H', 'C', 'D']; // ♠ ♥ ♣ ♦
  const RANK_SJ = 20;
  const RANK_BJ = 21;
  const RANK_LABEL = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 20: '小王', 21: '大王' };

  const CARDS = [];
  for (let id = 0; id < 108; id++) {
    const n = id % 54;
    if (n === 52) CARDS.push({ id, suit: 'J', rank: RANK_SJ });
    else if (n === 53) CARDS.push({ id, suit: 'J', rank: RANK_BJ });
    else CARDS.push({ id, suit: SUITS[Math.floor(n / 13)], rank: (n % 13) + 2 });
  }
  const card = (id) => CARDS[id];
  const rankLabel = (r) => RANK_LABEL[r] || String(r);

  /** comparison power of a rank in non-sequence contexts */
  const power = (rank, lvl) => (rank >= 20 ? rank : rank === lvl ? 15 : rank);
  const isWild = (c, lvl) => c.suit === 'H' && c.rank === lvl;
  const cardPower = (id, lvl) => power(CARDS[id].rank, lvl);

  // bomb tiers: 4-bomb < 5-bomb < straight flush < 6 < 7 < 8 < four jokers
  const BOMB_TIER = { 4: 1, 5: 2, 6: 4, 7: 5, 8: 6 };
  const TIER_SF = 3;
  const TIER_JOKERS = 7;

  const seqRank = (p) => (p === 1 || p === 14 ? 14 : p);

  function fillSlots(slots, ids, lvl) {
    // Arrange ids so that each slot gets a natural card of that rank (and suit), wilds where none is left.
    const used = new Set();
    const out = [];
    const nat = ids.filter((id) => !isWild(CARDS[id], lvl));
    const wilds = ids.filter((id) => isWild(CARDS[id], lvl));
    for (const s of slots) {
      let pick = nat.find((id) => !used.has(id) && CARDS[id].rank === s.r && (!s.s || CARDS[id].suit === s.s));
      if (pick === undefined) pick = wilds.find((id) => !used.has(id));
      if (pick === undefined) return null;
      used.add(pick);
      out.push(pick);
    }
    return out;
  }

  /**
   * All the legal combos the given selection can be read as (wild cards make several readings possible).
   * combo = { type, key, tier, n, ids (ordered for display) }
   */
  function analyze(ids, lvl) {
    const n = ids.length;
    const out = [];
    if (n === 0 || n > 8) return out;
    let W = 0;
    const cnt = {};
    const natSuits = new Set();
    for (const id of ids) {
      const c = CARDS[id];
      if (isWild(c, lvl)) W++;
      else {
        cnt[c.rank] = (cnt[c.rank] || 0) + 1;
        natSuits.add(c.suit);
      }
    }
    const ranks = Object.keys(cnt).map(Number);
    const push = (type, key, tier, slots) => {
      const ordered = fillSlots(slots, ids, lvl);
      if (ordered) out.push({ type, key, tier, n, ids: ordered });
    };
    const rep = (r, k) => Array.from({ length: k }, () => ({ r }));

    // same-rank families: single / pair / triple / bomb
    if (ranks.length <= 1) {
      const r = ranks.length === 1 ? ranks[0] : lvl;
      if (!(r >= 20 && W > 0)) {
        if (n === 1) push('single', power(r, lvl), 0, rep(r, 1));
        else if (n === 2) push('pair', power(r, lvl), 0, rep(r, 2));
        else if (n === 3) push('triple', power(r, lvl), 0, rep(r, 3));
        else if (n >= 4 && r < 20) push('bomb', power(r, lvl), BOMB_TIER[n], rep(r, n));
      }
    }
    if (n === 4 && W === 0 && cnt[RANK_SJ] === 2 && cnt[RANK_BJ] === 2) {
      push('jokerbomb', 0, TIER_JOKERS, [{ r: RANK_SJ }, { r: RANK_SJ }, { r: RANK_BJ }, { r: RANK_BJ }]);
    }

    // runs: groupSize cards per position over groupCount consecutive positions (A is low or high)
    const runs = (groupSize, groupCount, maxStart, cb) => {
      if (n !== groupSize * groupCount) return;
      for (let s = 1; s <= maxStart; s++) {
        const rs = [];
        for (let p = s; p < s + groupCount; p++) rs.push(seqRank(p));
        let ok = true;
        for (const r of ranks) if (!rs.includes(r) || cnt[r] > groupSize) { ok = false; break; }
        if (ok) cb(s, rs);
      }
    };
    runs(1, 5, 10, (s, rs) => {
      push('straight', s, 0, rs.map((r) => ({ r })));
      if (natSuits.size === 1) {
        const suit = [...natSuits][0];
        push('sflush', s, TIER_SF, rs.map((r) => ({ r, s: suit })));
      }
    });
    runs(3, 2, 13, (s, rs) => push('plate', s, 0, [].concat(...rs.map((r) => rep(r, 3)))));
    runs(2, 3, 12, (s, rs) => push('tube', s, 0, [].concat(...rs.map((r) => rep(r, 2)))));

    // full house: triple a + pair b (a != b); wilds can fill either side but never a joker
    if (n === 5) {
      const pairRanks = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 20, 21];
      for (let a = 2; a <= 14; a++) {
        for (const b of pairRanks) {
          if (a === b) continue;
          const ca = cnt[a] || 0;
          const cb = cnt[b] || 0;
          if (ca > 3 || cb > 2) continue;
          if (ranks.some((r) => r !== a && r !== b)) continue;
          if (b >= 20 && cb !== 2) continue;
          push('fullhouse', power(a, lvl), 0, [...rep(a, 3), ...rep(b, 2)]);
        }
      }
    }
    return out;
  }

  /** can combo c legally beat `last` (null = leading, anything goes) */
  function canBeat(c, last) {
    if (!last) return true;
    if (c.tier || last.tier) {
      if (c.tier !== last.tier) return c.tier > last.tier;
      return c.key > last.key;
    }
    if (c.type !== last.type || c.n !== last.n) return false;
    return c.key > last.key;
  }

  const strength = (c) => c.tier * 1000 + c.key;

  /** Interpret a selection against the current table combo. Returns the strongest legal reading, or null. */
  function resolve(ids, lvl, last) {
    if (new Set(ids).size !== ids.length) return null;
    let best = null;
    for (const c of analyze(ids, lvl)) {
      if (!canBeat(c, last)) continue;
      if (!best || strength(c) > strength(best)) best = c;
    }
    return best;
  }

  /** Every playable combo in a hand (before comparing with the table). */
  function enumerate(handIds, lvl) {
    const natByRank = {};
    const natBySR = {};
    const wilds = [];
    const inHand = new Set(handIds);
    for (const id of handIds) {
      const c = CARDS[id];
      if (isWild(c, lvl)) wilds.push(id);
      else {
        (natByRank[c.rank] = natByRank[c.rank] || []).push(id);
        (natBySR[c.suit + c.rank] = natBySR[c.suit + c.rank] || []).push(id);
      }
    }
    const fill = (slots) => {
      const used = new Set();
      const out = [];
      for (const s of slots) {
        const pool = s.s ? natBySR[s.s + s.r] : natByRank[s.r];
        let pick = pool && pool.find((id) => !used.has(id));
        if (pick === undefined && s.r < 20) pick = wilds.find((id) => !used.has(id));
        if (pick === undefined) return null;
        used.add(pick);
        out.push(pick);
      }
      return out;
    };
    const res = [];
    const add = (type, key, tier, slots) => {
      const ids = fill(slots);
      if (!ids) return;
      // a wild only ever reads as the level rank when it stands alone, so re-check anything using wilds
      if (ids.some((id) => isWild(CARDS[id], lvl)) && !analyze(ids, lvl).some((c) => c.type === type && c.key === key && c.tier === tier)) return;
      res.push({ type, key, tier, n: ids.length, ids });
    };
    const rep = (r, k) => Array.from({ length: k }, () => ({ r }));
    const normal = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
    const withJ = normal.concat([RANK_SJ, RANK_BJ]);
    for (const r of withJ) {
      add('single', power(r, lvl), 0, rep(r, 1));
      add('pair', power(r, lvl), 0, rep(r, 2));
    }
    for (const r of normal) {
      add('triple', power(r, lvl), 0, rep(r, 3));
      for (let k = 4; k <= 8; k++) add('bomb', power(r, lvl), BOMB_TIER[k], rep(r, k));
      for (const b of withJ) if (b !== r) add('fullhouse', power(r, lvl), 0, [...rep(r, 3), ...rep(b, 2)]);
    }
    if (natByRank[RANK_SJ] && natByRank[RANK_SJ].length >= 2 && natByRank[RANK_BJ] && natByRank[RANK_BJ].length >= 2) {
      add('jokerbomb', 0, TIER_JOKERS, [{ r: RANK_SJ }, { r: RANK_SJ }, { r: RANK_BJ }, { r: RANK_BJ }]);
    }
    for (let s = 1; s <= 10; s++) {
      const rs = [];
      for (let p = s; p < s + 5; p++) rs.push(seqRank(p));
      const slots = rs.map((r) => ({ r }));
      const ids = fill(slots);
      // a suited straight is really a straight flush (bomb); it is enumerated below instead
      if (ids && !analyze(ids, lvl).some((c) => c.type === 'sflush')) res.push({ type: 'straight', key: s, tier: 0, n: 5, ids });
      for (const suit of SUITS) add('sflush', s, TIER_SF, rs.map((r) => ({ r, s: suit })));
    }
    for (let s = 1; s <= 13; s++) {
      const slots = [].concat(...[s, s + 1].map((p) => rep(seqRank(p), 3)));
      add('plate', s, 0, slots);
    }
    for (let s = 1; s <= 12; s++) {
      const slots = [].concat(...[s, s + 1, s + 2].map((p) => rep(seqRank(p), 2)));
      add('tube', s, 0, slots);
    }
    // sanity: every id must really be in the hand
    return res.filter((c) => c.ids.every((id) => inHand.has(id)));
  }

  /** how much a combo hurts the rest of the hand (bombs broken, wilds spent) — used to order hints */
  function damage(c, handIds, lvl) {
    if (c.tier) return 0;
    const cnt = {};
    for (const id of handIds) {
      const cd = CARDS[id];
      if (!isWild(cd, lvl)) cnt[cd.rank] = (cnt[cd.rank] || 0) + 1;
    }
    let d = 0;
    const used = {};
    for (const id of c.ids) {
      const cd = CARDS[id];
      if (isWild(cd, lvl)) d += 3;
      else used[cd.rank] = (used[cd.rank] || 0) + 1;
    }
    for (const r of Object.keys(used)) {
      const total = cnt[r];
      const rem = total - used[r];
      if (rem > 0) {
        if (total >= 4) d += 5;
        else if (c.type === 'single' || c.type === 'pair' || c.type === 'triple') d += rem === 1 && total === 2 ? 1.5 : 2;
        else d += 1;
      }
    }
    return d;
  }

  const TYPE_ORDER = { single: 0, pair: 1, triple: 2, fullhouse: 3, straight: 4, tube: 5, plate: 6, bomb: 7, sflush: 8, jokerbomb: 9 };

  /** Combos that beat `last`, weakest & least damaging first. */
  function hints(handIds, lvl, last) {
    const list = enumerate(handIds, lvl).filter((c) => canBeat(c, last));
    for (const c of list) c.damage = damage(c, handIds, lvl);
    list.sort(
      (a, b) =>
        (a.tier ? 1 : 0) - (b.tier ? 1 : 0) ||
        a.tier - b.tier ||
        a.damage - b.damage ||
        a.key - b.key ||
        TYPE_ORDER[a.type] - TYPE_ORDER[b.type] ||
        b.n - a.n
    );
    return list;
  }

  /** Sort a hand for display. mode 'rank' = strongest first grouped by rank, 'group' = bombs / triples / pairs / singles */
  function sortHand(ids, lvl, mode) {
    const suitOrder = { S: 0, H: 1, C: 2, D: 3, J: 4 };
    const byRank = (a, b) => {
      const ca = CARDS[a];
      const cb = CARDS[b];
      return cardPower(b, lvl) - cardPower(a, lvl) || suitOrder[ca.suit] - suitOrder[cb.suit] || a - b;
    };
    const arr = ids.slice();
    if (mode === 'group') {
      const cnt = {};
      for (const id of arr) {
        const c = CARDS[id];
        cnt[c.rank] = (cnt[c.rank] || 0) + 1;
      }
      return arr.sort((a, b) => {
        const ka = cnt[CARDS[a].rank] >= 4 ? 4 : cnt[CARDS[a].rank];
        const kb = cnt[CARDS[b].rank] >= 4 ? 4 : cnt[CARDS[b].rank];
        return (kb >= 4) - (ka >= 4) || kb - ka || byRank(a, b);
      });
    }
    // wild hearts sit right after the level cards but ahead of them visually: put the wild first among level cards
    return arr.sort((a, b) => {
      const pa = cardPower(a, lvl);
      const pb = cardPower(b, lvl);
      if (pa !== pb) return pb - pa;
      const wa = isWild(CARDS[a], lvl) ? 1 : 0;
      const wb = isWild(CARDS[b], lvl) ? 1 : 0;
      if (wa !== wb) return wb - wa;
      return suitOrder[CARDS[a].suit] - suitOrder[CARDS[b].suit] || a - b;
    });
  }

  function shuffledDeck(rng) {
    const r = rng || Math.random;
    const d = Array.from({ length: 108 }, (_, i) => i);
    for (let i = d.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [d[i], d[j]] = [d[j], d[i]];
    }
    return d;
  }

  const TYPE_NAME = {
    single: '单张',
    pair: '对子',
    triple: '三条',
    fullhouse: '三带二',
    straight: '顺子',
    plate: '钢板',
    tube: '三连对',
    bomb: '炸弹',
    sflush: '同花顺',
    jokerbomb: '天王炸',
  };

  return {
    SUITS, RANK_SJ, RANK_BJ, CARDS, card, rankLabel, power, isWild, cardPower,
    analyze, canBeat, resolve, enumerate, hints, sortHand, shuffledDeck, damage,
    TYPE_NAME, BOMB_TIER, TIER_SF, TIER_JOKERS,
  };
});
