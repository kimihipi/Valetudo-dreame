# MSmartDummycloud

> **Navigation aid.** Route list and file locations extracted via AST. Read the source files listed below before implementing or modifying this subsystem.

The MSmartDummycloud subsystem handles **21 routes** and touches: auth, db.

## Routes

- `GET` `/m7-server/actuator/health/ping` [auth, db, upload]
  `backend/lib/msmart/MSmartDummycloud.js`
- `POST` `/v1/dev2pro/m7/map/part/get` [auth, db, upload]
  `backend/lib/msmart/MSmartDummycloud.js`
- `POST` `/v1/dev2pro/m7/map/list/:part` params(part) [auth, db, upload]
  `backend/lib/msmart/MSmartDummycloud.js`
- `POST` `/v1/dev2pro/m7/map/list/mop/:part` params(part) [auth, db, upload]
  `backend/lib/msmart/MSmartDummycloud.js`
- `POST` `/v1/dev2pro/m7/map/list/target/:part` params(part) [auth, db, upload]
  `backend/lib/msmart/MSmartDummycloud.js`
- `POST` `/v1/dev2pro/m7/map/part/upload` [auth, db, upload]
  `backend/lib/msmart/MSmartDummycloud.js`
- `POST` `/v1/dev2pro/cruise/list/points` [auth, db, upload]
  `backend/lib/msmart/MSmartDummycloud.js`
- `POST` `/v1/dev2pro/m7/work/status/upload` [auth, db, upload]
  `backend/lib/msmart/MSmartDummycloud.js`
- `POST` `/v1/dev2pro/m7/voice/check` [auth, db, upload]
  `backend/lib/msmart/MSmartDummycloud.js`
- `POST` `/package-management/v1/dev2pro/check` [auth, db, upload]
  `backend/lib/msmart/MSmartDummycloud.js`
- `POST` `/v1/ota/version/check` [auth, db, upload]
  `backend/lib/msmart/MSmartDummycloud.js`
- `POST` `/v1/ota/status/update` [auth, db, upload]
  `backend/lib/msmart/MSmartDummycloud.js`
- `POST` `/logService/v1/dev/event-tracking` [auth, db, upload]
  `backend/lib/msmart/MSmartDummycloud.js`
- `POST` `/v3/dev2pro/ability` [auth, db, upload]
  `backend/lib/msmart/MSmartDummycloud.js`
- `POST` `/v3/dev2pro/enc/persistent/key` [auth, db, upload]
  `backend/lib/msmart/MSmartDummycloud.js`
- `POST` `/v3/dev2pro/enc/rtc/key` [auth, db, upload]
  `backend/lib/msmart/MSmartDummycloud.js`
- `POST` `/v3/dev2pro/robot/event` [auth, db, upload]
  `backend/lib/msmart/MSmartDummycloud.js`
- `POST` `/v3/dev2pro/m7/work/status/upload/proto` [auth, db, upload]
  `backend/lib/msmart/MSmartDummycloud.js`
- `POST` `/v1/biz/file/device/uploadFileUrl` [auth, db, upload]
  `backend/lib/msmart/MSmartDummycloud.js`
- `PUT` `/_valetudo/fileUpload` [auth, db, upload]
  `backend/lib/msmart/MSmartDummycloud.js`
- `POST` `/v1/dev/feedback/log/config` [auth, db, upload]
  `backend/lib/msmart/MSmartDummycloud.js`

## Source Files

Read these before implementing or modifying this subsystem:
- `backend/lib/msmart/MSmartDummycloud.js`

---
_Back to [overview.md](./overview.md)_