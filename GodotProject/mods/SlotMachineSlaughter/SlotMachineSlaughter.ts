// === SlotMachineSlaughter.ts ===
// Slot Machine Slaughter — Portal SDK mod
// Solo arcade: kill bots, roll random upgrades, survive 5 minutes

// ─── Constants ───────────────────────────────────────────────────────────────

const ROUND_DURATION_SECONDS = 300; // 5 minutes
const UPGRADE_FLASH_DURATION = 3;   // seconds
const DEALER_RESPAWN_DELAY = 30;    // seconds
const DEALER_SPAWNER_ID = 1;        // AI_Spawner ObjId in Godot scene
const DEALER_INTERACT_ID = 1;       // InteractPoint ObjId in Godot scene
const DEALER_WAYPOINT_COUNT = 4;    // Number of waypoints in scene
const BOT_SPAWNER_ID = 2;           // AI_Spawner ObjId for enemy bots
const VEHICLE_SPAWNER_ID = 1;       // VehicleSpawner ObjId for Drop Zone
const CLONE_SPAWNER_ID = 3;         // AI_Spawner ObjId for Clone Strike

// ─── Game State ──────────────────────────────────────────────────────────────

class GameState {
    static score = 0;
    static timeRemaining = ROUND_DURATION_SECONDS;
    static roundActive = false;
    static killCount = 0;
    static speedMultiplier = 1.0;
    static scoreFrenzyStacks = 0;
    static activeUpgrades: Map<string, number> = new Map();
    static deathMarkTargetId = -1;

    static addUpgrade(name: string) {
        const current = GameState.activeUpgrades.get(name) ?? 0;
        GameState.activeUpgrades.set(name, current + 1);
    }

    static getUpgradeStacks(name: string): number {
        return GameState.activeUpgrades.get(name) ?? 0;
    }
}

// ─── Upgrade System ──────────────────────────────────────────────────────────

type UpgradeFn = (killer: mod.Player, victim: mod.Player) => void;

interface Upgrade {
    key: string;       // matches stringkeys key e.g. 'upgKillshotWarp'
    name: string;      // display name
    apply: UpgradeFn;  // called on each kill while upgrade is active
    onRoll?: () => void; // called once when upgrade is first rolled (permanent state change)
}

let UPGRADE_POOL: Upgrade[] = [];

function rollUpgrade(): Upgrade {
    const idx = Math.round(mod.RandomReal(0, UPGRADE_POOL.length - 1));
    return UPGRADE_POOL[idx];
}

function applyRollToPlayer(killer: mod.Player, victim: mod.Player) {
    if (UPGRADE_POOL.length === 0) return;
    const upgrade = rollUpgrade();
    GameState.addUpgrade(upgrade.name);
    if (upgrade.onRoll) upgrade.onRoll();
    // apply() is handled by applyAllActiveUpgrades to prevent double-firing
    // Flash upgrade name to all human players
    const all = mod.AllPlayers();
    const n = mod.CountOf(all);
    for (let i = 0; i < n; i++) {
        const p = mod.ValueInArray(all, i) as mod.Player;
        if (!mod.GetSoldierState(p, mod.SoldierStateBool.IsAISoldier)) {
            UI.flashUpgrade(p, upgrade.name).catch(err => console.error(`flashUpgrade error: ${err}`));
        }
    }

    // Refresh the upgrade panel
    const allP = mod.AllPlayers();
    const nP = mod.CountOf(allP);
    for (let i = 0; i < nP; i++) {
        const p = mod.ValueInArray(allP, i) as mod.Player;
        if (p && !mod.GetSoldierState(p, mod.SoldierStateBool.IsAISoldier)) {
            UI.refreshUpgradePanel(p);
        }
    }
}

function applyAllActiveUpgrades(killer: mod.Player, victim: mod.Player) {
    for (const upgrade of UPGRADE_POOL) {
        const stacks = GameState.getUpgradeStacks(upgrade.name);
        for (let s = 0; s < stacks; s++) {
            upgrade.apply(killer, victim);
        }
    }
}

