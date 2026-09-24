# Playtest log — persona 3.2 `diligent`

Account `diligent` (character id 3), created level 1 novice, clean DB.
Rules I held to: HTTP API only, no DB, no gamedata edits, no `tune.cjs`, no engine source.
I *did* read `docs/bloxcode-language.md` (allowed for this persona) and the zone `lessonTh` strings.

Base character at registration:
`level 1 novice · str6 int4 vit7 agi4 luk4 · maxHp 144 maxMp 42 atk 17 matk 15 def 7 mdef 5.5 speed 16`

## Zone lessons (from `GET /world`), translated for my own use

| region | floors | lesson (paraphrase) |
|---|---|---|
| tower 1-10 | ladder | from floor 2 up every wave has a fat, hard-hitting monster `weakest()` will never pick. Use `deadliest(enemies)` |
| greenwood 1-4 | start | nothing one-shots you, but they come in numbers. Every turn you `defend()` is one more enemy still alive hitting you. Thin them out first |
| isles 3-7 | | monsters here are faster than you, they act first, so `me.hp_pct < 20` is too late — react while still above half |
| ruins 4-8 | | every wave has a dark mage: weak fist, heavy spell, so `deadliest()` (which reads `atk`) will not pick it. It is the lowest-HP thing in the wave → `weakest(enemies)` is the right target here |
| frostland 5-9 | | everything is slow and fat. You act first almost every turn, but AoE will not kill anything — focus one at a time; fewer enemies = damage you do not take |
| volcano 6-10 | | the stone giant hits harder than the rest of the wave combined. `deadliest(enemies)` here is not an option, it is the pass condition |

Note the two lessons are in direct opposition: ruins says `weakest`, tower/volcano say `deadliest`.
That is the interesting part of the curriculum — one program cannot be right everywhere unless it
*chooses* per wave. That is my design goal: one program that infers the wave type.

---

## Running log

### Session 1 — greenwood (floors 1–4)

**B1. greenwood d1, program v1 (the stock program), entered at level 1 — LOST at wave 8/10.**

```python
def turn():
    attack(weakest(enemies))
```

Log: wolves/slimes/goblins doing 1–5 damage a hit, me doing 13–16. Pure attrition over 8 waves.
Nothing to fix in the code — at level 1 with atk 17 vs 33 HP monsters I simply could not out-damage
three of them at once.

**First real finding, and it is a big one: a loss pays full EXP.** `expGained: 352`, and the
character came out of that loss at **level 4** (from 1). Also `drops` was paid in full:
242 gold, 13 materials, 2 items. So "losing" is a farming action. This bounds how different
`lazy` and `diligent` can ever be — you cannot choose to stay low level, the game levels you
for failing.

**B2. greenwood d1, same program v1, entered at level 4 — WON, 10/10 waves.** Floor 1 cleared.
The only thing that changed between B1 and B2 was three levels I did not ask for.

**Class choice: `warrior`.** Reasoning written down before I looked at any result:
- `frostland` says outright that AoE "will not kill anything here" → the mage's headline
  advantage is explicitly nerfed in one sixth of the map.
- `isles` says monsters act before you → being fragile (mage, vit 4) or slow (guardian, agi 3)
  is punished in another sixth.
- `tower`, `volcano`, `ruins` and `greenwood` all reduce to "pick the right single target and
  delete it fast" → STR.
Warrior: str 8 / vit 6 / agi 5 is the only class none of the six lessons argues against.

*Complaint about that screen:* `GET /gamedata` only returns the skill list **for the class you
already are**. At the moment of choosing I could see `growthHint` and `baseStats` and nothing
else — I could not see that warrior gets exactly two skills (`w_power_strike` lv1,
`w_whirlwind` lv5) until after I had committed. Choosing a class is irreversible-looking and
the game hides the thing that actually decides it.

**B3. greenwood d2 (floor 2), v1, entered level 5 — WON.** Took 57 damage out of 238 HP.
**B4. greenwood d3 (floor 3), v1, entered level 7 — WON.** Took 84 damage out of ~250 HP.

