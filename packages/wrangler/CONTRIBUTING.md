# Wrangler Contributing Guidelines for Internal Teams

## What you will learn

- How to add a new command to Wrangler
- How to specify arguments for a command
- How to use experimental flags
- How to read from the config
- How to implement a command
- How to test a command

## Defining your new command to Wrangler

1. define the command with the util defineCommand

```ts
import { defineCommand, defineNamespace } from "./util";

// Namespaces are the prefix before the subcommand
// eg "wrangler kv" in "wrangler kv put"
// eg "wrangler kv key" in "wrangler kv key put"
defineNamespace({
	command: "wrangler kv",
	metadata: {
		description: "Commands for interacting with Workers KV",
		status: "stable",
	},
});
// Every level of namespaces must be defined
// eg "wrangler kv key" in "wrangler kv key put"
defineNamespace({
	command: "wrangler kv key",
	metadata: {
		description: "Commands for interacting with Workers KV data",
		status: "stable",
	},
});

// Define the command args, implementation and metadata
const command = defineCommand({
	command: "wrangler kv key put", // the full command including the namespace
	metadata: {
		description: "Put a key-value pair into a Workers KV namespace",
		status: "stable",
	},
	args: {
		key: {
			type: "string",
			description: "The key to put into the KV namespace",
			required: true,
		},
		value: {
			type: "string",
			description: "The value to put into the KV namespace",
			required: true,
		},
		"namespace-id": {
			type: "string",
			description: "The namespace to put the key-value pair into",
			required: true,
		},
	},
	// the positionalArgs defines which of the args are positional and in what order
	positionalArgs: ["key", "value"],
	handler(args) {
		// implementation here
	},
});
```

2. global vs shared vs command specific (named + positional) args

- Command-specific args are defined in the `args` field of the command definition. Command handlers receive these as a typed object automatically. To make any of these positional, add the key to the `positionalArgs` array.
- You can share args between commands by declaring a separate object and spreading it into the `args` field. Feel free to import from another file.
- Global args are shared across all commands and defined in `src/commands/global-args.ts` (same schema as command-specific args). They are passed to every command handler.

3. (get a type for the args)

You may want to pass your args to other functions. These functions will need to be typed. To get a type of your args, you can use `typeof command.args`.

4. implement the command handler

A command handler is just a function that receives the args as the first param. This is where you will want to do API calls, I/O, logging, etc.

- api calls

Define API response type. Use `fetchResult` to make API calls. `fetchResult` will throw an error if the response is not 2xx.

```ts
await fetchResult(
	`/accounts/${accountId}/workers/services/${scriptName}`,
	{ method: "DELETE" },
	new URLSearchParams({ force: needsForceDelete.toString() })
);
```

- logging

Do not use `console.*` methods to log. You must import and use the `logger` singleton.

- error handling - UserError vs Error

Throw `UserError` for errors _caused_ by the user -- these are not sent to Sentry whereas regular `Error` are and show be used for unexpected exceptions.

Errors are caught at the top-level and formatted for the console.

## Best Practices

### Status / Deprecation

Status can be alpha, private-beta, open-beta, or stable. Breaking changes can freely be made in alpha or private-beta. Try avoid breaking changes in open-beta but are acceptable and should be called out in changeset.

Stable commands should never have breaking changes.

### Changesets

Run `npx changesets` from the top of the repo. New commands warrant a "minor" bump. Please explain the functionality with examples.

### Experimental Flags

If you have a stable command, new features should be added behind an experimental flag. By convention, these are named `--experimental-<feature-name>` and have an alias `--x-<feature-name>`. These should be boolean, defaulting to false (off by default).

To stabilise a feature, flip the default to true while keeping the flag to allow users to disable the feature.

After a bedding period, you can mark the flag as deprecated and hidden. And remove all code paths using the flag.

### Documentation

Add documentation for the command in the [`cloudflare-docs`](https://github.com/cloudflare/cloudflare-docs) repo.

### PR Best Practices

- link to a ticket or issue
- add a description of what the PR does _and why_
- add a description of how to test the PR manually
- test manually with prelease (automatically published by PR bot)
- lint/check before push
- add "e2e" label if you need e2e tests to run

## Testing

### Unit/Integration Tests

These tests are in the `workers-sdk/packages/wrangler/src/__tests__/` directory.

Write these tests when you need to mock out the API or any module.

### Fixture Tests

These tests are in the `workers-sdk/fixtures/` directory.

Write these when you want to test your feature on a real Workers project.

### E2E Tests

Write these when you want to test your feature against the production API. Use describe.each to write the same test against multiple combinations of flags for your command.
