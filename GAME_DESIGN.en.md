# GreenMafia — Game Design Document

> 🇷🇺 Русская версия: [GAME_DESIGN.md](GAME_DESIGN.md). The Russian document is the original; this is a full translation. If the two ever disagree, fix both.

> **Status:** v0.3 · 26 Oct 2026 · Mafia Don added, new night order, Mistress block = skipped turn, new defaults
> **Purpose:** the single source of truth for the rules, logic, interface, design and assets. Code is written from this document. If code and document disagree, fix the document first, then the code.
> **Notation:** ⚙️ — behaviour is controlled by a setting (see §12); the default value is in **bold**. ❓ — open question (see §22).

---

## Contents

1. [Concept](#1-concept)
2. [App modes](#2-app-modes)
3. [Glossary](#3-glossary)
4. [Teams and roles](#4-teams-and-roles)
5. [Role distribution by player count](#5-role-distribution-by-player-count)
6. [Game loop](#6-game-loop)
7. [Night](#7-night)
8. [Day](#8-day)
9. [Win conditions](#9-win-conditions)
10. [Who knows what (information visibility)](#10-who-knows-what)
11. [Special situations](#11-special-situations)
12. [Settings](#12-settings)
13. [Engine: data model and invariants](#13-engine-data-model-and-invariants)
14. [Screens and user flow](#14-screens-and-user-flow)
15. [Host script](#15-host-script)
16. [Design](#16-design)
17. [Assets](#17-assets)
18. [Logic test scenarios](#18-logic-test-scenarios)
19. ["Everyone on their own phone" mode (v2)](#19-everyone-on-their-own-phone-mode-v2)
20. [Technology](#20-technology)
21. [Roadmap](#21-roadmap)
22. [Open questions](#22-open-questions)
23. [Extensions (not in v1)](#23-extensions-not-in-v1)

---

## 1. Concept

**GreenMafia** is an app for playing live "Mafia" with a group of 5 to 20 people.

Its core value is **flawless logic**. The host of a live game constantly has to keep track of: whom the Mistress visited, whether the Doctor healed this player last night, how many times he healed himself, who is nominated, how many votes there are, whose turn it is to speak, whether someone has already won. The app takes all of that over: it prompts the host what to say, never allows an illegal move, resolves the night and the vote by itself and announces the winner by itself.

v1 goals:
- The rules are implemented completely and unambiguously; every disputed point has a decision (or a setting).
- A host can run a game the first time they open the app.
- Any host action can be undone.
- The game survives an accidentally closed tab or a dead phone battery (the state is saved).
- Works offline.
- A design with character — not "yet another app set in Inter".

---

## 2. App modes

| Mode | How it is played | Version |
|---|---|---|
| **A. Host** | One phone/tablet in the hands of a live host. The host does not play. The app is their prompter, notebook, timer and referee. | **v1** |
| **B. Everyone on their own phone** | Everyone sits together (or in a voice chat), each with their own phone. The app runs the game itself: deals roles, takes night actions and votes. No live host is needed. | v2, §19 |

**Why we start with A.** Both modes share the same logic (engine). Mode A needs no server, and it is the easiest way to verify that the rules are computed correctly. Mode B is the same engine plus a server, rooms and filtering of secret information.

❓ Confirm the order of the modes (§22, question 1).

---

## 3. Glossary

| Term | Meaning |
|---|---|
| **Number (seat)** | The number on the player's card, 1–20, no repeats; the cards may be dealt at random. A label only: it has no effect on the order. Never changes during the game. |
| **Seating order** | The order of players around the table, clockwise (as in the setup list). Defines the speaking order, the order in which the phone is passed during the deal and the layout of the chips. |
| **Alive / out** | A player who is out does not speak (except for the last word), does not vote, does not act at night and cannot be a target. |
| **Mafia team** | Mafiosi and the Mafia Don. |
| **Town (civilians)** | Team: civilians, Commissar, Doctor, Mistress. |
| **Mafia** | The team of mafiosi. |
| **Maniac** | A loner, a team of one. |
| **Night N** | The night phase. Night N always comes before Day N. |
| **Wake** | The moment of the night when a particular role "opens their eyes" and acts. |
| **Fake wake** | The host "wakes" a role that is already out and waits the usual pause, so that nobody can tell from the timing that the role is gone. |
| **Block** | The effect of the Mistress's visit: the client does not act this night — there is no choice, the step is skipped. |
| **Client** | The player the Mistress visited this night. |
| **Alibi** | The Mistress's client cannot be nominated for the vote on the following day. ⚙️ |
| **Nomination** | A player's proposal, during their own speech, to put someone up for the vote. |
| **Candidate** | A nominated player. |
| **Defense speech** | An extra short speech by candidates who received an equal number of votes. |
| **All-out vote** | A vote to "eliminate all tied candidates at once". |
| **Last word** | The speech of a player who is out, before they fall silent for good. |
| **Miss** | The mafia killed no one this night (could not agree, refused, or was blocked). |
| **Foul** | A warning for breaking the rules (optional). ⚙️ |

---

## 4. Teams and roles

### 4.1. Summary table

| Role | Team | Night action | Restrictions | Commissar's check |
|---|---|---|---|---|
| Civilian | Town | — | — | "Not mafia" |
| Mafioso | Mafia | Chooses one victim together with the mafia | Cannot target the mafia or the Don ⚙️ | "Mafia" |
| Mafia Don | Mafia | Has the final word on the victim; separately checks whether a player is the Commissar | Not himself | "Mafia" |
| Commissar | Town | Checks one player | Not himself | "Not mafia" |
| Doctor | Town | Heals one player | Not the same player two nights in a row ⚙️; himself — once per game ⚙️ | "Not mafia" |
| Mistress | Town | Visits one player: block + alibi | Not herself; not the same player two nights in a row ⚙️ | "Not mafia" |
| Maniac | Maniac (loner) | Kills one player | Not himself | **"Not mafia"** ⚙️ |

Each special role (Don, Commissar, Doctor, Mistress, Maniac) appears **at most once**. The mafia team always has at least one player — a mafioso or the Don.

Any role may **skip its turn** (for the mafia this is a "miss"). A skip counts as a turn without a target: the "two nights in a row" restriction does not apply on the next night. A turn skipped because of the Mistress counts the same way.

> In the code the Mistress role is called `lover`.

### 4.2. Civilian

- Sleeps at night.
- Speaks, nominates and votes during the day.
- Goal: find and eliminate the mafia and the Maniac.

### 4.3. Mafia

- **Meeting.** The mafiosi and the Don know each other from the start of the game: through the meeting night ⚙️ or through the role card, which lists the accomplices (the Don is marked).
- **Turn.** Every night the whole mafia team (mafiosi and the Don) wakes up together and chooses **one** victim.
- **Target:** any living player except the mafiosi and the Don ⚙️ (by default **not allowed**). The Maniac may be killed.
- **Disagreement.** In host mode the mafia shows the victim with gestures. **The Don has the final word**: the host records his choice. If there is no Don in the game, he is out, or the Mistress visited him, the remaining mafiosi decide; if they point at different people, it is a "Miss". In mode B — §19.3.
- **Block.** If the Mistress visited one member of the team, he does not take part in the choice that night. The kill is cancelled only if **the whole living** mafia team is blocked — in practice, when only one member is left. Then the mafia step is skipped, like any blocked step (§7.2).
- **Team goal:** to equal the others in number (§9).

### 4.3a. Mafia Don

- A member of the mafia team: counts as mafia for the win conditions (§9); the Commissar sees him as **"Mafia"**.
- Wakes up **twice**: first together with the mafia (final word on the victim, §4.3), then **separately**, right after the mafia.
- **Check.** On his separate step the Don points at one living player other than himself. Answer: **"Commissar"** or **"Not commissar"**. The host shows it to the Don on the app screen. Repeat checks are allowed.
- **Block.** If the Mistress visited the Don, he skips both steps: the remaining mafiosi choose the victim, and there is no check.
- **Out** → his separate step is a fake wake (§7.2); the remaining mafiosi choose the victim.
- In the recommended composition the Don is present as soon as the mafia team has two or more members (from 6 players, §5.1).

### 4.4. Commissar

- Every night checks one living player other than himself.
- Answer: **"Mafia"** or **"Not mafia"**. The host shows it to the Commissar with a gesture or on the app screen.
- By default the Maniac gives the answer "Not mafia" ⚙️: the Commissar is looking specifically for the mafia.
- Checking the same player again is allowed, but the app warns that the answer is already known.
- **The Mistress visited him** → no turn, no choice, no answer. The host may show the Commissar the block screen (§14.4) — the Commissar understands that someone visited him.
- The Don gives the answer "Mafia".
- **Killed the same night** → still receives the result of the check: night actions are simultaneous, and the check happens at the moment he wakes. He will not be able to tell anyone about it, unless the last word for night victims is enabled ⚙️ (by default **off**). Then he may reveal it.
- The Commissar is not a "shooting sheriff". The shooting variant is listed under extensions (§23).

### 4.5. Doctor

- Every night heals one living player.
- **Healing protects from any death this night**: from the mafia, from the Maniac and from "linked death" with the Mistress ⚙️.
- If the mafia and the Maniac chose the same target and the Doctor healed it, the player survives.
- **Cannot heal the same player two nights in a row** ⚙️ (by default **not allowed**).
- **Himself — at most once per game** ⚙️ (0 / **1** / unlimited).
- **Restrictions are counted by the choice actually made.** If the Mistress visited the Doctor, he makes no choice that night — so nothing is spent: the next night he may heal anyone, and the self-heal is not used up.
- The Doctor does not learn whether he saved anyone, except from the morning announcement (⚙️ announce saves — by default **no**).

### 4.6. Mistress

The most "variable" role across different groups. The core behaviour is fixed; the rest is settings.

**Always (core of the role):**
- Wakes up **first** at night and visits one living player other than herself.
- **Block:** the client **does not act** this night: there is no choice, the step is skipped. The Doctor does not heal, the Commissar and the Don do not check, the Maniac does not kill, a mafioso does not take part in choosing the victim.
- Not the same player two nights in a row ⚙️ (by default **not allowed**).
- When a blocked role wakes up, the app shows a big "The Mistress is with him" screen with a cross instead of the choice. The host reads the script, waits the pause and may show the screen to the player — the client learns that someone visited.

**Settings:**

| Effect | Default | Description |
|---|---|---|
| Day alibi | **On** | The client cannot be nominated on the following day. In the morning the host announces: "Player #X has an alibi". |
| Client with alibi votes | **Yes** | If off, the client also does not vote. |
| Night protection | **Off** | If on, the client cannot be killed this night (as if healed). |
| Linked death | **On** | If the Mistress is killed at night, her client dies with her (unless the Doctor healed him). A day elimination does not affect the client. |

If the Mistress dies this night, her visit still takes effect: she has already gone; the block and the alibi apply.

### 4.7. Maniac

- A loner: knows nobody, and nobody knows him. Does not wake on the meeting night.
- Every night kills one living player other than himself (may kill mafiosi too).
- Can be blocked by the Mistress; the Doctor can save his victim.
- Wins when he is left alone or with one other player, and there is no mafia (§9).

---

## 5. Role distribution by player count

### 5.1. Recommended table (default)

The mafia team is roughly a quarter to a third of the players (the town has special roles, so there is slightly more mafia than in "pure" classic Mafia). As soon as the mafia team has two or more members, one of them is the Don. Special town roles appear as the group grows; the Maniac — from 11 players. In every row mafia team + Maniac < town, so the starting position is never already a win.

| Players | Mafiosi | Don | Commissar | Doctor | Mistress | Maniac | Civilians |
|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| 5 | 1 | — | 1 | — | — | — | 3 |
| 6 | 1 | 1 | 1 | — | — | — | 3 |
| 7 | 1 | 1 | 1 | 1 | — | — | 3 |
| 8 | 1 | 1 | 1 | 1 | — | — | 4 |
| 9 | 1 | 1 | 1 | 1 | 1 | — | 4 |
| 10 | 2 | 1 | 1 | 1 | 1 | — | 4 |
| 11 | 2 | 1 | 1 | 1 | 1 | 1 | 4 |
| 12 | 2 | 1 | 1 | 1 | 1 | 1 | 5 |
| 13 | 2 | 1 | 1 | 1 | 1 | 1 | 6 |
| 14 | 3 | 1 | 1 | 1 | 1 | 1 | 6 |
| 15 | 3 | 1 | 1 | 1 | 1 | 1 | 7 |
| 16 | 3 | 1 | 1 | 1 | 1 | 1 | 8 |
| 17 | 4 | 1 | 1 | 1 | 1 | 1 | 8 |
| 18 | 4 | 1 | 1 | 1 | 1 | 1 | 9 |
| 19 | 4 | 1 | 1 | 1 | 1 | 1 | 10 |
| 20 | 5 | 1 | 1 | 1 | 1 | 1 | 10 |

The table will be refined after playtests: its values are constants in a single engine file.

### 5.2. Manual composition

The host may change the composition. Validation:

| Rule | Type |
|---|---|
| 5 ≤ N ≤ 20 | Error |
| Sum of roles = N | Error |
| Mafiosi + Don ≥ 1 | Error |
| Don, Commissar, Doctor, Mistress, Maniac — 0 or 1 each | Error |
| The starting position must not already be a win: mafiosi + Don + Maniac < town | Error |
| Civilians = 0 | Warning |
| Deviation from the recommended table (balance indicator: "town favoured / balanced / mafia favoured") | Hint |

### 5.3. Dealing roles

Ways:
1. **The app deals** (default). At random, with a cryptographically secure generator. The seed is stored with the game, so the deal can be reproduced for debugging. Then the phone is passed around (§14.3).
2. **Physical cards.** The host deals the cards and enters who has which role.

### 5.4. Open composition

⚙️ The composition is announced to the players (by default **yes**: "In this game there are 3 mafia, a Commissar, a Doctor, a Mistress and a Maniac"). If the composition is hidden, the host wakes every role from the full list, including absent ones, with a fake pause.

---

## 6. Game loop

```
SETUP ──► DEAL ROLES ──► NIGHT 1 ──► DAY 1 ──► NIGHT 2 ──► DAY 2 ──► …
                           │           │
                           ▼           ▼
                       win check    win check
                           │           │
                           └──► GAME OVER ◄──┘
```

Inside the phases:

```
NIGHT N: "The town falls asleep" → [Mistress] → [Commissar] → [Doctor] → [Mafia with the Don] → [Don] → [Maniac]
         → night resolution (engine) → "The town wakes up"

DAY N:   Morning: announcement of deaths and alibi → WIN CHECK
         → last words of night victims (⚙️, off by default)
         → discussion around the table (everyone speaks, may nominate one)
         → vote (+ on a tie: defense speeches → revote → all-out vote)
         → elimination → WIN CHECK → last word of the eliminated
         → Night N+1
```

**Night 1** ⚙️:
- **"Meeting"** (default): only the mafia team (mafiosi and the Don) wakes up, to see each other. No actions, no deaths in the morning; Day 1 starts straight with the discussion.
- "Full": Night 1 is played like any other night, with all roles.

---

## 7. Night

### 7.1. Wake order

| # | Role | Why here |
|:-:|---|---|
| 1 | Mistress | **Must be first**: by the time the others wake up it is already known whom she visited, and their step is immediately shown as blocked. |
| 2 | Commissar | — |
| 3 | Doctor | The order does not affect the result: everything is resolved simultaneously. |
| 4 | Mafia with the Don | The whole mafia team; the Don has the final word. |
| 5 | Don | Right after the mafia, separately: the check for the Commissar. |
| 6 | Maniac | — |

Apart from "the Mistress goes first", the order does not affect the result: **all night actions are resolved simultaneously** after everyone has acted.

### 7.2. Which roles are woken

| Situation | What the app does |
|---|---|
| Role not in the composition, composition open | The step is skipped. |
| Role not in the composition, composition hidden | Fake wake. |
| Role is out | **Fake wake** ⚙️ (by default **on**): the role's screen with a timer, input disabled, the "Next" button becomes active no earlier than after `minWakeSeconds` (by default **10 s**). |
| Role blocked by the Mistress | Wakes up as usual (the host reads the script and waits the pause), but **there is no choice**: instead of the chip grid there is a big "The Mistress is with him" screen with a cross. There is no "Skip" button, only "Next". The chronicle says "with the Mistress, no turn". |
| Mafia: the whole living team is blocked | As above: the mafia step is skipped, no kill. |

So that timing gives nothing away, every step has a minimum duration. The host is advised to keep an even pace.

On every step the chips of those who are waking up are highlighted with a brass ring labelled "acting" — the host always sees who exactly is choosing, even if they cannot choose themselves.

### 7.3. Valid targets

| Role | May choose | May not choose |
|---|---|---|
| Mistress | A living player | Herself; the same player as last night ⚙️ |
| Mafia with the Don | A living player | Mafiosi and the Don ⚙️ |
| Don (check) | A living player | Himself |
| Maniac | A living player | Himself |
| Doctor | A living player, himself | The same player as last night ⚙️; himself if the limit is used up ⚙️ |
| Commissar | A living player | Himself |

"Last night" means the previous night on which the role made a choice. If last night was a skip, there is no restriction.

Invalid targets are disabled in the interface, and tapping one shows the reason ("The Doctor healed #7 last night").

### 7.4. Night resolution algorithm

The engine receives the choices of all roles and computes the result **in a single step**:

```text
input: living players at the start of the night, role choices, settings, memory of previous nights

1. client  := the Mistress's choice, if the Mistress is alive (otherwise none)
   blocked := { client }, if there is a client

2. Actors (alive and not in blocked; a blocked role made no choice):
   mafiaActors  := living mafiosi and the Don \ blocked
   mafiaTarget  := the mafia's choice, if mafiaActors ≠ ∅ and it is not a "miss"
   maniacTarget := the Maniac's choice, if the Maniac is alive and not in blocked
   healed       := the Doctor's choice, if the Doctor is alive and not in blocked
   checkResult  := "No answer", if the Commissar is in blocked,
                   otherwise the answer for the Commissar's target (§4.4)
   donResult    := "No answer", if the Don is in blocked,
                   otherwise "Commissar" / "Not commissar" for the Don's target (§4.3a)

3. protected := { healed }
   if loverProtects and there is a client: protected += { client }

4. deaths := { mafiaTarget, maniacTarget } \ { none } \ protected

5. if loverDeathLink, the Mistress ∈ deaths, there is a client and client ∉ protected:
       deaths += { client }

6. alibi for Day N := client, if loverAlibi and the client is alive after step 5

7. memory:
   lastLoverTarget  := the Mistress's choice (or "none" if skipped)
   lastDoctorTarget := the Doctor's choice (or "none" if skipped or blocked)
   doctorSelfHeals  += 1, if the Doctor chose himself

8. Everyone in deaths leaves the game simultaneously, cause "night".
   Public announcement — the list of the dead IN ASCENDING SEAT NUMBER,
   without saying who killed whom.

9. Win check (§9).
```

Important consequences:
- A player cannot "die twice": if both the mafia and the Maniac chose him, one death is announced.
- The morning announcement **never** reveals the killer or the cause. Sorting by seat number exists so that the order gives no hint about who killed whom.
- The Commissar and the Don get their answer right away during the night (step 2 depends only on the block, and the block is known first).

### 7.5. Morning announcement

Contains:
1. Those who died this night (by seat number), or "Nobody died this night".
2. Roles of the dead — according to the setting ⚙️ `revealRoleOnDeath`: **none** / team only / full role.
3. Alibi: "Player #X has an alibi today" (if `loverAlibi` and the Mistress visited someone).
4. Saves — only with `announceSaves` (by default **no**): "Someone was saved tonight". No name is given.

---

## 8. Day

### 8.1. Order of the day

1. **Morning.** Announcement (§7.5) → win check. If someone won — game over.
2. **Last word** of night victims ⚙️ (by default **no**; if enabled — 60 s, in ascending seat number). Players eliminated during the day do get a last word (⚙️, by default **yes**).
3. **Discussion.** Every living player speaks in turn (⚙️ 60 s).
4. **Vote** (if there are candidates).
5. **Elimination** → win check → **last word** of the eliminated ⚙️ (by default **yes**, 60 s).
6. **Night.**

### 8.2. Speaking order

- The speaking order is the **seating order**, not the numbers: #13 may speak before #10.
- Day 1 is opened by the first player in seating order.
- Each following day is opened by the **next living player** after the one who opened the previous day (in seating order) ⚙️ (by default **rotate around the table**; alternative — always the first living player).
- Players who are out are skipped.

### 8.3. Nominating candidates

- A player may nominate **only during their own speech**, and at most **one** candidate.
- Target: a living player who **has no alibi**. Oneself — ⚙️ by default **not allowed**.
- An already nominated player cannot be nominated again: he is already on the list, and the speaker may choose someone else or no one.
- The order of candidates in the vote = the order of nomination.
- A nomination cannot be withdrawn.

### 8.4. When there is no vote

- No candidates at all → no vote, night falls.
- ⚙️ `firstDayVoting` = **yes**. If off, Day 1 has discussion only.
- ⚙️ `firstDaySingleCandidateSafe` = **yes**: if exactly one candidate is nominated on **Day 1**, no vote is held. Otherwise the very first speech could eliminate a random person.

### 8.5. Voting

- **All living** players vote, candidates included (you may vote for yourself). A client with an alibi — ⚙️ by default **votes**.
- The host names the candidates one by one. A voter raises their hand once, for one candidate. Changing one's mind is not allowed.
- **Abstaining** ⚙️ (by default **allowed**). If not allowed (sports rule), the votes of those who did not vote automatically go to the **last** candidate.
- Input in the app: the host marks **who** voted for each candidate (by tapping the players' chips). This makes voting twice impossible, and the votes are kept in the chronicle. There is a quick "enter a number" mode — then the app only checks that the total is not greater than the number of voters.
- **Result:** the candidate with the most votes is eliminated, but with **at least 1** vote. A candidate with 0 votes is never eliminated.
- ⚙️ `singleCandidateAutoEliminate` = **no**. If on (sports rule), a single candidate (not on Day 1) is eliminated without a vote.

### 8.6. Tie

⚙️ `tieRule`, by default **"sports"**:

```text
1. Several candidates received the same maximum number of votes (> 0).
2. Defense: each of them, in nomination order, gives a defense speech (30 s).
3. Revote: all living players vote, but only for the tied candidates.
4. a) There is a single leader → he is eliminated.
   b) A tie again, but among fewer candidates → steps 2–4 for the new set.
   c) A tie again among the SAME candidates → "all-out vote":
      "Who is for all N candidates leaving the game?"
      If "for" is strictly more than half of the voters (living players with the right to vote),
      all tied candidates are eliminated.
      Otherwise nobody is eliminated.
```

Alternatives:
- **"Revote, then nobody"** — one defense speech and one revote; if there is a tie again, nobody is eliminated.
- **"Nobody"** — on any tie nobody is eliminated.

When several players are eliminated, their last words go in ascending seat number, and there is a single win check after all of them are out.

### 8.7. Elimination

- The eliminated player is out, cause "vote".
- The role is revealed according to `revealRoleOnDeath` ⚙️.
- **Win check first, then the last word.** If the game is over, there is no last word — straight to game over.

---

## 9. Win conditions

### 9.1. Notation

- **M** — living members of the mafia team (mafiosi and the Don)
- **K** — 1 if the Maniac is alive, otherwise 0
- **T** — living town players (civilians + Commissar + Doctor + Mistress)

### 9.2. Rules (checked in order, the first match wins)

| # | Condition | Result |
|:-:|---|---|
| 1 | M + K + T = 0 | **Draw** (everyone died at once) |
| 2 | M = 0 and K = 0 and T ≥ 1 | **Town wins** |
| 3 | M = 0 and K = 1 and T ≤ 1 | **Maniac wins** |
| 4 | M ≥ 1 and K = 0 and M ≥ T | **Mafia wins** (parity) |
| 5 | M ≥ 1 and K = 1 and M ≥ T + 2 | **Mafia wins** (early) ⚙️ |
| 6 | M = 1 and K = 1 and T = 0 | **Draw** (early) ⚙️ |
| — | otherwise | The game goes on |

### 9.3. Explanations

- **Rule 3.** Left alone with the Maniac, a civilian cannot eliminate him: in his speech the Maniac nominates the civilian back, the votes split 1:1, and the all-out vote cannot get more than half. At night the Maniac kills him.
- **Rule 4 (parity).** When there is as much mafia as town, the mafia controls the vote. Traditionally the win is awarded at once.
- **Rule 5.** With the Maniac alive, the mafia wins if it has a strict majority over everyone else (M > T + 1). During the day it eliminates the Maniac, at night it kills him — either way it reaches rule 4. This is an "early" call of an outcome that is already decided.
- **Rule 6.** One mafioso and the Maniac are left. During the day nobody can be eliminated at 1:1, at night they inevitably kill each other. The outcome is decided — a draw.
- Rules 5 and 6 can be turned off ⚙️ `earlyWinDetection` (by default **on**); then the game is played to the end.
- The rules are mutually exclusive: enumerating all M ≤ 6, K ≤ 1, T ≤ 14 yields exactly one matching rule or "goes on" (scenario 55 in §18).

### 9.4. When the win is checked

1. After the night is resolved (in the morning, before the last words).
2. After an elimination by vote (before the last word).
3. After a player is removed or leaves, at any moment (§11).
4. The host may end the game manually: "Declare a draw" or "Abort the game". Such an outcome is marked in the chronicle.

### 9.5. Game over

- **All roles** are revealed.
- The **chronicle** is shown: for every night — the Mistress's visit, the mafia's target, the Maniac's target, whom the Doctor healed, whom the Commissar checked and with what answer, who died and why; for every day — who nominated whom and who voted how.
- The winning team: when the town wins, all town players win, including those who are out. The same for the mafia. The Maniac wins alone.

---

## 10. Who knows what

| | Own role | Accomplices | Night events | Roles of those out |
|---|---|---|---|---|
| Civilian | ✔ | — | Only the morning announcement | By `revealRoleOnDeath` |
| Mafioso | ✔ | ✔ the whole team, the Don marked | Their victim | By setting |
| Don | ✔ | ✔ the whole team | Their victim, his checks and answers | By setting |
| Commissar | ✔ | — | His checks and answers | By setting |
| Doctor | ✔ | — | Whom he healed; knows if the Mistress visited him | By setting |
| Mistress | ✔ | — | Whom she visited | By setting |
| Maniac | ✔ | — | His victim | By setting |
| Host | everything | everything | everything | everything |

Rule: **the app never shows players information they must not have.** In host mode the roles screen is hidden by default and opens while the "eye" button is held. In mode B the server simply never sends other players' secrets to a client (§19).

---

## 11. Special situations

### 11.1. A player leaves or is removed

- At any moment the host may mark: "Left the game" or "Removed" (for violations).
- The player is out immediately, with no last word; the role — by `revealRoleOnDeath`.
- If he was a candidate, the nomination is withdrawn. If he was a client with an alibi, the alibi disappears.
- If the removal happens during a vote or a defense, the vote restarts from the main round with the remaining candidates (or is cancelled, see the setting below).
- His night choice, if the night is still going, is cancelled.
- Immediate win check.
- ⚙️ If a player is removed during the day before the vote (from the morning until the vote result), no vote is held that day (sports rule; by default **off**).

### 11.2. Fouls (optional, ⚙️ off by default)

- The host gives a foul for talking out of turn, peeking at night, gestures and so on.
- 3rd foul → the player skips their next speech, and therefore cannot nominate anyone that day either.
- 4th foul → removal (§11.1).

### 11.3. Host mistakes: undo

- **Every** host action is an event in the log. The "Undo" button rolls back the last event.
- You can undo any number of steps, all the way to the start of the game (with a confirmation if the rollback crosses a phase boundary).
- Game over can be undone too, if the win happened because of an input mistake.

### 11.4. Saving

- The event log is saved to the device storage after every action.
- The current voting draft (both entry modes, page and all-out vote) and speech/defense/last-word timer are saved separately. Drafts belong to a specific phase, round and speaker and do not carry over to another phase.
- Hiding the app automatically pauses its timer. A restored game opens paused with its remaining time preserved; the host explicitly resumes it.
- Writes are ordered; the current game and history update in one transaction. Write failures show a persistent warning with a retry action; read failures block editing instead of creating an empty database. An unreadable autosave is not deleted automatically.
- Only one tab writes to the device data store. It holds an exclusive Web Lock until closed; backgrounding does not transfer ownership. A second tab does not load an editable session and requires closing the first and reloading to read fresh data. Without safe locking support, writes remain disabled; iOS compatibility is tested separately.
- Losing focus, hiding the page or leaving it immediately covers the interface, clears role reveals, host peeks and night answers, and pauses the timer. Regaining focus neither reveals secrets nor starts the timer. While paused, the game screen is hidden from input and assistive technology; host information is not left behind the pause dialog. Native iOS app-switcher snapshot protection requires separate implementation.
- When the app is opened with an unfinished game: "Continue game / Start a new one".
- Recovery is tolerant: if some action in the log no longer passes the rule check (for example, the log was saved by an older version of the app), the game is restored up to the last valid action, and the host sees how many actions were dropped.
- Before partial recovery, migration of an older format, or replacement of an unfinished game, the complete original is written to Backups. A failed backup cancels the transition. Replacing a game requires confirmation; cancelling preserves the current game, setup preferences and player database.
- Game saves are versioned; the original unversioned format/compositions without the Don are migrated on opening, and unknown versions are not executed. Game, history, settings and profile inputs are validated before use. An unreadable autosave remains visible on Home and can be exported.
- Backups are accessible from History and Settings: export the original file or restore a readable unfinished game, paused, after backing up the current game. Backups do not count towards statistics and are not deleted automatically except through explicitly confirmed full clearing. Files contain names and secret roles, and the interface warns about this before export.
- Settings accepts a device JSON export or individual game up to 20 MB. Preview shows counts and replacement consequences only. Unknown versions, damaged/partly readable logs, invalid sections, duplicate profiles and archive conflicts are rejected without writing. Older formats are migrated in a copy and the original is retained separately. A device export replaces six data sections. Individual games receive a new ID: unfinished games replace the current game, paused; finished games are added to history without evicting existing games (adding is blocked at 500).
- Before importing or clearing history, current data is kept in a device copy. The copy and replacement/clearing commit in one transaction, with rollback even on synchronous failures. Device copies and original import files can be exported from Backups; the copies list is not recursively included in transfer files. Restore previous data by choosing the exported copy in import. Existing saves finish before the operation; after success the stale UI and failed-write retries remain blocked until restart. Failed operations need a fresh confirmation and are never automatically retried.
- Clearing history removes the archive and statistics calculated from it, preserving the current game, profiles, preferences and a recovery copy. Full clearing requires typing "DELETE" and removes all seven sections including internal copies, without retaining a hidden personal-data backup. A file export is offered first. Previously exported files remain outside the app; deleting a profile does not erase its name from old games or files.
- An unexpected UI, event-handler or asynchronous-action error hides secrets and pauses the game. The recovery screen can remount the interface or return Home while preserving the in-memory journal; an older autosave cannot replace it, and an asynchronous transition started before the crash cannot change the recovered session. Only a fully validated journal is automatically checkpointed, paused; a damaged original remains available for explicit recovery.
- The error screen exports a private game file with names/roles separately from a technical report without names, roles, journal, exception text or stack. The report contains the version/build, time, error category/source, screen/phase and storage status. Neither file is sent automatically. Reloading is a separate action with a warning about unsaved data.
- The history of the last 500 games is kept (the event log: the chronicle, the result and player statistics are rebuilt from it).

### 11.4a. Player base

- **Profile:** a name (up to 20 characters, unique ignoring case) and the date added. Stored on the device together with the history. A new installation starts with an empty base; opening the screen or reading it again neither creates profiles nor writes initial data. Existing profiles, their IDs and links to statistics survive updates.
- **No sign-in required:** player profiles are the host's local records, not player accounts. V1 has no Apple authentication, server account or automatic cross-device sync. A future host account for cloud features is designed separately from player IDs; signing in with Apple alone does not transfer the base.
- **Link to games:** the profile id becomes the player id in a game. That is why renaming does not lose statistics.
- **During game setup** players can be seated at the table by tapping them in the base (into free places in order; if there are no free places, one is added) or names can be typed in manually. At start every name is linked to a profile ignoring case; a new name is added to the base automatically; an empty place is a guest without a profile. One profile cannot sit at the table twice.
- **Statistics** are not stored separately — they are computed from the history of finished games (aborted and unfinished games do not count): games, wins, win %, by team, by role, favourite role, how the player went out (survived / killed at night / eliminated / removed or left), recent games with a link to the case file in the archive. Games played before the base existed are counted by name match.
- **Deleting** a profile does not touch the archive, but the statistics disappear: a new profile with the same name will not get the old games.

### 11.5. Pause

- The "Pause" button stops all timers. While paused, the night screen shows nothing secret.

### 11.6. Peeking at the host's phone

- Night screens are dark, without large bright spots: the light of the screen must not reveal that the host is showing something.
- The answer to the Commissar is a separate full-screen "showing" that closes on tap.
- The list of roles — only while held.

---

## 12. Settings

All settings are chosen before the game and **do not change during the game**. There are presets: **"Classic"** (the defaults below), "Sports" and "Custom". The host saves their own sets as **rule profiles** ("My rules" on the Rules step): up to 30 profiles with unique names (never a standard set name), picked with one tap, renamed, deleted, and updated with "Save changes" after editing a loaded profile. Profiles live on the device (), are part of device export and import, survive clearing the history and are removed by clearing all data.

| Key | Values | Default | Section |
|---|---|---|---|
| `firstNight` | `meeting` · `full` | **`meeting`** | §6 |
| `openSetup` | yes · no | **yes** | §5.4 |
| `fakeWakes` | yes · no | **yes** | §7.2 |
| `minWakeSeconds` | 0…30 | **10** | §7.2 |
| `mafiaCanTargetMafia` | yes · no | **no** | §4.3 |
| `commissarManiacResult` | `notMafia` · `mafia` | **`notMafia`** | §4.4 |
| `doctorSelfHealLimit` | 0 · 1 · ∞ | **1** | §4.5 |
| `doctorRepeatTarget` | yes · no | **no** | §4.5 |
| `loverRepeatTarget` | yes · no | **no** | §4.6 |
| `loverAlibi` | yes · no | **yes** | §4.6 |
| `alibiClientCanVote` | yes · no | **yes** | §4.6 |
| `loverProtects` | yes · no | **no** | §4.6 |
| `loverDeathLink` | yes · no | **yes** | §4.6 |
| `announceSaves` | yes · no | **no** | §7.5 |
| `revealRoleOnDeath` | `none` · `team` · `full` | **`none`** ❓ | §7.5 |
| `lastWordNight` | yes · no | **no** | §8.1 |
| `lastWordDay` | yes · no | **yes** | §8.1 |
| `speakingOrder` | `rotating` · `fromFirst` | **`rotating`** | §8.2 |
| `selfNomination` | yes · no | **no** | §8.3 |
| `firstDayVoting` | yes · no | **yes** | §8.4 |
| `firstDaySingleCandidateSafe` | yes · no | **yes** | §8.4 |
| `singleCandidateAutoEliminate` | yes · no | **no** | §8.5 |
| `abstainAllowed` | yes · no | **yes** | §8.5 |
| `tieRule` | `sports` · `revoteThenNobody` · `nobody` | **`sports`** | §8.6 |
| `earlyWinDetection` | yes · no | **yes** | §9 |
| `fouls` | yes · no | **no** | §11.2 |
| `removalCancelsVote` | yes · no | **no** | §11.1 |
| `timers.speech` | 30…120 s | **60** | §8 |
| `timers.defense` | 15…60 s | **30** | §8.6 |
| `timers.lastWord` | 15…120 s | **60** | §8 |

"Sports" preset: `abstainAllowed = no`, `singleCandidateAutoEliminate = yes`, `fouls = yes`, `removalCancelsVote = yes`, `lastWordNight = yes`, `revealRoleOnDeath = none`.

---

## 13. Engine: data model and invariants

### 13.1. Principles

- The engine is a **separate module with no UI**, pure functions. No timers, no DOM, no network.
- The state is fully derived from the **event log**: `state = events.reduce(apply, initialState)`. Undo = drop the last event and recompute.
- Every event goes through **validation**: `validate(state, event) → ok | error (code + message in Russian)`. An invalid event is never applied.
- The engine itself tells the interface what can be done right now: `getAvailableActions(state)`.
- Randomness only when dealing roles, through a seed stored in the event.
- The state serialises to JSON; the format has a version number.

### 13.2. Types (TypeScript, sketch)

```ts
type Role = 'civilian' | 'mafia' | 'commissar' | 'doctor' | 'lover' | 'maniac';
type Team = 'town' | 'mafia' | 'maniac';

type DeathCause = 'night' | 'loverLink' | 'vote' | 'removed' | 'left';

interface Player {
  id: string;
  seat: number;            // 1..N
  name: string;
  role: Role;
  alive: boolean;
  death?: { cause: DeathCause; phase: 'night' | 'day'; number: number };
  fouls: number;
}

type Target = string | null; // player id, or null = skip / miss

interface NightChoices {
  lover?: Target;
  mafia?: Target;
  maniac?: Target;
  doctor?: Target;
  commissar?: Target;
}

interface NightRecord {
  number: number;
  kind: 'meeting' | 'full';
  choices: NightChoices;
  blocked: string | null;
  checkResult: 'mafia' | 'notMafia' | 'noAnswer' | null;
  deaths: { playerId: string; cause: DeathCause }[];
  saved: string[];         // who was saved (for the chronicle)
  alibiFor: string | null;
}

interface VoteRound {
  kind: 'main' | 'revote' | 'allOut';
  candidates: string[];
  votes: Record<string, string[]>;  // candidateId -> voterIds ('allOut': 'yes' -> voterIds)
}

interface DayRecord {
  number: number;
  firstSpeaker: string;
  nominations: { by: string; candidate: string }[];
  rounds: VoteRound[];
  eliminated: string[];
}

interface Memory {
  lastLoverTarget: Target;
  lastDoctorTarget: Target;
  doctorSelfHeals: number;
}

type Phase =
  | { t: 'setup' }
  | { t: 'reveal'; index: number }
  | { t: 'night'; number: number; step: 'lover' | 'mafia' | 'maniac' | 'doctor' | 'commissar' | 'meeting' }
  | { t: 'morning'; number: number }
  | { t: 'lastWords'; queue: string[]; next: 'discussion' | 'night' }
  | { t: 'discussion'; number: number; speakerIndex: number }
  | { t: 'voting'; number: number; round: number }
  | { t: 'defense'; number: number; queue: string[] }
  | { t: 'gameOver'; result: GameResult };

type GameResult =
  | { winner: 'town' | 'mafia' | 'maniac' }
  | { winner: 'draw'; reason: 'allDead' | 'stalemate' | 'manual' }
  | { winner: 'aborted' };

interface GameState {
  version: 1;
  settings: Settings;
  seed: string;
  players: Player[];
  phase: Phase;
  nights: NightRecord[];
  days: DayRecord[];
  memory: Memory;
}
```

### 13.3. Events

The implemented set (`engine/src/types.ts`):

| Event | What it does |
|---|---|
| `CreateGame` | Settings, players by seat, composition, dealing (`app` + seed or `cards` + roles). |
| `Proceed` | "Next": role seen, night step finished (on the last step the engine resolves the night itself), announcement read, speech over. |
| `NightChoose(target or null)` | The role's choice on the current step; `null` — skip/miss. Can be changed until `Proceed`. |
| `Nominate(candidate)` | The current speaker nominates a candidate. |
| `CastVotes(voters or counts)` | Result of a voting round: who voted for whom, or just numbers. |
| `RemovePlayer(id, cause)` | A player left / was removed. |
| `Foul(id)` | A foul. |
| `EndGame(draw or aborted)` | Manual end of the game. |

Queries for the interface (`engine/src/queries.ts`): `getNightStepView`, `getCommissarResult`, `getMorningReport`, `getRoleCard`, `getNominationOptions`, `getCurrentSpeaker`, `getEligibleVoters`, `publicIdentity`, `getWinners`.

### 13.4. Invariants (checked by tests at every step)

1. A player who is out does not act, vote or nominate, and cannot be a target or a candidate.
2. Each role makes at most one choice per night.
3. Night actions are resolved simultaneously; the result does not depend on the input order.
4. The death announcement contains neither the killer nor the cause; the order is by seat number.
5. Each player votes at most once per round.
6. The total of a round's votes ≤ the number of voters.
7. The "two nights in a row" and "self-heal" restrictions are counted by the choice made.
8. After game over no game events are accepted except undo.
9. The win check runs after every change in who is alive.
10. A `state` recomputed from the log from scratch is identical to the current one.

---

## 14. Screens and user flow

Host mode, phone in portrait orientation (tablet — two-column layout).

### 14.1. Home screen
"New game" · "Continue" (if there is an unfinished game) · "Players" (base and profiles, §11.4a) · "Rules" · "Game history".

On first launch, a short introduction appears before Home: 5–20 players plus a separate host, one phone, in-person conversation, setup and prompts, offline play in the installed app and local data without registration. Language selection is immediately available. "Set up a game" opens setup and "Go to Home" skips the introduction; both save that it was seen. "How to use" on Home reopens it without creating demo players/games. An unfinished game or data needing recovery takes priority over the introduction. Matching store positioning is drafted in `docs/STORE_DESCRIPTION.md` for final verification before publication.

### 14.1a. App settings
A separate Settings screen is accessible from Home: language, independent sound and vibration controls, a "Keep screen on" mode (during a game — the default / always / never; Screen Wake Lock, held only by the tab that owns the game; without browser support the app suggests a longer auto-lock time), internal backups, data export/import and clearing (§11.4), local-storage information, GitHub support, app version/build and full license texts. Backups return to Settings or History depending on where they were opened. Older preferences without a vibration field inherit their initial vibration setting from sound, so an update does not turn alerts on for previously muted users. License texts ship with the app; their separate module is included in the offline cache. Public privacy and final store-support contact details are prepared separately.

### 14.2. Game setup

1. **Players:** the count (5–20); the seating order, clockwise ("up/down" arrows); everyone has the number from their card — tapping the chip opens a window with chips 1–20, taken ones are unavailable; "Reset all numbers" removes the numbers from everyone (a "?" chip), after which the window hands out numbers one after another, moving by itself to the next player without a number; while anyone has no number you cannot go further; names (from the base or typed in; by default "Player {number}"). The list of names and the numbers are remembered between games.
2. **Composition:** recommended by the table, ± buttons per role, balance indicator, validation errors.
3. **Rules:** a preset + expandable settings, each with an explanation.
4. **Dealing:** "The app will deal" / "I'll deal physical cards".

### 14.3. Dealing roles (passing the phone)
- Screen: "Pass the phone to: #3 Anna".
- The player **holds** the sealed envelope → the envelope opens and the role card is visible (the mafia also sees the list of accomplices). Releases → the card hides.
- "I've got it" → a placeholder screen "Pass the phone to: #4 …". The previous player's role does not stay on screen for even an instant.
- After everyone — "Give the phone back to the host".

### 14.4. Night
- Dark theme. At the top — the host's line (§15) in a typewriter font, which the host reads aloud.
- A grid of player chips. Tap — choose the target. Invalid targets are dimmed; tapping shows the reason.
- **The chips of those who are waking are highlighted** with a brass ring and the label "acting" — even if they cannot choose themselves.
- Buttons: "Skip" ("Miss" for the mafia), "Next".
- Commissar: after the choice — a full-screen card "MAFIA" / "NOT MAFIA" that the host turns towards the Commissar.
- Don: after the choice — a card "COMMISSAR" / "NOT COMMISSAR".
- Every answer uses the same dark background, panel size and text colour, without light paper, stamp animation or sound. The minimum wait also applies to blocked and fake wakes and stops while the game is paused. Consistent styling does not replace testing an actual screen's glow in a dark room.
- Blocked role: instead of the grid — a big "The Mistress is with him" screen with the chip crossed out. No choice, only "Next".
- Fake wake: the same screen, chips inactive, a note "The role is out — wait the pause" and a countdown.
- Night step bar: Mistress · Commissar · Doctor · Mafia · Don · Maniac.

### 14.5. Morning
- Switch to the light theme. A "newspaper" with a headline: "#7 DIED TONIGHT" / "A QUIET NIGHT" and an "Alibi: #4" badge.
- If someone won — straight to the game over screen.

### 14.6. Day
- A circle of chips, the current speaker highlighted, a large speech timer.
- During a speech: "Nominate…" → choose a chip (those with an alibi are unavailable).
- The list of candidates at the top.
- Voting: for each candidate in turn the host taps the chips of the voters (they "toss a chip onto the felt"), a vote counter, a warning on a repeated vote.
- Tie: the defense screen with the defense speech timer, then the revote.

### 14.7. Game over
- A "CASE CLOSED" stamp, the winning team, all roles.
- The "Chronicle" tab — night by night, day by day.
- "Play again" (same players, a new deal).

### 14.8. Persistent elements
- "Undo" (always visible except during the deal).
- "Pause".
- "Eye": the roles cheat sheet while held.
- **Host's console** (☰ button), two tabs:
  - **Players** — everyone at the table: number, name, public status (in the game / how they went out, alibi, fouls); roles are not shown. Tapping a player opens their card: **change number** (the window with chips 1–20, taken ones unavailable), **fix the name** (in this game only; the profile in the base is not changed), **foul**, **player left the game**, **remove for a violation**. Number and name can be changed for players who are out, too.
  - **Game** — rules of this game, sound and vibration, declare a draw, abort the game, to the home screen.
  - Changing a number or name is an event in the log (`ChangeSeat`, `RenamePlayer`): it can be undone with ↶ and survives a reload. It does not affect the rules or the order. After game over changes are unavailable.

---

## 15. Host script

Lines that the app shows to the host (and that can later be voiced, §17.4). Numbers and names are substituted into the text. The app is currently in Russian; below are the original lines with their English equivalents.

| Key | Russian (in the app) | English |
|---|---|---|
| `night.start` | Город засыпает. Все закрывают глаза. | The town falls asleep. Everyone closes their eyes. |
| `night.meeting.mafia` | Просыпается мафия. Посмотрите друг на друга и запомните своих. | The mafia wakes up. Look at each other and remember your own. |
| `night.meeting.mafia.sleep` | Мафия засыпает. | The mafia falls asleep. |
| `night.lover.wake` | Просыпается любовница. К кому вы пойдёте этой ночью? | The Mistress wakes up. Whom will you visit tonight? |
| `night.lover.sleep` | Любовница засыпает. | The Mistress falls asleep. |
| `night.mafia.wake` | Просыпается мафия. Выберите жертву. (С доном: «Просыпаются мафия и дон. Выберите жертву — последнее слово за доном.») | The mafia wakes up. Choose your victim. (With the Don: "The mafia and the Don wake up. Choose your victim — the Don has the final word.") |
| `night.mafia.sleep` | Мафия сделала выбор и засыпает. | The mafia has made its choice and falls asleep. |
| `night.maniac.wake` | Просыпается маньяк. Кто не увидит рассвета? | The Maniac wakes up. Who will not see the dawn? |
| `night.maniac.sleep` | Маньяк засыпает. | The Maniac falls asleep. |
| `night.doctor.wake` | Просыпается доктор. Кого вы спасёте этой ночью? | The Doctor wakes up. Whom will you save tonight? |
| `night.doctor.sleep` | Доктор засыпает. | The Doctor falls asleep. |
| `night.commissar.wake` | Просыпается комиссар. Кого вы проверите? | The Commissar wakes up. Whom will you check? |
| `night.commissar.sleep` | Комиссар засыпает. | The Commissar falls asleep. |
| `night.don.wake` | Просыпается дон. Кого вы проверите — не комиссар ли он? | The Don wakes up. Whom will you check — could he be the Commissar? |
| `night.don.sleep` | Дон засыпает. | The Don falls asleep. |
| `morning.start` | Город просыпается. | The town wakes up. |
| `morning.deaths.one` | Этой ночью нас покинул игрок №{seat}, {name}. | Tonight we lost player #{seat}, {name}. |
| `morning.deaths.many` | Этой ночью нас покинули: {list}. | Tonight we lost: {list}. |
| `morning.deaths.none` | Этой ночью никто не погиб. | Nobody died tonight. |
| `morning.alibi` | У игрока №{seat} сегодня алиби: его нельзя выставить. | Player #{seat} has an alibi today: they cannot be nominated. |
| `morning.saved` | Этой ночью кого-то спасли. | Someone was saved tonight. |
| `day.lastWord` | Игрок №{seat}, ваше последнее слово. | Player #{seat}, your last word. |
| `day.speech` | Слово игроку №{seat}, {name}. | The floor goes to player #{seat}, {name}. |
| `day.noCandidates` | Никто не выставлен. Голосования не будет. | Nobody is nominated. There will be no vote. |
| `day.singleSafe` | В первый день единственная кандидатура не голосуется. | On the first day a single candidate is not put to the vote. |
| `vote.start` | Переходим к голосованию. Кандидаты: {list}. | Let's vote. Candidates: {list}. |
| `vote.candidate` | Кто за то, чтобы игрок №{seat} покинул город? | Who is for player #{seat} leaving the town? |
| `vote.tie` | Голоса разделились между {list}. Каждому — слово в защиту. | The votes are split between {list}. Each gets a word in their defense. |
| `vote.allOut` | Кто за то, чтобы все игроки — {list} — покинули город? | Who is for all the players — {list} — leaving the town? |
| `vote.result` | Город решил: игрок №{seat} покидает игру. | The town has decided: player #{seat} leaves the game. |
| `vote.nobody` | Город не пришёл к решению. Никто не покидает игру. | The town could not decide. Nobody leaves the game. |
| `end.town` | Мафия повержена. Город победил. | The mafia is defeated. The town wins. |
| `end.mafia` | Мафия захватила город. | The mafia has taken over the town. |
| `end.maniac` | В городе остался только маньяк. | Only the Maniac is left in the town. |
| `end.draw` | В живых не осталось никого, кто мог бы победить. Ничья. | There is nobody left alive who could win. A draw. |

---

## 16. Design

### 16.1. Concept: "Green felt and case file #"

Three layers from which the whole visual language is built:

1. **The green felt** of a gaming table: the background, the playing field, casino chips instead of avatars. Voting is "betting": votes are chips tossed into a candidate's column.
2. **A 1930s criminal case file:** cardboard folders, typewritten text, paper clips, rubber stamps "KILLED", "EXILED", "ALIBI", "CASE CLOSED". The morning is an evening newspaper with a headline.
3. **The neon sign of a speakeasy:** the only bright accent — absinthe green, at night only.

**Day = the investigator's desk** (light paper theme). **Night = felt under a lamp** (deep green theme). The theme is switched by the **game phase**, not by the system setting. The change of day and night is the main visual rhythm of the app.

### 16.2. Palette

| Token | Colour | Where |
|---|---|---|
| `--felt-950` | `#08160F` | Night background |
| `--felt-800` | `#0F2E21` | Night cards |
| `--felt-600` | `#1D5A40` | Felt, playing field |
| `--absinthe` | `#B9D94A` | Night accent, target selection, neon |
| `--paper` | `#EEE4CD` | Day background |
| `--paper-shade` | `#D8C8A3` | Day cards, folders |
| `--ink` | `#1B1813` | Main day text |
| `--stamp` | `#B3261E` | Stamps, death, errors |
| `--brass` | `#B4894A` | Frames, seat numbers, the lamp |
| `--smoke` | `#8C9B90` | Secondary text, players who are out |

Red (`--stamp`) — only death, errors and stamps. Absinthe (`--absinthe`) — only night choices. Text contrast — at least WCAG AA.

### 16.3. Fonts

All fonts have been checked: they **support Cyrillic**. They are bundled locally (woff2) so the app works offline.

| Role | Font | Why |
|---|---|---|
| Headings, role names, seat numbers | **Oranienbaum** | A high-contrast serif made specifically for Cyrillic. Feels like an old poster and a newspaper headline. |
| Interface, buttons, body text | **Commissioner** | A variable sans-serif with character. The name speaks for itself. |
| Host lines, chronicle, timers, dossier | **Anonymous Pro** | Monospaced, "typewritten". The host reads the lines like a protocol. |
| Handwritten notes (host's notes, "suspicion") | **Bad Script** | Pencil handwriting in the margins of the case file. |
| Fallback font for stamps (if there are no images) | **Rubik Dirt** | The texture of a "dirty" imprint. |

**We do not use:** Inter, Roboto, Montserrat, Open Sans, Poppins, Playfair Display, Cormorant, Lora, Space Grotesk, the system font.

### 16.4. Textures and elements

- Paper with fibres and light stains, folder cardboard, paper clips, a coffee cup ring.
- A smooth green gradient on the home screen and at night, a soft vignette and a cone of lamp light over the field. The grainy felt texture has been removed from the project.
- Player chips: round casino chips with the seat number (Oranienbaum) and the name. A player who is out — the chip is flipped, desaturated, with a red stamp on top.
- Dealing a role — an envelope with a wax seal.
- No glass (glassmorphism) and no "cloudy" cards with a shadow on white. Green surfaces use calm gradients without grain noise.

### 16.5. Motion

- **Stamp:** a slam from scale 1.3 → 1 with a slight rotation and a short screen shake.
- **Typewriter:** the host's lines are typed character by character (tap to skip).
- **Chip:** tossed onto the felt on a vote.
- **Day/night:** a "lamp goes out" / "morning through the blinds" transition (stripes of light).
- With `prefers-reduced-motion` — simple changes without animation.

### 16.6. Usability

- Touch targets ≥ 48 px; chips for 20 players fit on a phone screen without scrolling (a 4×5 grid).
- Night screens are dark and dim.
- All important actions come with a confirmation or undo.
- Sound and vibration ⚙️ can be turned on and off independently in Settings and the host menu; night restrictions apply regardless of preferences.

---

## 17. Assets

**Implemented, updated 27 Oct 2026:** 7 role illustrations including the Don (WebP 1024×1536, image_gen), a vector card back, 9 SVG stamps with Cyrillic, 2 paper and cardboard textures (WebP 1254×1254), 11 original short WAV signals, an emblem and 3 PWA icons. The grainy felt texture was removed at the user's request; the home screen and the night use a smooth green gradient. Vector role icons stay built into the interface. Prompts — `app/src/assets/generation-prompts.json`; sources and how to reproduce them — `app/src/assets/README.md`.

Card portraits are shown in full, keeping their proportions and anchored to the top edge (`object-fit: contain`); the caption must not push out the illustration or crop the character's head.

Role briefs are generated from the game's settings and are available during the deal only while held, and to the host in the "Rules of this game" menu. On release, loss of focus or when the tab is hidden, the secret text is removed from the screen. An A4 kit is available: seat numbers 1–20 and a general guide (`app/public/print-kit.html`).

The night sound policy is centralised: only the shared signal for the start of the night and for the morning are allowed; target choices, rejections, blocks, fake wakes and Commissar/Don answers are silent. Vibration is forbidden at night and during the deal. Playback and an already running vibration pattern stop on pause, when the page is hidden and when the phase changes; disabling an individual alert cancels only that alert. Delayed decoding cannot resurrect an outdated sound. All supported image and audio formats are included in the offline cache. The typewriter sound is prepared but not bound to night lines. Background music, host voice-over and the four game-over illustrations remain P2.

**Until an asset exists, the app draws a placeholder:** a stylised SVG with a caption, in the palette. To replace a placeholder, drop a file into **`app/src/assets/`** at the given path (paths in the tables below are relative to it, without `assets/`; any extension of webp/png/jpg/svg, for sound — mp3/ogg/m4a/wav). No code changes needed: the app finds the files at build time. Details — `app/src/assets/README.md`. Exception — the app icons: `app/public/assets/brand/`.

Priority: **P0** — needed for a good-looking v1, **P1** — desirable, **P2** — later.

### 17.1. Images

| Path | What | Format and size | Priority |
|---|---|---|---|
| `assets/roles/civilian.webp` | Card art: civilian | WebP, 1024×1536 (2:3) | P0 |
| `assets/roles/mafia.webp` | Art: mafioso | same | P0 |
| `assets/roles/commissar.webp` | Art: Commissar | same | P0 |
| `assets/roles/doctor.webp` | Art: Doctor | same | P0 |
| `assets/roles/lover.webp` | Art: Mistress | same | P0 |
| `assets/roles/maniac.webp` | Art: Maniac | same | P0 |
| `assets/roles/back.webp` | Card back | same | P0 |
| `assets/icons/roles/*.svg` | Icons for the 6 roles, single-colour (coloured via CSS) | SVG, 96×96, 2 px stroke | P0 |
| `assets/stamps/killed.png` | Stamp "KILLED" | PNG with transparency, 1024×512 | P0 |
| `assets/stamps/exiled.png` | Stamp "EXILED" | same | P0 |
| `assets/stamps/alibi.png` | Stamp "ALIBI" | same | P1 |
| `assets/stamps/case-closed.png` | Stamp "CASE CLOSED" | same | P0 |
| `assets/stamps/checked-mafia.png` | Stamp "MAFIA" (for the answer to the Commissar) | same | P1 |
| `assets/stamps/checked-clean.png` | Stamp "NOT MAFIA" | same | P1 |
| `assets/textures/paper.webp` | Paper, seamless | WebP, 1024×1024 | P0 |
| `assets/textures/cardboard.webp` | Folder cardboard, seamless | WebP, 1024×1024 | P1 |
| `assets/ui/envelope.webp` | Envelope (closed and open — 2 frames or 2 files) | WebP, 1080×1350 | P1 |
| `assets/ui/wax-seal.png` | Wax seal | PNG, 512×512 | P1 |
| `assets/ui/newspaper-masthead.png` | Masthead of the "Evening Town" newspaper | PNG, 1600×300 | P1 |
| `assets/end/town.webp` | Game over: town wins | WebP, 1080×1920 | P2 |
| `assets/end/mafia.webp` | Game over: mafia wins | same | P2 |
| `assets/end/maniac.webp` | Game over: Maniac wins | same | P2 |
| `assets/end/draw.webp` | Game over: draw | same | P2 |
| `assets/brand/logo.svg` | GreenMafia logo | SVG | P0 |
| `assets/brand/icon-512.png`, `icon-192.png`, `icon-maskable.png` | App icons | PNG | P0 |

Guidelines for role art: one style for all 6 cards; the character in the upper 2/3 of the card, the lower third calm (the role caption goes there in the app's font; do **not** put text into the art); there must be no differences in tone or brightness between roles that would let someone guess a role from a distance during the deal.

### 17.2. Sounds (P1)

| Path | What |
|---|---|
| `assets/audio/sfx/night-fall.mp3` | The town falls asleep (the lamp goes out, crickets) |
| `assets/audio/sfx/morning.mp3` | The town wakes up |
| `assets/audio/sfx/stamp.mp3` | A stamp slam |
| `assets/audio/sfx/chip.mp3` | A chip on the felt (a vote) |
| `assets/audio/sfx/typewriter.mp3` | A short typewriter burst |
| `assets/audio/sfx/tick.mp3` | Ticking for the last 10 seconds |
| `assets/audio/sfx/time-up.mp3` | Time is up |
| `assets/audio/sfx/envelope.mp3` | Opening the envelope |
| `assets/audio/sfx/win-town.mp3`, `win-mafia.mp3`, `win-maniac.mp3` | Game over |
| `assets/audio/ambience/night-loop.mp3` | Night background (quiet, seamless) |
| `assets/audio/ambience/day-loop.mp3` | Day background (jazz from the bar next door, quiet) |

**Warning:** at night, never play sounds tied to a specific choice (for example, a gunshot at the very moment the mafia chooses): that is a hint to the players. All night sounds are of equal length on every step, or only at the start and the end of the night.

### 17.3. Fonts
Downloaded from Google Fonts (OFL licence) and placed in `assets/fonts/`. The developer takes care of this; nothing is needed from you.

### 17.4. Host voice (P2)
Voice-over of the §15 lines (key = file name: `assets/audio/voice/night.start.mp3`, etc.). Lines with names and numbers are stitched from pieces ("Tonight we lost player number" + "seven") or voiced by speech synthesis. Needed for mode B.

---

## 18. Logic test scenarios

Each scenario is an automated engine test. "N" — night, "D" — day. Default settings: "Classic".

### Night

| # | Situation | Expected |
|:-:|---|---|
| 1 | Mafia → A, Doctor → A | Nobody died. |
| 2 | Mafia → A, Maniac → B, Doctor → A | B died. |
| 3 | Mafia → A, Maniac → A, Doctor → A | Nobody died. |
| 4 | Mafia → A, Maniac → A, no Doctor | A died, announced once. |
| 5 | Mafia → A, Maniac → B, no healing | A and B died, announced in ascending seat number. |
| 6 | Mistress → Doctor; Doctor → A; mafia → A | A died. |
| 7 | Mistress → Commissar | The Commissar's step is blocked: no choice possible, "Next" without a choice, answer "No answer". |
| 8 | Mistress → the only living mafioso | No mafia kill. |
| 9 | Mistress → one of two living mafiosi | The mafia kill happens. |
| 10 | Mistress → Maniac; Maniac → A | A is alive. |
| 11 | Mistress → A; mafia → A; `loverProtects = no` | A died. |
| 12 | Same, `loverProtects = yes` | A is alive. |
| 13 | `loverDeathLink = yes`; Mistress → B; mafia → Mistress | The Mistress and B died. |
| 14 | Same + Doctor → B | Only the Mistress died. |
| 15 | Same, but Doctor → Mistress | Nobody died. |
| 16 | Doctor → A on N2 | On N3 A is unavailable; on N4 available. |
| 17 | Doctor skipped on N2 (healed A on N1) | On N3 A is available. |
| 18 | Doctor → himself on N2 (limit 1) | From N3 on, "himself" is unavailable. |
| 19 | Mistress → Doctor | No choice possible; the self-heal and "two nights in a row" are not used up. |
| 20 | Commissar → Maniac, `commissarManiacResult = notMafia` | "Not mafia". |
| 21 | Same, `= mafia` | "Mafia". |
| 22 | Commissar → mafioso; mafia → Commissar | The answer "Mafia" is given, the Commissar died. |
| 23 | The mafia tries to choose a mafioso | Validation error. |
| 24 | The Mistress tries to choose the same player as last night | Validation error. |
| 25 | The Commissar is out | Fake wake, input disabled, "Next" no earlier than `minWakeSeconds`. |
| 26 | `firstNight = meeting` | No actions on N1; no deaths and no alibi on the morning of D1. |
| 27 | `loverDeathLink = no`; the Mistress died on N2 after visiting B | B gets an alibi on D2. |
| 27a | Default: mafia → Mistress, Mistress → B | The Mistress and B died. |
| 27b | Step order with the full composition | Mistress, Commissar, Doctor, mafia, Don, Maniac. |
| 27c | Don → Commissar / → civilian | "Commissar" / "Not commissar". |
| 27d | Mistress → Don; mafia → A | No Don check ("No answer"), A died (a mafioso decided). |
| 27e | Mistress → Don, the Don is the last mafia member | The mafia step is blocked, no mafia kill. |
| 27f | Commissar → Don | "Mafia". |
| 27g | The mafia tries to choose the Don; the Don checks himself | Validation error. |
| 27h | The Don is out | His separate step is a fake wake. |

### Day

| # | Situation | Expected |
|:-:|---|---|
| 28 | B has an alibi | B cannot be nominated; B votes. |
| 29 | Same, `alibiClientCanVote = no` | B does not vote. |
| 30 | Nobody nominated | No vote, night falls. |
| 31 | D1, one candidate, `firstDaySingleCandidateSafe = yes` | No vote. |
| 32 | D2, one candidate, 0 votes | Nobody is eliminated. |
| 33 | D2, one candidate, `singleCandidateAutoEliminate = yes` | The candidate is eliminated without a vote. |
| 34 | A=3, B=3 → defense → A=4, B=2 | A is eliminated. |
| 35 | A=3, B=3 → defense → A=3, B=3 → all-out vote: 5 of 9 "for" | A and B are eliminated. |
| 36 | Same, all-out vote: 4 of 9 "for" | Nobody is eliminated. |
| 37 | A=3, B=3, C=3 → revote A=4, B=4, C=1 | A new defense and revote only for A and B. |
| 38 | `tieRule = nobody`, A=2, B=2 | Nobody is eliminated. |
| 39 | `abstainAllowed = no`, 9 alive, candidates A and B, 3 for A, 2 for B | The 4 non-voters go to B → B=6, B is eliminated. |
| 40 | A player tries to vote a second time in a round | Validation error. |
| 41 | Self-nomination with `selfNomination = no` | Validation error. |
| 42 | A second nomination in the same speech | Validation error. |
| 43 | Order: #1 opened D1, #2 died on N2 | #3 opens D2. |

### Win

| # | Situation (M / K / T) | Expected |
|:-:|---|---|
| 44 | After the night: 3 / 0 / 3 | The mafia wins in the morning, before the last word. |
| 45 | After an elimination: 0 / 0 / 5 | The town wins, with no last word. |
| 46 | 0 / 1 / 1 | The Maniac wins. |
| 47 | 1/1/1 → the mafia killed the Maniac, the Maniac killed the mafioso → 0 / 0 / 1 | The town wins. |
| 48 | 1/1/1 → the mafia killed a civilian, the Maniac killed the mafioso → 0 / 1 / 0 | The Maniac wins. |
| 49 | 2 / 1 / 0 | The mafia wins (early). |
| 50 | 1 / 1 / 0 | Draw (early). |
| 51 | 2 / 1 / 0, `earlyWinDetection = no` | The game goes on. |
| 52 | 3 / 1 / 1 | The mafia wins (early, M ≥ T + 2). |
| 53 | 2 / 1 / 1 | The game goes on. |
| 54 | The last mafioso left the game during the day | The town wins immediately (if K = 0). |
| 55 | Enumerating all (M, K, T) for M ≤ 6, K ≤ 1, T ≤ 14 | Exactly one rule matches, or "goes on". |

### Service

| # | Situation | Expected |
|:-:|---|---|
| 56 | Undo the last vote | State = as before the vote. |
| 57 | Undo after game over | The game is on again. |
| 58 | Reloading the app in the middle of the night | The same night step is restored with the same choices. |
| 59 | Recomputing the state from the log from scratch | Matches the current one. |
| 60 | The same deal seed | The same role distribution. |

---

## 19. "Everyone on their own phone" mode (v2)

A sketch, to be detailed after v1.

### 19.1. Rooms
- The room creator gets a 5-character code and a QR code. Others join by the code.
- The creator is the admin (settings, start, kick), but plays as an equal.
- Seats — in the order of joining; the admin can reseat players.

### 19.2. Server
- The source of truth is the server: the same engine as in v1.
- Each client receives a **filtered** state according to the §10 matrix. Other players' roles and night choices never reach a device that is not entitled to them (protection against peeking through developer tools).
- At night **every** player has an "action" on screen, even civilians ("The town is asleep… please wait"), so that a role cannot be deduced from how a phone behaves. Civilians may be given an "empty" choice ("Whom do you suspect?") so that everyone taps the screen the same way.

### 19.3. Mafia at night
- The mafiosi see each other's choices in real time and a shared text chat.
- The result is the majority among the non-blocked living mafiosi. A tie ⚙️ — **miss** / a random one of the leaders.
- Time per turn ⚙️ (by default 40 s). No choice by the end of the time → skip (for the mafia — a miss).

### 19.4. Day
- The discussion is by voice, live; the app shows the queue, the timer and the "Nominate" button.
- Voting is on the phones, simultaneous and secret; the result is published all at once.

### 19.5. Disconnections
- Disconnected → 60 s to come back; the game waits only if it is their turn.
- Did not come back in time → the turn is skipped. The admin may remove the player (§11.1).

### 19.6. Players who are out
- See everything (roles, night moves) ⚙️, but cannot message the living.

---

## 20. Technology

Proposal (❓ confirm the platform):

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript | Types catch logic errors before anything runs. |
| Engine | A separate `engine/` package, tests in Vitest | Pure logic, 100% of the §18 scenarios. |
| Interface | React + Vite, PWA | Installs on a phone like an app, works offline, no app stores. |
| UI state | Zustand on top of the engine | Simple, no extra boilerplate. |
| Storage | IndexedDB | The event log and game history. |
| Languages | Russian (original) and English | Dictionaries in `app/src/i18n` (`ru.ts` is the master, `en.ts` has the same shape). The engine returns error codes with parameters; the app translates them. Stamps and the print kit are generated for each language. |
| v2 server | Node.js + WebSocket | The same engine on the server. |

Structure:
```
GreenMafia/
├─ GAME_DESIGN.md     # Russian original
├─ GAME_DESIGN.en.md  # English translation
├─ engine/        # rules, no UI
│  ├─ src/
│  └─ tests/      # §18 scenarios
├─ app/           # host-mode PWA
│  └─ src/
└─ assets/        # §17 (placeholders until the files exist)
```

---

## 21. Roadmap

| Stage | Result |
|---|---|
| 0 | This document is agreed, the §22 questions are answered. |
| 1 | ✔ Engine: all rules, all §18 tests pass, plus 600 random games without violations. |
| 2 | ✔ Host mode: all §14 screens on placeholders, a game can be run from start to finish (`app/`). |
| 3 | Design system §16, animations, sound, offline, installing on a phone. |
| 4 | Playtests with real people, balancing the §5 table. |
| 5 | Mode B (§19). |

---

## 22. Open questions

> **Decided 26 Oct 2026:** host mode (one phone), a PWA web app. The defaults in the document are accepted — questions 3, 4, 5 and 7 are closed as they are. 6 and 8 remain open.
>
> **Decided 27 Oct 2026:** question 6 — the manual is kept in Russian and English; the app will be translated into English as well.

1. ~~**Mode.**~~ Host mode first. ✔
2. ~~**Platform.**~~ PWA. ✔
3. **Roles of players who are out.** Reveal the role of the killed/eliminated? Currently **not revealed** by default (classic and sports). Home groups often reveal it — then I will set `full`.
4. **Mistress.** Is the base variant fine: block of the night action + day alibi, without night protection and without linked death?
5. **First night.** Mafia meeting without kills (default) — or a "real" night right away?
6. ~~**Language.**~~ Russian and English: the manual in both languages, the app to be translated. ✔
7. **Maniac from 11 players** — fine, or should he appear earlier (e.g. from 9)?
8. **The name "GreenMafia"** — working or final? The logo and the newspaper masthead depend on it.

---

## 23. Extensions (not in v1)

The engine architecture allows adding roles without rewriting the rules. Candidates for the future:

| Role | Gist |
|---|---|
| Shooting Commissar | Every night chooses: check or shoot. |
| Sergeant | The Commissar's assistant; becomes the Commissar after his death. |
| Journalist | Compares two players: are they on the same team? |
| Immortal | Does not die at night, only by vote. |
| Kamikaze | When eliminated during the day, takes one player with him. |
| Yakuza | A second mafia clan. |