**B5. greenwood d4 (floor 4) — deliberate H3 experiment. Program v2, written to VIOLATE the
greenwood lesson as hard as I could:**

```python
def turn():
    if me.hp_pct < 90:
        defend()
    else:
        attack(weakest(enemies))
```

Result: **LOST**, but it cleared 9 of 10 waves first. Per-wave action counts:

```
wave 1 {'attack': 2}   wave 6 {'attack': 3}
wave 2 {'attack': 2}   wave 7 {'attack': 3}
wave 3 {'attack': 3}   wave 8 {'attack': 3}
wave 4 {'attack': 3}   wave 9 {'attack': 4}
wave 5 {'attack': 3}   wave 10 {'attack': 2, 'defend': 61}
```

Two things fell out of this that the lessons never mention:
1. **HP is restored between waves.** Player HP at each wave start: 261, 269, 263, 264, 263,
   263, 255, 254, 249 out of ~270. So `me.hp_pct < 90` never fired during the trash waves —
   the program behaved exactly like v1 for 9 waves. The regen is why the "defend" branch was
   never reached, not my code.
2. It died on the **boss wave**, against a **single** enemy (จ่าฝูงหมาป่า, 170 HP), by defending
   61 turns in a row while the boss chipped 4–6 per hit. The engine happily simulated 61
   consecutive `defend()` turns and let me die of it; there is no stall detection.

So for greenwood the lesson text is *true* but it is **not the thing that kills you**. The
lesson talks about many enemies at once; the only thing that can actually kill you there is a
one-enemy boss wave. See the H3 verdict section.

**B6. greenwood d4 again, program v3, entered level 9 — WON, 10/10.**

```python
def turn():
    if count(enemies) == 1:
        cast("power_strike", deadliest(enemies))
    else:
        attack(weakest(enemies))
```

Reasoning: at level 9 I one-shot every greenwood trash mob (one attack per kill in the v2 log),
so spending MP there is waste; the only wave where damage-per-turn matters is the boss, and
`count(enemies) == 1` is a cheap way to say "this is the boss". Power strike hit for 144/153
versus ~75 for a plain attack — worth 8 MP.

*Small positive:* I wrote `cast("power_strike", ...)` instead of the catalog id
`w_power_strike`, half expecting a warning. The engine resolved it to `w_power_strike` anyway
(log shows `skillId: "w_power_strike"`) and produced **no** `codeWarnings`. Forgiving, good.
(Both spellings also pass `PUT /program`.)

### Structural finding: regions share one global floor counter

After clearing greenwood depth 4 (= floor 4), `GET /world` returned:

```
tower     cleared 4  max 5  unlocked True
greenwood cleared 4  max 4  unlocked True
isles     cleared 2  max 3  unlocked True
ruins     cleared 1  max 2  unlocked True
frostland cleared 0  max 1  unlocked True
volcano   cleared 0  max 0  unlocked False
```

I had never set foot in the isles, the ruins or the tower. `depthCleared` is computed from
`highestFloorCleared - floorBase + 1`. **Clearing floor N anywhere marks floor N cleared
everywhere.** This is the single biggest threat to H3: a player can clear the whole map through
whichever region is softest at each floor number and never meet four of the six lessons.
I am going to fight each region on its own anyway, because that is the thing being measured,
but a real player optimising would not.


### Session 2 — isles (floors 5–7), program v3 unchanged

