---
"wrangler": patch
---

feature: Sentry Integration
Top level exception logging which will allow to Pre-empt issues, fix bugs faster,
Identify uncommon error scenarios, and better quality error information. Context includes of Error in addition to stacktrace
Environment:
OS/arch
node/npm versions
wrangler version
RewriteFrames relative pathing of stacktrace and will prevent user file system information
from being sent.

Sourcemaps:

- The sourcemap custom scripts for path matching in Artifact, Sentry Event and Build output is moved to be handled in GH Actions
  Sentry upload moved after changeset version bump script and npm script to get current version into GH env variable
- Add org and project to secrets for increased obfuscation of Cloudflare internal ecosystem

Prompt for Opt-In:

- When Error is thrown user will be prompted with yes (only sends this time), Always, and No (default). Always and No
  will be added to deafult.toml with a datetime property for future update checks.
- If the property already exists it will skip the prompt.

Sentry Tests:
The tests currently check that the decision flow works as currently set up then checks if Sentry is able
to send events or is disabled.
