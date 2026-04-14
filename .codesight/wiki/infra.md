# Infra

> **Navigation aid.** Route list and file locations extracted via AST. Read the source files listed below before implementing or modifying this subsystem.

The Infra subsystem handles **4 routes** and touches: auth, db.

## Routes

- `GET` `/` [auth, db, upload]
  `backend/lib/msmart/MSmartDummycloud.js`
- `GET` `/status`
  `backend/lib/webserver/MQTTRouter.js`
- `POST` `/` [db]
  `backend/lib/webserver/TimerRouter.js`
- `PUT` `/`
  `backend/lib/webserver/UpdaterRouter.js`

## Source Files

Read these before implementing or modifying this subsystem:
- `backend/lib/msmart/MSmartDummycloud.js`
- `backend/lib/webserver/MQTTRouter.js`
- `backend/lib/webserver/TimerRouter.js`
- `backend/lib/webserver/UpdaterRouter.js`

---
_Back to [overview.md](./overview.md)_