function getBotsNear(position: mod.Vector, radius: number): mod.Player[] {
    const all = mod.AllPlayers();
    const n = mod.CountOf(all);
    const result: mod.Player[] = [];
    for (let i = 0; i < n; i++) {
        const p = mod.ValueInArray(all, i) as mod.Player;
        if (!mod.GetSoldierState(p, mod.SoldierStateBool.IsAISoldier)) continue;
        if (!mod.GetSoldierState(p, mod.SoldierStateBool.IsAlive)) continue;
        const bpos = mod.GetSoldierState(p, mod.SoldierStateVector.GetPosition) as mod.Vector;
        const dx = mod.XComponentOf(bpos) - mod.XComponentOf(position);
        const dy = mod.YComponentOf(bpos) - mod.YComponentOf(position);
        const dz = mod.ZComponentOf(bpos) - mod.ZComponentOf(position);
        if (dx * dx + dy * dy + dz * dz <= radius * radius) {
            result.push(p);
        }
    }
    return result;
}

// ─── Upgrade Implementations ─────────────────────────────────────────────────

// 1. Killshot Warp — teleport to kill location on kill
const upgKillshotWarp: Upgrade = {
    key: 'upgKillshotWarp',
    name: 'Killshot Warp',
    apply: (killer, victim) => {
        const pos = mod.GetSoldierState(victim, mod.SoldierStateVector.GetPosition) as mod.Vector;
        mod.Teleport(killer, pos, 0);
    }
};

// 2. Speed Surge — permanent speed stack (onRoll updates multiplier)
const upgSpeedSurge: Upgrade = {
    key: 'upgSpeedSurge',
    name: 'Speed Surge',
    apply: (_killer, _victim) => {},
    onRoll: () => {
        GameState.speedMultiplier += 0.2;
        const all = mod.AllPlayers();
        const n = mod.CountOf(all);
        for (let i = 0; i < n; i++) {
            const p = mod.ValueInArray(all, i) as mod.Player;
            if (p && !mod.GetSoldierState(p, mod.SoldierStateBool.IsAISoldier)) {
                mod.SetPlayerMovementSpeedMultiplier(p, GameState.speedMultiplier);
            }
        }
    }
};

// 5. Score Frenzy — +1 score per kill per stack
const upgScoreFrenzy: Upgrade = {
    key: 'upgScoreFrenzy',
    name: 'Score Frenzy',
    apply: (_killer, _victim) => {},
    onRoll: () => {
        GameState.scoreFrenzyStacks++;
    }
};

// 6. Ghost Pulse — 2s invincibility after kill
const upgGhostPulse: Upgrade = {
    key: 'upgGhostPulse',
    name: 'Ghost Pulse',
    apply: (killer, _victim) => {
        (async () => {
            mod.SetPlayerMaxHealth(killer, 99999);
            await mod.Wait(2);
            mod.SetPlayerMaxHealth(killer, 100);
        })().catch(err => console.error(`Ghost Pulse error: ${err}`));
    }
};

// 8. Respawn Rush — reduce bot spawner delay
const upgRespawnRush: Upgrade = {
    key: 'upgRespawnRush',
    name: 'Respawn Rush',
    apply: (_killer, _victim) => {},
    onRoll: () => {
        const spawner = mod.GetSpawner(BOT_SPAWNER_ID);
        mod.SetUnspawnDelayInSeconds(spawner, 0);
    }
};

// 10. Bounty Hunter — every 5th kill grants a double roll (logic in OnPlayerEarnedKill)
const upgBountyHunter: Upgrade = {
    key: 'upgBountyHunter',
    name: 'Bounty Hunter',
    apply: (_killer, _victim) => {}
};

