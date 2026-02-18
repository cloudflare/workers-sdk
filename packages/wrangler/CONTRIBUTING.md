# Wrangler Contributing Guidelines for Internal Teams

## What you will learn

- How to add a new command to Wrangler
- How to specify arguments for a command
- How to use experimental flags
- How to read from the config
- How to implement a command
- How to test a command

## Defining your new command in Wrangler

1. Create the command structure and define it in the registry.

First, create your namespaces and commands with the `createNamespace` and `createCommand` utilities. Namespaces are the prefix before the subcommand, eg. "wrangler kv" in "wrangler kv put".

```ts
import { createCommand, createNamespace } from "../core/create-command";
import { createKVNamespace } from "./helpers";

// Namespaces are the prefix before the subcommand
// eg "wrangler kv" in "wrangler kv put"
// eg "wrangler kv key" in "wrangler kv key put"
export const kvNamespace = createNamespace({
	metadata: {
		description: "Commands for interacting with Workers KV",
		status: "stable",
	},
});

// Every level of namespaces must be defined
// eg "wrangler kv key" in "wrangler kv key put"
export const kvKeyNamespace = createKVNamespace({
	metadata: {
		description: "Commands for interacting with Workers KV data",
		status: "stable",
	},
});

// Define the command args, implementation and metadata
export const kvKeyPutCommand = createCommand({
	metadata: {
		description: "Put a key-value pair into a Workers KV namespace",
		status: "stable",
	},
	args: {
		key: {
			type: "string",
			description: "The key to put into the KV namespace",
			demandOption: true,
		},
		value: {
			type: "string",
			description: "The value to put into the KV namespace",
			demandOption: true,
		},
		"namespace-id": {
			type: "string",
			description: "The namespace to put the key-value pair into",
		},
	},
	// the positionalArgs defines which of the args are positional and in what order
	positionalArgs: ["key", "value"],
	handler(args, ctx) {
		// implementation here
	},
});
```

Define your commands in the registry

```ts
import { kvKeyNamespace, kvKeyPutCommand, kvNamespace } from "./kv";

// ...

registry.define([
	{ command: "wrangler kv", definition: kvNamespace },
	{ command: "wrangler kv key", definition: kvKeyNamespace },
	{ command: "wrangler kv key put", definition: kvKeyPutCommand },
	// ...other kv commands here
]);
registry.registerNamespace("kv");
```

2. Command-specific (named + positional) args vs shared args vs global args

- Command-specific args are defined in the `args` field of the command definition. Command handlers receive these as a typed object automatically. To make any of these positional, add the key to the `positionalArgs` array.
- You can share args between commands by declaring a separate object and spreading it into the `args` field. Feel free to import from another file.
- Global args are shared across all commands and defined in `src/commands/global-args.ts` (same schema as command-specific args). They are available in every command handler.

3. Optionally, get a type for the args

You may want to pass your args to other functions. These functions will need to be typed. To get a type of your args, you can use `typeof command.args`.

4. Implement the command handler

A command handler is just a function that receives the `args` as the first param and `ctx` as the second param. This is where you will want to do API calls, I/O, logging, etc.

- API calls

Define API response type. Use `fetchResult` to make authenticated API calls. Import it from `src/cfetch` or use `ctx.fetchResult`. `fetchResult` will throw an error if the response is not 2xx.

```ts
type UploadResponse = {
	jwt?: string;
};

const res = await fetchResult<UploadResponse>(
	`/accounts/${accountId}/workers/assets/upload`,
	{
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: payload,
	}
);
```

- Logging

Do not use `console.*` methods to log. You must the `logger` singleton (imported from `src/logger`) or use `ctx.logger`.

- Error handling - UserError vs Error

These classes can be imported from `src/errors` or found on `ctx`, eg. `ctx.errors.UserError`.

Throw `UserError` for errors _caused_ by the user -- these are not sent to Sentry whereas regular `Error`s are and should be used for unexpected exceptions.

For example, if an exception was encountered because the user provided an invalid SQL statement in a D1 command, a `UserError` should be thrown. Whereas, if the D1 local DB crashed for another reason or there was a network error, a regular `Error` would be thrown.

Errors are caught at the top-level and formatted for the console.

## Best Practices

### Integration with Cloudflare REST API

The [Cloudflare REST API](https://developers.cloudflare.com/api/) whenever possible should not be interacted directly with, the [Cloudflare TypeScript SDK](https://www.npmjs.com/package/cloudflare) package should be used instead. This helps the type safety of the code as well as preventing the usage of undocumented and unstable features that might be present in the raw REST API.

The SDK is set up for every command's handler ([code](https://github.com/cloudflare/workers-sdk/blob/20467fda1/packages/wrangler/src/core/register-yargs-command.ts#L200)) and unless there are other needs, this should be the preferred way of consuming it.
You can see an example of using the SDK in the [KV create command](https://github.com/cloudflare/workers-sdk/blob/20467fda1/packages/wrangler/src/kv/index.ts#L110).

### Status / Deprecation

Status can be alpha, "private beta", "open beta", or stable. Breaking changes can freely be made in alpha or "private beta". Try avoid breaking changes in "open beta" but are acceptable and should be called out in [a changeset](../../CONTRIBUTING.md#Changesets).

Stable commands should never have breaking changes.

### Changesets

Run `npx changesets` from the top of the repo. New commands warrant a "minor" bump. Please explain the functionality with examples.

For example:

```md
feat: implement the `wrangler versions deploy` command

This command allows users to deploy a multiple versions of their Worker.

For interactive use (to be prompted for all options), run:

- `wrangler versions deploy`

For non-interactive use, run with CLI args (and `--yes` to accept defaults):

- `wrangler versions deploy --version-id $v1 --percentage 90 --version-id $v2 --percentage 10 --yes`
```

### Experimental Flags

If you have a stable command, new features should be added behind an experimental flag. By convention, these are named `--experimental-<feature-name>` and have an alias `--x-<feature-name>`. These should be boolean, defaulting to false (off by default).

To stabilise a feature, flip the default to true while keeping the flag to allow users to disable the feature with `--no-x-<feature-name>`.

After a validation period with no issues reported, you can mark the flag as deprecated and hidden, and remove all code paths using the flag.

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
