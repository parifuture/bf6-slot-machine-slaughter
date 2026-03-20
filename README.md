# Slot Machine Slaughter

A Battlefield 6 Portal SDK mod. Solo arcade: kill bots, roll random stackable upgrades, survive 5 minutes.

## Concept

Every kill spins a slot machine and grants one random upgrade from a pool of 16 — all fully stackable, all duplicatable. A special ally bot called **The Dealer** roams the map. Find him and interact to get a guaranteed choice of 3 upgrades.

## Upgrades (16 total)

| # | Name | Effect |
|---|---|---|
| 1 | Killshot Warp | Teleport to kill location on kill |
| 2 | Speed Surge | Permanent movement speed increase (stacks) |
| 3 | Shockwave | Blasts nearby bots outward on kill |
| 4 | Drop Zone | Forces a vehicle to spawn |
| 5 | Score Frenzy | +1 bonus kill point per stack |
| 6 | Ghost Pulse | 2s invincibility after each kill |
| 7 | Chain Kill | Splash damage to nearby bots on kill |
| 8 | Respawn Rush | Bots respawn faster |
| 9 | Magnet Kill | Yanks nearby bots toward you on kill |
| 10 | Bounty Hunter | Every 5th kill grants a double roll |
| 11 | Clone Strike | Allied bot clone spawns for 15s |
| 12 | Ground Slam | AOE damage around you on kill |
| 13 | Time Warp | Nearby bots freeze for 2s on kill |
| 14 | Scatter Shot | Fills gadget ammo for 8s |
| 15 | Death Mark | Killing a marked bot chains an explosion |
| 16 | Infinite Ammo Burst | Unlimited ammo for 10s |

## The Dealer

An allied bot that roams **MP_Limestone** via waypoints. Interact with him to receive a choice of 3 random upgrades (auto-applies the first after 5s). If enemies kill him, he respawns after 30 seconds.

## File Structure

```
GodotProject/mods/SlotMachineSlaughter/
  SlotMachineSlaughter.ts           # All game logic
  SlotMachineSlaughter.strings.json # UI string keys
  tsconfig.json                     # Extends root tsconfig

code/modlib/index.ts                # Shared mod helper utilities
tsconfig.json                       # Root TypeScript config
package.json                        # Dev dependencies (typescript)
```

## Setup

This mod requires the **Battlefield 6 Portal SDK** (available from EA.com). Place the `GodotProject/mods/SlotMachineSlaughter/` folder inside your SDK's `GodotProject/mods/` directory.

The `code/types/mod/index.d.ts` type definitions ship with the SDK — they are not included here due to size.

```bash
npm install
npx tsc --project GodotProject/mods/SlotMachineSlaughter/tsconfig.json --noEmit
```

Then open the Godot project and set up the scene per the [implementation plan](docs/superpowers/plans/2026-03-20-slot-machine-slaughter.md) (Task 11).

## Map

**MP_Limestone** — medium-sized urban map. Scene setup (Task 11 in the plan) requires:
- Enemy AI_Spawner (ObjId 2)
- Dealer AI_Spawner (ObjId 1, no auto-spawn)
- Clone Strike AI_Spawner (ObjId 3, no auto-spawn)
- VehicleSpawner (ObjId 1, no auto-spawn)
- 4 WaypointPaths (ObjIds 0-3) for Dealer roaming
- InteractPoint (ObjId 1) near Dealer spawn

## Docs

- [Design Spec](docs/superpowers/specs/2026-03-19-slot-machine-slaughter-design.md)
- [Implementation Plan](docs/superpowers/plans/2026-03-20-slot-machine-slaughter.md)