// 3. Shockwave — teleport nearby bots away from kill location
const upgShockwave: Upgrade = {
    key: 'upgShockwave',
    name: 'Shockwave',
    apply: (_killer, victim) => {
        const killPos = mod.GetSoldierState(victim, mod.SoldierStateVector.GetPosition) as mod.Vector;
        const nearby = getBotsNear(killPos, 15);
        for (const bot of nearby) {
            const bpos = mod.GetSoldierState(bot, mod.SoldierStateVector.GetPosition) as mod.Vector;
            const blastPos = mod.CreateVector(
                mod.XComponentOf(bpos) + (Math.round(mod.RandomReal(0, 10)) - 5),
                mod.YComponentOf(bpos) + 3,
                mod.ZComponentOf(bpos) + (Math.round(mod.RandomReal(0, 10)) - 5)
            );
            mod.Teleport(bot, blastPos, 0);
        }
    }
};

// 7. Chain Kill — deal 50 splash damage to bots near kill
const upgChainKill: Upgrade = {
    key: 'upgChainKill',
    name: 'Chain Kill',
    apply: (_killer, victim) => {
        const killPos = mod.GetSoldierState(victim, mod.SoldierStateVector.GetPosition) as mod.Vector;
        const nearby = getBotsNear(killPos, 10);
        for (const bot of nearby) {
            mod.DealDamage(bot, 50);
        }
    }
};

// 9. Magnet Kill — yank nearby bots toward killer
const upgMagnetKill: Upgrade = {
    key: 'upgMagnetKill',
    name: 'Magnet Kill',
    apply: (killer, _victim) => {
        const kpos = mod.GetSoldierState(killer, mod.SoldierStateVector.GetPosition) as mod.Vector;
        const nearby = getBotsNear(kpos, 20);
        for (const bot of nearby) {
            const pullPos = mod.CreateVector(
                mod.XComponentOf(kpos) + (Math.round(mod.RandomReal(0, 4)) - 2),
                mod.YComponentOf(kpos),
                mod.ZComponentOf(kpos) + (Math.round(mod.RandomReal(0, 4)) - 2)
            );
            mod.Teleport(bot, pullPos, 0);
        }
    }
};

// 4. Drop Zone — force a vehicle spawner to spawn
const upgDropZone: Upgrade = {
    key: 'upgDropZone',
    name: 'Drop Zone',
    apply: (_killer, _victim) => {
        const spawner = mod.GetVehicleSpawner(VEHICLE_SPAWNER_ID);
        mod.ForceVehicleSpawnerSpawn(spawner);
    }
};

// 13. Time Warp — freeze nearby bots for 2 seconds
const upgTimeWarp: Upgrade = {
    key: 'upgTimeWarp',
    name: 'Time Warp',
    apply: (_killer, victim) => {
        const killPos = mod.GetSoldierState(victim, mod.SoldierStateVector.GetPosition) as mod.Vector;
        const nearby = getBotsNear(killPos, 20);
        (async () => {
            for (const bot of nearby) {
                mod.SetSoldierEffect(bot, mod.SoldierEffects.FreezeStatusEffect, true);
            }
            await mod.Wait(2);
            for (const bot of nearby) {
                if (mod.GetSoldierState(bot, mod.SoldierStateBool.IsAlive)) {
                    mod.SetSoldierEffect(bot, mod.SoldierEffects.FreezeStatusEffect, false);
                }
            }
        })().catch(err => console.error(`Time Warp error: ${err}`));
    }
};

// 11. Clone Strike — spawn an allied bot for 15 seconds
const upgCloneStrike: Upgrade = {
    key: 'upgCloneStrike',
    name: 'Clone Strike',
    apply: (_killer, _victim) => {
        (async () => {
            const spawner = mod.GetSpawner(CLONE_SPAWNER_ID);
            const playerTeam = mod.GetTeam(0);
            mod.SpawnAIFromAISpawner(spawner, playerTeam);
            await mod.Wait(15);
            // Note: unspawns all clones from this spawner — concurrent stacks share the timer
            mod.UnspawnAllAIsFromAISpawner(spawner);
        })().catch(err => console.error(`Clone Strike error: ${err}`));
    }
};

