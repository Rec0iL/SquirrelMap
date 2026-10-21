---
id: custom-oled-macropad
title: Custom OLED 9-Key Macro Pad
category: Hardware & Electronics
status: in-progress
tags:
- rp2040
- keyboard
- cad
- ergonomics
description: 9-key mechanical keypad with dual rotary encoders and mini display for
  CAD and code shortcuts.
bom:
- item: RP2040-Zero Microcontroller
  qty: 1
  notes: QMK / Vial firmware
- item: 0.96 inch I2C OLED Display (SSD1306)
  qty: 1
  notes: Active layer & volume display
- item: EC11 Rotary Encoder
  qty: 2
  notes: CAD zoom and system audio dial
- item: Gateron Yellow Switches
  qty: 9
  notes: Smooth linear key feel
- item: Neodymium Disc Magnets 6x3mm
  qty: 4
  notes: Snap-fit base incline riser
connections:
- target: desktop-reflow-plate
  relation: shared_bom
  notes: Both utilize RP2040-Zero and 0.96 OLEDs.
  shared_parts:
  - RP2040-Zero Microcontroller
  - 0.96 inch I2C OLED Display (SSD1306)
- target: stream-deck-dock
  relation: synergy
  notes: Can dock alongside the Stream Deck controller for seamless desk setup.
created_at: '2026-10-21T03:06:53.828356'
updated_at: '2026-10-21T03:06:53.828361'
---

# Custom OLED 9-Key Macro Pad

## Design Overview
A custom machined aluminum or 3D-printed macro pad with 9 hot-swap mechanical switches and 2 high-precision aluminum knobs.

### Firmware & Features
- Vial compatible for on-the-fly GUI key remapping.
- Rotary encoders provide clicky detents for timeline scrubbing in CAD and video editing.
- Magnetic base allows swapping between 15-degree tilt and flat desk orientation.

