---
id: desktop-reflow-plate
title: Desktop PCB Reflow Hotplate
category: Hardware & Electronics
status: in-progress
tags:
- rp2040
- smd
- soldering
- electronics
created_at: '2026-10-21T03:06:53.826241'
updated_at: '2026-10-21T11:25:54.499980'
description: Precision aluminum heating plate with PID temperature profile for SMD
  soldering.
bom:
- item: RP2040-Zero Microcontroller
  qty: 1
  notes: PID loop and graphic display driver
  link: ''
- item: 0.96 inch I2C OLED Display (SSD1306)
  qty: 1
  notes: Shows temperature curve graph
  link: ''
- item: Noctua NF-F12 120mm 12V PWM Fan
  qty: 1
  notes: Rapid cool-down cycle after reflow
  link: ''
- item: K-Type Thermocouple with MAX6675
  qty: 1
  notes: Plate temp feedback
  link: ''
- item: Solid State Relay (SSR) 25A
  qty: 1
  notes: AC or 24V DC heater switching
  link: ''
connections:
- target: custom-oled-macropad
  relation: shared_bom
  notes: Shares RP2040-Zero MCU and 0.96 OLED screens.
  shared_parts:
  - RP2040-Zero Microcontroller
  - 0.96 inch I2C OLED Display (SSD1306)
---

# Desktop PCB Reflow Hotplate

## Overview
A compact 100x100mm aluminum heating bed with precise reflow temperature curves (Lead-free SAC305 and Leaded Sn63 profiles).

### Control System
- RP2040 microcontroller running custom PID heating curves.
- 0.96 inch OLED showing live Celsius temperature and time elapsed.
- Noctua fan underneath blows air up to quench the board once the reflow peak is achieved.