// 12. Ground Slam — deal heavy AOE damage to all bots near the killer on kill
const upgGroundSlam: Upgrade = {
    key: 'upgGroundSlam',
    name: 'Ground Slam',
    apply: (killer, _victim) => {
        const kpos = mod.GetSoldierState(killer, mod.SoldierStateVector.GetPosition) as mod.Vector;
        const nearby = getBotsNear(kpos, 12);
        for (const bot of nearby) {
            mod.DealDamage(bot, 80);
        }
    }
};

// 15. Death Mark — killing a marked bot chains explosion + marks next bot
const upgDeathMark: Upgrade = {
    key: 'upgDeathMark',
    name: 'Death Mark',
    apply: (killer, victim) => {
        const victimId = mod.GetObjId(victim);
        if (victimId === GameState.deathMarkTargetId) {
            const pos = mod.GetSoldierState(victim, mod.SoldierStateVector.GetPosition) as mod.Vector;
            const nearby = getBotsNear(pos, 15);
            for (const bot of nearby) {
                mod.DealDamage(bot, 100);
            }
        }
        const kpos = mod.GetSoldierState(killer, mod.SoldierStateVector.GetPosition) as mod.Vector;
        const candidates = getBotsNear(kpos, 30);
        if (candidates.length > 0) {
            const idx = Math.floor(mod.RandomReal(0, candidates.length));
            const clamped = Math.min(idx, candidates.length - 1);
            GameState.deathMarkTargetId = mod.GetObjId(candidates[clamped]);
        }
    }
};

// 16. Infinite Ammo Burst — fill ammo in primary and secondary for 10 seconds
const upgInfiniteAmmo: Upgrade = {
    key: 'upgInfiniteAmmo',
    name: 'Infinite Ammo Burst',
    apply: (killer, _victim) => {
        (async () => {
            for (let t = 0; t < 10; t++) {
                mod.SetInventoryAmmo(killer, mod.InventorySlots.PrimaryWeapon, 999);
                mod.SetInventoryMagazineAmmo(killer, mod.InventorySlots.PrimaryWeapon, 999);
                mod.SetInventoryAmmo(killer, mod.InventorySlots.SecondaryWeapon, 999);
                mod.SetInventoryMagazineAmmo(killer, mod.InventorySlots.SecondaryWeapon, 999);
                await mod.Wait(1);
            }
        })().catch(err => console.error(`Infinite Ammo error: ${err}`));
    }
};

// 14. Scatter Shot — fill gadget slot ammo for 8 seconds
const upgScatterShot: Upgrade = {
    key: 'upgScatterShot',
    name: 'Scatter Shot',
    apply: (killer, _victim) => {
        (async () => {
            mod.SetInventoryAmmo(killer, mod.InventorySlots.GadgetOne, 8);
            mod.SetInventoryMagazineAmmo(killer, mod.InventorySlots.GadgetOne, 8);
            await mod.Wait(8);
            mod.SetInventoryAmmo(killer, mod.InventorySlots.GadgetOne, 0);
        })().catch(err => console.error(`Scatter Shot error: ${err}`));
    }
};

// Full upgrade pool — all 16
UPGRADE_POOL = [
    upgKillshotWarp,
    upgSpeedSurge,
    upgShockwave,
    upgDropZone,
    upgScoreFrenzy,
    upgGhostPulse,
    upgChainKill,
    upgRespawnRush,
    upgMagnetKill,
    upgBountyHunter,
    upgCloneStrike,
    upgGroundSlam,
    upgTimeWarp,
    upgScatterShot,
    upgDeathMark,
    upgInfiniteAmmo,
];

// ─── Dealer Bot ──────────────────────────────────────────────────────────────

class DealerBot {
    static isAlive = false;
    static dealerPlayer: mod.Player | null = null;
    static respawnCountdown = 0;
    static pendingSpawn = false;

