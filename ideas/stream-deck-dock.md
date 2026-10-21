---
id: stream-deck-dock
title: Modular Stream Deck & Tool Dock
category: Hardware & Electronics
status: concept
tags:
- rp2040
- desk
- audio
- productivity
description: Desk dock integrating media dials, shortcut buttons, and USB hub.
bom:
- item: RP2040-Zero Microcontroller
  qty: 1
  notes: USB HID composite device
- item: 0.96 inch I2C OLED Display (SSD1306)
  qty: 1
  notes: Context menu feedback
- item: EC11 Rotary Encoder
  qty: 3
  notes: App volume mixer channels
- item: M3 Brass Heat-Set Inserts
  qty: 8
  notes: Threaded enclosure fastening
connections:
- target: custom-oled-macropad
  relation: shared_bom
  notes: Shares RP2040-Zero, OLED, and EC11 encoders.
  shared_parts:
  - RP2040-Zero Microcontroller
  - 0.96 inch I2C OLED Display (SSD1306)
  - EC11 Rotary Encoder
- target: gridfinity-storage-wall
  relation: synergy
  notes: Dock base aligns with Gridfinity pitch standard.
created_at: '2026-10-21T03:06:53.830460'
updated_at: '2026-10-21T03:06:53.830463'
---

# Modular Stream Deck & Tool Dock

## Concept
A multi-knob audio mixer and productivity dock for Linux desktop management. Controls Discord volume, Spotify playback, and terminal shortcuts.

