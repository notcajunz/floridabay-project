# FBRP DDoS shield

Install (asks to confirm SSH/web/game still work, auto-rolls back after 3 min otherwise):

    sudo bash /home/ubuntu/fbrp/deploy/ddos-shield/install.sh

Remove: `sudo bash /home/ubuntu/fbrp/deploy/ddos-shield/install.sh uninstall`

## What it does (on the VPS)

| Layer | Protection |
|---|---|
| `ddos-shield.nft` (own nftables table, never touches ufw/Docker/fail2ban) | Drops malformed TCP, bogus sources, unsolicited UDP from amplifier ports (DNS/NTP/memcached/SSDP…), ping floods, per-IP SYN floods. FiveM UDP 30120: >1500 pkt/s from one IP gets that IP dropped for 5 min. FiveM HTTP 30120: max 30 new conns/s and 64 open per IP. Caddy 80/443: max 128 open per IP. txAdmin 40120 closed to the internet (still reachable at tx.floridabay.net). SSH: max 10 new conns/min per IP. |
| `99-fbrp-ddos.conf` | Larger packet/SYN/socket queues, 512k conntrack entries with short timeouts for half-open/UDP junk. |
| `fbrp-ddos-shield.service` | Loads both at boot and spreads packet processing for ens3 over all 4 CPUs (RPS). |

Your home IP 73.173.242.232 and the Docker bridges are never limited. Edit `trusted4` in the .nft file to add more.

See what's being dropped: `sudo nft list table inet fbrp_shield | grep -E 'counter packets [1-9]'`
Currently banned IPs: `sudo nft list set inet fbrp_shield fivem_ban4`

## What it cannot do

A server can only filter what reaches it. A flood bigger than the VPS's network link fills the pipe
before any of these rules run. That part has to be stopped upstream:

1. **OVH Edge Network Firewall** (OVH Control Panel → Network → Public IP Addresses → `15.204.211.183` → ⋯ → Edge Network Firewall).
   Allow TCP 22, 80, 443, 30120 and UDP 30120, 443, plus "established", then deny everything else. OVH drops the rest before it reaches the VPS.
2. **Stop publishing the IP.** `floridabay.net`, `www` and `tx` all resolve straight to the game server IP. Put the website on
   Cloudflare with the orange-cloud proxy so the website doesn't give the IP away.
3. **Hide the game IP.** Players see it when they connect. The only full fix is a FiveM-aware filtered proxy or
   game-protected hosting in front of FXServer (`sv_endpoints`, `sv_proxyIPRanges`, `sv_forceIndirectListing`).
   After moving to a new IP that has never been public, keep it private.