    static spawn() {
        DealerBot.pendingSpawn = true;
        const spawner = mod.GetSpawner(DEALER_SPAWNER_ID);
        const playerTeam = mod.GetTeam(0);
        mod.SpawnAIFromAISpawner(spawner, mod.Message('The Dealer'), playerTeam);
        DealerBot.isAlive = true;
        DealerBot.respawnCountdown = 0;
        DealerBot.wanderToNextWaypoint();
        DealerBot.notifyAvailable();
    }

    static wanderToNextWaypoint() {
        if (!DealerBot.dealerPlayer) return;
        const wpIdx = Math.floor(mod.RandomReal(0, DEALER_WAYPOINT_COUNT));
        const clamped = Math.min(wpIdx, DEALER_WAYPOINT_COUNT - 1);
        const wp = mod.GetWaypointPath(clamped);
        mod.AIWaypointIdleBehavior(DealerBot.dealerPlayer, wp);
        mod.AISetMoveSpeed(DealerBot.dealerPlayer, mod.MoveSpeed.Walk);
    }

    static onDied() {
        DealerBot.isAlive = false;
        DealerBot.dealerPlayer = null;
        DealerBot.respawnCountdown = DEALER_RESPAWN_DELAY;
        DealerBot.notifyDied();
    }

    static tickRespawn() {
        if (DealerBot.isAlive) return;
        if (DealerBot.respawnCountdown <= 0) return;

        DealerBot.respawnCountdown--;
        DealerBot.notifyRespawning(DealerBot.respawnCountdown);

        if (DealerBot.respawnCountdown === 0) {
            DealerBot.spawn();
        }
    }

    static onInteract(player: mod.Player, interactPoint: mod.InteractPoint) {
        if (mod.GetObjId(interactPoint) !== DEALER_INTERACT_ID) return;
        if (!DealerBot.isAlive) return;
        DealerBot.showUpgradeChoice(player);
        DealerBot.wanderToNextWaypoint();
    }

    static showUpgradeChoice(player: mod.Player) {
        if (UPGRADE_POOL.length === 0) return;
        const pool = UPGRADE_POOL.slice();
        const choices: Upgrade[] = [];
        for (let i = 0; i < 3 && pool.length > 0; i++) {
            const idx = Math.floor(mod.RandomReal(0, pool.length));
            const clamped = Math.min(idx, pool.length - 1);
            choices.push(pool.splice(clamped, 1)[0]);
        }

        const names = choices.map(c => c.name).join(' | ');
        mod.DisplayNotificationMessage(
            mod.Message(`Dealer offers: ${names} — auto-picking ${choices[0].name} in 5s`),
            player
        );

        (async () => {
            await mod.Wait(5);
            if (!GameState.roundActive) return;
            const upgrade = choices[0];
            GameState.addUpgrade(upgrade.name);
            if (upgrade.onRoll) upgrade.onRoll();
            UI.flashUpgrade(player, upgrade.name).catch(err => console.error(`Dealer flash error: ${err}`));
            UI.refreshUpgradePanel(player);
        })().catch(err => console.error(`Dealer choice error: ${err}`));
    }

    static notifyAvailable() {
        const all = mod.AllPlayers();
        const n = mod.CountOf(all);
        for (let i = 0; i < n; i++) {
            const p = mod.ValueInArray(all, i) as mod.Player;
            if (p && !mod.GetSoldierState(p, mod.SoldierStateBool.IsAISoldier)) {
                UI.setDealerStatus(p, true);
            }
        }
    }

    static notifyDied() {
        const all = mod.AllPlayers();
        const n = mod.CountOf(all);
        for (let i = 0; i < n; i++) {
            const p = mod.ValueInArray(all, i) as mod.Player;
            if (p && !mod.GetSoldierState(p, mod.SoldierStateBool.IsAISoldier)) {
                UI.setDealerStatus(p, false, DEALER_RESPAWN_DELAY);
                mod.DisplayNotificationMessage(mod.Message(mod.stringkeys.dealerDied), p);
            }
        }
    }

