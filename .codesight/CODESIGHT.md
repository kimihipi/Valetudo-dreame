# valetudo — AI Context Map

> **Stack:** express | none | react | typescript
> **Monorepo:** valetudo-backend, valetudo-frontend

> 63 routes + 6 ws | 0 models | 110 components | 41 lib files | 5 env vars | 16 middleware | 1 events | 0% test coverage
> **Token savings:** this file is ~7,400 tokens. Without it, AI exploration would cost ~94,400 tokens. **Saves ~87,000 tokens per conversation.**

---

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

---

# Components

- **ANIMATION_SPEED** — `frontend/src/App.tsx`
- **Root** — `frontend/src/AppRouter.tsx`
- **Context** — `frontend/src/CapabilitiesProvider.tsx`
- **ScrollableGrid** — `frontend/src/HomePage.tsx`
- **MainApp** — props: paletteMode, setPaletteMode — `frontend/src/MainApp.tsx`
- **SCAN_RESULT_BATCH_SIZE** — props: signal — `frontend/src/ProvisioningPage.tsx`
- **RouterChoiceStageTwo** — `frontend/src/RouterChoice.tsx`
- **IterationsIcon** — props: iterationCount — `frontend/src/assets/icon_components/IterationsIcon.tsx`
- **ConfirmationDialog** — props: title, text, open, onClose, onAccept — `frontend/src/components/ConfirmationDialog.tsx`
- **FanSpeedIcon** — `frontend/src/components/CustomIcons.tsx`
- **TopRightRefreshButton** — props: title, icon, helpText, onRefreshClick, isRefreshing — `frontend/src/components/DetailPageHeaderRow.tsx`
- **FullHeightGrid** — `frontend/src/components/FullHeightGrid.tsx`
- **StyledDialog** — `frontend/src/components/HelpDialog.tsx`
- **InfoBox** — `frontend/src/components/InfoBox.tsx`
- **IntegrationHelpDialog** — `frontend/src/components/IntegrationHelpDialog.tsx`
- **LoadingFade** — props: in, transitionDelay, size — `frontend/src/components/LoadingFade.tsx`
- **LogViewer** — props: logLines, style, className — `frontend/src/components/LogViewer.tsx`
- **ActualObstacleImage** — `frontend/src/components/ObstacleImage.tsx`
- **PaperContainer** — `frontend/src/components/PaperContainer.tsx`
- **RatioBar** — props: style, total, totalLabel, partitions, hideLegend, noneLegendLabel — `frontend/src/components/RatioBar.tsx`
- **TopRightIconButton** — props: title, onReload, reloadButton, loading, divider, boxShadow, helpText — `frontend/src/components/ReloadableCard.tsx`
- **SelectItem** — props: size, options, currentValue, setValue, disabled, loadingOptions, loadError — `frontend/src/components/SelectItem.tsx`
- **TextInformationGrid** — props: items — `frontend/src/components/TextInformationGrid.tsx`
- **ValetudoAppBar** — `frontend/src/components/ValetudoAppBar.tsx`
- **ValetudoBounce** — props: onClose — `frontend/src/components/ValetudoBounce.tsx`
- **EventRow** — props: event — `frontend/src/components/ValetudoEventControls.tsx`
- **ValetudoEvents** — `frontend/src/components/ValetudoEvents.tsx`
- **ValetudoSplash** — `frontend/src/components/ValetudoSplash.tsx`
- **FullCleanupButtonItem** — `frontend/src/components/WelcomeDialog.tsx`
- **DURATION** — props: facing — `frontend/src/components/Woodcock.tsx`
- **ButtonListMenuItem** — props: primaryLabel, secondaryLabel, icon, buttonLabel, buttonColor, confirmationDialog, action, actionLoading — `frontend/src/components/list_menu/ButtonListMenuItem.tsx`
- **LinkListMenuItem** — props: url, primaryLabel, secondaryLabel, icon — `frontend/src/components/list_menu/LinkListMenuItem.tsx`
- **ListMenu** — props: primaryHeader, secondaryHeader, listItems, helpText, style — `frontend/src/components/list_menu/ListMenu.tsx`
- **SelectListMenuItem** — props: options, currentValue, setValue, disabled, loadingOptions, loadError, primaryLabel, secondaryLabel, icon — `frontend/src/components/list_menu/SelectListMenuItem.tsx`
- **SpacerListMenuItem** — props: halfHeight — `frontend/src/components/list_menu/SpacerListMenuItem.tsx`
- **SubHeaderListMenuItem** — props: primaryLabel, icon — `frontend/src/components/list_menu/SubHeaderListMenuItem.tsx`
- **TextEditModalListMenuItem** — props: primaryLabel, secondaryLabel, icon, dialog, value, isLoading — `frontend/src/components/list_menu/TextEditModalListMenuItem.tsx`
- **ToggleSwitchListMenuItem** — props: value, setValue, disabled, loadError, primaryLabel, secondaryLabel, icon — `frontend/src/components/list_menu/ToggleSwitchListMenuItem.tsx`
- **Attachments** — `frontend/src/controls/Attachments.tsx`
- **CameraStream** — `frontend/src/controls/CameraStream.tsx`
- **ControlsBody** — `frontend/src/controls/ControlsBody.tsx`
- **ControlsCard** — props: icon, title, subtitle, pending, isLoading, headerExtra — `frontend/src/controls/ControlsCard.tsx`
- **ControlsInlineCard** — props: icon, title, isLoading — `frontend/src/controls/ControlsInlineCard.tsx`
- **CurrentStatistics** — `frontend/src/controls/CurrentStatistics.tsx`
- **DockComponentTile** — props: label, icon, statusText, statusColor — `frontend/src/controls/Dock.tsx`
- **MobileControls** — `frontend/src/controls/MobileControls.tsx`
- **MultipleMap** — `frontend/src/controls/MultipleMap.tsx`
- **StyledIcon** — props: capability, label, icon, noPaper, iconColor — `frontend/src/controls/PresetSelection.tsx`
- **ActiveStates** — props: mop — `frontend/src/controls/RobotStatus.tsx`
- **MapContainer** — props: rawMap, paletteMode, trackSegmentSelectionOrder — `frontend/src/map/BaseMap.tsx`
- **Container** — `frontend/src/map/EditMapPage.tsx`
- **StatsOverlayWidget** — props: onClick — `frontend/src/map/LiveMap.tsx`
- **NoTransition** — `frontend/src/map/LiveMapModeSwitcher.tsx`
- **LiveMapModeSwitcher** — props: supportedModes, currentMode, setMode — `frontend/src/map/LiveMapModeSwitcher.tsx`
- **Container** — `frontend/src/map/LiveMapPage.tsx`
- **ModeSwitcher** — props: availableModes, currentMode, setMode — `frontend/src/map/MapEditorPage.tsx`
- **Container** — `frontend/src/map/RobotCoverageMapPage.tsx`
- **SegmentCleanOrderContent** — `frontend/src/map/SegmentCleanOrder.tsx`
- **ActionButton** — `frontend/src/map/Styled.tsx`
- **HelpButtonContainer** — `frontend/src/map/actions/edit_map_actions/HelpAction.tsx`
- **MapToolbarContainer** — `frontend/src/map/actions/edit_map_actions/MapToolbar.tsx`
- **SegmentRenameDialog** — props: open, onClose, currentName, onRename — `frontend/src/map/actions/edit_map_actions/SegmentActions.tsx`
- **VirtualRestrictionActions** — `frontend/src/map/actions/edit_map_actions/VirtualRestrictionActions.tsx`
- **VirtualThresholdActions** — `frontend/src/map/actions/edit_map_actions/VirtualThresholdActions.tsx`
- **GoToActions** — `frontend/src/map/actions/live_map_actions/GoToActions.tsx`
- **SegmentActions** — `frontend/src/map/actions/live_map_actions/SegmentActions.tsx`
- **ZoneActions** — `frontend/src/map/actions/live_map_actions/ZoneActions.tsx`
- **OptionsRouter** — `frontend/src/options/ConnectivityOptionsRouter.tsx`
- **MappingPassButtonItem** — `frontend/src/options/MapManagement.tsx`
- **PersistentMapSwitchListItem** — `frontend/src/options/MapManagement.tsx`
- **OptionsRouter** — `frontend/src/options/MapManagementOptionsRouter.tsx`
- **OptionsRouter** — `frontend/src/options/OptionsRouter.tsx`
- **OptionsRouter** — `frontend/src/options/RobotOptionsRouter.tsx`
- **ActivationListMenuItem** — `frontend/src/options/ValetudoActivation.tsx`
- **ConfigRestoreButtonListMenuItem** — `frontend/src/options/ValetudoOptions.tsx`
- **AuthSettings** — `frontend/src/options/connectivity/AuthSettingsPage.tsx`
- **ConnectivityOptions** — `frontend/src/options/connectivity/ConnectivityOptions.tsx`
- **MQTTStatusComponent** — props: status — `frontend/src/options/connectivity/MQTTConnectivityPage.tsx`
- **MQTTStatusComponent** — props: status — `frontend/src/options/connectivity/MatterConnectivityPage.tsx`
- **NTPClientStatusComponent** — props: status — `frontend/src/options/connectivity/NTPConnectivityPage.tsx`
- **NetworkAdvertisementSettings** — `frontend/src/options/connectivity/NetworkAdvertisementSettingsPage.tsx`
- **WifiStatusComponent** — props: status — `frontend/src/options/connectivity/WifiConnectivityPage.tsx`
- **ConsumableButtonListMenuItem** — props: consumable — `frontend/src/robot/Consumables.tsx`
- **ManualControlEnableButton** — `frontend/src/robot/ManualControl.tsx`
- **LocateButtonListMenuItem** — `frontend/src/robot/RobotOptions.tsx`
- **RobotRouter** — `frontend/src/robot/RobotRouter.tsx`
- **TotalStatisticsInternal** — `frontend/src/robot/TotalStatistics.tsx`
- **CapabilityContainer** — `frontend/src/robot/capabilities/CapabilityLayout.tsx`
- **CapabilityItem** — props: title, onReload, loading, helpText — `frontend/src/robot/capabilities/CapabilityLayout.tsx`
- **DoNotDisturbControl** — `frontend/src/robot/capabilities/DoNotDisturb.tsx`
- **PlayAudioControl** — `frontend/src/robot/capabilities/PlayAudio.tsx`
- **QuirkControl** — `frontend/src/robot/capabilities/Quirks.tsx`
- **SpeakerControl** — `frontend/src/robot/capabilities/Speaker.tsx`
- **SystemRobotOptions** — `frontend/src/robot/capabilities/SystemRobotOptions.tsx`
- **VoicePackControl** — `frontend/src/robot/capabilities/VoicePackManagement.tsx`
- **About** — `frontend/src/valetudo/About.tsx`
- **LinkRenderer** — `frontend/src/valetudo/Help.tsx`
- **Search** — `frontend/src/valetudo/Log.tsx`
- **SystemRuntimeInfo** — `frontend/src/valetudo/SystemInformation.tsx`
- **Updater** — props: state — `frontend/src/valetudo/Updater.tsx`
- **ValetudoRouter** — `frontend/src/valetudo/ValetudoRouter.tsx`
- **ActionFallbackControls** — `frontend/src/valetudo/timers/ActionControls.tsx`
- **FullCleanupActionControls** — `frontend/src/valetudo/timers/ActionControls.tsx`
- **SegmentCleanupActionControls** — props: disabled, params, setParams — `frontend/src/valetudo/timers/ActionControls.tsx`
- **FanSpeedControlPreActionControl** — props: wasEnabled, params, setParams — `frontend/src/valetudo/timers/PreActionControls.tsx`
- **WaterUsageControlPreActionControl** — props: wasEnabled, params, setParams — `frontend/src/valetudo/timers/PreActionControls.tsx`
- **OperationModeControlPreActionControl** — props: wasEnabled, params, setParams — `frontend/src/valetudo/timers/PreActionControls.tsx`
- **TimerCard** — props: timer, timerProperties, onSave, onDelete, onExecNow — `frontend/src/valetudo/timers/TimerCard.tsx`
- **TimerEditDialog** — props: timerInLocalTime, timerProperties, onSave, onCancel — `frontend/src/valetudo/timers/TimerEditDialog.tsx`
- **Timers** — `frontend/src/valetudo/timers/Timers.tsx`

