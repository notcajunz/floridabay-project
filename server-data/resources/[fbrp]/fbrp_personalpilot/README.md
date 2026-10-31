# FBRP Personal Pilot

Personal Pilot is available to clocked-in Trial Management staff and above.

1. Place a map waypoint at the destination. Fixed-wing destinations must be near
   LSIA, Sandy Shores, Grapeseed, Fort Zancudo, or the Roxwood/Arroyo Muerto
   runway. Helicopters can land at any waypoint.
2. Stand beside (or sit in) a passenger aircraft and run `/pilot` to use it, or
   run `/pilot <model>` to spawn a plane or helicopter. Planes must start near a
   configured runway so the NPC can perform the full taxi and takeoff sequence.
3. The NPC pilot takes the pilot seat and waits 60 seconds for the requester and
   any other passengers to board. Planes taxi to the runway, take off, fly the
   approach, land, and taxi to the exact destination waypoint. Helicopters lift
   vertically, cruise, and land directly at the waypoint.
4. After a plane parks, move the waypoint and use `/pilottaxi` to taxi somewhere
   else. The pilot remains available for five minutes. Use `/pilotcancel` to
   dismiss the active pilot at any time.

Any fixed-wing plane or helicopter model with at least two seats is accepted.
Single-seat aircraft and non-aircraft models are rejected on the client, while
rank, duty state, coordinates, and session concurrency are enforced by the server.
