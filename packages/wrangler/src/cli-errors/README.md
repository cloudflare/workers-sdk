# CLI Errors

Structured error classes for Wrangler CLI commands. Each error provides **two
messages**: a concise one for humans and a verbose and one for AI coding agents.
The base class automatically selects the right variant at construction time by
checking whether the process is running inside an agentic environment
(via [`am-i-vibing`](https://www.npmjs.com/package/am-i-vibing)).

## Why

Traditional CLI errors are optimized for human readers. When an AI agent drives
Wrangler, it benefits from richer context: what went wrong, how to fix it, and
what to ask the human operator. This dual-message system lets us serve both
audiences from a single `throw`.

## Directory Structure

```
cli-errors/
  cli-error.ts                          # Abstract CLIError base class
  cli-command-line-args-error.ts        # Abstract CLICommandLineArgsError (preserves --help display)
  index.ts                              # Barrel file
  README.md                             # This file

  type-generation/                      # Errors thrown by `wrangler types`
    index.ts                            # Barrel file
    missing-config-file-error.ts
    types-out-of-date-error.ts
    ...
```

Each Wrangler command that adopts this system gets its own subdirectory
(e.g. `type-generation/`). This keeps errors co-located by feature while
making it easy to enumerate every error a command can throw.

## Adding a New Error

1. Create a file in the appropriate command subdirectory (e.g.
   `cli-errors/deploy/my-new-error.ts`).
2. Export a class that extends `CLIError` (or `CLICommandLineArgsError` for
   argument-validation errors that should trigger `--help` display).
3. Supply both `humanMessage` and `aiMessage` to the `super()` call.
4. Re-export the class from the subdirectory's `index.ts` barrel.

```typescript
import dedent from "ts-dedent";
import { CLIError } from "../cli-error";

/**
 * Thrown when the flux capacitor is not calibrated.
 */
export class FluxCapacitorError extends CLIError {
	constructor(currentLevel: number) {
		const humanMessage = `Flux capacitor is miscalibrated (level: ${currentLevel}).`;

		const aiMessage = dedent`
			Error: Flux Capacitor Miscalibrated

			The flux capacitor is at level ${currentLevel}, but it must be at 1.21 GW.

			To resolve this, adjust the flux capacitor in wrangler.json and run "wrangler calibrate --force".

			You may want to ask the human developer whether this is the correct DeLorean.
		`;

		super(humanMessage, aiMessage, {
			telemetryMessage: "deploy flux capacitor miscalibrated",
		});
	}
}
```

## AI Message Format

AI messages should be plain text written as natural prose. Avoid markdown
formatting (no `##` headers, no backtick fences, no `**bold**`). Use double
quotes around code identifiers, file names, and commands.

A typical message has three parts that flow naturally:

1. **Title and explanation** — Start with `Error: [Short Title]`, followed by
   a paragraph that explains what happened and why.
2. **Resolution** — A paragraph starting with "To resolve this, ..." that
   tells the agent what to do.
3. **Human questions** _(optional)_ — A sentence starting with "You may want
   to ask the human developer ..." for cases where clarification is needed.

Example:

```
Error: [Short Title]

[Description of what happened, including relevant context and why it matters.]

To resolve this, [actionable fix instructions with concrete examples].

You may want to ask the human developer [clarifying question].
```

## Base Classes

| Class                     | Extends    | Use when                                             |
| ------------------------- | ---------- | ---------------------------------------------------- |
| `CLIError`                | `Error`    | General CLI errors (config, bindings, runtime, etc.) |
| `CLICommandLineArgsError` | `CLIError` | Argument-validation errors that should show `--help` |

Both are **abstract** — you must subclass them.

## `WRANGLER_OUTPUTS_FOR_AGENTS` Environment Variable

You can override automatic agent detection with the
`WRANGLER_OUTPUTS_FOR_AGENTS` environment variable:

| Value     | Effect                                                    |
| --------- | --------------------------------------------------------- |
| `"true"`  | Force AI-optimized (plain text) error output              |
| `"false"` | Force concise human error output, even inside an AI agent |
| _(unset)_ | Auto-detect via `am-i-vibing` (default)                   |

This is useful for:

- **Manual testing** — preview AI messages without running inside an agent:
  `WRANGLER_OUTPUTS_FOR_AGENTS=true wrangler types`
- **Opt-out** — force human messages even when an agent is detected:
  `WRANGLER_OUTPUTS_FOR_AGENTS=false wrangler types`

## Integration with Wrangler's Error Pipeline

`CLIError` does **not** extend `UserError`. Instead it uses an `isUserError`
flag (defaulting to `true`) that `handleError()` checks to suppress Sentry
reporting and "report a bug" messaging. This keeps the CLI error hierarchy
independent from Wrangler's legacy error taxonomy.

### Telemetry

The `telemetryMessage` property on `CLIError` is consumed by the same
telemetry sinks that handle `UserError`:

- `core/register-yargs-command.ts` — reports `errorMessage` for command-level
  telemetry events
- `metrics/sanitization.ts` (`sanitizeError()`) — used by `index.ts` and
  `autoconfig/` for error telemetry

Both sinks check `err instanceof UserError || err instanceof CLIError` to
extract the telemetry label. If you add a new telemetry consumer that reads
`telemetryMessage`, make sure it also handles `CLIError`.

## Future: Automated Error Documentation

All concrete error classes are centralized under `cli-errors/` by design. This
makes it possible to statically analyze the directory (e.g. via AST parsing or
a simple script) and extract every error's:

- Class name and file path
- Human message template
- AI message template
- Telemetry label
- Which command throws it

This data can be used to generate automated error documentation, a searchable
error catalogue, or an LLM-consumable error reference.
