---
"wrangler": minor
---

feature: Add 'cloudchamber whoami' command and change 'cloudchamber ssh list' so it matches the style

Adding a new command to cloudchamber that allows the customer to see their Cloudchamber account configuration.
We also had to change 'cloudchamber ssh list' so it fits the style of the command.
The new command shows relevant information like:

- Available locations.
- Configured image registries.
- Configured public ssh keys.
- Default configuration and limits in the account.
