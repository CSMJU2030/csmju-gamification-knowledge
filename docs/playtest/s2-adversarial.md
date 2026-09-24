# S2 adversarial test — "branching logic is worth ≤1 level"

Claim under attack (from `engine/tools/progsearch.cjs` results): in every region cell the best
multi-line program beats the best one-liner by at most 1 level.
Win condition: a program that saves **≥2 levels** in at least one cell vs the per-cell best one-liner,
measured with `EVAL_FILE=... CLASS=... node tools/progsearch.cjs` (same seeds, same gear, same validator).

Running log, newest at the bottom. Written incrementally.

## 0. Setup notes (what the rules actually are)

- Feature unlocks in code (`spec.ts FEATURE_UNLOCK`) differ from the language doc table:
  if/else 1 · string 2 · elif 3 · and/or/not 4 · arithmetic 5 · variables 6 · for 8
  (unlocked when floor N is *cleared*, progsearch uses `floor - 1`).
  So volcano (floors 6-10) has and/or/not + arithmetic everywhere, variables from floor 7, `for` from floor 9.
  Ruins (floors 4-8) has and/or/not from floor 5, arithmetic from 6, variables from 7.
- Skill unlock levels gate the *whole program*: a program that mentions `cast("barrier", ...)`
  anywhere is rejected by the validator below lv6, so it cannot win below lv6 even if the branch never fires.
  warrior: power_strike 1, whirlwind 5, execute 10 · mage: firebolt 1, blizzard 4, heal 7 ·
  guardian: shield_bash 1, taunt 3, barrier 6.
