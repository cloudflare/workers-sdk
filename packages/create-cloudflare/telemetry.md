# Create-Cloudflare Telemetry

Cloudflare gathers non-user identifying telemetry data about usage of [create-cloudflare](https://www.npmjs.com/package/create-cloudflare), the command-line interface for scaffolding Workers and Pages applications

You can [opt out of sharing telemetry data](#how-can-i-configure-create-cloudflare-telemetry) at any time.

## Why are we collecting telemetry data?

Create-Cloudflare Telemetry allows us to better identify roadblocks and bugs and gain visibility on usage of features across all users. It also helps us to add new features to create a better overall experience. We monitor this data to ensure Create-Cloudflare’s consistent growth, stability, usability and developer experience.

- If certain errors are hit more frequently, those bug fixes will be prioritized in future releases
- If certain languages are used more frequently, we will add more templates in this language
- If certain templates are no longer used, they will be removed and replaced

## What telemetry data is Cloudflare collecting?

- Command used as the entrypoint into Create-Cloudflare (e.g. `npm create cloudflare@latest`, `npm create cloudflare –-template myrepo`)
- Package manager (e.g. npm, yarn)
- Create-Cloudflare version (e.g. create-cloudflare 10.8.1)
- Whether project is renamed
- Sanitized error information (e.g. error type, frequency)
- Whether instance is a first time Create-Cloudflare download
- Used template and language
- Experience outcome (e.g. deployed, created locally, or no project created)
- Total session duration (e.g. 30 seconds, etc.)
- General machine information such as OS Version, CPU architecture (e.g. macOS, x84)

Cloudflare will receive the IP address associated with your machine and such information is handled in accordance with Cloudflare’s [Privacy Policy](https://www.cloudflare.com/privacypolicy/).

**Note**: This list is regularly audited to ensure its accuracy.

## What happens with sensitive data?

Cloudflare takes your privacy seriously and does not collect any sensitive information including: any usernames, raw error logs and stack traces, file names/paths and content of files, and environment variables. Data is never shared with third parties.

## How can I view analytics code?

To view what data is being collected while using Create-Cloudflare, provide the environment variable `CREATE_CLOUDFLARE_TELEMETRY_DEBUG=1` during invocation:

`CREATE_CLOUDFLARE_TELEMETRY_DEBUG=1 npm create cloudflare`

All events can be viewed at [./src/event.ts](./src/event.ts). It is run in the background and will not delay project execution. As a result, when necessary (e.g. no internet connection), it will fail quickly and quietly.

An example of an event sent to Cloudflare might look like:

```json
{
	"event": "c3 session started",
	"deviceId": "9fd5d422-99a1-4c7d-9666-ca3637927fa6",
	"timestamp": 1726760778899,
	"properties": {
		"amplitude_session_id": 1726760778800,
		"amplitude_event_id": 0,
		"platform": "Mac OS",
		"c3Version": "2.34.5",
		"isFirstUsage": false,
		"packageManager": "npm",
		"args": {
			"_": [],
			"auto-update": false,
			"autoUpdate": false,
			"experimental": false,
			"open": true,
			"$0": "create-cloudflare",
			"additionalArgs": []
		}
	}
}
```

## How can I configure Create-Cloudflare telemetry?

If you would like to disable telemetry, you can run:

```sh
npm create cloudflare telemetry disable
```

Alternatively, you can set an environment variable:

```sh
export CREATE_CLOUDFLARE_TELEMETRY_DISABLED=1
```

If you would like to re-enable telemetry, you can run:

```sh
npm create cloudflare telemetry enable
```

If you would like to check the status of Create-Cloudflare telemetry, you can run:

```sh
npm create cloudflare telemetry status
```
