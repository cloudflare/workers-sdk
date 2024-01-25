---
"wrangler": minor
---

feature: adds support for configuring Sippy with Google Cloud Storage (GCS) provider.

Sippy (https://developers.cloudflare.com/r2/data-migration/sippy/) now supports Google Cloud Storage.
This change updates the `wrangler r2 sippy` commands to take a provider (AWS or GCS) and appropriate configuration arguments.
If you don't specify a provide then the command will enter an interactive flow for the user to set the configuration.
Note that this is a breaking change from the previous behaviour where you could configure AWS as the provider without explictly specifying the `--provider` argument.
(This breaking change is allowed in a minor release because the Sippy feature and `wrangler r2 sippy` commands are marked as beta.)