- Combat facts that matter (from `battle.ts`, `evaluator.ts`, gamedata):
  - `cast()` with too little MP (or a skill you don't own) is **skipped without losing the turn**; the
    program keeps running, and if nothing else acts the engine does `attack(weakest(enemies))`.
    So every one-liner `cast(X, t)` is really "cast X at t if MP allows, else basic-attack the weakest".
    Also: statements after a `cast` still run → a flat list of `cast` lines is already a priority list.
  - Variables do **not** persist between turns (scope is per `runTurn`). Only observable state:
    own hp/mp, enemies' hp/atk/speed/level, `turn_no` (global round counter across all 10 waves),
    `has_buff("taunt"|"shield")`.
  - HP carries over between the 10 waves; only +15% HP/MP on wave clear. MP regen 5%/turn, +3 on basic attack.
  - Shields (`barrier`, 25% maxHp) **stack without cap and never expire** (Fighter.shield is never reset).
  - Taunt in solo = 30% damage reduction for 3 rounds (cast round + 2), 6 MP.
  - Heal = 30% maxHp, 18 MP. Mage regen at lv7 is ~9 MP/turn, so heal is nearly free for a mage.
  - `MAX_ROUNDS = 200` for the **whole** 10-wave battle; hitting it = defeat.
  - Volcano: the only monster that hurts is the brute (atk 39-56). Normal orc/harpy/golem deal **1 damage**
    per hit to any class wearing floor gear (their atk*1.5 is below def/2, damage floors at 1); EX versions and
    the bosses do ~5-18, still small.
    So in volcano every wave has a "danger phase" (brutes alive) and a "safe phase" (only harmless left).

## 1. First probes (harness `h.cjs` = exact copy of progsearch's winRate/minLevel, fast)

| class | program idea | result vs ref (volcano d1..d5) |
|---|---|---|
| warrior | spend power_strike only when `deadliest(enemies).atk > 30` (a brute is present), else basic attack | 7 8 9 10 11 vs ref 7 8 9 10 12 → +1 at d5 only |
| warrior | same + `defend()` while safe & MP<90% (bank MP) | 7 8 9 11 11 → no gain |
| mage | **rest in the safe phase**: brute present → firebolt deadliest; else if hp<95% → heal / defend; else firebolt | 7 7 **7** 10 10 vs ref 6 6 9 9 11 → **+2 at volcano d3** |
| guardian | stall with barrier+defend while safe until `turn_no < T` (stack shields) | vol5 lv6 16/24, not enough |
| guardian | keep taunt up only when a brute is present (`not has_buff("taunt")`), attack brute, else barrier | vol4 lv6 20/24 (+1), vol5 lv6 17/24 |

### First confirmed hit (official EVAL tool)
Mage, `CLASS=mage EVAL_FILE=... node tools/progsearch.cjs`:
```python
def turn():
    if me.hp_pct < 40:
        cast("heal", me)
        cast("firebolt", deadliest(enemies))
    elif deadliest(enemies).atk > 30:
        cast("firebolt", deadliest(enemies))
    elif me.hp_pct < 95:
        cast("heal", me)
        defend()
    else:
        cast("firebolt", weakest(enemies))
```
EVAL: volcano d3 one-liner 9 → this 7 (**+2**), volcano d5 11 → 10 (+1). lv7 is the floor for any
program that mentions `heal`, so d3 is saved as much as it possibly can be by a heal program.
Win counts (of 24) at volcano d3: this program lv7 = 21, best one-liners at lv7 = 6 (firebolt) / 9 (blizzard).

### Noise check on the first hits (fresh seeds)
I added `fresh.cjs` (same minLevel rule, but seeds 1000+ / 2000+ ... and the best one-liner is
re-derived on those same seeds from the search's exact ACTIONS list) and `big.cjs` (win % on 240 fresh seeds).
- The mage `hp<40 / brute / rest` program above: on fresh seeds only **+1** at volcano d3 (true win rate
  at lv7 = 73%, so its official "7" was partly seed luck). Honest status: +1, not a refutation by itself.
- Warrior "execute a brute if it has >200 HP, else power_strike it, else basic attack":
  official EVAL volcano d5 **+2** (12 → 10) but on fresh seeds the best one-liner needs 11, so again only +1 true.

## 2. Mage — robust refutation (volcano d4 and d5)

Found by a small coordinate search (`msearch.cjs`) over the thresholds of a hand-written template,
scored on the 24 official seeds + 48 fresh seeds so it can't just memorise the official ones.

```python
def turn():
    n = 0
    t = deadliest(enemies)
    for e in enemies:
        if e.atk > 30:
            n = n + 1
            if e.hp < t.hp:
                t = e
    if n == 1 and me.hp_pct < 55:
        cast("heal", me)
    if n >= 3:
        cast("blizzard", enemies)
    if n >= 1:
        cast("firebolt", t)
    if me.hp_pct < 95:
        cast("heal", me)
        defend()
    cast("firebolt", weakest(enemies))
```
(uses `for`, so it is writable only from floor 9 = volcano d4/d5; d1-d3 show "เขียนไม่ได้")

Official EVAL (`CLASS=mage EVAL_FILE=... node tools/progsearch.cjs`):
```
  volcano d4        9 |       9                 7   +2
  volcano d5       10 |      11                 9   +2
```
Fresh-seed min level (best one-liner re-derived on the same seeds each time):

| seed set | vol4 one-liner → program | vol5 one-liner → program |
|---|---|---|
| 1000-1047 | 9 → 7 (+2) | 11 → 9 (+2) |
| 2000-2047 | 9 → 8 (+1) | 11 → 9 (+2) |
| 3000-3047 | 9 → 7 (+2) | 11 → 9 (+2) |
| 4000-4047 | 9 → 7 (+2) | 11 → 9 (+2) |

Win % on 240 fresh seeds, volcano d5: program lv8 57% · **lv9 92%** · lv10 97%.
Best one-liners on the same 240 seeds: firebolt deadliest lv9 30% / lv10 58% / lv11 98%;
blizzard lv9 34% / lv10 49% / lv11 100%. → volcano d5 is a clean, reproducible **+2** for the mage.

### Mage ablation (win % on 240 fresh seeds, volcano d5 at lv9 / d4 at lv7)
| variant | d5 lv9 | d4 lv7 |
|---|---|---|
| full program | **92%** | **79%** |
| remove the safe-phase rest block (`hp<95 → heal/defend`) | 84% | 50% |
| rest uses heal only (no `defend()` fallback) | 92% | 79% |
| remove "1 brute and hp<55 → heal" | 81% | 54% |
| remove "≥3 brutes → blizzard" | 80% | 65% |
| target `deadliest` brute instead of lowest-HP brute | 91% | 79% |
| only "brute → firebolt, else rest, else firebolt" (no counting) | 69% | 43% |
| all the danger logic but **no heal at all** | 32% | 12% |
| (reference) one-liners firebolt deadliest / blizzard | 30% / 34% | 9% / 17% |
| (reference) search-space heal programs `if me.hp_pct < 30/50/70: heal else firebolt deadliest` | 56% / 53% / 28% | 22% / 15% / 10% |

→ Almost all of the value is *when* to heal: heal is only a net gain when incoming damage per
round is smaller than the heal (≤1 brute alive, or none). `me.hp_pct < X` alone (the only heal
gate the search had) fires in the middle of 3-brute fights where healing loses the race.

## 3. Guardian — refutation at volcano d5 (capped by barrier's lv6 unlock)

Same coordinate search idea (`gsearch.cjs`, official + 48 fresh seeds):
```python
def turn():
    n = 0
    t = deadliest(enemies)
    for e in enemies:
        if e.atk > 30:
            n = n + 1
            if e.hp < t.hp:
                t = e
    if n == 1 and me.hp_pct < 40:
        cast("barrier", me)
    if n >= 1:
        attack(t)
    cast("barrier", me)
    attack(strongest(enemies))
```
Official EVAL: `volcano d4 9 | 7 → 6 +1` · `volcano d5 10 | 8 → 6 +2`.
240 fresh seeds: barrier one-liner d5 lv6 48% / lv7 72% / lv8 100%; this program d5 lv6 **85%** / lv7 96%.
Fresh 48-seed sets: d5 +1, +2, +2, +2 (the barrier one-liner's lv7 sits at ~72%, so one set lets it pass at 7).
lv6 is the hard floor (any program mentioning barrier is invalid below lv6), so d1-d4 cannot show +2 with barrier.

### Guardian ablation (240 fresh seeds, volcano d5 lv6 / lv7)
| variant | lv6 | lv7 |
|---|---|---|
| full program | 85% | 96% |
| drop "1 brute and hp<40 → barrier" | 78% | 86% |
| finish harmless with `weakest` instead of `strongest` | 85% | 96% |
| shield_bash the brute instead of basic attack | 81% | 86% |
| no-`for` version: `if deadliest(enemies).atk > 30: attack(deadliest)` / barrier / attack strongest | 78% | 86% |
| **`if can_cast("barrier"): barrier else: attack(deadliest)`** (inside the search's grammar!) | 81% | 96% |
| barrier one-liner (reference) | 48% | 72% |

## 4. The search's OWN grammar contains a +2 program it never measured

`ingrammar.cjs`: take exactly progsearch's CONDS × ACTIONS if/else space, keep only programs that use the
class's sustain skill (barrier / heal), and measure them fully on volcano d3-d5 with the official seeds.

Guardian, top of the list:
```python
def turn():
    if count(enemies) >= 2:
        attack(deadliest(enemies))
    else:
        cast("barrier", me)
```
Official EVAL: `volcano d4 7 → 6 +1`, `volcano d5 8 → 6 +2`. 240 fresh seeds: d5 lv6 86%, lv7 97%
(barrier one-liner 48% / 72%). Fresh 48-seed sets: +1, +2, +2, +2.
(`if count(enemies) == 1: barrier else: attack(deadliest)` is the same program and scores the same.)

**Why progsearch missed it — a screening bias, not a search-space gap.** Step B screens every if/else at
`level = FALLBACK − 2` on the depth-3 and last-depth cell of every region, with 6 seeds, and only the
top 15 get measured. For the guardian those screen levels are lv1 (greenwood/isles/frostland), lv2-3 (ruins),
lv4 (volcano d3) and lv6 (volcano d5). Any program that *mentions* barrier is invalid below lv6, so it scores
0 on every screen cell except one, while every shield_bash/attack program collects free wins on the lv1 cells.
Same for the mage's `heal` (lv7: only volcano d5 screens at ≥7) and the warrior's `execute` (lv10: only volcano d5).
So the search never fully measured *any* branching program built around the late-unlock skills — which are
exactly the skills whose value depends on state (heal/shield when safe, big hit when a brute is up).

Reproduced step B exactly (`screen.cjs`): screen cells for the guardian are
`greenwood3@1 greenwood4@1 isles3@1 isles5@1 ruins3@2 ruins5@3 frostland3@1 frostland5@1 volcano3@4 volcano5@6`.
The +2 program above scores **1.00** and ranks **814th of 1,430** if/else programs; the cut-off for full measurement
(15th place) is 6.00. Second weakness visible here: the screen is saturated — the top programs all tie at 6.00
(six lv1 cells won 100%), so "top 15" is an arbitrary slice of a big tie, not a ranking.

## 5. Warrior — no robust refutation (+2 on the official seeds only)

Best found (`wsearch.cjs`, same method):
```python
def turn():
    n = 0
    t = deadliest(enemies)
    for e in enemies:
        if e.atk > 30:
            n = n + 1
            if e.hp < t.hp:
                t = e
    if n >= 3:
        cast("whirlwind", enemies)
    if n >= 1 and t.hp > 200:
        cast("execute", t)
    if n >= 1 and t.hp > 140:
        cast("power_strike", t)
    if n >= 1:
        attack(t)
    attack(deadliest(enemies))
```
Official EVAL: `volcano d4 10 → 10 0` · `volcano d5 12 → 10 +2`.
But the official one-liner "12" is unlucky seeds: on 240 fresh seeds `power_strike deadliest` is 47% at lv10 and
**84% at lv11**, and on three fresh 48-seed sets the best one-liner needs 11 every time → true saving **+1**.
This program: vol5 lv10 86%. It cannot go lower: `execute` unlocks at lv10; without execute the best vol5 lv9 I
found is ~30%.

Other warrior results (true, 120-240 fresh seeds):
- "≥2 brutes → whirlwind, else power_strike the lowest-HP brute, else attack": volcano d4 lv9 94% vs one-liner 68% (+1; lv8 only 38%).
- No-`for` "`count(enemies) >= 2 and weakest(enemies).atk > 30` → whirlwind; brute → power_strike": d1 lv6 93%, d2 lv7 89-94% (+1 each vs one-liner 7 / 8).
- Spending power_strike only on brutes (MP banking) +1 at most; adding `defend()` to refill MP in the safe phase: 0.
So the warrior gains a real **+1 in volcano d1, d2, d4 and d5** from logic (0 at d3), but never a robust +2.
(Fresh-seed check of the no-`for` whirlwind program: d1 7→6, d2 8→7, d3 9→9, d4 10→9, d5 11→11 on two seed sets.)

## 6. Ideas that did NOT help (so the PM doesn't re-try them)
| idea | where | result |
|---|---|---|
| guardian: stall with `barrier`+`defend` while safe until `turn_no < T` (big shield stack) | vol5 lv6 | 16/24 at best; runs hit the 200-round cap; coordinate search picks T=0 |
| guardian: keep taunt up (`not has_buff("taunt")`) | volcano / ruins | volcano: never selected by the search; ruins: *worse* (dark mages die faster if you just hit them) |
| warrior: `defend()` to bank MP when safe (`me.mp_pct < 90`) | volcano | 0 to −1 |
| mage: also rest until `me.mp_pct >= X` | volcano | no change (mage MP is never the constraint) |
| mage: blizzard at ≥2 brutes | vol5 lv9 | worse than ≥3 (firebolt ~one-shots at lv9, blizzard doesn't) |
| mage: target lowest-HP brute instead of `deadliest` | vol5 | ±1% |
| mage: +3 at vol5 (lv8) | vol5 | best 66% — speed breakpoint: at lv8 mage speed 20.5 < brute 22, all brutes act first |
| replace the magic `e.atk > 30` with `e.atk * 3 > me.defense + 20` ("its bite would do >10 to me") | vol4/5 | identical results — the threat test needs no zone-specific constant |

## 7. Numbers behind the mechanism (24 official seeds, per-battle averages)
Guardian, volcano d5 lv6:
| program | barriers cast while a brute is alive / when safe | shield created | damage taken | wins |
|---|---|---|---|---|
| `cast("barrier", me)` | 24 / 18 | 4,826 | 4,282 | 14/24 |
| `if count(enemies) >= 2: attack(deadliest) else: barrier` | 2 / 39 | 4,722 | **2,808** | 22/24 |
| `for`-count version (sec. 3) | 2 / 47 | 5,553 | 2,872 | 23/24 |
Same total shield, but a third less damage: the one-liner spends ~24 turns per battle casting barrier *while
brutes are hitting it* (each is a free round for every living brute) and its fallback `attack(weakest)` kills the
harmless monsters first, so brutes stay alive for the whole wave. The branch kills the brute first with MP-positive
basic attacks (+3 MP each), then spends the banked MP on barriers against the harmless leftover; shields never expire,
so the stack is carried into the next brute wave.

Mage, volcano d5 lv9:
| program | heals when safe / with brutes alive | HP healed | wins |
|---|---|---|---|
| `cast("firebolt", deadliest(enemies))` | 0 / 0 | 0 | 7/24 |
| `if me.hp_pct < 50: heal else: firebolt deadliest` (search grammar) | 0 / 5 | 496 | 9/24 |
| sec. 2 program | 9 / 4 (all with ≤1 brute) | 904 | 21/24 |

## 8. Verdict

| class | refuted? | best cell | evidence |
|---|---|---|---|
| mage | **yes, robustly** | volcano d5: 11 → 9 (+2); volcano d4: 9 → 7 (+2) | official EVAL +2/+2; d5 +2 on 4/4 fresh seed sets (92% vs ≤34% at lv9); d4 +2 on 3/4 |
| guardian | **yes** | volcano d5: 8 → 6 (+2) | official EVAL +2 with a plain if/else *from the search's own grammar*; +2 on 3/4 fresh sets (86% vs 48% at lv6, 97% vs 72% at lv7). Capped at lv6 by barrier's unlock |
| warrior | **no** (in substance) | volcano d5: 12 → 10 officially | fresh seeds: one-liner really needs 11, so +1; +1 is available in volcano d1/d2/d4/d5 but never a robust +2 |

## 9. Mechanism — why logic beats every single line in volcano

1. Volcano is a two-phase fight in every wave. Only the brute hurts (normal orc/harpy/golem hit for 1 because
   their atk×1.5 is below half the hero's gear defense). While a brute is alive you lose ~40-60 HP per brute per
   round; once brutes are dead, the remaining monsters are free time.
2. The mage (heal) and guardian (barrier) own a skill that converts free time into HP. Its value is extremely
   state-dependent: heal with 3 brutes alive loses the race (100 healed vs ~150 taken, and a round of delay);
   heal with ≤1 brute alive or none is pure profit. Barrier cast while a brute is alive gives that brute a free
   round; barrier cast against a harmless leftover is free and **permanent** (shields stack, never expire).
3. A single line can't make that distinction. `cast("heal", me)` heals at full HP; `cast("firebolt", ...)` never
   heals; `cast("barrier", me)` casts barrier in the middle of brute fights and its fallback `attack(weakest)` kills
   the harmless monsters first (burning the free time and leaving brutes alive). The search's if/else had only
   `me.hp_pct < X` as a "should I heal?" signal, which fires *during* brute fights (the wrong time) and never
   tops up during the safe phase (the right time).
4. What makes the program good is a **threat test** — `deadliest(enemies).atk > 30`, a `for` count of enemies with
   high atk, or simply `count(enemies) >= 2` after killing `deadliest` first — used to gate the sustain skill.
   Removing heal entirely from the mage program drops it to one-liner level (32%), so the targeting logic alone
   is worth nothing here; the gated sustain is the whole effect.

## 10. Rules that remove the reason to branch (what I'd tell the PM)

1. **`cast()` silently falls through on low MP, and the program's fallback is `attack(weakest(enemies))`.**
   Every one-liner `cast(X, t)` is already `if can_cast(X): cast(X, t) else: attack(weakest)`. A large part of the
   if/else space (all the `can_cast(...)` and `me.mp_pct >= 50` branches) re-implements what one line already does.
2. **Each zone has exactly one threat type and a built-in selector that finds it** (`deadliest` = brute in volcano,
   `weakest` = dark mage in ruins). Targeting logic collapses into "pick the right selector for the zone".
3. **Non-threat monsters deal 1 damage.** In volcano 3 of 4 monster types don't matter, so there is only one
   decision axis (brute alive or not) — and it only pays off for classes with a sustain skill.
4. **Mage MP never binds**: firebolt costs 7, mage regen is 5% of 120-200 MP = 6-10 per turn. No MP decisions exist.
   Warrior MP (≈46) is too small for allocation to matter much. So "save MP for the big moment" logic has no payoff.
5. **Monster AI has no states to react to**: every role runs the same "bite a random enemy if mp>30% else attack"
   program; roar is never cast; `has_debuff()` is always False (`debuffs: []` in battle.ts); solo taunt is only a
   30% damage reduction because every monster already targets you.
6. **Skill unlock gates the whole program**: mentioning heal/barrier/execute anywhere makes a program invalid below
   lv7/6/10. The skills whose value is state-dependent arrive at or after the level where one-liners already clear
   most cells, so the maximum possible saving is `(one-liner level − unlock level)` — 0 for guardian volcano d1-d3,
   at most 2 for mage d3/d4.
7. **Speed breakpoints dominate**: hero speed grows only from the 8% agi share, so e.g. the mage goes from "every
   brute acts first" (lv8, speed 20.5 vs 22) to "coin flip" (lv9). One-liner win rates jump 30% → 98% across two
   levels at volcano d5; logic has to fight for the few levels left between breakpoints.
8. No state persists between turns (locals reset every `turn()`), so multi-turn plans can only be keyed off HP/MP/turn_no.

## 11. Measurement issues found along the way

- **Step B screening bias (hid a +2 program inside the search's own grammar).** See §4. Suggested fix: screen at
  `max(FALLBACK−2, unlock level of every skill the program mentions)`, or screen per region instead of summing.
- **Screen saturation**: many screen cells run at lv1 where everything wins, so the top of the screen is a big tie
  (guardian: all top programs at 6.00) — "top 15" is an arbitrary slice.
- **±1 level of noise in minLevel with 24 seeds / 80% bar.** Warrior d5 one-liner reads 12 on the official seeds but
  11 on every fresh set; my first mage program read +2 officially but +1 on fresh seeds. Treat single-seed-set
  results within 1 level as ties; I'd use ≥96 seeds for anything that drives design.
- **Binary search needs monotone win rates** (it must pass at 40, 20, 10, … on the way down). A few programs have
  dips (e.g. `cast("execute", deadliest(enemies))` at volcano d4: 13→18→21→16 wins of 24 across lv10-13), so
  minLevel can land on a level that the bisection path happens to probe rather than the true threshold.

Tools used (all in the session scratchpad, not in the repo): `h.cjs` (exact copy of progsearch winRate/minLevel),
`fresh.cjs` (same metric on other seeds, best one-liner re-derived), `big.cjs` (win % on 240 seeds),
`msearch*.cjs`/`gsearch.cjs`/`wsearch.cjs` (coordinate search over program templates on official+fresh seeds),
`ingrammar.cjs` / `screen.cjs` (re-measure / re-screen progsearch's own if/else space).
