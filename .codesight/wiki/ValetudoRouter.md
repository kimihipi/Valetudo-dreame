# ValetudoRouter

> **Navigation aid.** Route list and file locations extracted via AST. Read the source files listed below before implementing or modifying this subsystem.

The ValetudoRouter subsystem handles **10 routes** and touches: auth.

## Routes

- `PUT` `/action` [auth]
  `backend/lib/webserver/ValetudoRouter.js`
- `GET` `/version` [auth]
  `backend/lib/webserver/ValetudoRouter.js`
- `GET` `/log/content` [auth]
  `backend/lib/webserver/ValetudoRouter.js`
- `GET` `/log/level` [auth]
  `backend/lib/webserver/ValetudoRouter.js`
- `PUT` `/log/level` [auth]
  `backend/lib/webserver/ValetudoRouter.js`
- `GET` `/config/interfaces/mqtt` [auth]
  `backend/lib/webserver/ValetudoRouter.js`
- `PUT` `/config/interfaces/mqtt` [auth]
  `backend/lib/webserver/ValetudoRouter.js`
- `GET` `/config/customizations` [auth]
  `backend/lib/webserver/ValetudoRouter.js`
- `PUT` `/config/customizations` [auth]
  `backend/lib/webserver/ValetudoRouter.js`
- `GET` `/log/content/sse` [auth]
  `backend/lib/webserver/ValetudoRouter.js`

## Source Files

Read these before implementing or modifying this subsystem:
- `backend/lib/webserver/ValetudoRouter.js`

---
_Back to [overview.md](./overview.md)_