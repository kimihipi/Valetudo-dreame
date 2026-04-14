# Auth

> **Navigation aid.** Route list and file locations extracted via AST. Read the source files listed below before implementing or modifying this subsystem.

The Auth subsystem handles **4 routes** and touches: auth, db.

## Routes

- `POST` `/acl/device/register` [auth, db, upload]
  `backend/lib/msmart/MSmartDummycloud.js`
- `POST` `/v3/dev2pro/login` [auth, db, upload]
  `backend/lib/msmart/MSmartDummycloud.js`
- `GET` `/config/interfaces/http/auth/basic` [auth]
  `backend/lib/webserver/ValetudoRouter.js`
- `PUT` `/config/interfaces/http/auth/basic` [auth]
  `backend/lib/webserver/ValetudoRouter.js`

## Middleware

- **EggTermMiddleware** (auth) — `backend/lib/webserver/middlewares/EggTermMiddleware.js`
- **dynamicAuth.handle** (auth) — `backend/lib/webserver/WebServer.js`
- **authMiddleware** (auth) — `backend/lib/webserver/WebServer.js`

## Source Files

Read these before implementing or modifying this subsystem:
- `backend/lib/msmart/MSmartDummycloud.js`
- `backend/lib/webserver/ValetudoRouter.js`

---
_Back to [overview.md](./overview.md)_