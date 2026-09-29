/* Simple but sensible Guandan AI, used for empty seats and for players in 托管 (auto-play) mode. */
const GD = require('../shared/engine');

const partnerOf = (s) => (s + 2) % 4;

function keyNorm(c) {
  // rough 0..12 "how big" measure, comparable across types
  if (c.type === 'straight' || c.type === 'plate' || c.type === 'tube') return c.key - 1;
  if (c.type === 'jokerbomb') return 20;
  return Math.min(c.key, 16) - 2;
}

/**
 * ctx = { hand, lvl, seat, last: {seat, combo}|null, counts: [n0..n3] }
 * returns { play: ids } | { pass: true }
 */
function decide(ctx) {
  const { hand, lvl, seat, counts } = ctx;
  const last = ctx.last && ctx.last.seat !== seat ? ctx.last : null;
  const opp = [(seat + 1) % 4, (seat + 3) % 4].filter((s) => counts[s] > 0);
  const minOpp = opp.length ? Math.min(...opp.map((s) => counts[s])) : 99;
  const partner = partnerOf(seat);

  const all = GD.hints(hand, lvl, last);
  // going out in one move always wins
  const out = all.find((c) => c.n === hand.length);
  if (out) return { play: out.ids };

  if (!last) {
    const plain = all.filter((c) => !c.tier);
    if (!plain.length) return { play: all.length ? all[0].ids : [hand[0]] };
    let best = null;
    let bestScore = Infinity;
    for (const c of plain) {
      let score = keyNorm(c) - 1.3 * (c.n - 1) + (c.damage || 0);
      if (c.type === 'single' && minOpp <= 1 && keyNorm(c) < 13) score += 6; // don't feed a one-card opponent
      if (c.type === 'pair' && minOpp <= 2 && keyNorm(c) < 12) score += 2;
      if (c.type === 'single' && counts[partner] <= 1) score -= 3; // small single lets the partner out
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return { play: best.ids };
  }

  // following
  const partnerWinning = last.seat === partner;
  if (partnerWinning) return { pass: true };
  const lastOpp = counts[last.seat];
  const plain = all.filter((c) => !c.tier);
  const bombs = all.filter((c) => c.tier);
  const urgent = minOpp <= 3 || lastOpp <= 4;
  if (plain.length) {
    const c = plain[0];
    // avoid wrecking the hand with a heavily damaging answer unless the opponent is about to go out
    if ((c.damage || 0) >= 5 && !urgent) {
      /* fall through to pass / bomb decision */
    } else if (keyNorm(c) >= 13 && last.combo.n === 1 && !urgent && lastOpp > 8) {
      /* not worth spending a top card on a small lead early on */
    } else return { play: c.ids };
  }
  if (bombs.length) {
    const nLeft = hand.length;
    const worth = urgent || nLeft <= 10 || (last.combo.n >= 5 && lastOpp <= 8);
    if (worth) return { play: bombs[0].ids };
  }
  return { pass: true };
}

/** which card to send back as 还贡: a low, isolated, non-wild card */
function chooseReturn(hand, lvl) {
  const cnt = {};
  for (const id of hand) {
    const c = GD.card(id);
    cnt[c.rank] = (cnt[c.rank] || 0) + 1;
  }
  const cands = hand.filter((id) => !GD.isWild(GD.card(id), lvl) && GD.cardPower(id, lvl) <= 10);
  const pool = cands.length ? cands : hand.filter((id) => !GD.isWild(GD.card(id), lvl));
  pool.sort((a, b) => cnt[GD.card(a).rank] - cnt[GD.card(b).rank] || GD.cardPower(a, lvl) - GD.cardPower(b, lvl));
  return pool[0] !== undefined ? pool[0] : hand[0];
}

module.exports = { decide, chooseReturn };