---

# Libraries

- `frontend/src/api/client.ts`
  - function fetchCapabilities
  - function fetchMap
  - function subscribeToMap
  - function fetchStateAttributes
  - function subscribeToStateAttributes
  - function fetchPresetSelections
  - _...148 more_
- `frontend/src/api/go2rtc/client.ts`
  - function fetchStreams
  - const go2RtcAPIBaseURL
  - const go2RtcAPI
- `frontend/src/api/go2rtc/hooks.ts` — function useGo2RtcStreamsQuery
- `frontend/src/api/hooks.ts`
  - function useRobotAttributeQuery: (clazz) => UseQueryResult<Extract<RobotAttribute,
  - function useRobotAttributeQuery: (clazz, select, {...}) => void
  - function useRobotAttributeQuery: (clazz, select?, {...}) => void
  - function useRobotStatusQuery: () => UseQueryResult<StatusState>;
  - function useRobotStatusQuery: (select) => void
  - function useRobotStatusQuery: (select?) => void
  - _...148 more_
- `frontend/src/api/mapUtils.ts` — function preprocessMap: (data) => RawMapData
- `frontend/src/api/utils.ts`
  - function getIn
  - function setIn
  - const isAttribute
  - const floorObject
- `frontend/src/hooks/useCommittingSlider.ts` — function useCommittingSlider
- `frontend/src/hooks/useFeedbackPending.ts` — function useFeedbackPending
- `frontend/src/hooks/useIsMobileView.ts` — function useIsMobileView
- `frontend/src/hooks/useValetudoColors.ts` — function useValetudoColors, function useValetudoColorsInverse
- `frontend/src/map/MapLayerManager.ts` — class MapLayerManager
- `frontend/src/map/MapLayerManagerUtils.ts`
  - function adjustRGBColorBrightness: (color, percent) => RGBColor
  - function PROCESS_LAYERS: (layers, pixelSize, paletteMode, selectedSegmentIds) => void
  - type RGBColor
  - type LayerColors
  - const COLORS: LayerColors
  - const ACCENT_COLORS: LayerColors
  - _...6 more_
