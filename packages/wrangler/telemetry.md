# Wrangler CLI Telemetry

Cloudflare gathers non-user identifying telemetry data about usage of [Wrangler](https://www.npmjs.com/package/wrangler), the command-line interface for building and deploying Workers and Pages applications.

You can [opt out of sharing telemetry data](#how-can-i-configure-wrangler-telemetry) at any time.

## Why are we collecting telemetry data?

Telemetry in Wrangler allows us to better identify bugs and gain visibility on usage of features across all users. It also helps us to make data-informed decisions like adding, improving or removing features. We monitor and analyze this data to ensure Wrangler’s consistent growth, stability, usability and developer experience. For instance, if certain errors are hit more frequently, those bug fixes will be prioritized in future releases.

## What telemetry data is Cloudflare collecting?

- What command is being run (e.g. `wrangler deploy`, `wrangler dev`)
- Anonymized arguments and flags given to Wrangler (e.g. `wrangler deploy ./src/index.ts --dry-run=true --outdir=dist` would be sent as `wrangler deploy REDACTED --dry-run=true --outdir=REDACTED`)
- Anonymized information about your Worker. For instance, this can include (this list is non-exhaustive):
  - Whether or not Workers Assets is being used, along with the output directory
  - Whether or not TypeScript is being used
  - The framework being used
  - The build command being used
  - How secrets are managed (e.g. whether secrets are added individually or in bulk, whether input comes from interactive prompts, stdin, or files, and the format used for bulk imports). No secret names, values, or counts are tracked.
- Information about your connection to Cloudflare's API (e.g. how long it takes Wrangler to deploy your Worker)
- The version of the Wrangler client that is sending the event
- The package manager that the Wrangler client is using. (e.g. npm, yarn)
- The major version of Node.js that the Wrangler client is running on
- Whether this is the first time the user has used the Wrangler client
- The format of the Wrangler configuration file (e.g. `toml`, `jsonc`)
- Total session duration of the command run (e.g. 3 seconds, etc.)
- Whether the Wrangler client is running in CI or in an interactive instance
- Whether the command was executed by an AI coding agent (e.g. Claude Code, Cursor, GitHub Copilot), and if so, which agent
- Error _type_ (e.g. `APIError` or `UserError`), and sanitised error messages that will not include user information like filepaths or stack traces (e.g. `Asset too large`).
- General machine information such as OS and OS Version

Cloudflare will receive the IP address associated with your machine and such information is handled in accordance with Cloudflare’s [Privacy Policy](https://www.cloudflare.com/privacypolicy/).

**Note**: This list is regularly audited to ensure its accuracy.

## What happens with sensitive data?

Cloudflare takes your privacy seriously and does not collect any sensitive information including: usernames, raw error logs, stack traces, file names/paths, content of files, and environment variables. Data is never shared with third parties.

## How can I view analytics data?

To view what is being collected while using Wrangler, provide the following environment variable in your command:

`WRANGLER_LOG=debug`

e.g.

```sh
WRANGLER_LOG=debug npx wrangler deploy
```

Telemetry source code can be viewed at https://github.com/cloudflare/workers-sdk/tree/main/packages/wrangler/src/metrics. It is run in the background and will not delay project execution. As a result, when necessary (e.g. no internet connection), it will fail quickly and quietly.

## How can I configure Wrangler telemetry?

If you would like to disable telemetry, you can run:

```sh
npx wrangler telemetry disable
```

You may also configure telemetry on a per project basis by adding the following field to your project’s wrangler.toml:

`send_metrics=false`

Alternatively, you may set an environment variable to disable telemetry.

`WRANGLER_SEND_METRICS=false`

If you would like to re-enable telemetry globally, you can run:

```sh
npx wrangler telemetry enable
```

If you would like to check the status of Wrangler telemetry, you can run:

```sh
npx wrangler telemetry status
```
