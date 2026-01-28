---
"wrangler": patch
---

Sanitize commands and arguments in telemetry to prevent accidentally capturing sensitive information.

**Changes:**

- Renamed telemetry fields from `command`/`args` to `sanitizedCommand`/`sanitizedArgs` to distinguish from historical fields that may have contained sensitive data in older versions
- Command names now come from command definitions rather than user input, preventing accidental capture of sensitive data pasted as positional arguments
- Sentry breadcrumbs now use the safe command name from definitions
- Argument values are only included if explicitly allowed via `COMMAND_ARG_ALLOW_LIST`
- Argument keys (names) are always included since they come from command definitions, not user input
