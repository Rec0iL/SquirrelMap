---
id: audio-spectrum-tube
title: Audio Spectrum Visualizer Tube
category: Audio & Visual
status: concept
tags:
- esp32
- audio
- dsp
- led
description: Cylindrical ambient audio spectrum analyzer with real-time FFT frequency
  response.
bom:
- item: ESP32-WROOM-32 Dev Board
  qty: 1
  notes: Runs 512-point FFT in real time
- item: WS2812B Addressable LED Strip (60/m)
  qty: 1
  notes: Spiral wrap around frosted acrylic tube
- item: INMP441 I2S Digital MEMS Microphone
  qty: 1
  notes: Clean 24-bit audio capture
connections:
- target: smart-workbench-bench
  relation: shared_bom
  notes: Shares ESP32 and WS2812B strips.
  shared_parts:
  - ESP32-WROOM-32 Dev Board
  - WS2812B Addressable LED Strip (60/m)
created_at: '2026-10-21T03:06:53.834178'
updated_at: '2026-10-21T03:06:53.834181'
---

# Audio Spectrum Visualizer Tube

## Concept
An ambient desktop pillar that samples room audio via an I2S MEMS mic and maps frequency bands into flowing particle waves on a spiral LED column.