- `frontend/src/map/PathDrawer.ts` — class PathDrawer
- `frontend/src/map/utils/Canvas2DContextTrackingWrapper.ts` — class Canvas2DContextTrackingWrapper
- `frontend/src/map/utils/colors/ColorUtils.ts`
  - function create2DArray: (xLength, yLength) => void
  - type SegmentId
  - type PossibleSegmentId
  - type SegmentColorId
  - type PossibleSegmentColorId
- `frontend/src/map/utils/colors/FourColorTheoremSolver.ts` — class FourColorTheoremSolver
- `frontend/src/map/utils/colors/MapAreaGraph.ts` — class MapAreaGraph
- `frontend/src/map/utils/colors/MapAreaVertex.ts` — class MapAreaVertex
- `frontend/src/map/utils/helpers.ts`
  - function clampMapScalingFactorFactor: (currentScaleFactor, factor) => void
  - function isInsideBox: (point, box) => void
  - function calculateBoxAroundPoint: (point, boxPadding) => Box
  - const considerHiDPI: (val: number)
  - const isMobile
- `frontend/src/map/utils/rampArrows.ts` — function drawRampDirectionArrows: (ctx, centX, centY, halfW, halfH, angleRad, color, zoom) => void
- `frontend/src/map/utils/simplify_js.ts` — function simplify: (points, tolerance?, highestQuality?) => number[]
- `frontend/src/map/utils/touch_handling/MapCanvasEvent.ts` — class MapCanvasEvent
- `frontend/src/map/utils/touch_handling/TouchHandler.ts` — class TouchHandler
- `frontend/src/map/utils/touch_handling/TouchHandlingUtils.ts` — function distance2d: (x0, y0, x1, y1) => number, type UserEvent
- `frontend/src/map/utils/touch_handling/events/PanEndTouchHandlerEvent.ts` — class PanEndTouchHandlerEvent
- `frontend/src/map/utils/touch_handling/events/PanMoveTouchHandlerEvent.ts` — class PanMoveTouchHandlerEvent
- `frontend/src/map/utils/touch_handling/events/PanStartTouchHandlerEvent.ts` — class PanStartTouchHandlerEvent
- `frontend/src/map/utils/touch_handling/events/PinchEndTouchHandlerEvent.ts` — class PinchEndTouchHandlerEvent
- `frontend/src/map/utils/touch_handling/events/PinchMoveTouchHandlerEvent.ts` — class PinchMoveTouchHandlerEvent
- `frontend/src/map/utils/touch_handling/events/PinchStartTouchHandlerEvent.ts` — class PinchStartTouchHandlerEvent
- `frontend/src/map/utils/touch_handling/events/TapTouchHandlerEvent.ts` — class TapTouchHandlerEvent
- `frontend/src/map/utils/touch_handling/events/TouchHandlerEvent.ts` — class TouchHandlerEvent
- `frontend/src/map/utils/touch_handling/gestures/Gesture.ts` — class Gesture, type GestureEventHandlingResult
- `frontend/src/map/utils/touch_handling/gestures/NoGesture.ts` — class NoGesture
- `frontend/src/map/utils/touch_handling/gestures/OngoingPanGesture.ts` — class OngoingPanGesture
- `frontend/src/map/utils/touch_handling/gestures/OngoingPinchGesture.ts` — class OngoingPinchGesture
- `frontend/src/map/utils/touch_handling/gestures/PossibleTapGesture.ts` — class PossibleTapGesture
- `frontend/src/util/XmPlayer.ts`
  - class XmPlayer
  - interface XmSong
  - interface ChannelState
