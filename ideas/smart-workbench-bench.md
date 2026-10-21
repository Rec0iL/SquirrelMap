---
id: smart-workbench-bench
title: Smart IoT Electronics Workbench
category: Workshop & Tools
status: in-progress
tags:
- esp32
- workshop
- lighting
- power
created_at: '2026-10-21T03:06:53.832385'
updated_at: '2026-10-21T11:24:53.324929'
description: Illuminated workbench with integrated telemetry, overhead CRI95 task
  lights, and power rails.
bom:
- item: ESP32-WROOM-32 Dev Board
  qty: 1
  notes: Home Assistant MQTT integration
  link: ''
- item: WS2812B Addressable LED Strip (60/m)
  qty: 2
  notes: Bias and colored alert lighting
  link: ''
- item: MeanWell 24V 10A Power Supply
  qty: 1
  notes: Main DC bus for bench tools
  link: ''
- item: M5 Socket Head Cap Screws 16mm
  qty: 24
  notes: 2020 Aluminum extrusion assembly
  link: ''
connections:
- target: audio-spectrum-tube
  relation: shared_bom
  notes: Shares WS2812B LED strips and ESP32 boards.
  shared_parts:
  - ESP32-WROOM-32 Dev Board
  - WS2812B Addressable LED Strip (60/m)
---

# Smart IoT Electronics Workbench

## Concept
A high-CRI workstation built from 2020 T-slot aluminum extrusions with built-in power measurement, safety cutoffs, and lighting presets.


