import { CommandLineArgsError } from "@cloudflare/workers-utils";
import { createCommand, createNamespace } from "../core/create-command";
import { confirm } from "../dialogs";
import { logger } from "../logger";
import { requireAuth } from "../user";
import { createdResourceConfig } from "../utils/add-created-resource-config";
import formatLabelledValues from "../utils/render-labelled-values";
import {
	createK2Stream,
	deleteK2Stream,
	getK2Stream,
	listK2Streams,
} from "./client";
import type { K2Stream } from "./client";

const metadata = { owner: "Product: Pipelines", status: "open beta" } as const;
const MIN_RETENTION_SECONDS = 60 * 60;
const MAX_RETENTION_SECONDS = 30 * 24 * 60 * 60;
const jsonArg = {
	describe: "Output in JSON format",
	type: "boolean",
	default: false,
} as const;

export const k2Namespace = createNamespace({
	metadata: {
		...metadata,
		description: "⛰️ Manage K2 streams",
		category: "Storage & databases",
	},
});
export const k2StreamsNamespace = createNamespace({
	metadata: {
		...metadata,
		description: "Create, inspect, and delete K2 streams",
	},
});

function validateCors(origins: string[] | undefined): void {
	if (!origins) {
		return;
	}
	if (
		origins.length > 5 ||
		new Set(origins).size !== origins.length ||
		(origins.includes("*") && origins.length !== 1)
	) {
		throw new CommandLineArgsError(
			"Specify at most five distinct CORS origins, or '*' by itself.",
			{ telemetryMessage: "k2 streams invalid cors list" }
		);
	}
	for (const origin of origins) {
		if (origin === "*") {
			continue;
		}
		let url: URL;
		try {
			url = new URL(origin);
		} catch {
			throw new CommandLineArgsError(
				"CORS origins must be HTTP or HTTPS origins without credentials, paths, queries, or fragments.",
				{ telemetryMessage: "k2 streams invalid cors origin" }
			);
		}
		if (
			!["http:", "https:"].includes(url.protocol) ||
			url.origin !== origin ||
			url.username ||
			url.password
		) {
			throw new CommandLineArgsError(
				"CORS origins must be HTTP or HTTPS origins without credentials, paths, queries, or fragments.",
				{ telemetryMessage: "k2 streams invalid cors origin" }
			);
		}
	}
}

function displayStream(stream: K2Stream): void {
	logger.log(
		formatLabelledValues({
			Name: stream.name,
			ID: stream.id,
			"Retention (seconds)": String(stream.retention_seconds),
			HTTP: stream.http.enabled
				? stream.http.authentication
					? "Enabled (authenticated)"
					: "Enabled (public)"
				: "Disabled",
			...(stream.http.enabled && stream.endpoint
				? { Endpoint: stream.endpoint }
				: {}),
			"Worker binding": stream.worker_binding.enabled ? "Enabled" : "Disabled",
		})
	);
}

export const k2StreamsCreateCommand = createCommand({
	metadata: { ...metadata, description: "Create a K2 stream" },
	behaviour: { printBanner: (args) => !args.json },
	positionalArgs: ["stream"],
	args: {
		stream: {
			describe: "The name of the stream to create",
			type: "string",
			demandOption: true,
		},
		"retention-seconds": {
			describe: `Record retention in seconds (${MIN_RETENTION_SECONDS}–${MAX_RETENTION_SECONDS}; defaults to the API default)`,
			type: "number",
		},
		"http-enabled": {
			describe: "Enable HTTP ingestion",
			type: "boolean",
			default: false,
		},
		"http-auth": {
			describe: "Require authentication for HTTP ingestion",
			type: "boolean",
			default: true,
		},
		"worker-binding-enabled": {
			describe: "Allow Workers to bind to this stream",
			type: "boolean",
			default: true,
		},
		"cors-origin": {
			describe: "Allowed HTTP origin (repeatable; '*' must be used alone)",
			type: "string",
			array: true,
		},
		json: jsonArg,
	},
	validateArgs(args) {
		if (
			args.retentionSeconds !== undefined &&
			(!Number.isInteger(args.retentionSeconds) ||
				args.retentionSeconds < MIN_RETENTION_SECONDS ||
				args.retentionSeconds > MAX_RETENTION_SECONDS)
		) {
			throw new CommandLineArgsError(
				`Retention must be an integer between ${MIN_RETENTION_SECONDS} and ${MAX_RETENTION_SECONDS} seconds.`,
				{ telemetryMessage: "k2 streams invalid retention" }
			);
		}
		if (!args.httpEnabled && !args.workerBindingEnabled) {
			throw new CommandLineArgsError(
				"At least one input (HTTP or Worker binding) must be enabled.",
				{ telemetryMessage: "k2 streams no enabled input" }
			);
		}
		if (!args.httpEnabled && args.corsOrigin?.length) {
			throw new CommandLineArgsError(
				"CORS origins require HTTP ingestion to be enabled.",
				{ telemetryMessage: "k2 streams cors without http" }
			);
		}
		validateCors(args.corsOrigin);
	},
	async handler(args, { config, sdk }) {
		const accountId = await requireAuth(config);
		if (!args.json) {
			logger.log(`Creating K2 stream '${args.stream}'...`);
		}
		const stream = await createK2Stream(sdk, accountId, {
			name: args.stream,
			...(args.retentionSeconds === undefined
				? {}
				: { retention_seconds: args.retentionSeconds }),
			http: args.httpEnabled
				? {
						enabled: true,
						authentication: args.httpAuth,
						...(args.corsOrigin ? { cors: { origins: args.corsOrigin } } : {}),
					}
				: { enabled: false },
			worker_binding: { enabled: args.workerBindingEnabled },
		});
		if (args.json) {
			logger.json(stream);
			return;
		}
		displayStream(stream);
		if (stream.worker_binding.enabled) {
			await createdResourceConfig(
				"k2",
				() => ({
					binding: "YOUR_BINDING_NAME",
					stream: stream.id,
				}),
				config.configPath,
				args.env,
				{ updateConfig: false }
			);
			logger.log(
				'Replace "YOUR_BINDING_NAME" with your chosen Worker binding name (for example, "EVENTS" for env.EVENTS).'
			);
		}
	},
});

