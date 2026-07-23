---
name: screenreel
description: Route ScreenReel work across interactive Projector/Studio integration, shared demo craft, and Playwright/FFmpeg Capture. Use whenever a user asks to add a live demo mode, author or repair a demo flow, create presenter notes, record a demo or launch video, inspect or validate selectors, migrate legacy scenes, or reuse one scripted journey for live presentation and video.
---

# ScreenReel

Select the smallest specialist set:

- Use `screenreel-projector` for embedding, Studio, local flows, routing, selectors, validation, and Scene Play.
- Use `screenreel-capture` for recording, selective re-capture, assembly, encoding, and footage verification.
- Use `screenreel-demo-craft` for audience, narrative, talking points, scene boundaries, pacing, and determinism.

For end-to-end work, apply Demo Craft first, Projector second, and Capture last. Keep the application-owned manifest as the shared source across all three.

Do not add an LLM SDK or upload application DOM. Use local files, the running local application, screenshots, and ScreenReel's structured CLI output.
