---
"wrangler": patch
---

Always print deployment and placement ID in Cloudchamber commands

Currently, Cloudchamber commands only print the full deployment ID when the deployment has an IPv4 address. This commit ensures the deployment ID and the placement ID are always printed to stdout. It also moves the printing of the IPv4 address (if one exists) to the same place as the IPv6 address so that they are printed together.
