QuantiX Anticheat — FiveM resource
===========================

1. Copy the "corevia_ac" folder into your server's resources directory.

2. Add this to server.cfg, ABOVE any framework resources:

       set corevia_api_url "https://cixnservices.xyz"
       set corevia_token   "cvia_i_your_token_here"
       add_ace resource.corevia_ac command.restart allow
       add_ace resource.corevia_ac command.start allow
       add_ace resource.corevia_ac command.stop allow
       ensure corevia_ac

   The token is issued in the QuantiX panel under Settings -> Servers.
   Treat it as a secret: it is also this server's licence.

3. Restart the server. Within a minute the server should show as online in
   the panel. If it does not, check the server console for lines beginning
   [corevia_ac].

   The three command permissions let QuantiX install signed releases and
   run "restart corevia_ac" on itself (FXServer's restart command needs start
   and stop too). After this one-time setup, the files under build/, ui/ and
   bridge/ update automatically. FXServer does not let a resource rewrite the
   files in its own top-level folder, so fxmanifest.lua and this README stay
   as installed; that is expected.

Optional integration
--------------------
Each of these converts a guess into a certainty. Without them the matching
detection stays silent rather than guessing — which is the correct default
for a check whose premise your server has not established.

    exports.corevia_ac:registerClientEvents({ 'esx:getSharedObject' })
    exports.corevia_ac:recordWeaponGrant(source, weaponHash)
    exports.corevia_ac:recordVehicleGrant(source, vehicleModel)
    exports.corevia_ac:recordHealthGrant(source, 'health', 50)
    exports.corevia_ac:recordProtectionGrant(source, 10)
    exports.corevia_ac:rateLimit('shop:buy', 5, 1000)
    exports.corevia_ac:reportMalformedPayload(source, 'shop:buy', 'negative quantity')

Teleports and cameras your own scripts cause
--------------------------------------------
Add this as the FIRST server script in the fxmanifest.lua of any resource
that moves players or opens cameras for them (housing, jail, elevators,
garages, spawn selectors, clothing shops, admin menus):

    server_script '@corevia_ac/bridge/server.lua'

It tells QuantiX where that resource is putting each player, so the landing
is not read as a teleport hack, and when it opens a camera, so the viewpoint
is not read as a freecam. Or call the exports yourself:

    exports.corevia_ac:authorizeTeleport(source, vector3(x, y, z))
    exports.corevia_ac:beginScriptedCamera(source, 30)
    exports.corevia_ac:endScriptedCamera(source)

Doors and elevators that several players use are also learned automatically.

Economy integrations are available for servers that want item, reward, and
currency detection. See the current guide for every export and its arguments:

    https://cixnservices.xyz/docs

Support: https://cixnservices.xyz/docs
