---
"wrangler": patch
---

Ignore the removed `legacy_env` field when reading a redirected configuration

Older versions of tools such as the Vite plugin can generate a redirected configuration (`.wrangler/deploy/config.json`) that still includes the removed `legacy_env` field. Since these files are tool-generated, users could not easily remove the field themselves, and Wrangler would error out. Wrangler now silently strips `legacy_env` from redirected configurations. User-authored configurations still report an error so that the field can be removed.
