---
id: articulated-tool-arm
title: Articulated Tool & Camera Arm
category: Workshop & Tools
status: in-progress
tags:
- workshop
- cad
- mechanics
- 3d-printing
description: Heavy-duty friction-lock articulated arm for overhead soldering microscope
  or camera.
bom:
- item: M5 Socket Head Cap Screws 16mm
  qty: 12
  notes: Friction clamp joints
- item: Neodymium Disc Magnets 6x3mm
  qty: 8
  notes: Cable routing clips
- item: 1/4-inch Camera Mount Adapter
  qty: 1
  notes: Standard tripod screw
connections:
- target: smart-workbench-bench
  relation: shared_bom
  notes: Shares M5 socket head screws.
  shared_parts:
  - M5 Socket Head Cap Screws 16mm
- target: gridfinity-storage-wall
  relation: shared_bom
  notes: Shares 6x3mm neodymium magnets.
  shared_parts:
  - Neodymium Disc Magnets 6x3mm
created_at: '2026-10-21T03:06:53.837173'
updated_at: '2026-10-21T03:06:53.837176'
---

# Articulated Tool & Camera Arm

## Concept
A counterbalanced 3-axis arm for holding inspection cameras, PCB holders, or fume extractor nozzles directly over the workpiece without vibrating.