    static notifyRespawning(seconds: number) {
        const all = mod.AllPlayers();
        const n = mod.CountOf(all);
        for (let i = 0; i < n; i++) {
            const p = mod.ValueInArray(all, i) as mod.Player;
            if (p && !mod.GetSoldierState(p, mod.SoldierStateBool.IsAISoldier)) {
                UI.setDealerStatus(p, false, seconds);
            }
        }
    }
}

// ─── UI ──────────────────────────────────────────────────────────────────────

const UI_TIMER_ID = 'sms_timer';
const UI_SCORE_ID = 'sms_score';
const UI_UPGRADE_FLASH_ID = 'sms_upgrade_flash';
const UI_DEALER_STATUS_ID = 'sms_dealer_status';
const UI_UPGRADES_PANEL_ID = 'sms_upgrades_panel';

class UI {
    static initForPlayer(player: mod.Player) {
        // Timer — top center
        mod.AddUIText(
            UI_TIMER_ID + mod.GetObjId(player),
            mod.CreateVector(0, 10, 0),
            mod.CreateVector(200, 50, 0),
            mod.UIAnchor.TopCenter,
            mod.GetUIRoot(),
            true,
            8,
            mod.CreateVector(0, 0, 0),
            0,
            mod.UIBgFill.None,
            mod.Message(mod.stringkeys.timerLabel, '5:00'),
            32,
            mod.CreateVector(1, 1, 1),
            1,
            mod.UIAnchor.Center,
            player
        );

        // Score — top right
        mod.AddUIText(
            UI_SCORE_ID + mod.GetObjId(player),
            mod.CreateVector(10, 10, 0),
            mod.CreateVector(200, 50, 0),
            mod.UIAnchor.TopRight,
            mod.GetUIRoot(),
            true,
            8,
            mod.CreateVector(0, 0, 0),
            0,
            mod.UIBgFill.None,
            mod.Message(mod.stringkeys.score, 0),
            28,
            mod.CreateVector(1, 1, 0),
            1,
            mod.UIAnchor.CenterRight,
            player
        );

        // Dealer status — bottom left
        mod.AddUIText(
            UI_DEALER_STATUS_ID + mod.GetObjId(player),
            mod.CreateVector(10, 10, 0),
            mod.CreateVector(300, 40, 0),
            mod.UIAnchor.BottomLeft,
            mod.GetUIRoot(),
            true,
            8,
            mod.CreateVector(0.1, 0.1, 0.1),
            0.6,
            mod.UIBgFill.Solid,
            mod.Message(mod.stringkeys.dealerRespawning, ''),
            18,
            mod.CreateVector(1, 0.8, 0),
            1,
            mod.UIAnchor.CenterLeft,
            player
        );
    }