I read the isles lesson ("everything is faster than you, `me.hp_pct < 20` comes too late, plan
from above half HP") and then **deliberately did not act on it**, because I wanted to know
whether it was load-bearing before I spent code on it. Program v3 has no HP condition at all.

- **B7. isles d3 (floor 5), entered level 10 — WON.** 214 damage taken of 318 HP.
- **B8. isles d4 (floor 6), entered level 11 — WON.** 355 damage taken of ~350 HP + wave regen.
- **B9. isles d5 (floor 7), entered level 12 — WON**, elite หมาป่า EX in wave 5. 365 damage taken.

Isles complete, 5/5, with a program that never once looks at `me.hp_pct`. The lesson is true
about the *mechanic* — harpies (93 HP) out-damage wolves (84 HP) and `weakest()` leaves them
for last, and I was never the first to act — but it is not a *requirement*. Nothing I could
have written at `hp_pct > 50` would have helped anyway: a warrior has no heal, no shield and no
escape, so the only "early reaction" available is `defend()`, which the greenwood lesson tells
you never to do. The isles lesson names a problem the warrior kit cannot answer.

### Session 3 — ruins (floor 8): the one lesson that was real

**B10. ruins d5 (floor 8), program v5, entered level 13 — LOST at wave 5/10.**
v5 deliberately violates the ruins lesson: it targets `deadliest` (the tower/volcano advice).

```python
def turn():
    if count(enemies) == 1:
        cast("power_strike", deadliest(enemies))
    else:
        attack(deadliest(enemies))
```

Damage taken by source over 4.5 waves:

```
เมจมืด (dark mage)  442
โกเลม  (golem)       81
โครงกระดูก (skeleton) 53
```

The dark mage did **more than three times** everything else put together, and I never once hit
one, because `deadliest()` reads `atk` and the mage's damage is `mon_dark_bolt` (magic).
Wave HP: mage 95, skeleton 125, golem 197 — the mage is always the lowest-HP body in the wave,
exactly as the lesson says. Death log: `mon_dark_bolt` for 20, 18, 19 on consecutive turns
while I was busy killing a golem.

**This is the single strongest H3 result of my run**, and the reason is worth spelling out:
the language exposes `hp` `hp_pct` `level` `atk` `speed` on an enemy and **nothing about its
magic attack**. There is no expression I could have written that discovers the dark mage is
dangerous. The only signal in the whole game is the `lessonTh` string. The lesson is not
flavour, it is the missing API field.

**B11. ruins d5, program v6, entered level 14 — WON, 10/10.**

```python
def turn():
    if count(enemies) == 1:
        cast("power_strike", deadliest(enemies))
        attack(deadliest(enemies))
    elif weakest(enemies).hp <= me.atk:
        attack(weakest(enemies))
    else:
        cast("power_strike", deadliest(enemies))
        attack(deadliest(enemies))
```

Reasoning: I did not want to hard-code "in the ruins, hit the weakest". I wanted a rule that is
*true everywhere*: **anything I can kill in one action, kill now — a corpse deals no damage.**
`weakest(enemies).hp <= me.atk` is that rule; in the ruins it happens to name the dark mage
(95 HP vs my atk 128), in the volcano it will not fire on a 234 HP giant. Result: dark mage
damage dropped from 442 in four waves to 242 across ten.

I also learned the MP-cascade idiom here, and it is the nicest thing in the language:

```python
    cast("power_strike", d)
    attack(d)
```

A `cast` with insufficient MP is skipped **without consuming the turn**, so the `attack` below
it fires instead; a `cast` that succeeds ends the turn and the `attack` is ignored. Two lines
give you "use the skill if you can afford it, otherwise swing". The in-battle warning is also
exactly right: `MP ไม่พอสำหรับ 'whirlwind' (ต้องใช้ 15 MP มี 13 MP) — ข้ามคำสั่งนี้ (ไม่เสียเทิร์น)`.

### Session 4 — frostland (floor 9): the lesson is factually wrong

**B12. frostland d5 (floor 9), program v7, entered level 15 — WON, 10/10, in 26 turns.**
v7 was written to violate the frostland lesson, which says *"สกิลวงกว้างจะไม่ฆ่าใครเลยสักตัว"* —
"an area skill will not kill a single one of them here."

```python
def turn():
    if count(enemies) >= 2:
        cast("whirlwind", enemies)
        attack(deadliest(enemies))
    else:
        cast("power_strike", deadliest(enemies))
        attack(deadliest(enemies))
```

Damage breakdown:

```
w_whirlwind    6737   (20 casts)
attack          452
w_power_strike  420
total kills      27   over 26 turns
damage taken    508   (my best ratio of the whole run)
```

Whirlwind hit each golem for 115–182; a golem has 214 HP, so **two casts kill the entire wave
at once**. It was the fastest clear I recorded anywhere and it took less damage than the ruins
run. The lesson does not merely fail to be necessary — **following it would have made me worse.**

### Session 5 — volcano (floor 10): the only real wall, and what actually broke it

**B13. volcano d5 (floor 10), program v8, entered level 16 — LOST at wave 5/10.**
v8 targets `weakest` only, i.e. the exact thing the volcano lesson forbids.

```python
def turn():
    cast("power_strike", weakest(enemies))
    attack(weakest(enemies))
```

```
ยักษ์หิน (stone giant, 234 HP)  524 damage
ออร์ค  (orc, 159 HP)            117
โกเลม                            23
```

The lesson claims the giant "hits harder than the rest of the wave combined" — measured:
524 vs 140. Literally true. `weakest()` picks the 159 HP orc over the 234 HP giant every time,
so the giant lived through whole waves hitting for 77–80.

**B14. volcano d5, program v9 (`deadliest` everywhere), entered level 16 — LOST at wave 6/10.**

```python
def turn():
    cast("power_strike", deadliest(enemies))
    attack(deadliest(enemies))
```

Better (wave 5 → wave 6) and giant damage fell 524 → 441, but still dead. Reading the log told
me why, and it was a single number: **power strike did 232 into a 234 HP giant.** Two HP short
of a one-shot, every time, so every giant got a second turn.

I also measured the thing no lesson mentions: **between-wave HP regen is tiny at this depth.**
Player HP at each wave start in that run: 381, 296, 268, 157, 53, 51 out of 408. In frostland
the same regen kept me at 319–388 all run. So a deep floor is one long HP budget, not ten
separate fights — which is why "kill it one turn sooner" is worth more than any defensive line.

**B15. volcano d5, program v10, entered level 16 — LOST at wave 5/10.** *This revision did not help.*

```python
def turn():
    if count(enemies) >= 2:
        cast("whirlwind", enemies)
    cast("power_strike", deadliest(enemies))
    attack(deadliest(enemies))
```

Reasoning at the time: frostland had just shown me AoE is enormous, so sweep the crowd.
It went *backwards* (wave 6 → wave 5). Working it out afterwards from the log: against a wave
of N giants, whirlwind and power strike take the same number of turns, because whirlwind
spreads ~125 over everything and a giant needs 234 — so it removes **zero** attackers on turn 1,
while power strike removes one attacker per turn. Total giant-attacks taken is identical
(3+3 vs 3+2+1 = 6), but whirlwind costs 15 MP instead of 8 and ran me dry. AoE is only better
when the sweep actually kills, i.e. when the wave is *wide and soft* (frostland trash after one
sweep) — not when it is *narrow and fat*. That distinction is the real lesson of these two
regions, and neither `lessonTh` says it.

**Then I stopped writing code and looked at my character sheet, and found the actual problem.**

I was level 17 and still wearing the **floor-1 magic staff** (`matk 11`), floor-1 plate
(`def 8`) and a floor-1 crown (`mdef 6`), while 44 unused items sat in my bag, including a
floor-10 rare sword with `atk 38`. Nothing in the game had ever told me to look. Equipping the
best of each slot and spending the gold/materials I had been accumulating for nineteen levels:

```
before:  atk 128   maxHp 374   def 21
after equip:  atk 178   maxHp 496   def 56
after +8 on the sword (salvaged 36 junk items for materials):  atk 202 → later 226
```

**B16. volcano d5, program v11, entered level 17 — WON, 10/10.** 388 damage taken.

```python
def turn():
    d = deadliest(enemies)
    if count(enemies) >= 3 and d.hp > 300:
        cast("whirlwind", enemies)
    cast("power_strike", d)
    attack(d)
```

Power strike now hits for 325–348 — over the 234 HP one-shot line. The `whirlwind` branch never
fired once (no volcano enemy has >300 HP), so the win was `deadliest` + one-shot + gear.

Note the hard-coded `300`. I wanted to write `d.hp > me.atk * 1.5`, which is what I actually
mean. **Arithmetic is locked until floor 13 and floor 10 is the last floor in the game** (see
below), so the honest expression of my own rule is permanently unavailable and I had to bake in
a magic number that goes stale every time I upgrade a weapon.

**B17. volcano d5, program v12 (`weakest` only, but with the good gear), entered level 18 — WON.**
This is the controlled test for the volcano lesson, and the answer is uncomfortable:

```python
def turn():
    w = weakest(enemies)
    cast("power_strike", w)
    attack(w)
```

| program | gear | result | damage taken |
|---|---|---|---|
| v8 `weakest` | old (atk ~170) | lost, wave 5 | 664 |
| v9 `deadliest` | old | lost, wave 6 | 803 over 6 waves |
| v11 `deadliest` | new (atk 202) | **won** | 388 |
| v12 `weakest` | new | **won** | 677 |

So `deadliest` cuts damage taken by 43% and is clearly the better code — but it is **not** the
pass condition the lesson claims it is. Gear was.

### Session 6 — the tower, which I had already cleared without entering

**B18. tower d10 (floor 10), program v12 (`weakest`), entered level 19 — WON**, 269 damage taken.

The tower's lesson says: *"from floor 2 up, **every** wave has a fat, hard-hitting monster that
`weakest()` will never pick… try `deadliest(enemies)`."* Floor 10 wave rosters, from the log:

```
w1 orc 159 / harpy 123          w6 skeleton 147 / skeleton 147 / harpy 123
w2 brute 234 / wolf 111         w7 orc 159 / slime 123 / lich 135 / orc 159
w3 orc 159 / slime 123          w8 orc 159 / golem 234 / slime 123
w4 skeleton 147 / golem 234 / lich 135   w9 skeleton 147 / slime 123 / goblin 111
w5 orc 159 / slime 123 / goblin 111      w10 BOSS 1051 / brute 234
```

Waves 1, 3, 5, 6 and 9 contain no fat monster at all, so "every wave" is false. Worse, the
biggest damage source in the whole run was **ลิช (Lich, 135 HP, 133 damage)** — the low-HP
caster pattern again, the one `deadliest()` specifically refuses to target. On this floor the
tower's own advice is the *wrong* advice and `weakest()` is right.

### Content ceiling and dead syntax

```
POST /tower/challenge {"floor": 11} → {"error":"ท้าทายได้เฉพาะชั้น 1 ถึง 10 เท่านั้น"}
(same for 13, 15)
```

Floor 10 is the top of the game. The language unlock table therefore ends like this:

| unlock floor | feature | reachable? |
|---|---|---|
| 8 | variables | yes |
| 10 | `for x in enemies:` | yes — **on the last floor of the game** |
| 13 | `+ - * /`, `len()` | **never** |

`PUT /program` with `me.atk * 2` returns
`LockedFeatureError — การคำนวณ + - * / และ len() ยังไม่ปลดล็อก — ต้องผ่านชั้น 13 ก่อน`
— an error that instructs the player to do something the server will refuse.
And `for` arrives with exactly one floor left to use it on.

### The one-line control, run by me at the end

**B19. volcano d5 (floor 10), `def turn(): attack(weakest(enemies))`, level 19 — WON**,
840 damage taken, finished at 143/533 HP, no skills, no MP, no conditions.
The final floor of the game is clearable with the stock one-liner once you are level 19 and
wearing gear you already own.


---

## Result table

Map **completed** — `GET /world` returns `completed: true` for all seven regions,
`highestFloorCleared: 10`. Finished at **level 20**, **19 world battles**, 6 of them losses.

| region | depth cleared | floor | my level entering the clearing run | battles spent in that region |
|---|---|---|---|---|
| greenwood | 4 / 4 | 4 | **9** | 6 (2 losses) |
| isles | 5 / 5 | 7 | **12** | 3 (0 losses) |
| ruins | 5 / 5 | 8 | **14** | 2 (1 loss) |
| frostland | 5 / 5 | 9 | **15** | 1 (0 losses) |
| volcano | 5 / 5 | 10 | **17** | 6 (3 losses) |
| tower | 10 / 10 | 10 | **19** | 1 (0 losses) — already marked complete before I entered |
| haven | n/a | — | — | 0 |

Levels are **at the moment of entering**, from `GET /me` immediately before `POST .../enter`.

Two caveats the PM should apply when comparing me to `lazy`:
1. **A loss pays full EXP, gold and drops.** My level-1 loss in greenwood paid 352 EXP and
   took me to level 4 in one battle. Six losses across the run are six unavoidable farming
   sessions. Neither player can choose to stay low level.
2. **I never farmed a cleared floor once.** Every one of my 19 battles was on the deepest
   content available to me. If my level still tracks `lazy`'s closely, it is because the game
   levels you for failing, not because I ground.

## H3 — was each zone's lesson necessary? One verdict per zone

| zone | lesson necessary? | evidence |
|---|---|---|
| **greenwood** | **No** | I cleared d1–d3 with the stock one-liner and d4 with v3. The deliberate violation (v2, `defend()` below 90% HP) still cleared 9 of 10 waves, because between-wave regen kept me above the threshold the whole time; it died on the **boss wave**, to a **single** enemy — the opposite of the "they come in numbers" scenario the lesson describes. The lesson's advice is correct but it is not what the zone tests. |
| **isles** | **No** | All 5 depths cleared with v3, a program containing no HP condition of any kind. The lesson's premise is accurate (harpies act first, and at 93 HP `weakest()` leaves them for last), but the warrior kit contains no early-reaction tool other than `defend()`, which greenwood forbids. The zone asks for a move the class cannot make. |
| **ruins** | **YES — the strongest yes in the game** | v5 (`deadliest`) died at wave 5/10 with the dark mage responsible for 442 of 576 damage taken; v6 (kill anything at or below `me.atk` HP → the mage) cleared 10/10 with mage damage down to 242 over twice as many waves. Decisive, because **enemy magic attack is not exposed to the program at all** (`hp hp_pct level atk speed` only) — the lesson is the only channel through which that information reaches the player. |
| **frostland** | **No, and it is wrong** | The lesson says an AoE "will not kill a single one of them here". I cleared 10/10 in 26 turns with whirlwind doing 6737 of 7609 damage and 27 kills, taking 508 damage — my best run of the game. Obeying this lesson makes you strictly worse. |
| **volcano** | **Partly — true at the intended power level, false once geared** | At atk ~170: `weakest` died wave 5, `deadliest` died wave 6 (giant = 524 of 664 damage taken, i.e. "harder than the rest combined" is literally true). At atk 202: `deadliest` won taking 388, `weakest` also **won** taking 677. So it is a 43% damage reduction and the correct code — but calling it "the pass condition" is only true in a window. |
| **tower** | **No, and it is wrong at floor 10** | "Every wave from floor 2 has a fat monster `weakest()` never picks" — 5 of 10 waves on floor 10 contain no such monster, and the top damage dealer was the 135 HP **Lich**, which `deadliest()` is guaranteed never to target. I cleared floor 10 with `weakest` taking 269 damage. |
| **haven** | n/a | Correct: `depths: 0`, no combat, nothing to test. |

**Score: 1 clearly necessary (ruins), 1 partly (volcano), 2 unnecessary (greenwood, isles),
2 actively misleading (frostland, tower).**

### The structural problem behind that score

`depthCleared` for every region is derived from the single global `highestFloorCleared`.
I cleared **tower 10/10 and greenwood 4/4 and frostland 1–4 without ever entering them.**
A player who never reads a lesson can take the softest region at each floor number and the map
will mark itself complete. As long as "the curriculum" is a set of strings attached to regions
that share one progression counter, four sixths of it is optional by construction.

## Bugs and things that are wrong

**1. `attack(me)` damages the opponent.** Found in the duel attached to my ruins d5 run
(`POST /world/ruins/fight`, `result.duel`). The opponent's stored program is verbatim:

```python
def turn():
    attack(me)
```

and the duel log records:

```json
{"actorId":"s57","actorName":"newbie","action":"attack",
 "targets":[{"id":"u3","name":"diligent","damage":123,"crit":false,"hpAfter":438}],"line":2}
```

`attack(me)` hit **me**, for 123, twice, with no `codeWarnings`. Either a self-target is
silently coerced to an enemy or it falls through to the auto-fallback without saying so. A
beginner who writes `attack(me)` gets a working program and learns the wrong meaning of `me`.

**2. `LockedFeatureError` points at a floor that does not exist.**
`PUT /program` with `me.atk * 2` → `การคำนวณ + - * / และ len() ยังไม่ปลดล็อก — ต้องผ่านชั้น 13 ก่อน`,
while `POST /tower/challenge {"floor":11}` → `ท้าทายได้เฉพาะชั้น 1 ถึง 10 เท่านั้น`.
Arithmetic and `len()` are unreachable content; `for` unlocks on the final floor.
Consequence in play: the only way to express "can I one-shot this?" is a literal
(`d.hp > 300`) that is wrong again the moment you upgrade a weapon.

**3. The engine will simulate an unbounded stall.** Program v2 executed `defend()` for 61
consecutive turns against one boss and the battle ran to my death at turn 90. No stall
detection, no warning, no "your program has taken no offensive action in N turns".

**4. `POST /salvage` silently does nothing for the documented-looking single-item call.**
`{"itemId": "<uuid>"}` → `{"error":"ต้องระบุ itemIds เป็น array ของ id"}` (fine, clear), but
`POST /equip` and `POST /upgrade` both take `itemId` singular. Three sibling endpoints, two
shapes, no hint on the endpoint that differs. Minor, but I lost a loop to it.

**5. No skill information at the moment of class choice.** `GET /gamedata` returns `skills`
for the class you already are. Choosing between warrior / mage / guardian, the deciding
information (warrior has exactly 2 skills; mage's AoE is the thing frostland's lesson attacks)
is hidden until after the choice.

**6. Nothing in the game ever suggests equipping anything.** I reached floor 9 wearing a
floor-1 `matk` staff as a warrior with 44 unused items in the bag, including a floor-10
`atk 38` sword. The jump from equipping and upgrading what I already owned —
atk 128 → 202, HP 374 → 496, def 21 → 56 — was **larger than every program revision I made
combined**, and it cost zero battles. There is no "new item is better than equipped" flag in
`GET /inventory`.

**7. Between-wave HP regen is a major hidden mechanic.** It restores almost everything on low
floors (greenwood: 261→269→263… of 270) and almost nothing on high ones (volcano floor 10:
381→296→268→157→53). It decides whether a floor is ten fights or one long HP budget, and it
is the reason a defensive program looks fine for nine waves and then dies. It is not mentioned
in any lesson, in the language doc, or in any API response.

## Honest judgement: where did the game make me think?

**It made me think exactly twice.**

*The ruins.* Losing to the dark mage and having to work out from the log that the thing killing
me was the thing with the least HP — and then realising the language deliberately does not let
me see its magic attack, so the only expressible version of the idea is "kill whatever I can
kill this turn" — is a genuinely good puzzle. It has a wrong answer that feels right
(`deadliest`, which two other zones teach you), a readable trail of evidence in the combat log,
and a fix that generalises. That single zone is the proof that the concept works.

*The volcano at wave 6.* Reading `damage: 232` against `hpAfter: 2` on a 234 HP giant and
understanding that the entire fight hinged on a two-point shortfall was the best moment of the
run. But the resolution was **arithmetic, not programming** — I did not out-think it, I
out-geared it, and I proved that by re-clearing the same floor with the *forbidden* targeting
once my sword was +8.

**Everywhere else it was arithmetic.** Greenwood, isles and frostland fell to programs written
to violate their own lessons. The tower fell to the one-liner. The last floor of the game fell
to `attack(weakest(enemies))` at level 19. Four of the six lessons cost me nothing to ignore
and two of them would have cost me damage to obey.

The shape of the problem is not that the lessons are badly written — greenwood's and isles' are
observably true statements about their monsters. It is that **being right about a zone is not
rewarded and being wrong about it is not punished**, because (a) every region shares one floor
counter so you can route around any of them, (b) a loss pays full EXP so failing is farming,
and (c) equipment scales faster than any decision the language lets you express. The one zone
where the lesson mattered is the one zone where the lesson carries information the API
deliberately withholds. That is the design principle the rest of the map is missing.
