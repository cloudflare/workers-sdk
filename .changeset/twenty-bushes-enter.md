---
"wrangler": patch
---

Remove default values for delivery delay and message retention and update messaging on limits

Fixes the issue of the default maximum message retention (365400 seconds) being longer than the maximum allowed retention period for free tier users (86400 seconds).

Previous: wrangler set a default value of 365400 seconds max message retention if setting was not explicitly provided to wrangler and the max retention period was documented as 1209600 seconds for all queues users because it was required to be on paid tier, wrangler also set a default value of 0 seconds for delivery delay if setting was not explicitly provided to wrangler

Updated:

- Wrangler no longer sets a default value for max message retention so that the default can be applied at the API.
- The maximum retention period is now documented as 86400 seconds for free tier queues and 1209600 seconds for paid tier queues
- Wrangler also no longer sets a default value for delivery delay so that the default can be applied at the API.
