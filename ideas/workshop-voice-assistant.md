---
id: workshop-voice-assistant
title: Local AI Workshop Voice Assistant
category: Software & AI
status: concept
tags:
- ai
- python
- whisper
- voice
- raspberry-pi
description: Hands-free voice assistant running offline on local hardware to control
  bench tools.
bom:
- item: Raspberry Pi 5 (8GB)
  qty: 1
  notes: Local LLM & Whisper server
- item: INMP441 I2S Digital MEMS Microphone
  qty: 2
  notes: Beamforming mic pair
- item: MeanWell 24V 10A Power Supply
  qty: 1
  notes: Stepped down to 5V 5A for Pi
connections:
- target: audio-spectrum-tube
  relation: shared_bom
  notes: Both utilize INMP441 I2S MEMS microphones.
  shared_parts:
  - INMP441 I2S Digital MEMS Microphone
- target: smart-workbench-bench
  relation: synergy
  notes: Assistant controls workbench lighting and power relays via voice.
created_at: '2026-10-21T03:06:53.838716'
updated_at: '2026-10-21T03:06:53.838723'
---

# Local AI Workshop Voice Assistant

## Concept
Hands get dirty when soldering or greasing bearings. A local, privacy-first voice assistant running Whisper.cpp lets you say 'turn on fume extractor' or 'lookup pinout of LM317' hands-free.

