# valetudo — Overview

> **Navigation aid.** This article shows WHERE things live (routes, models, files). Read actual source files before implementing new features or making changes.

**valetudo** is a typescript project built with express, organized as a monorepo.

**Workspaces:** `valetudo-backend` (`backend`), `valetudo-frontend` (`frontend`)

## Scale

69 API routes · 110 UI components · 16 middleware layers · 5 environment variables

## Subsystems

- **[Auth](./auth.md)** — 4 routes — touches: auth, db, upload
- **[ConsumableMonitoringCapabilityRouter](./ConsumableMonitoringCapabilityRouter.md)** — 1 routes — touches: payment
- **[Dummycloud](./Dummycloud.md)** — 2 routes
- **[MQTTRouter](./MQTTRouter.md)** — 1 routes
- **[MSmartDummycloud](./MSmartDummycloud.md)** — 21 routes — touches: auth, db, upload
- **[MiioSocket](./MiioSocket.md)** — 1 routes
- **[MiioValetudoRobot](./MiioValetudoRobot.md)** — 2 routes — touches: auth, db, cache, upload
- **[NTPClientRouter](./NTPClientRouter.md)** — 2 routes
- **[ObstacleImagesCapabilityRouter](./ObstacleImagesCapabilityRouter.md)** — 1 routes
- **[PresetSelectionCapabilityRouter](./PresetSelectionCapabilityRouter.md)** — 2 routes
- **[RobotRouter](./RobotRouter.md)** — 6 routes
- **[SSDPRouter](./SSDPRouter.md)** — 1 routes
- **[SSDPServer](./SSDPServer.md)** — 3 routes
- **[SystemRouter](./SystemRouter.md)** — 2 routes
- **[TimerRouter](./TimerRouter.md)** — 4 routes — touches: db
- **[ValetudoEventRouter](./ValetudoEventRouter.md)** — 1 routes
- **[ValetudoRouter](./ValetudoRouter.md)** — 10 routes — touches: auth
- **[WebServer](./WebServer.md)** — 1 routes — touches: auth
- **[Infra](./infra.md)** — 4 routes — touches: auth, db, upload

**UI:** 110 components (react) — see [ui.md](./ui.md)

## High-Impact Files

Changes to these files have the widest blast radius across the codebase:

- `backend/lib/robots/dreame/DreameValetudoRobot.js` — imported by **155** files
- `backend/lib/core/ValetudoRobot.js` — imported by **123** files
- `backend/lib/Logger.js` — imported by **109** files
- `backend/lib/Configuration.js` — imported by **76** files
- `backend/lib/msmart/MSmartPacket.js` — imported by **73** files
- `backend/lib/robots/midea/MideaValetudoRobot.js` — imported by **73** files

## Required Environment Variables

- `BABEL_ENV` — `frontend/scripts/build.js`
- `GENERATE_SOURCEMAP` — `frontend/scripts/build.js`
- `IMAGE_INLINE_SIZE_LIMIT` — `frontend/config/webpack.config.js`
- `NODE_ENV` — `frontend/config/paths.js`
- `PUBLIC_URL` — `frontend/config/paths.js`

---
_Back to [index.md](./index.md) · Generated 2026-04-11_