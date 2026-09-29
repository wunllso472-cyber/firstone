# 欢乐掼蛋 · Guandan Online

A four-player online Guandan (掼蛋) card game for the browser. The table layout and interactions are modelled on Tencent's Guandan: a landscape felt table, hands stacked in columns by rank, the 不出 / 提示 / 出牌 buttons, an alarm-clock turn timer, 托管 auto-play, voice call-outs, bomb effects, props you can throw at other players, and tribute and result screens.

## Run it

```bash
cd guandan
npm install
npm start            # http://localhost:3000   (PORT=8080 npm start to change the port)
```

Open the page, then pick 快速开始 (quick match), 创建房间 (create a room) or 人机练习 (practice against the computer). To play with friends, create a room and send them the 邀请好友 link, or the six-digit room number. Empty seats can be filled with computer players.

Other devices on your network can join through `http://<your-ip>:3000`. To play over the internet, deploy the folder to any Node host; a `Dockerfile` is included. WebSockets go to `/ws` on the same host.

The game only needs Node 18+ and the `ws` package. There is no build step, and all artwork (cards, avatars, icons) is procedural SVG/CSS, so there are no image assets. On phones held upright the table rotates into landscape, as mobile card games do.

## Rules implemented

- Two decks (108 cards), 27 each; partners sit opposite; play goes counter-clockwise.
- The **level card** (级牌) ranks above A and below the jokers. The **heart of the level rank** is wild (逢人配). It can stand in for any card except a joker.
- Combos: single, pair, triple, 三带二, straight (exactly 5, A low or high, no wrap), 三连对, 钢板, bombs of 4–8, 同花顺, and 天王炸 (all four jokers).
- Bomb order: 天王炸 > 8 > 7 > 6 > 同花顺 > 5 > 4; same-size bombs compare by rank.
- **接风**: if everyone passes after a player's last hand, that player's partner leads.
- Scoring: 1st+2nd on one team = up 3 levels, 1st+3rd = up 2, 1st+4th = up 1. The winning team plays its own level next round.
- **Winning at A**: you must win while playing A, and your partner must not come last. Three failed attempts send the team back to 2.
- **进贡 / 还贡**: the loser(s) give their highest card, never the wild. With two losers, the bigger card goes to 1st place. Each receiver returns a card of 10 or lower. The giver of the (bigger) tribute leads.
- **抗贡**: if the paying side holds both big jokers, no tribute is paid and 1st place leads.

## Features

- Server-authoritative play: every move is checked on the server, and clients only see their own hand.
- Reconnect: refresh or lose the connection and you get your seat back. A player who disconnects mid-game is put on 托管 so the game keeps going.
- 30-second turn timer; running out of time switches the player to 托管.
- 提示 steps through legal plays, cheapest and least hand-breaking first. 同花顺 finds straight flushes. 理牌 groups the selected cards into their own column. 排序 switches between sorting by rank and by count.
- Tap to select, swipe across cards to select several, double-tap to take a whole column. Right-click, Enter or Space plays; P passes; H hints; Esc clears the selection.
- 记牌器 shows how many of each rank are still unseen. After you go out you can watch your partner's cards.
- Quick-chat phrases (read aloud), emoji, free text, and throwable props (flowers, eggs, bombs…).
- Sound effects are synthesized with WebAudio, and play call-outs ("对三", "炸弹"…) use the browser's Chinese speech voice.

## Code layout

```
shared/engine.js   rules: combo detection (with wilds), comparison, hint search, sorting — used by server and browser
server/room.js     room + game state machine: seats, dealing, tribute, tricks, 接风, scoring, timers, 托管
server/bot.js      computer player (empty seats and 托管)
server/index.js    static file server + WebSocket protocol + lobby / matchmaking
public/            the client (index.html, css/style.css, js/app.js, js/art.js, js/audio.js)
test/              node:test suites for the rules engine and full simulated games
```

Run the tests with `npm test`.