- `frontend/src/utils.ts`
  - function convertSecondsToHumans: (seconds, showSeconds, showDays) => string
  - function convertBytesToHumans: (bytes) => string
  - function convertNumberToRoman: (num) => string
  - function getFriendlyStatName: (stat) => string
  - function getHumanReadableStatValue: (stat) => string
  - function adjustHexColorBrightness: (hexInput, percent) => string
  - _...8 more_
- `frontend/src/valetudo/res/Badwords.ts` — function filter: (text) => string
- `frontend/src/valetudo/timers/TimerUtils.ts` — function convertTimer: (timer, offset) => Timer

---

# Config

## Environment Variables

- `BABEL_ENV` **required** — frontend/scripts/build.js
- `GENERATE_SOURCEMAP` **required** — frontend/scripts/build.js
- `IMAGE_INLINE_SIZE_LIMIT` **required** — frontend/config/webpack.config.js
- `NODE_ENV` **required** — frontend/config/paths.js
- `PUBLIC_URL` **required** — frontend/config/paths.js

---

# Middleware

## custom
- CSPMiddleware — `backend/lib/webserver/middlewares/CSPMiddleware.js`
- ServerMiddleware — `backend/lib/webserver/middlewares/ServerMiddleware.js`
- VersionMiddleware — `backend/lib/webserver/middlewares/VersionMiddleware.js`
- index — `backend/lib/webserver/middlewares/index.js`
- SSEHub — `backend/lib/webserver/middlewares/sse/SSEHub.js`
- index — `backend/lib/webserver/middlewares/sse/index.js`
- generate_build_metadata — `util/generate_build_metadata.js`
- generate_eslintrc_flavors — `util/generate_eslintrc_flavors.js`
- generate_mqtt_docs — `util/generate_mqtt_docs.js`
- generate_robot_docs — `util/generate_robot_docs.js`

