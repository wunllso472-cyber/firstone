/* Procedural art: card faces, avatars and icons. Everything is SVG/HTML so the game needs no image assets. */
(function () {
  'use strict';
  const SUIT_CH = { S: '♠', H: '♥', C: '♣', D: '♦' };
  const RED = { H: 1, D: 1 };

  // ---------- court card portraits ----------
  function court(rank, suit) {
    const col = RED[suit] ? '#c8102e' : '#1d2a44';
    const alt = RED[suit] ? '#1d3f8f' : '#b3121f';
    const gold = '#e7b43c';
    const skin = '#fbe0c4';
    const hat =
      rank === 13
        ? `<path d="M22 30 L26 14 L33 24 L40 10 L47 24 L54 14 L58 30 Z" fill="${gold}" stroke="#8a5a12" stroke-width="1.4"/>
           <circle cx="40" cy="10" r="2.6" fill="${alt}"/><circle cx="26" cy="14" r="2" fill="${alt}"/><circle cx="54" cy="14" r="2" fill="${alt}"/>`
        : rank === 12
        ? `<path d="M24 30 Q40 6 56 30 Z" fill="${gold}" stroke="#8a5a12" stroke-width="1.4"/>
           <circle cx="40" cy="17" r="3.4" fill="${alt}"/><path d="M28 30 Q40 22 52 30" fill="none" stroke="#8a5a12" stroke-width="1.2"/>`
        : `<path d="M22 31 Q24 14 40 13 Q56 14 58 31 Z" fill="${col}"/><path d="M20 31 H60" stroke="${gold}" stroke-width="4"/>
           <path d="M52 16 q10 -6 14 4" fill="none" stroke="${alt}" stroke-width="3"/>`;
    const hair =
      rank === 12
        ? `<path d="M25 32 Q20 60 28 66 L32 40 Z M55 32 Q60 60 52 66 L48 40 Z" fill="#6b3a1a"/>`
        : rank === 13
        ? `<path d="M29 48 Q40 66 51 48 Q48 58 40 60 Q32 58 29 48Z" fill="#7a4b22"/>`
        : `<path d="M27 32 Q25 44 29 46 M53 32 Q55 44 51 46" stroke="#7a4b22" stroke-width="4" fill="none"/>`;
    return `<svg viewBox="0 0 80 100" class="court">
      <rect x="4" y="4" width="72" height="92" rx="5" fill="#fff8e6" stroke="${gold}" stroke-width="2"/>
      <path d="M8 96 Q14 70 40 68 Q66 70 72 96 Z" fill="${col}"/>
      <path d="M30 70 L40 92 L50 70" fill="${gold}" opacity=".85"/>
      <path d="M18 96 Q22 80 32 74 M62 96 Q58 80 48 74" stroke="${alt}" stroke-width="3" fill="none"/>
      <rect x="35" y="56" width="10" height="12" fill="${skin}"/>
      <ellipse cx="40" cy="42" rx="14" ry="16" fill="${skin}"/>
      ${hair}
      <circle cx="35" cy="41" r="1.8" fill="#222"/><circle cx="45" cy="41" r="1.8" fill="#222"/>
      <path d="M36 50 Q40 53 44 50" stroke="#b5463a" stroke-width="1.6" fill="none"/>
      <circle cx="31" cy="47" r="2.4" fill="#f4a1a1" opacity=".6"/><circle cx="49" cy="47" r="2.4" fill="#f4a1a1" opacity=".6"/>
      ${hat}
      <text x="66" y="90" font-size="16" fill="${RED[suit] ? '#c8102e' : '#111'}" text-anchor="middle" font-family="serif">${SUIT_CH[suit]}</text>
    </svg>`;
  }

  function jokerArt(big) {
    const a = big ? '#d8131f' : '#2a2f3a';
    const b = big ? '#ffb000' : '#6f7c91';
    const c = big ? '#1b6fd8' : '#9aa6b8';
    return `<svg viewBox="0 0 80 100" class="court">
      <rect x="4" y="4" width="72" height="92" rx="5" fill="${big ? '#fff4e0' : '#f1f3f7'}" stroke="${b}" stroke-width="2"/>
      <path d="M14 44 L26 14 L40 34 L54 14 L66 44 Z" fill="${a}"/>
      <path d="M26 14 L40 34 L40 44 L22 44Z" fill="${c}" opacity=".85"/>
      <circle cx="14" cy="44" r="4.5" fill="${b}"/><circle cx="26" cy="14" r="4.5" fill="${b}"/><circle cx="54" cy="14" r="4.5" fill="${b}"/><circle cx="66" cy="44" r="4.5" fill="${b}"/>
      <ellipse cx="40" cy="60" rx="16" ry="15" fill="#fde2c8"/>
      <path d="M26 46 H54" stroke="${b}" stroke-width="5"/>
      <circle cx="34" cy="58" r="2" fill="#222"/><circle cx="46" cy="58" r="2" fill="#222"/>
      <path d="M32 65 Q40 73 48 65" stroke="${a}" stroke-width="2.4" fill="none"/>
      <circle cx="40" cy="62" r="3" fill="${a}"/>
      <path d="M18 96 Q22 80 40 76 Q58 80 62 96Z" fill="${c}"/>
      <path d="M26 82 L40 92 L54 82" stroke="${b}" stroke-width="3" fill="none"/>
    </svg>`;
  }

  const rankText = (r) => (r === 11 ? 'J' : r === 12 ? 'Q' : r === 13 ? 'K' : r === 14 ? 'A' : String(r));

  /** HTML for a card face */
  function cardHTML(id, lvl) {
    const c = GD.card(id);
    if (c.suit === 'J') {
      const big = c.rank === GD.RANK_BJ;
      return `<div class="card joker ${big ? 'big' : 'small'}" data-id="${id}">
        <div class="c-corner jk"><b>J</b><b>O</b><b>K</b><b>E</b><b>R</b></div>
        <div class="c-art">${jokerArt(big)}</div>
        <div class="c-jname">${big ? '大王' : '小王'}</div>
      </div>`;
    }
    const red = RED[c.suit] ? 'red' : 'black';
    const wild = GD.isWild(c, lvl);
    const isLvl = c.rank === lvl;
    const center = c.rank >= 11 && c.rank <= 13 ? `<div class="c-art">${court(c.rank, c.suit)}</div>` : `<div class="c-big">${SUIT_CH[c.suit]}</div>`;
    return `<div class="card ${red}${wild ? ' wild' : ''}${isLvl ? ' lvl' : ''}${c.rank === 14 ? ' ace' : ''}" data-id="${id}">
      <div class="c-corner"><b>${rankText(c.rank)}</b><i>${SUIT_CH[c.suit]}</i></div>
      ${center}
      ${wild ? '<span class="c-wild">配</span>' : isLvl ? '<span class="c-lvl">级</span>' : ''}
    </div>`;
  }

  // ---------- avatars ----------
  const AV = [
    { bg: ['#ffd36e', '#f59f2f'], skin: '#fde0c5', hair: '#2b1b12', style: 'short', shirt: '#2f7de1' },
    { bg: ['#ff9fbf', '#e0487c'], skin: '#fde3cf', hair: '#5a2e1a', style: 'long', shirt: '#ffffff' },
    { bg: ['#8fe3c3', '#1fa37a'], skin: '#f7d2b0', hair: '#1c1c1c', style: 'spiky', shirt: '#ff6a3d' },
    { bg: ['#9fc6ff', '#3c6fe0'], skin: '#fde0c5', hair: '#7a3f12', style: 'bun', shirt: '#f2c200' },
    { bg: ['#d7b0ff', '#8a4de0'], skin: '#f2c9a4', hair: '#222', style: 'cap', shirt: '#1ea56b' },
    { bg: ['#ffc2a1', '#ee6d3c'], skin: '#fde3cf', hair: '#999', style: 'glasses', shirt: '#6b4c9a' },
    { bg: ['#b8f07e', '#58b327'], skin: '#fde0c5', hair: '#3a2210', style: 'cap', shirt: '#d8263b' },
    { bg: ['#ffe28a', '#e2a400'], skin: '#fce1c9', hair: '#b04d1f', style: 'long', shirt: '#2a8cf0' },
    { bg: ['#a4e8ff', '#1a9bd1'], skin: '#f5cfaa', hair: '#101010', style: 'short', shirt: '#f28c28' },
    { bg: ['#ffb5d8', '#d94c95'], skin: '#fde3cf', hair: '#2e1d10', style: 'bun', shirt: '#44b0a5' },
    { bg: ['#c7c9ff', '#5e62d8'], skin: '#f2c9a4', hair: '#444', style: 'glasses', shirt: '#e6534b' },
    { bg: ['#ffd0a0', '#e88a2a'], skin: '#fde0c5', hair: '#1a1a1a', style: 'spiky', shirt: '#3a7d2c' },
  ];
  function avatarSVG(i) {
    const a = AV[((i | 0) % AV.length + AV.length) % AV.length];
    const gid = 'avg' + i;
    const hair = {
      short: `<path d="M30 44 Q30 22 50 21 Q70 22 70 44 Q64 32 50 31 Q36 32 30 44Z" fill="${a.hair}"/>`,
      long: `<path d="M28 70 Q24 40 34 28 Q50 16 66 28 Q76 40 72 70 L66 70 Q68 46 60 36 Q50 42 38 36 Q32 46 34 70Z" fill="${a.hair}"/>`,
      spiky: `<path d="M29 44 L32 26 L38 32 L42 20 L48 29 L53 18 L57 29 L63 22 L65 32 L71 28 L71 44 Q62 33 50 33 Q38 33 29 44Z" fill="${a.hair}"/>`,
      bun: `<circle cx="50" cy="18" r="8" fill="${a.hair}"/><path d="M30 46 Q28 24 50 23 Q72 24 70 46 Q66 34 50 33 Q34 34 30 46Z" fill="${a.hair}"/>`,
      cap: `<path d="M28 40 Q30 20 50 20 Q70 20 72 40Z" fill="${a.shirt}"/><path d="M50 38 H82 Q80 44 70 44 H50Z" fill="${a.shirt}" opacity=".85"/><circle cx="50" cy="21" r="3" fill="#fff"/>`,
      glasses: `<path d="M31 42 Q31 26 50 25 Q69 26 69 42 Q62 34 50 34 Q38 34 31 42Z" fill="${a.hair}"/>`,
    }[a.style];
    const glasses =
      a.style === 'glasses'
        ? `<circle cx="42" cy="48" r="6" fill="none" stroke="#222" stroke-width="2"/><circle cx="58" cy="48" r="6" fill="none" stroke="#222" stroke-width="2"/><path d="M48 48 H52" stroke="#222" stroke-width="2"/>`
        : '';
    return `<svg viewBox="0 0 100 100"><defs><radialGradient id="${gid}" cx="50%" cy="35%" r="70%"><stop offset="0" stop-color="${a.bg[0]}"/><stop offset="1" stop-color="${a.bg[1]}"/></radialGradient></defs>
      <rect width="100" height="100" fill="url(#${gid})"/>
      <path d="M18 100 Q20 74 50 72 Q80 74 82 100Z" fill="${a.shirt}"/>
      <path d="M42 72 L50 82 L58 72" fill="#fff" opacity=".7"/>
      <rect x="44" y="60" width="12" height="12" fill="${a.skin}"/>
      <ellipse cx="50" cy="48" rx="20" ry="22" fill="${a.skin}"/>
      <ellipse cx="30" cy="50" rx="3.5" ry="5" fill="${a.skin}"/><ellipse cx="70" cy="50" rx="3.5" ry="5" fill="${a.skin}"/>
      ${hair}
      <ellipse cx="42" cy="49" rx="2.6" ry="3.2" fill="#2a1a10"/><ellipse cx="58" cy="49" rx="2.6" ry="3.2" fill="#2a1a10"/>
      <circle cx="43" cy="48" r=".9" fill="#fff"/><circle cx="59" cy="48" r=".9" fill="#fff"/>
      ${glasses}
      <path d="M43 59 Q50 65 57 59" stroke="#c0503c" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      <ellipse cx="37" cy="56" rx="4" ry="2.4" fill="#ff8a8a" opacity=".45"/><ellipse cx="63" cy="56" rx="4" ry="2.4" fill="#ff8a8a" opacity=".45"/>
    </svg>`;
  }

  // ---------- icons ----------
  const ICONS = {
    sound: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
    mute: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    rules: '<svg viewBox="0 0 24 24"><path d="M5 3h11l3 3v15H5z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 9h8M8 13h8M8 17h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    set: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    exit: '<svg viewBox="0 0 24 24"><path d="M14 4H5v16h9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 12h10M16 8l4 4-4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    sf: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="8" height="12" rx="1.5" fill="#fff" stroke="currentColor" stroke-width="1.6" transform="rotate(-12 7 11)"/><rect x="9" y="4" width="8" height="12" rx="1.5" fill="#fff" stroke="currentColor" stroke-width="1.6"/><rect x="14" y="5" width="8" height="12" rx="1.5" fill="#fff" stroke="currentColor" stroke-width="1.6" transform="rotate(12 18 11)"/><path d="M18 12l-1.8-1.8a1 1 0 0 1 1.8-1 1 1 0 0 1 1.8 1z" fill="#e0243a"/></svg>',
    arr: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="7" height="16" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><rect x="14" y="4" width="7" height="16" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6.5 8v8M17.5 8v8" stroke="currentColor" stroke-width="2"/></svg>',
    sort: '<svg viewBox="0 0 24 24"><path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    chat: '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="9" cy="10.5" r="1.2" fill="currentColor"/><circle cx="12" cy="10.5" r="1.2" fill="currentColor"/><circle cx="15" cy="10.5" r="1.2" fill="currentColor"/></svg>',
  };

  const PROPS = {
    flower: { e: '🌹', name: '鲜花' },
    egg: { e: '🥚', name: '鸡蛋' },
    bomb: { e: '💣', name: '炸弹' },
    beer: { e: '🍺', name: '干杯' },
    kiss: { e: '💋', name: '飞吻' },
    tomato: { e: '🍅', name: '番茄' },
  };

  window.ART = { cardHTML, avatarSVG, ICONS, PROPS, SUIT_CH, rankText, AV_COUNT: AV.length };
})();
