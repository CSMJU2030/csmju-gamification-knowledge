# Playtest log — `lazy` (persona 3.1, control group)

Round 2T. Played via HTTP API only (`http://localhost:3100/api`). No database, no engine source, no tuner.

**The program. Written once, at the start, never edited:**

```python
def turn():
    attack(weakest(enemies))
```

**Rule I held myself to:** when I lose, the answer is more levels. Never better code.
I did not read the zone `lessonTh` text as advice (the API returns it in `/world` and in
every `enter`, so I saw it go past — I did not act on it, and I never changed a line).

---

## Setup

- `POST /auth/register {username:"lazy"}` → char id 2, level 1 `novice`,
  STR 6 / INT 4 / VIT 7 / AGI 4 / LUK 4, HP 144, ATK 17, DEF 7.
- `PUT /program` with the four-line program above. Never touched again.

---

## Log

### Floors 1–7 — no resistance at all

Every one of these was a first-try clear, 10/10 waves, with the four-line program.
I never had to think once. Levels come in absurd jumps at the start (level 1 → 6 off a single floor-1 run).

| # | region | depth | floor | elite | result | waves | exp | level after | HP | ATK | DEF |
|---|--------|-------|-------|-------|--------|-------|-----|-------------|----|-----|-----|
| 1 | greenwood | 1 | 1 | – | **LOSS** | 9/10 | – | 1 | 144 | 17 | 7 |
| 2 | greenwood | 1 | 1 | – | win | 10 | 496 | 6 | 230 | 51 | 10 |
| 3 | greenwood | 2 | 2 | – | win | 10 | 774 | 7 | 240 | 72 | 16 |
| 4 | greenwood | 3 | 3 | elite | win | 10 | 1065 | 8 | 250 | 80 | 10 |
| 5 | greenwood | 4 | 4 | – | win | 10 | 1200 | 10 | 270 | 122 | 22 |
| 6 | tower | 5 | 5 | – | win | 10 | 1440 | 11 | 280 | 130 | 22 |
| 7 | tower | 6 | 6 | – | win | 10 | 1736 | 12 | 371 | 154 | 12 |
| 8 | tower | 7 | 7 | – | win | 10 | 1920 | 13 | 402 | 142 | 32 |

Notes:
- Battle 1, my very first fight at level 1, lost at wave 9/10 — and I still got the floor on
  the next try at level 6. So the opening loss is a level problem, not a code problem. That
  taught me (the lazy player) exactly the wrong lesson, and it taught it in the first 30 seconds:
  **"when you lose, come back with more levels."** The game confirmed my prior immediately.
- `POST /me/class {"classId":"warrior"}` after floor 1. Got `w_power_strike` and
  `w_whirlwind` as skills. My program never calls a skill, so they are decoration.
- Clearing a floor credits that floor in **every** region whose range contains it — clearing
  floor 4 in greenwood immediately gave me isles depth 2 and ruins depth 1. Regions are
  parallel skins over one floor ladder, not separate tracks.
- Gear: I take the obvious upgrade each time (highest rarity / biggest number for a warrior).

### Battle 9 — first real loss: tower depth 8 (floor 8)

- `POST /world/tower/enter {"depth":8}` → floor 8, no elite, no duel
- `POST /world/tower/fight` → `victory: false, wavesCleared: 8`
- Level 14 at the end (a loss still pays full-ish exp: **1728**), HP 387, ATK 150, DEF 45

Also: `enter {"depth":9}` and `{"depth":10}` are refused —
`400 "หอคอย" เข้าได้เฉพาะรอบที่ 1 ถึง 8 เท่านั้น` — even though `GET /world` advertises
`tower` as `depths: 10, floorRange: [1,10]`. The cap is `maxDepthAllowed = depthCleared + 1`,
which is sane, but the listed `depths: 10` next to a hard 400 at 9 is a mixed message.

### Floors 8 and 9 — the pattern that made me confident grinding works

