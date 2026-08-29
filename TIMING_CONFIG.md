# Perudo Game Timing Configuration

## Overview

This document describes the configurable timing system for the Perudo server: server-operator
defaults set at startup via a config file, plus a per-room on/off toggle players can flip in a
running game.

Not part of CLAUDE.md/AGENTS.md's original MVP spec (section 3.4 describes a single fixed rules
config) — this is an intentional extension layered on top of it, called out here so it doesn't
get lost. Worth reconciling into the main spec docs at some point rather than living only here.

## Configurable Timer Values

The following timer values are configurable in `server/perudo.config.json` (loaded once, from
the server process's own working directory, at server startup — **not** the repo root):

### Base Timers

- `quietPhaseEndMs`: 0-15,000 ms (player thinks, no signal)
- `audiblePhaseEndMs`: 15,000-25,000 ms (yellow zone audible warning)
- `baseTurnMs`: After this many ms the personal time bank starts being spent
- `personalBankMs`: Fixed personal extra-time bank; does not regenerate in the MVP

### Special Round Timer

- `specialRoundBonusTimerMs`: 7,000ms bonus for special rounds

### Connection Handling

- `reconnectWaitWindowMs`: 60,000ms (1 minute) - hard timeout for disconnected players

## Enable/Disable Feature

`server/perudo.config.json`'s `enabled` field sets the **process-wide default** for every new
room, from server startup:

```json
{
  "enabled": true
}
```

Players can also toggle timers on/off **for their own room only**, at any time, via the
`setTimerMode` socket message (`{ enabled: boolean }`) — this is an in-memory override on that
room alone (`RoomRuntime.timerEnabled`), takes effect immediately (cancels/starts the room's
active timer right away, no restart needed), and never affects any other room. It does not write
to `perudo.config.json` — the file is a static startup default only, not something any client can
mutate.

## Implementation Notes

1. All configurable values fall back to default settings when not specified.
2. When timers are disabled (process-wide default or a room's own override), no turn timer events
   are scheduled or executed for that room.
3. `setTimerMode` is currently server-only — there is no client UI for it yet.

## Usage

### Basic Configuration

To customize default timing:

```json
{
  "turnTimer": {
    "quietPhaseEndMs": 10000,
    "audiblePhaseEndMs": 20000,
    "baseTurnMs": 20000,
    "personalBankMs": 25000
  },
  "specialRoundBonusTimerMs": 10000,
  "reconnectWaitWindowMs": 45000,
  "enabled": true
}
```

### Disable Timers Completely

```json
{
  "enabled": false
}
```

All changes will be applied to new rooms. Existing games retain their original timer behavior.
