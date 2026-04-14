# Project Context

This is a typescript project using express.
It is a monorepo with workspaces: valetudo-backend (backend), valetudo-frontend (frontend).

The API has 69 routes. See .codesight/routes.md for the full route map with methods, paths, and tags.
The UI has 107 components. See .codesight/components.md for the full list with props.
Middleware includes: custom, auth, logging.

High-impact files (most imported, changes here affect many other files):
- backend/lib/robots/dreame/DreameValetudoRobot.js (imported by 153 files)
- backend/lib/core/ValetudoRobot.js (imported by 122 files)
- backend/lib/Logger.js (imported by 109 files)
- backend/lib/Configuration.js (imported by 76 files)
- backend/lib/msmart/MSmartPacket.js (imported by 73 files)
- backend/lib/robots/midea/MideaValetudoRobot.js (imported by 73 files)
- backend/lib/msmart/MSmartConst.js (imported by 65 files)
- backend/lib/robots/roborock/RoborockValetudoRobot.js (imported by 65 files)

Required environment variables (no defaults):
- BABEL_ENV (frontend/scripts/build.js)
- GENERATE_SOURCEMAP (frontend/scripts/build.js)
- IMAGE_INLINE_SIZE_LIMIT (frontend/config/webpack.config.js)
- NODE_ENV (frontend/config/paths.js)
- PUBLIC_URL (frontend/config/paths.js)

Read .codesight/wiki/index.md for orientation (WHERE things live). Then read actual source files before implementing. Wiki articles are navigation aids, not implementation guides.
Read .codesight/CODESIGHT.md for the complete AI context map including all routes, schema, components, libraries, config, middleware, and dependency graph.