I did exactly what my persona says: lost, went back to the last cleared floor, farmed, came back.

| # | what | result | waves | level after |
|---|------|--------|-------|-------------|
| 9 | tower d8 (floor 8) | LOSS | 8/10 | 14 |
| 10 | tower d8 (floor 8) | LOSS | 7/10 | 14 |
| 11 | farm tower d7 (floor 7, already cleared) | LOSS | 6/10 | 15 |
| 12 | farm tower d7 | win | 10 | 16 |
| 13 | tower d8 (floor 8) | **WIN** | 10/10 | 16 |
| 14 | tower d9 (floor 9) | LOSS | 6/10 | 17 |
| 15–17 | farm tower d8 ×3 | win ×3 | 10 | 19 |
| 18 | tower d9 (floor 9) | **WIN** | 10/10 | 19 |
| 19 | tower d10 (floor 10) | LOSS | 8/10 | 20 |

Two data points, same shape: lose a floor, farm **2 levels**, win the floor.
Two levels. That is about three battles. Nothing about my program changed.

**Important structural thing I noticed here.** By the time I cleared floor 8, `GET /world`
said `isles` and `ruins` were both `completed: true` — I had never entered either region.
Clearing a floor credits it in every region whose `floorRange` contains it, so:

- greenwood 1–4, isles 3–7, ruins 4–8, frostland 5–9, volcano 6–10, tower 1–10

is really one ladder of 10 floors wearing six coats of paint. After floor 9, five of the six
regions were `completed`, and the only content left anywhere on the map was **floor 10**
(tower d10 / volcano d5). The "map" is not a map. It is a progress bar with hotspots on it.

**Also: losing pays almost as well as winning.** Floor 8 win = 2203 exp; floor 8 loss = 1728 exp.
Floor 10 loss = 2175 exp. I level up *from failing*. For a lazy player this is the single most
important fact in the game: **failure is a farming method**. There is no cost to throwing myself
at a wall except the seconds it takes, and I get most of the reward either way.

### Battle 23 — floor 10 cleared. The game is over.

| # | what | result | waves | level after |
|---|------|--------|-------|-------------|
| 20 | farm tower d9 | win | 10 | 21 |
| 21 | farm tower d9 | LOSS | 9/10 | 21 |
| 22 | farm tower d9 | win | 10 | 22 |
| 23 | tower d10 (floor 10) | **WIN** | 10/10 | 22 |

`GET /world` right after:

```
tower      [1,10]  cleared 10  completed true
greenwood  [1, 4]  cleared  4  completed true
isles      [3, 7]  cleared  5  completed true
ruins      [4, 8]  cleared  5  completed true
frostland  [5, 9]  cleared  5  completed true
volcano    [6,10]  cleared  5  completed true
haven      [1, 0]  cleared  0  completed true
highestFloorCleared: 10
```

**Every region on the map is `completed: true`, at level 22, in 23 battles, with a program
I wrote before I had seen a single monster and never touched again.**

There is nothing past floor 10:

- `POST /world/tower/enter {"depth":11}` → `400 "หอคอย" เข้าได้เฉพาะรอบที่ 1 ถึง 10 เท่านั้น`
- `POST /world/volcano/enter {"depth":6}` → `400 "ภูเขาไฟ" เข้าได้เฉพาะรอบที่ 1 ถึง 5 เท่านั้น`
- `POST /tower/challenge {"floor":11}` → `400 ท้าทายได้เฉพาะชั้น 1 ถึง 10 เท่านั้น`

### Battles 24–27 — I went and actually visited the four regions I had "completed" without entering

I had never set foot in isles, ruins, frostland or volcano. They completed themselves when the
floors under them got cleared in the tower. So I went and played them, same program, no changes:

| # | region | depth | floor | result | waves | exp | level |
|---|--------|-------|-------|--------|-------|-----|-------|
| 24 | volcano | 5 | 10 | **WIN first try** | 10/10 | 2900 | 23 |
| 25 | frostland | 5 | 9 | **WIN first try** | 10/10 | 2640 | 23 |
| 26 | ruins | 5 | 8 | **WIN first try** | 10/10 | 2304 | 24 |
| 27 | isles | 5 | 7 | **WIN first try** | 10/10 | 1984 | 24 |

Four regions, their hardest depth, first attempt each, zero losses, no code change.

Volcano's own `lessonTh` says, in its own words, that `deadliest(enemies)` there is
*"ไม่ใช่ทางเลือก แต่เป็นเงื่อนไขผ่าน"* — not an option, a pass condition. I cleared volcano's
top floor on the first try with `weakest(enemies)`, the exact opposite target.
Tower's lesson says a lazy `weakest()` player "จะโดนมันทุบทั้งเวฟ". I did not.

---

## State at the moment the map was 100% complete (after battle 27)

```
level 24   class warrior   highestFloorCleared 10
STR 90  INT 4  VIT 15  AGI 15  LUK 16
HP 564  MP 88  ATK 322  MATK 15  DEF 72  MDEF 9.5  SPD 32.5  CRIT 23.4%
gold 36,953   materials 508   (never spent a single one — never called /upgrade)

weapon     ดาบ        epic  +0  atk 35  [crit_rate 6, matk_pct 3, def_pct 15, atk_pct 9]
armor      เกราะเหล็ก  uncommon +0 def 26 [atk_pct 4]
helmet     หมวกเหล็ก   epic  +0  def 19  [hp_pct 20, def_pct 5, drop_bonus 6, atk_pct 13]
accessory  แหวน        rare  +0  atk 12  [lifesteal 2, atk_pct 13, crit_rate 6]
```

`GET /program` at the end, byte for byte what I set before battle 1:

```python
def turn():
    attack(weakest(enemies))
```

Totals at map completion: **27 battles, 7 losses, 20 wins, level 1 → 24, floor 10/10, map 100% complete.**
(I kept farming afterwards purely as a stability check — see the section below. Grand total 40 battles, level 29.)

---

## What I think, as the player who did not think

**I never hit the wall.** My stop condition was "farmed 10 levels and still stuck." The most I
ever had to farm at one spot was **2 levels** (≈3 battles), and that happened exactly three
times: floor 8, floor 9, floor 10. That is not a wall, that is a speed bump, and it is the same
speed bump three times in a row.

**Where progress stopped feeling like progress:** around floor 6. By then I knew the loop —
enter, fight, if it says `victory:false` go back one floor and run it twice, come back, win.
Floors 7 through 10 were not decisions, they were the same button pressed eleven more times.
I was never once curious about what the enemies were, and the game never gave me a reason to be.

**The three things that make grinding strictly correct here:**

1. **Losing pays.** Floor 10 loss = 2175 exp; floor 8 win = 2203 exp. Failing a hard floor pays
   better than clearing an easy one. There is no death penalty, no gold loss, no durability,
   no cooldown. The optimal lazy strategy is to throw yourself at the highest floor you can
   `enter` and let the loss exp carry you until you happen to win — which is nearly what I did.
2. **Two levels is always enough.** Every wall fell to +2 levels. If the intent was that the
   wall is a lesson, the lesson is priced at about 90 seconds of farming.
3. **The map is one ladder.** Six regions, but clearing floor N clears depth N in all of them.
   The four regions with the sharpest lessons (isles/ruins/frostland/volcano) auto-completed
   for me before I ever entered them. A lazy player would never even see those lessons fire.

**Honest answer to H1: false.** A player who cannot be bothered to think finishes this game.
Not "gets far" — finishes it, clears every region, with one line of code and 27 battles.

---

## Extra: 13 more battles after the game was already over (stability / long-play check)

Battle 28 was an API edge-case check (`enter d10`, then `enter d3` without fighting, then
`fight`) — the second `enter` correctly replaces the first and the fight ran floor 3. Not a bug.

