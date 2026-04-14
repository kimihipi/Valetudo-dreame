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
