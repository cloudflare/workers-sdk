import { randomUUID } from "crypto";
import { logRaw } from "@cloudflare/cli";
import { bold, brandColor, cyanBright, yellow } from "@cloudflare/cli/colors";
import { OpenAPI } from "./client";
import { ApiError } from "./client/core/ApiError";
import { request } from "./client/core/request";
import type { Config } from "../config";
import type {
	CommonYargsOptionsJSON,
	StrictYargsOptionsToInterfaceJSON,
} from "../yargs-types";
import type yargs from "yargs";

export function yargsCurl(args: yargs.Argv<CommonYargsOptionsJSON>) {
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
	args: StrictYargsOptionsToInterfaceJSON<typeof yargsCurl>,
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

async function requestFromCmd(
	args: {
		path: string;
		method: string;
		header: (string | number)[] | undefined;
		data?: string;
		silent?: boolean;
		verbose?: boolean;
		useStdin?: boolean;
		json?: boolean;
	},
	_config: Config
): Promise<void> {
	const requestId = `wrangler-${randomUUID()}`;
	if (!args.json && args.verbose) {
		logRaw(bold(brandColor("Request id: " + requestId)));
	}

	if (args.useStdin) {
		args.data = await read(process.stdin);
	}
	try {
		const headers: Record<string, string> = (args.header ?? []).reduce(
			(prev, now) => ({
				...prev,
				[now.toString().split(":")[0].trim()]: now
					.toString()
					.split(":")[1]
					.trim(),
			}),
			{ "coordinator-request-id": requestId }
		);
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
			body: args.data ? JSON.parse(args.data) : undefined,
			mediaType: "application/json",
			headers: headers,
		});
		if (args.json || args.silent) {
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
		} else if (!args.json && !args.silent) {
			if (args.verbose) {
				logRaw(cyanBright(">> Headers"));
				for (const header in headers) {
					logRaw("\t" + yellow(`${header}: ${headers[header]}`));
				}
			}
			logRaw(cyanBright(">> Body"));
			const text = JSON.stringify(res, null, 4);
			logRaw(
				text
					.split("\n")
					.map((line) => `${yellow(`\t`)} ${brandColor(line)}`)
					.join("\n")
			);
		}
		return;
	} catch (error) {
		if (error instanceof ApiError) {
			logRaw(
				JSON.stringify({
					request: error.request,
					status: error.status,
					statusText: error.statusText,
				})
			);
		} else {
			logRaw(String(error));
		}
	}
}