Battles 29–40: twelve straight runs of tower d10 (floor 10), same unchanged program.

```
12 / 12 victories, 10/10 waves every time, no elite, no duel
exp per run drifted 2816 → 2728 as my level rose above the floor
level 24 → 29,  ATK 322 → 385,  HP 564 → 697,  gold 61,976,  materials 761
inventory 178 items
```

Nothing broke, nothing drifted wrong. The endgame floor is now a 100% farm.

**Final totals: 40 battles, 33 wins, 7 losses, level 1 → 29, floor 10/10, all regions complete,
program edited zero times.**

---

## Things that looked wrong / worth a ticket

1. **Losing is profitable.** Not a small amount — a *loss* on floor 8 paid 1728 exp while a
   *win* on floor 8 paid 2203, and a loss on floor 10 paid 2175. No death penalty, no gold loss,
   no cooldown. For the lazy player this removes the only pressure the game had. Requests:
   `POST /world/tower/fight` → `{"result":{"victory":false,"wavesCleared":8,...,"expGained":1728}}`.
2. **Regions credit each other's floors, so four of six regions completed themselves.**
   After clearing floor 9 in the tower, `GET /world` reported `isles`, `ruins`, `frostland`
   `completed: true` with `depthCleared: 5` — I had never sent a single `enter` to any of them.
   Every region's distinct lesson is therefore optional content on the critical path.
3. **The only region on the critical path has `eliteChance: 0`.** Tower covers floors 1–10
   by itself, so a player who goes up the tower meets elites essentially never. Across 40
   `enter` calls I got **one** elite (greenwood d3, battle 4).
4. **`duel` was `null` in all 40 `enter` responses.** The duel feature never once fired in a
   complete playthrough. `playersHere` was 0 on every region the whole time, so I assume duels
   need a second live player — but from inside a normal single-player run the feature does not
   exist.
5. **Same floor, higher level, worse result — variance is large.** I cleared floor 7 first try
   at level 13 (10/10 waves), then **lost** floor 7 at level 14 at wave 6 (battle 11). Same for
   floor 9: cleared at 19, lost at 21 (battle 21, wave 9). A loss at a floor you already beat,
   at a higher level, reads as the game being broken rather than as randomness.
6. **`depths` in `GET /world` does not match what `enter` accepts.** `tower` advertises
   `depths: 10` / `floorRange: [1,10]` while `enter {"depth":9}` returns
   `400 "หอคอย" เข้าได้เฉพาะรอบที่ 1 ถึง 8 เท่านั้น`. The error quotes the *current* cap,
   not the region's real range, which makes it read like the region only has 8 depths.
7. **Nothing ever needs spending.** I finished with 61,976 gold and 761 materials and never
   called `/upgrade` or `/salvage` once. The upgrade system is entirely skippable.
8. **Inventory has no cap and no pressure to manage it** — 178 items after 40 battles
   (≈4.4 per battle). At a few hundred battles this is thousands of rows per player.
9. **Cosmetic:** `mdef` comes back fractional (`9.5`, `7`, `5.5`) while every other derived
   stat is an integer.
10. **Skills are dead weight for this build.** `GET /program` lists `w_power_strike`,
    `w_whirlwind`, `w_execute` and unlocked language features `for`, `elif`, `boolop`,
    `variable`, `string`, `if_else`. I used none of them and finished the game.

---

## Verdict — H1 is false

The control group finished the game.

`attack(weakest(enemies))`, written once before I had seen a monster, cleared all ten floors
and all six regions. The hardest moment in the whole run was needing **two extra levels**,
three times. The strongest region lesson in the game — volcano's, which says in its own text
that `deadliest()` there is a pass condition, not an option — I beat on the first try with the
opposite target, at its top floor.

Progress stopped feeling like progress at **floor 6**, where I understood the loop completely
and the remaining floors were the same input repeated. From floor 6 to the end of the game I
made no decisions. Not "made bad decisions" — made none, and nothing in the game asked me to.
