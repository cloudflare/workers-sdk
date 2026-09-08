---
"wrangler": minor
---

Improve onboarding when the `previews` block is missing from a Wrangler configuration file

When a local `previews` block is absent, Wrangler can write a safe Preview Base configuration to the user-authored config file while retaining adapter-generated Preview settings for deployment. If no Preview Base exists, Wrangler prints placeholders for supported production bindings and gives manual guidance for unsupported bindings without exposing production values. After deployment, Wrangler also warns when production secret names are missing from the Preview deployment.
