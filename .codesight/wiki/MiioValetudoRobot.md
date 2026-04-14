# MiioValetudoRobot

> **Navigation aid.** Route list and file locations extracted via AST. Read the source files listed below before implementing or modifying this subsystem.

The MiioValetudoRobot subsystem handles **2 routes** and touches: auth, db, cache.

## Routes

- `PUT` `/api/miio/fds_upload_handler{/:filename}` params(filename) [auth, db, cache, upload]
  `backend/lib/robots/MiioValetudoRobot.js`
- `GET` `/gslb` [auth, db, cache, upload]
  `backend/lib/robots/MiioValetudoRobot.js`

## High-Impact Files

- `backend/lib/robots/MiioValetudoRobot.js` — imported by 51 files

## Source Files

Read these before implementing or modifying this subsystem:
- `backend/lib/robots/MiioValetudoRobot.js`

---
_Back to [overview.md](./overview.md)_