export const k2StreamsGetCommand = createCommand({
	metadata: { ...metadata, description: "Get a K2 stream by ID" },
	behaviour: { printBanner: (args) => !args.json },
	positionalArgs: ["stream"],
	args: {
		stream: {
			describe: "The K2 stream ID",
			type: "string",
			demandOption: true,
		},
		json: jsonArg,
	},
	async handler(args, { config, sdk }) {
		const stream = await getK2Stream(
			sdk,
			await requireAuth(config),
			args.stream
		);
		if (args.json) {
			logger.json(stream);
		} else {
			displayStream(stream);
		}
	},
});

export const k2StreamsDeleteCommand = createCommand({
	metadata: { ...metadata, description: "Delete a K2 stream by ID" },
	behaviour: { printBanner: (args) => !args.json },
	positionalArgs: ["stream"],
	args: {
		stream: {
			describe: "The K2 stream ID",
			type: "string",
			demandOption: true,
		},
		force: {
			describe: "Skip confirmation",
			type: "boolean",
			alias: "y",
			default: false,
		},
		json: jsonArg,
	},
	validateArgs(args) {
		if (!args.stream || args.stream === "." || args.stream === "..") {
			throw new CommandLineArgsError(
				"A non-empty K2 stream ID other than '.' or '..' is required.",
				{ telemetryMessage: "k2 streams delete invalid stream id" }
			);
		}
		if (args.json && !args.force) {
			throw new CommandLineArgsError(
				"Deleting a K2 stream with --json requires --force to skip confirmation.",
				{ telemetryMessage: "k2 streams delete json missing force" }
			);
		}
	},
	async handler(args, { config, sdk }) {
		const accountId = await requireAuth(config);
		const stream = await getK2Stream(sdk, accountId, args.stream);
		if (
			!args.force &&
			!(await confirm(
				`Are you sure you want to delete the K2 stream '${stream.name}' (${args.stream})?`,
				{ defaultValue: false, fallbackValue: false }
			))
		) {
			logger.log("Delete cancelled.");
			return;
		}
		await deleteK2Stream(sdk, accountId, args.stream);
		if (args.json) {
			logger.json({ id: args.stream, deleted: true });
		} else {
			logger.log(
				`Successfully deleted K2 stream '${stream.name}' (${args.stream}).`
			);
		}
	},
});

export const k2StreamsListCommand = createCommand({
	metadata: { ...metadata, description: "List a page of K2 streams" },
	behaviour: { printBanner: (args) => !args.json },
	args: {
		page: { describe: "Page number", type: "number", default: 1 },
		"per-page": {
			describe: "Streams per page (1–100)",
			type: "number",
			default: 25,
		},
		name: {
			describe: "Filter by a case-insensitive name substring",
			type: "string",
		},
		json: jsonArg,
	},
	validateArgs(args) {
		if (
			!Number.isSafeInteger(args.page) ||
			args.page < 1 ||
			!Number.isInteger(args.perPage) ||
			args.perPage < 1 ||
			args.perPage > 100 ||
			!Number.isSafeInteger((args.page - 1) * args.perPage)
		) {
			throw new CommandLineArgsError(
				"Page must be a positive integer, per-page must be 1–100, and the pagination offset must be a safe integer.",
				{ telemetryMessage: "k2 streams invalid pagination" }
			);
		}
	},
	async handler(args, { config, sdk }) {
		const streams = await listK2Streams(sdk, await requireAuth(config), {
			page: args.page,
			per_page: args.perPage,
			...(args.name === undefined ? {} : { name: args.name }),
		});
		if (args.json) {
			logger.json(streams);
			return;
		}
		if (streams.length === 0) {
			logger.log("No K2 streams found.");
			return;
		}
		logger.table(
			streams.map((stream) => ({
				Name: stream.name,
				ID: stream.id,
				"Retention (seconds)": String(stream.retention_seconds),
				HTTP: stream.http.enabled ? "Enabled" : "Disabled",
				"Worker binding": stream.worker_binding.enabled
					? "Enabled"
					: "Disabled",
			}))
		);
		logger.log(`Page ${args.page} (${args.perPage} streams per page).`);
	},
});
