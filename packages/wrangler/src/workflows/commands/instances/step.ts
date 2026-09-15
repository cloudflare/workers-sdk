import { createWriteStream, writeFileSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { UserError } from "@cloudflare/workers-utils";
import { performApiFetch } from "../../../cfetch";
import { createCommand } from "../../../core/create-command";
import { logger } from "../../../logger";
import { requireAuth } from "../../../user";
import {
	fetchLocalRaw,
	getLocalInstanceIdFromArgs,
	localWorkflowArgs,
} from "../../local";
import { getInstanceIdFromArgs, jsonWorkflowArgs } from "../../utils";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import type { Response } from "undici";

interface StepOutputResult {
	status: string;
	error: { name: string; message: string } | null;
	output: unknown;
}

const STEP_OUTPUT_DISPLAY_CAP_BYTES = 2 * 1024 * 1024;

export const workflowsInstancesStepCommand = createCommand({
	metadata: {
		description: "Get the full, untruncated output of a single step",
		owner: "Product: Workflows",
		status: "stable",
	},
	positionalArgs: ["name", "id"],
	args: {
		...localWorkflowArgs,
		...jsonWorkflowArgs,
		name: {
			describe: "Name of the workflow",
			type: "string",
			demandOption: true,
		},
		id: {
			describe:
				"ID of the instance - instead of an UUID you can type 'latest' to get the latest instance",
			type: "string",
			demandOption: false,
			default: "latest",
		},
		step: {
			describe:
				"Exact step name from the instance logs (including the generated -N counter suffix)",
			type: "string",
			demandOption: true,
		},
		type: {
			describe: "Step type, to disambiguate step.do and waitForEvent steps",
			type: "string",
			choices: ["step", "waitForEvent"] as const,
			default: "step" as const,
		},
		attempt: {
			describe: "Retrieve the output/error for a specific attempt number",
			type: "number",
		},
		output: {
			describe: "Write the step output to a file instead of stdout",
			type: "string",
		},
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},

	async handler(args, { config }) {
		if (args.json && args.output !== undefined) {
			throw new UserError("'--output' cannot be used with '--json'.", {
				telemetryMessage: "workflows step output file with json",
			});
		}
		if (
			args.attempt !== undefined &&
			(!Number.isInteger(args.attempt) || args.attempt < 1)
		) {
			throw new UserError("--attempt must be a positive integer", {
				telemetryMessage: "workflows step output invalid attempt",
			});
		}
		if (args.attempt !== undefined && args.type === "waitForEvent") {
			throw new UserError(
				"'--attempt' is not supported when '--type' is 'waitForEvent'.",
				{ telemetryMessage: "workflows step output attempt with waitForEvent" }
			);
		}

		const query = new URLSearchParams({ name: args.step, type: args.type });
		if (args.attempt !== undefined) {
			query.set("attempt", String(args.attempt));
		}

		let response: Response;
		if (args.local) {
			const id = await getLocalInstanceIdFromArgs(args.port, args, {
				quiet: args.json,
			});
			response = await fetchLocalRaw(
				args.port,
				`/workflows/${encodeURIComponent(args.name)}/instances/${encodeURIComponent(id)}/step?${query.toString()}`
			);
		} else {
			const accountId = await requireAuth(config);
			const id = await getInstanceIdFromArgs(accountId, args, config);
			response = await performApiFetch(
				config,
				`/accounts/${accountId}/workflows/${args.name}/instances/${id}/step?${query.toString()}`
			);
		}

		await renderStepOutput(response, args.step, args.output, args.json);
	},
});

async function renderStepOutput(
	response: Response,
	stepName: string,
	outputFile: string | undefined,
	jsonOutput: boolean
): Promise<void> {
	if (!response.ok) {
		const json = (await response.json().catch(() => null)) as {
			errors?: Array<{ message: string }>;
		} | null;
		const message = json?.errors?.[0]?.message ?? `HTTP ${response.status}`;
		throw new UserError(`Failed to get step output: ${message}`, {
			telemetryMessage: "workflows step output error response",
		});
	}

	const contentType = response.headers.get("content-type") ?? "";

	// A ReadableStream output is streamed back as raw bytes (may be text or binary).
	if (contentType.includes("application/octet-stream")) {
		if (jsonOutput) {
			throw new UserError(
				"Streamed step output cannot be emitted with --json. Re-run without --json or use --output <file> to save the raw bytes.",
				{ telemetryMessage: "workflows step output stream with json" }
			);
		}
		if (!response.body) {
			throw new UserError("Step output response had no body.", {
				telemetryMessage: "workflows step output empty body",
			});
		}
		if (outputFile) {
			// Stream to disk so arbitrarily large outputs never buffer in memory.
			await pipeline(
				Readable.fromWeb(response.body as unknown as NodeReadableStream),
				createWriteStream(outputFile)
			);
			logger.info(`Wrote step output to "${outputFile}"`);
			return;
		}
		const { bytes, exceededCap } = await readBodyWithDisplayCap(
			response.body as unknown as NodeReadableStream<Uint8Array>,
			STEP_OUTPUT_DISPLAY_CAP_BYTES
		);
		if (exceededCap) {
			throw new UserError(
				`Step "${stepName}" output exceeds the 2 MiB stdout display limit. Re-run with --output <file> to save the full output.`,
				{
					telemetryMessage:
						"workflows step output exceeds stdout display limit",
				}
			);
		}
		try {
			logger.log(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
		} catch {
			throw new UserError(
				`Step "${stepName}" returned binary output (${bytes.byteLength} bytes). Re-run with --output <file> to save it.`,
				{
					telemetryMessage: "workflows step output binary requires output file",
				}
			);
		}
		return;
	}

	const { result } = (await response.json()) as { result?: StepOutputResult };
	if (!result) {
		throw new UserError("Unexpected response from the step output endpoint.", {
			telemetryMessage: "workflows step output malformed response",
		});
	}
	if (jsonOutput) {
		logger.json(result);
		return;
	}

	if (result.error) {
		logger.warn(`Step "${stepName}" is in status "${result.status}".`);
		logger.error(`${result.error.name}: ${result.error.message}`);
		return;
	}

	if (result.output === null || result.output === undefined) {
		logger.info(
			`Step "${stepName}" is in status "${result.status}" with no output available.`
		);
		return;
	}

	const text =
		typeof result.output === "string"
			? result.output
			: JSON.stringify(result.output, null, 2);
	if (outputFile) {
		writeFileSync(outputFile, text);
		logger.info(`Wrote step output to "${outputFile}"`);
		return;
	}
	logger.log(text);
}

async function readBodyWithDisplayCap(
	body: NodeReadableStream<Uint8Array>,
	capBytes: number
): Promise<{ bytes: Uint8Array; exceededCap: boolean }> {
	const reader = body.getReader();
	const buffer = new Uint8Array(capBytes + 1);
	let byteLength = 0;

	try {
		while (byteLength <= capBytes) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}
			const retainedByteLength = Math.min(
				value.byteLength,
				buffer.byteLength - byteLength
			);
			buffer.set(value.subarray(0, retainedByteLength), byteLength);
			byteLength += retainedByteLength;
		}
	} finally {
		void reader.cancel().catch(() => {});
	}

	return {
		bytes: buffer.subarray(0, byteLength),
		exceededCap: byteLength > capBytes,
	};
}
