---
id: smart-solder-fume-extractor
title: Smart Solder Fume Extractor
category: Hardware & Electronics
status: prototyping
tags:
- esp32
- soldering
- workshop
- 3d-printing
created_at: '2026-10-21T03:06:53.823909'
updated_at: '2026-10-21T11:25:54.493332'
description: Automated whisper-quiet bench fume extractor with VOC air sensor and
  PWM fan control.
bom:
- item: ESP32-WROOM-32 Dev Board
  qty: 1
  notes: PWM fan curve and SGP40 reading
  link: ''
- item: Noctua NF-F12 120mm 12V PWM Fan
  qty: 1
  notes: High static pressure, silent operation
  link: ''
- item: Activated Carbon Filter Sheet
  qty: 1
  notes: Cut to 120mm square cartridge
  link: ''
- item: 12V 2A DC Power Adapter
  qty: 1
  notes: Barrel jack supply
  link: ''
- item: SGP40 VOC Gas Sensor
  qty: 1
  notes: Detects rosin flux vapors
  link: ''
connections:
- target: smart-workbench-bench
  relation: synergy
  notes: Mounts directly to articulated workbench arm.
---

# Smart Solder Fume Extractor

## Concept & Requirements
A compact, desktop soldering fume extractor that automatically detects rosin flux smoke and spins up quietly without needing manual button presses.

### Key Features
- **Automatic Smoke Trigger**: Uses an SGP40 VOC sensor next to the intake grille to detect flux aerosol spikes.
- **Whisper-Quiet Mode**: Uses a Noctua 120mm PWM fan running at 40% idle, boosting to 100% only when soldering.
- **Replaceable Filter Tray**: 3D printed magnetic filter cassette for quick replacement of activated carbon foam.

### Sourcing & Bulk Buy Opportunity
- Noctua 120mm fan can be ordered as a multi-pack together with the Desktop Reflow Hotplate cooling fan.