    static updateTimer(player: mod.Player, seconds: number) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        const label = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
        const widget = mod.FindUIWidgetWithName(UI_TIMER_ID + mod.GetObjId(player)) as mod.UIWidget;
        if (widget) mod.SetUITextLabel(widget, mod.Message(mod.stringkeys.timerLabel, label));
    }

    static updateScore(player: mod.Player) {
        const widget = mod.FindUIWidgetWithName(UI_SCORE_ID + mod.GetObjId(player)) as mod.UIWidget;
        if (widget) mod.SetUITextLabel(widget, mod.Message(mod.stringkeys.score, GameState.score));
    }

    static async flashUpgrade(player: mod.Player, upgradeName: string) {
        const widgetId = UI_UPGRADE_FLASH_ID + mod.GetObjId(player);
        mod.AddUIText(
            widgetId,
            mod.CreateVector(0, 80, 0),
            mod.CreateVector(400, 60, 0),
            mod.UIAnchor.BottomCenter,
            mod.GetUIRoot(),
            true,
            12,
            mod.CreateVector(0.8, 0.4, 0),
            0.85,
            mod.UIBgFill.Solid,
            mod.Message(mod.stringkeys.upgradeRolled, upgradeName),
            26,
            mod.CreateVector(1, 1, 1),
            1,
            mod.UIAnchor.Center,
            player
        );
        await mod.Wait(UPGRADE_FLASH_DURATION);
        const w = mod.FindUIWidgetWithName(widgetId) as mod.UIWidget;
        if (w) mod.DeleteUIWidget(w);
    }

    static setDealerStatus(player: mod.Player, available: boolean, respawnSeconds?: number) {
        const widget = mod.FindUIWidgetWithName(UI_DEALER_STATUS_ID + mod.GetObjId(player)) as mod.UIWidget;
        if (!widget) return;
        if (available) {
            mod.SetUITextLabel(widget, mod.Message(mod.stringkeys.dealerAvailable));
            mod.SetUIWidgetVisible(widget, true);
        } else if (respawnSeconds !== undefined && respawnSeconds > 0) {
            mod.SetUITextLabel(widget, mod.Message(mod.stringkeys.dealerRespawning, respawnSeconds));
            mod.SetUIWidgetVisible(widget, true);
        } else {
            mod.SetUIWidgetVisible(widget, false);
        }
    }

    static refreshUpgradePanel(player: mod.Player) {
        const playerId = mod.GetObjId(player);
        for (const upgrade of UPGRADE_POOL) {
            const widgetId = UI_UPGRADES_PANEL_ID + playerId + upgrade.name.replace(/\s/g, '');
            const old = mod.FindUIWidgetWithName(widgetId) as mod.UIWidget;
            if (old) mod.DeleteUIWidget(old);
        }

        const upgrades = GameState.activeUpgrades;
        if (upgrades.size === 0) return;

        let yOffset = 60;
        for (const [name, stacks] of upgrades) {
            const label = stacks > 1 ? `${name} x${stacks}` : name;
            const widgetId = UI_UPGRADES_PANEL_ID + playerId + name.replace(/\s/g, '');
            mod.AddUIText(
                widgetId,
                mod.CreateVector(10, yOffset, 0),
                mod.CreateVector(220, 30, 0),
                mod.UIAnchor.TopLeft,
                mod.GetUIRoot(),
                true,
                6,
                mod.CreateVector(0, 0, 0),
                0.5,
                mod.UIBgFill.Solid,
                mod.Message(label),
                16,
                mod.CreateVector(1, 1, 1),
                1,
                mod.UIAnchor.CenterLeft,
                player
            );
            yOffset += 34;
        }
    }
}

// ─── Round Management ─────────────────────────────────────────────────────────

async function endRound() {
    const all = mod.AllPlayers();
    const n = mod.CountOf(all);

    for (let i = 0; i < n; i++) {
        const p = mod.ValueInArray(all, i) as mod.Player;
        if (!p) continue;
        if (mod.GetSoldierState(p, mod.SoldierStateBool.IsAISoldier)) continue;

        const widgetId = 'sms_endscreen_' + mod.GetObjId(p);
        mod.AddUIText(
            widgetId,
            mod.CreateVector(0, 0, 0),
            mod.CreateVector(600, 120, 0),
            mod.UIAnchor.Center,
            mod.GetUIRoot(),
            true,
            20,
            mod.CreateVector(0.05, 0.05, 0.05),
            0.9,
            mod.UIBgFill.Solid,
            mod.Message(mod.stringkeys.roundEnd, GameState.score),
            48,
            mod.CreateVector(1, 0.8, 0),
            1,
            mod.UIAnchor.Center,
            p
        );
    }

    await mod.Wait(10);

    const allPlayers = mod.AllPlayers();
    const playerCount = mod.CountOf(allPlayers);
    if (playerCount > 0) {
        const player = mod.ValueInArray(allPlayers, 0) as mod.Player;
        if (player) {
            mod.EndGameMode(player); // API requires a Player argument
        }
    }
}

// ─── Event Hooks ─────────────────────────────────────────────────────────────

