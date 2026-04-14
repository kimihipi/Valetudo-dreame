# Routes

## CRUD Resources

- **`/`** GET | POST | PUT/:id
- **``** GET/:id | PUT/:id | DELETE/:id

## Other Routes

- `POST` `/acl/device/register` params() [auth, db, upload]
- `GET` `/m7-server/actuator/health/ping` params() [auth, db, upload]
- `POST` `/v1/dev2pro/m7/map/part/get` params() [auth, db, upload]
- `POST` `/v1/dev2pro/m7/map/list/:part` params(part) [auth, db, upload]
- `POST` `/v1/dev2pro/m7/map/list/mop/:part` params(part) [auth, db, upload]
- `POST` `/v1/dev2pro/m7/map/list/target/:part` params(part) [auth, db, upload]
- `POST` `/v1/dev2pro/m7/map/part/upload` params() [auth, db, upload]
- `POST` `/v1/dev2pro/cruise/list/points` params() [auth, db, upload]
- `POST` `/v1/dev2pro/m7/work/status/upload` params() [auth, db, upload]
- `POST` `/v1/dev2pro/m7/voice/check` params() [auth, db, upload]
- `POST` `/package-management/v1/dev2pro/check` params() [auth, db, upload]
- `POST` `/v1/ota/version/check` params() [auth, db, upload]
- `POST` `/v1/ota/status/update` params() [auth, db, upload]
- `POST` `/logService/v1/dev/event-tracking` params() [auth, db, upload]
- `POST` `/v3/dev2pro/login` params() [auth, db, upload]
- `POST` `/v3/dev2pro/ability` params() [auth, db, upload]
- `POST` `/v3/dev2pro/enc/persistent/key` params() [auth, db, upload]
- `POST` `/v3/dev2pro/enc/rtc/key` params() [auth, db, upload]
- `POST` `/v3/dev2pro/robot/event` params() [auth, db, upload]
- `POST` `/v3/dev2pro/m7/work/status/upload/proto` params() [auth, db, upload]
- `POST` `/v1/biz/file/device/uploadFileUrl` params() [auth, db, upload]
- `PUT` `/_valetudo/fileUpload` params() [auth, db, upload]
- `POST` `/v1/dev/feedback/log/config` params() [auth, db, upload]
- `PUT` `/api/miio/fds_upload_handler{/:filename}` params(filename) [auth, db, cache, upload]
- `GET` `/gslb` params() [auth, db, cache, upload]
- `GET` `/status` params()
- `GET` `/properties` params()
- `GET` `/config` params()
- `PUT` `/config` params()
- `GET` `/state` params()
- `GET` `/state/attributes` params()
- `GET` `/state/map` params()
- `GET` `/state/sse` params()
- `GET` `/state/attributes/sse` params()
- `GET` `/state/map/sse` params()
- `GET` `/valetudo.xml` params()
- `GET` `/host/info` params()
- `GET` `/runtime/info` params()
- `PUT` `/:id/action` params(id) [db]
- `PUT` `/:id/interact` params(id)
- `PUT` `/action` params() [auth]
- `GET` `/version` params() [auth]
- `GET` `/log/content` params() [auth]
- `GET` `/log/level` params() [auth]
- `PUT` `/log/level` params() [auth]
- `GET` `/config/interfaces/mqtt` params() [auth]
- `PUT` `/config/interfaces/mqtt` params() [auth]
- `GET` `/config/interfaces/http/auth/basic` params() [auth]
- `PUT` `/config/interfaces/http/auth/basic` params() [auth]
- `GET` `/config/customizations` params() [auth]
- `PUT` `/config/customizations` params() [auth]
- `GET` `/log/content/sse` params() [auth]
- `GET` `*splat` [auth]
- `PUT` `/:type{/:sub_type}` params(type, sub_type) [payment]
- `GET` `/img/:id` params(id)
- `GET` `/presets` params()
- `PUT` `/preset` params()

## WebSocket Events

- `WS` `listening` — `backend/lib/miio/Dummycloud.js`
- `WS` `error` — `backend/lib/miio/Dummycloud.js`
- `WS` `message` — `backend/lib/miio/MiioSocket.js`
- `WS` `listening` — `backend/lib/utils/SSDPServer.js`
- `WS` `message` — `backend/lib/utils/SSDPServer.js`
- `WS` `error` — `backend/lib/utils/SSDPServer.js`
