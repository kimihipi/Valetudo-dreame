# TimerRouter

> **Navigation aid.** Route list and file locations extracted via AST. Read the source files listed below before implementing or modifying this subsystem.

The TimerRouter subsystem handles **4 routes** and touches: db.

## Routes

- `GET` `/:id` params(id) [db]
  `backend/lib/webserver/TimerRouter.js`
- `PUT` `/:id` params(id) [db]
  `backend/lib/webserver/TimerRouter.js`
- `PUT` `/:id/action` params(id) [db]
  `backend/lib/webserver/TimerRouter.js`
- `DELETE` `/:id` params(id) [db]
  `backend/lib/webserver/TimerRouter.js`

## Source Files

Read these before implementing or modifying this subsystem:
- `backend/lib/webserver/TimerRouter.js`

---
_Back to [overview.md](./overview.md)_