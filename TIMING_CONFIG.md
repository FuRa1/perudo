# Perudo Game Timing Configuration

## Overview

This document describes the new configurable timing system for the Perudo game, allowing players to customize timer settings from room creation and toggle timing features on/off.

## Configurable Timer Values

The following timer values are now configurable in `perudo.config.json`:

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

In addition to customizable timing values, you can disable the timing system entirely:

### Timer Mode Toggle
```json
{
  "enabled": true
}
```

When `enabled` is set to `false`, all timer functionality is disabled and games proceed without time pressure.

## Implementation Notes

1. All configurable values fall back to default settings when not specified
2. When timings are disabled, no turn timer events are scheduled or executed
3. The current implementation allows players to toggle timing mode via a socket message: `setTimerMode`
4. Configuration changes take effect immediately with new rooms (existing rooms retain their previous behavior)

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