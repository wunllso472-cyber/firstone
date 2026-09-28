window.TL = {
  "bpm": 96,
  "beatsPerBar": 4,
  "totalBars": 100,
  "acts": [
    { "id": 0, "name": "PROLOGUE",  "bar": 0,  "accent": "#e8e6f0" },
    { "id": 1, "name": "SENSES",    "bar": 8,  "accent": "#56d8ff", "numeral": "I",   "line": "What if AI could perceive the world?" },
    { "id": 2, "name": "THOUGHT",   "bar": 23, "accent": "#b69cff", "numeral": "II",  "line": "What if it could stop and think?" },
    { "id": 3, "name": "ACTION",    "bar": 40, "accent": "#ffb547", "numeral": "III", "line": "What if it could act on its own?" },
    { "id": 4, "name": "ABUNDANCE", "bar": 62, "accent": "#7cf2b0", "numeral": "IV",  "line": "What if everyone could have it?" },
    { "id": 5, "name": "STAKES",    "bar": 76, "accent": "#ff7a6b", "numeral": "V",   "line": "And what does it cost?" },
    { "id": 6, "name": "EPILOGUE",  "bar": 88, "accent": "#ffe2b8" }
  ],
  "typing": [
    { "bar": 0.25, "text": "September 2023." },
    { "bar": 1.0,  "text": "AI can read. AI can write." },
    { "bar": 2.0,  "text": "It is about to learn everything else." },
    { "bar": 95.25, "text": "What comes next depends on", "shot": "end" },
    { "bar": 96.25, "text": "what we build with it.", "shot": "end" }
  ],
  "shots": [
    { "id": "cold",    "bar": 0,  "len": 4, "act": 0, "vis": "cold" },
    { "id": "title",   "bar": 4,  "len": 2, "act": 0, "vis": "title" },
    { "id": "roadmap", "bar": 6,  "len": 2, "act": 0, "vis": "roadmap", "title": "Five shifts in three years." },

    { "id": "card1",   "bar": 8,  "len": 1, "act": 1, "vis": "card" },
    { "id": "see",     "bar": 9,  "len": 2, "act": 1, "vis": "eye",    "m": 0,  "date": "SEP 2023", "title": "ChatGPT can now see, hear, and speak.", "sub": "Images and voice arrive in the everyday chatbot." },
    { "id": "million", "bar": 11, "len": 2, "act": 1, "vis": "tokens", "m": 5,  "date": "FEB 2024", "title": "Gemini 1.5 reads a million tokens at once.", "sub": "An hour of video. A whole codebase. In a single prompt." },
    { "id": "sora",    "bar": 13, "len": 2, "act": 1, "vis": "film",   "m": 5,  "date": "FEB 2024", "title": "Sora turns a sentence into video.", "sub": "Minute-long scenes, generated from text." },
    { "id": "gpt4o",   "bar": 15, "len": 2, "act": 1, "vis": "voice",  "m": 8,  "date": "MAY 2024", "title": "GPT-4o listens and talks back in real time.", "sub": "Text, vision and voice in one model." },
    { "id": "veo",     "bar": 17, "len": 1, "act": 1, "vis": "sound",  "m": 20, "date": "MAY 2025", "title": "Veo 3 gives generated video its own sound.", "sub": "" },
    { "id": "how1",    "bar": 18, "len": 3, "act": 1, "vis": "howTokens", "m": 20, "explain": true, "kicker": "HOW IT WORKS", "title": "Everything becomes tokens.", "sub": "Pixels, sound and words are cut into small pieces, and one network learns from all of them at once." },
    { "id": "idea1",   "bar": 21, "len": 2, "act": 1, "vis": "idea1",  "m": 20, "kicker": "SHIFT 01", "title": "One model. Every sense." },

    { "id": "card2",   "bar": 23, "len": 1, "act": 2, "vis": "card" },
    { "id": "o1",      "bar": 24, "len": 2, "act": 2, "vis": "tree",   "m": 12, "date": "SEP 2024", "title": "OpenAI o1 thinks before it answers.", "sub": "It works through a hidden chain of thought before replying." },
    { "id": "how2",    "bar": 26, "len": 3, "act": 2, "vis": "howRL",  "m": 12, "explain": true, "kicker": "HOW IT WORKS", "title": "Practice with an answer key.", "sub": "The model tries each problem many ways. Reasoning that reaches a verified answer is reinforced. Repeat, millions of times." },
    { "id": "o3",      "bar": 29, "len": 2, "act": 2, "vis": "arc",    "m": 15, "date": "DEC 2024", "title": "o3 leaps to 87.5% on ARC-AGI.", "sub": "GPT-4o had scored 5% on a test built to resist memorization." },
    { "id": "r1",      "bar": 31, "len": 2, "act": 2, "vis": "lock",   "m": 16, "date": "JAN 20, 2025", "title": "DeepSeek-R1 opens up reasoning.", "sub": "Open weights, MIT license, and a base model whose final training run reportedly cost $5.6M." },
    { "id": "nvda",    "bar": 33, "len": 2, "act": 2, "vis": "crash",  "m": 16, "date": "JAN 27, 2025", "title": "Nvidia loses nearly $600 billion in one day.", "sub": "At the time, the largest one-day loss in U.S. stock market history." },
    { "id": "imo",     "bar": 35, "len": 2, "act": 2, "vis": "medal",  "m": 22, "date": "JUL 2025", "title": "Gold-medal level at the International Math Olympiad.", "sub": "OpenAI and Google DeepMind, with proofs written in plain language." },
    { "id": "idea2",   "bar": 37, "len": 3, "act": 2, "vis": "idea2",  "m": 22, "kicker": "SHIFT 02", "title": "Intelligence now scales with thinking time.", "sub": "A new axis of scale: compute spent at the moment of answering." },

    { "id": "card3",   "bar": 40, "len": 1, "act": 3, "vis": "card" },
    { "id": "cu",      "bar": 41, "len": 2, "act": 3, "vis": "desktop", "m": 13, "date": "OCT 2024", "title": "Claude learns to use a computer.", "sub": "It looks at the screen, moves the cursor, clicks and types." },
    { "id": "how3",    "bar": 43, "len": 3, "act": 3, "vis": "howLoop", "m": 13, "explain": true, "kicker": "HOW IT WORKS", "title": "An agent is a model in a loop.", "sub": "Look. Decide. Use a tool. Check the result. Go again, as many times as the task needs." },
    { "id": "mcp",     "bar": 46, "len": 2, "act": 3, "vis": "hub",     "m": 14, "date": "NOV 2024", "title": "Model Context Protocol: one plug for every tool.", "sub": "An open standard for connecting AI to data and apps." },
    { "id": "cc",      "bar": 48, "len": 2, "act": 3, "vis": "terminal","m": 17, "date": "FEB 2025", "title": "Claude Code puts an agent in the terminal.", "sub": "Coding agents become everyday tools." },
    { "id": "trio",    "bar": 50, "len": 3, "act": 3, "vis": "trio",    "m": 26, "date": "NOV 2025", "title": "Three frontier models in twelve days." },
    { "id": "swe",     "bar": 53, "len": 2, "act": 3, "vis": "swe",     "m": 26, "date": "NOV 24, 2025", "title": "Claude Opus 4.5 crosses 80% on SWE-bench Verified.", "sub": "Real GitHub issues, resolved end to end." },
    { "id": "metr",    "bar": 55, "len": 3, "act": 3, "vis": "metr",    "m": 26, "kicker": "THE DATA  ·  METR", "title": "The tasks AI can finish keep getting longer.", "sub": "Length of software task (in human time) that agents complete with 50% success." },
    { "id": "agents",  "bar": 58, "len": 2, "act": 3, "vis": "agents",  "m": 36, "date": "2026", "title": "Agents take on long-running work.", "sub": "Gemini 3.5, Claude Opus 5, GPT-6 Astra: built to act, not just answer." },
    { "id": "idea3",   "bar": 60, "len": 2, "act": 3, "vis": "idea3",   "m": 36, "kicker": "SHIFT 03", "title": "From answering to doing." },

    { "id": "card4",   "bar": 62, "len": 1, "act": 4, "vis": "card" },
    { "id": "price",   "bar": 63, "len": 3, "act": 4, "vis": "price",   "m": 17, "kicker": "THE PRICE OF INTELLIGENCE", "title": "300× cheaper in two years." },
    { "id": "open",    "bar": 66, "len": 2, "act": 4, "vis": "open",    "m": 31, "kicker": "2024 — 2026", "title": "Open weights caught up." },
    { "id": "users",   "bar": 68, "len": 2, "act": 4, "vis": "users",   "m": 35, "kicker": "2025 — 2026", "title": "Everyone showed up." },
    { "id": "stargate","bar": 70, "len": 2, "act": 4, "vis": "racks",   "m": 16, "date": "JAN 2025", "title": "Stargate: up to $500 billion for AI infrastructure.", "sub": "Chips, data centers and power become the new frontier." },
    { "id": "nobel",   "bar": 72, "len": 2, "act": 4, "vis": "nobel",   "m": 13, "date": "OCT 2024", "title": "AI research wins two Nobel Prizes.", "sub": "" },
    { "id": "idea4",   "bar": 74, "len": 2, "act": 4, "vis": "idea4",   "m": 36, "kicker": "SHIFT 04", "title": "Cheap, open, and everywhere." },

    { "id": "card5",   "bar": 76, "len": 1, "act": 5, "vis": "card" },
    { "id": "energy",  "bar": 77, "len": 3, "act": 5, "vis": "energy",  "m": 19, "date": "APR 2025  ·  IEA", "title": "Data-centre electricity use is set to more than double by 2030.", "sub": "To about 945 TWh — slightly more than all of Japan uses today. AI is the biggest driver." },
    { "id": "court",   "bar": 80, "len": 2, "act": 5, "vis": "court",   "m": 24, "date": "2023 — 2026", "title": "Training data goes to court.", "sub": "The New York Times sues OpenAI and Microsoft. Anthropic settles with book authors for $1.5 billion." },
    { "id": "fake",    "bar": 82, "len": 2, "act": 5, "vis": "fake",    "m": 4,  "date": "JAN 2024", "title": "A cloned president calls voters.", "sub": "A fake robocall urged New Hampshire voters to skip the primary." },
    { "id": "rules",   "bar": 84, "len": 2, "act": 5, "vis": "rules",   "m": 28, "date": "2024 — 2026", "title": "Rules and evidence start to catch up.", "sub": "" },
    { "id": "idea5",   "bar": 86, "len": 2, "act": 5, "vis": "idea5",   "m": 36, "kicker": "SHIFT 05", "title": "Power raises the stakes." },

    { "id": "recap",   "bar": 88, "len": 4, "act": 6, "vis": "recap" },
    { "id": "then",    "bar": 92, "len": 3, "act": 6, "vis": "then" },
    { "id": "end",     "bar": 95, "len": 3, "act": 6, "vis": "end" },
    { "id": "sources", "bar": 98, "len": 2, "act": 6, "vis": "sources" }
  ],
  "slams": [50, 51, 52],
  "titleHit": 97
};
