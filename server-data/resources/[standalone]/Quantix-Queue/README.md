# Quantix-Queue

Advanced Discord priority queue system for FiveM servers with native Microsoft Adaptive Cards support.

## Features

- Discord Bot API integration (API v10) for fetching roles, avatars, and usernames.
- Configurable role IDs and rank order for priority and queue bypass.
- Native Microsoft Adaptive Card (v1.3) connection screen with rich customizable elements.
- Granular control over screen display elements (avatar, username, priority rank, position, estimated wait time, announcements, action buttons).
- Fallback plain text queue deferral updates.
- Server slot protection with configurable reserved slots for VIPs and staff.
- Disconnect grace period to preserve queue position or grant instant re-entry after client crashes.
- Automatic stale connection cleanup and cancellation detection to prevent ghost queues.
- Admin commands and resource exports for external script integration.

## Admin Commands

- `queue_status`: Outputs current player count, connecting count, queue size, and max slots.
- `queue_clear`: Clears the waiting queue and drops pending connections with a notification.

## Exports

- `exports['Quantix-Queue']:GetQueue()`
- `exports['Quantix-Queue']:GetQueueCount()`
- `exports['Quantix-Queue']:GetPlayerQueuePosition(license)`
- `exports['Quantix-Queue']:IsPlayerInQueue(license)`
"# Quantix-Queue" 