export async function OnGameModeStarted() {
    mod.SetSpawnMode(mod.SpawnModes.AutoSpawn);
    GameState.score = 0;
    GameState.timeRemaining = ROUND_DURATION_SECONDS;
    GameState.roundActive = true;
    GameState.killCount = 0;
    GameState.speedMultiplier = 1.0;
    GameState.scoreFrenzyStacks = 0;
    GameState.activeUpgrades = new Map();
    await mod.Wait(3);
    DealerBot.spawn();
}

export function OnPlayerJoinGame(eventPlayer: mod.Player): void {
    // Dealer reference is captured in OnPlayerDeployed
}

export function OnPlayerDeployed(eventPlayer: mod.Player): void {
    if (!mod.GetSoldierState(eventPlayer, mod.SoldierStateBool.IsAISoldier)) {
        UI.initForPlayer(eventPlayer);
    }
    // Capture Dealer reference — only the bot spawned via pendingSpawn flag
    if (mod.GetSoldierState(eventPlayer, mod.SoldierStateBool.IsAISoldier) && DealerBot.isAlive && !DealerBot.dealerPlayer && DealerBot.pendingSpawn) {
        const team = mod.GetTeam(eventPlayer);
        if (mod.GetObjId(team) === mod.GetObjId(mod.GetTeam(0))) {
            DealerBot.dealerPlayer = eventPlayer;
            DealerBot.pendingSpawn = false;
            DealerBot.wanderToNextWaypoint();
        }
    }
}

export function OnPlayerDied(
    eventPlayer: mod.Player,
    eventOtherPlayer: mod.Player,
    eventDeathType: mod.DeathType,
    eventWeaponUnlock: mod.WeaponUnlock
): void {
    if (!mod.GetSoldierState(eventPlayer, mod.SoldierStateBool.IsAISoldier)) return;
    if (DealerBot.dealerPlayer && mod.GetObjId(eventPlayer) === mod.GetObjId(DealerBot.dealerPlayer)) {
        DealerBot.onDied();
    }
}

export function OnPlayerEarnedKill(
    eventPlayer: mod.Player,
    eventOtherPlayer: mod.Player,
    eventDeathType: mod.DeathType,
    eventWeaponUnlock: mod.WeaponUnlock
): void {
    if (!GameState.roundActive) return;

    const points = 1 + GameState.scoreFrenzyStacks;
    GameState.score += points;
    GameState.killCount++;

    applyRollToPlayer(eventPlayer, eventOtherPlayer);
    applyAllActiveUpgrades(eventPlayer, eventOtherPlayer);

    // Bounty Hunter: double roll every 5th kill
    if (GameState.killCount % 5 === 0 && GameState.getUpgradeStacks('Bounty Hunter') > 0) {
        applyRollToPlayer(eventPlayer, eventOtherPlayer);
    }

    const allPlayers = mod.AllPlayers();
    const n = mod.CountOf(allPlayers);
    for (let i = 0; i < n; i++) {
        const p = mod.ValueInArray(allPlayers, i) as mod.Player;
        if (!mod.GetSoldierState(p, mod.SoldierStateBool.IsAISoldier)) {
            UI.updateScore(p);
        }
    }
}

export function OnPlayerInteract(
    eventPlayer: mod.Player,
    eventInteractPoint: mod.InteractPoint
): void {
    DealerBot.onInteract(eventPlayer, eventInteractPoint);
}

export function OngoingGlobal(): void {
    if (!GameState.roundActive) return;

    GameState.timeRemaining -= 1;

    const allPlayers = mod.AllPlayers();
    const n = mod.CountOf(allPlayers);
    for (let i = 0; i < n; i++) {
        const p = mod.ValueInArray(allPlayers, i) as mod.Player;
        if (!mod.GetSoldierState(p, mod.SoldierStateBool.IsAISoldier)) {
            UI.updateTimer(p, GameState.timeRemaining);
            UI.updateScore(p);
        }
    }

    DealerBot.tickRespawn();

    if (GameState.timeRemaining <= 0) {
        GameState.roundActive = false;
        endRound().catch(err => console.error(`endRound error: ${err}`));
    }
}
