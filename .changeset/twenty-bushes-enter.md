---
"wrangler": patch
---

removing default values for delivery delay and message retention and updating description to reflect different message retention limits for free tier queues (between 60 and 86400 seconds if on free tier, otherwise must be between 60 and 1209600 seconds)

Previous: wrangler set a default value of 365400 seconds max message retention if setting was not explicitly provided to wrangler and the max retention period was documented as 1209600 seconds for all queues users because it was required to be on paid tier, wrangler also set a default value of 0 seconds for delivery delay if setting was not explicitly provided to wrangler

Updated: wrangler no longer sets a default value for max message retention if setting was not explicitly provided to wrangler, max retention period is now documented as 86400 seconds for free tier queues and 1209600 seconds for paid tier queues, wrangler no longer sets a default value of 0 seconds for delivery delay if setting was not explicitly provided to wrangler
