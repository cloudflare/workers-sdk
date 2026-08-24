---
"@cloudflare/config": minor
---

Reject conflicting destination restrictions in send-email bindings

Send-email bindings now match Wrangler validation by allowing either `destinationAddress` or `allowedDestinationAddresses`, but not both. `allowedSenderAddresses` remains an independent restriction that can accompany either destination mode.
