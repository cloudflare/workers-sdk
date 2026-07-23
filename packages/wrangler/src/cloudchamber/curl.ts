import { randomUUID } from "node:crypto";
import { logRaw } from "@cloudflare/cli-shared-helpers";
import {
	bold,
	brandColor,
	cyanBright,
	yellow,
} from "@cloudflare/cli-shared-helpers/colors";
import { ApiError, OpenAPI } from "@cloudflare/containers-shared";
import { request } from "@cloudflare/containers-shared/src/client/core/request";
import { UserError } from "@cloudflare/workers-utils";
import { createCommand } from "../core/create-command";
import formatLabelledValues from "../utils/render-labelled-values";
import { cloudchamberScope, fillOpenAPIConfiguration } from "./common";
import type {
	CommonYargsOptions,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
import type { Config } from "@cloudflare/workers-utils";
import type { Argv } from "yargs";

export function yargsCurl(args: Argv<CommonYargsOptions>) {
	return args
		.positional("path", { type: "string", default: "/" })
		.option("header", {
			type: "array",
			alias: "H",
			describe: "Add headers in the form of --header <name>:<value>",
		})
		.option("data", {
			type: "string",
			describe: "Add a JSON body to the request",
			alias: "d",
		})
		.option("data-deprecated", {
			type: "string",
			hidden: true,
			alias: "D",
		})
		.option("method", {
			type: "string",
			alias: "X",
			default: "GET",
		})
		.option("silent", {
			describe: "Only output response",
			type: "boolean",
			alias: "s",
		})
		.option("verbose", {
			describe: "Print everything, like request id, or headers",
			type: "boolean",
			alias: "v",
		})
		.option("use-stdin", {
			describe: "Equivalent of using --data-binary @- in curl",
			type: "boolean",
			alias: "stdin",
		});
}

export async function curlCommand(
	args: StrictYargsOptionsToInterface<typeof yargsCurl>,
	config: Config
) {
	await requestFromCmd(args, config);
}

async function read(stream: NodeJS.ReadStream) {
	const chunks = [];
	for await (const chunk of stream) {
		chunks.push(chunk);
	}
	return Buffer.concat(chunks).toString("utf8");
}

function parseHeaders(
	headerArgs: (string | number)[] | undefined,
	requestId: string
): Record<string, string> {
	const headers: Record<string, string> = {
		"coordinator-request-id": requestId,
	};

	for (const headerArg of headerArgs ?? []) {
		const header = headerArg.toString();
		const separatorIndex = header.indexOf(":");
		if (separatorIndex === -1) {
			throw new UserError(
				`Invalid header format: "${header}". Expected "name:value".`,
				{ telemetryMessage: "cloudchamber curl invalid header" }
			);
		}

		const name = header.slice(0, separatorIndex).trim();
		if (!name) {
			throw new UserError(
				`Invalid header format: "${header}". Header name cannot be empty.`,
				{ telemetryMessage: "cloudchamber curl empty header name" }
			);
		}

		headers[name] = header.slice(separatorIndex + 1).trim();
	}

	return headers;
}

async function requestFromCmd(
	args: {
		path: string;
		method: string;
		header: (string | number)[] | undefined;
		data?: string;
		dataDeprecated?: string;
		silent?: boolean;
		verbose?: boolean;
		useStdin?: boolean;
	},
	_config: Config
): Promise<void> {
	const requestId = `wrangler-${randomUUID()}`;
	if (args.verbose && !args.silent) {
		logRaw(bold(brandColor("Request ID: " + requestId)));
	}

	if (args.useStdin) {
		args.data = await read(process.stdin);
	}
	const headers = parseHeaders(args.header, requestId);

	try {
		const data = args.data ?? args.dataDeprecated;
		const res = await request(OpenAPI, {
			url: args.path,
			method: args.method as
				| "GET"
				| "PUT"
				| "POST"
				| "DELETE"
				| "OPTIONS"
				| "HEAD"
				| "PATCH",
			body: data ? JSON.parse(data) : undefined,
			mediaType: "application/json",
			headers: headers,
		});
		if (args.silent) {
			logRaw(
				JSON.stringify(
					!args.verbose
						? res
						: {
								res,
								headers: headers,
								request_id: requestId,
							},
					null,
					4
				)
			);
		} else {
			if (args.verbose) {
				logRaw(cyanBright(">> Headers"));
				logRaw(
					formatLabelledValues(headers, {
						indentationCount: 4,
						formatLabel: function (label: string): string {
							return yellow(label + ":");
						},
						formatValue: yellow,
					})
				);

				logRaw(cyanBright(">> Body"));
			}

			const text = JSON.stringify(res, null, 4);
			logRaw(text);
		}
		return;
	} catch (error) {
		if (error instanceof ApiError) {
			logRaw(
				JSON.stringify({
					request: error.request,
					status: error.status,
					statusText: error.statusText,
					body: error.body,
				})
			);
		} else {
			logRaw(String(error));
		}
	}
}

export const cloudchamberCurlCommand = createCommand({
	metadata: {
		description: "Send a request to an arbitrary Cloudchamber endpoint",
		status: "alpha",
		owner: "Product: Cloudchamber",
		hidden: false,
	},
	args: {
		path: {
			type: "string",
			default: "/",
			demandOption: true,
		},
		header: {
			type: "array",
			alias: "H",
			describe: "Add headers in the form of --header <name>:<value>",
		},
		data: {
			type: "string",
			describe: "Add a JSON body to the request",
			alias: "d",
		},
		"data-deprecated": {
			type: "string",
			hidden: true,
			alias: "D",
		},
		method: {
			type: "string",
			alias: "X",
			default: "GET",
		},
		silent: {
			describe: "Only output response",
			type: "boolean",
			alias: "s",
		},
		verbose: {
			describe: "Print everything, like request id, or headers",
			type: "boolean",
			alias: "v",
		},
		"use-stdin": {
			describe: "Equivalent of using --data-binary @- in curl",
			type: "boolean",
			alias: "stdin",
		},
	},
	positionalArgs: ["path"],
	async handler(args, { config }) {
		await fillOpenAPIConfiguration(config, cloudchamberScope);
		await curlCommand(args, config);
	},
});