## auth
- EggTermMiddleware — `backend/lib/webserver/middlewares/EggTermMiddleware.js`
- dynamicAuth.handle — `backend/lib/webserver/WebServer.js`
- authMiddleware — `backend/lib/webserver/WebServer.js`

## logging
- ExternalAccessCheckMiddleware — `backend/lib/webserver/middlewares/ExternalAccessCheckMiddleware.js`
- Readme — `backend/lib/webserver/middlewares/sse/Readme.md`
- SSEMiddleware — `backend/lib/webserver/middlewares/sse/SSEMiddleware.js`

---

# Dependency Graph

## Most Imported Files (change these carefully)

- `backend/lib/robots/dreame/DreameValetudoRobot.js` — imported by **155** files
- `backend/lib/core/ValetudoRobot.js` — imported by **123** files
- `backend/lib/Logger.js` — imported by **109** files
- `backend/lib/Configuration.js` — imported by **76** files
- `backend/lib/msmart/MSmartPacket.js` — imported by **73** files
- `backend/lib/robots/midea/MideaValetudoRobot.js` — imported by **73** files
- `backend/lib/msmart/MSmartConst.js` — imported by **65** files
- `backend/lib/robots/roborock/RoborockValetudoRobot.js` — imported by **65** files
- `backend/lib/entities/index.js` — imported by **64** files
- `backend/lib/ValetudoEventStore.js` — imported by **63** files
- `backend/lib/robots/mock/MockValetudoRobot.js` — imported by **63** files
- `backend/lib/core/NotImplementedError.js` — imported by **61** files
- `backend/lib/robots/MiioValetudoRobot.js` — imported by **51** files
- `backend/lib/entities/core/ValetudoMapSegment.js` — imported by **49** files
- `backend/lib/core/capabilities/Capability.js` — imported by **48** files
- `backend/lib/webserver/capabilityRouters/CapabilityRouter.js` — imported by **44** files
- `backend/lib/core/capabilities/QuirksCapability.js` — imported by **43** files
- `backend/lib/mqtt/MqttController.js` — imported by **41** files
- `backend/lib/msmart/BEightParser.js` — imported by **41** files
- `frontend/src/api/index.ts` — imported by **40** files

