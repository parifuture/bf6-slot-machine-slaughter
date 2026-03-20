# Slot Machine Slaughter — Design Spec
**Date:** 2026-03-19
**SDK Version:** 1.2.2.0
**Map:** MP_Limestone

---

## Overview

A 5-minute arcade chaos game mode for solo play with bots. Every kill spins a slot machine and grants a random upgrade, fully stackable and duplicatable. A special helper bot called "The Dealer" roams the map offering guaranteed upgrade choices via interaction. Goal: highest kill score before time runs out.

---

## Core Loop

```
Round starts (5 min timer)
  -> Player kills bot
    -> OnPlayerEarnedKill fires
      -> Random upgrade selected from pool (duplicates allowed)
      -> Upgrade applied immediately
      -> UI flashes upgrade name (3s card)
      -> Score increments (+1, or more with Score Frenzy stacks)
  -> The Dealer roams map
    -> Player reaches Dealer + interacts
      -> Player chooses 1 of 3 presented upgrades
      -> Dealer moves to new random location
    -> If enemy bot kills Dealer
      -> Dealer respawns after 30s at random location
  -> Round ends at 0:00
    -> Final score displayed
```

---

## Upgrade Pool (16 total, all stackable, duplicates allowed)

| # | Name | Effect |
|---|---|---|
| 1 | Killshot Warp | Teleport to kill location on kill |
| 2 | Speed Surge | Permanent movement speed increase (stacks additively) |
| 3 | Shockwave | Blasts nearby bots outward on kill |
| 4 | Drop Zone | Vehicle drops from sky at kill location |
| 5 | Score Frenzy | +1 bonus kill point for rest of round (stacks) |
| 6 | Ghost Pulse | Brief invincibility window after each kill |
| 7 | Chain Kill | Kills deal splash damage to nearby bots |
| 8 | Respawn Rush | Bots respawn faster -- more targets |
| 9 | Magnet Kill | Yanks nearby bots toward player on kill |
| 10 | Bounty Hunter | Every 5th kill grants a double roll (two upgrades) |
| 11 | Clone Strike | Allied bot clone spawns for 15s on kill |
| 12 | Ground Slam | Player slams down from above on kill -- AOE on landing |
| 13 | Time Warp | Bots briefly freeze after each kill |
| 14 | Scatter Shot | Fills gadget ammo for 8s |
| 15 | Death Mark | Killing marked bot triggers explosion + marks next bot |
| 16 | Infinite Ammo Burst | 10s unlimited ammo after kill |

---

## The Dealer (Helper Bot)

- A named allied bot that does not fight
- Roams MP_Limestone via waypoint path
- Player interaction (OnPlayerInteract) triggers upgrade selection UI
- Presents 3 random upgrades -- player picks 1 (auto-applies first after 5s)
- After interaction, Dealer moves to a new random waypoint
- If killed by enemy bots: respawns after 30 seconds at a random location
- Acts as a risk/reward layer -- chase him mid-fight for a guaranteed choice vs. keep killing for random rolls

---

## Scoring

- Base: +1 point per kill
- Score Frenzy stacked N times: +(1+N) points per kill
- No other score modifiers
- Final score displayed on round end

---

## UI Layout

| Element | Position | Content |
|---|---|---|
| Timer | Top Center | Countdown MM:SS |
| Kill Score | Top Right | "Score: X" |
| Upgrade Flash | Bottom Center | Upgrade name card, fades after 3s |
| Active Upgrades | Side Panel | Name + stack count per upgrade |
| Dealer Status | Bottom Left | "Dealer available" / "Dealer respawning in Xs" |

---

## File Structure

```
GodotProject/mods/SlotMachineSlaughter/
  SlotMachineSlaughter.ts           # Game logic
  SlotMachineSlaughter.tscn         # Godot scene (based on MP_Limestone)
  SlotMachineSlaughter.strings.json # Localized UI strings
  tsconfig.json
```

---

## Key TypeScript Events Used

| Event / Function | Purpose |
|---|---|
| OnGameModeStarted | Setup timer, spawn Dealer, initialize state |
| OnPlayerEarnedKill | Trigger upgrade roll, update score |
| OnPlayerInteract | Handle Dealer interaction + upgrade selection |
| OnPlayerDied | Detect Dealer death |
| OngoingGlobal | Tick timer, check round end |
| mod.Teleport | Killshot Warp upgrade |
| mod.Wait | Async delays (Ghost Pulse, Time Warp, etc.) |
| mod.SetPlayerMovementSpeedMultiplier | Speed Surge |
| mod.SetSoldierEffect | Time Warp freeze |
| mod.AIWaypointIdleBehavior | Dealer roaming |

---

## Out of Scope (v1)

- Leaderboards / persistent scores
- Multiple maps
- Multiplayer balancing
- Upgrade synergy combos (intentional -- pure chaos is the point)