## Import Map (who imports what)

- `backend/lib/robots/dreame/DreameValetudoRobot.js` ← `backend/lib/robots/dreame/Dreame1CValetudoRobot.js`, `backend/lib/robots/dreame/Dreame1TValetudoRobot.js`, `backend/lib/robots/dreame/DreameD10SPlusValetudoRobot.js`, `backend/lib/robots/dreame/DreameD10SProValetudoRobot.js`, `backend/lib/robots/dreame/DreameD9ProPlusValetudoRobot.js` +150 more
- `backend/lib/core/ValetudoRobot.js` ← `backend/lib/NetworkAdvertisementManager.js`, `backend/lib/core/capabilities/AutoEmptyDockAutoEmptyDurationControlCapability.js`, `backend/lib/core/capabilities/AutoEmptyDockAutoEmptyIntervalControlCapability.js`, `backend/lib/core/capabilities/AutoEmptyDockManualTriggerCapability.js`, `backend/lib/core/capabilities/BasicControlCapability.js` +118 more
- `backend/lib/Logger.js` ← `backend/index.js`, `backend/lib/Configuration.js`, `backend/lib/NTPClient.js`, `backend/lib/NetworkAdvertisementManager.js`, `backend/lib/NetworkConnectionStabilizer.js` +104 more
- `backend/lib/Configuration.js` ← `backend/lib/NTPClient.js`, `backend/lib/NetworkAdvertisementManager.js`, `backend/lib/NetworkConnectionStabilizer.js`, `backend/lib/Valetudo.js`, `backend/lib/core/ValetudoRobot.js` +71 more
- `backend/lib/msmart/MSmartPacket.js` ← `backend/lib/msmart/BEightParser.js`, `backend/lib/msmart/MSmartDummycloud.js`, `backend/lib/msmart/MSmartDummycloud.js`, `backend/lib/msmart/MSmartDummycloud.js`, `backend/lib/msmart/MSmartDummycloud.js` +68 more
- `backend/lib/robots/midea/MideaValetudoRobot.js` ← `backend/lib/robots/midea/MideaE20ValetudoRobot.js`, `backend/lib/robots/midea/MideaMapHacksProvider.js`, `backend/lib/robots/midea/MideaModernValetudoRobot.js`, `backend/lib/robots/midea/MideaQuirkFactory.js`, `backend/lib/robots/midea/capabilities/MideaAutoEmptyDockAutoEmptyDurationControlCapabilityV1.js` +68 more
- `backend/lib/msmart/MSmartConst.js` ← `backend/lib/msmart/BEightParser.js`, `backend/lib/robots/midea/MideaE20ValetudoRobot.js`, `backend/lib/robots/midea/MideaJ15MaxUltraValetudoRobot.js`, `backend/lib/robots/midea/MideaModernValetudoRobot.js`, `backend/lib/robots/midea/MideaQuirkFactory.js` +60 more
- `backend/lib/robots/roborock/RoborockValetudoRobot.js` ← `backend/lib/robots/roborock/RoborockG10SValetudoRobot.js`, `backend/lib/robots/roborock/RoborockGen4ValetudoRobot.js`, `backend/lib/robots/roborock/RoborockM1SValetudoRobot.js`, `backend/lib/robots/roborock/RoborockQ7MaxValetudoRobot.js`, `backend/lib/robots/roborock/RoborockQuirkFactory.js` +60 more
- `backend/lib/entities/index.js` ← `backend/lib/core/ValetudoRobot.js`, `backend/lib/core/capabilities/CombinedVirtualRestrictionsCapability.js`, `backend/lib/core/capabilities/CombinedVirtualThresholdsCapability.js`, `backend/lib/res/default_map.js`, `backend/lib/robots/dreame/Dreame1CValetudoRobot.js` +59 more
- `backend/lib/ValetudoEventStore.js` ← `backend/lib/Valetudo.js`, `backend/lib/core/ValetudoRobot.js`, `backend/lib/mqtt/MqttController.js`, `backend/lib/mqtt/handles/RobotMqttHandle.js`, `backend/lib/mqtt/handles/ValetudoEventsNodeMqttHandle.js` +58 more

---

# Events & Queues

- `LogMessage` [event] — `backend/lib/Logger.js`

---

# Test Coverage

> **0%** of routes and models are covered by tests
> 15 test files found

---

_Generated by [codesight](https://github.com/Houseofmvps/codesight) — see your codebase clearly_