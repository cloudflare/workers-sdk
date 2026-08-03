import path from "node:path";
import readline from "node:readline";
import {
	FatalError,
	parseJSON,
	readFileSync,
	UserError,
} from "@cloudflare/workers-utils";
import { parse as dotenvParse } from "dotenv";

export function validateFileSecrets(
	content: unknown,
	jsonFilePath: string
): content is Record<string, string | null> {
	if (content === null || typeof content !== "object") {
		throw new FatalError(
			`The contents of "${jsonFilePath}" is not valid. It should be a JSON object of string values.`,
			{ telemetryMessage: "secret bulk file invalid contents" }
		);
	}
	const entries = Object.entries(content);
	for (const [key, value] of entries) {
		if (value != null && typeof value !== "string") {
			throw new FatalError(
				`The value for "${key}" in "${jsonFilePath}" is not null or a "string" instead it is of type "${typeof value}"`,
				{ telemetryMessage: "secret bulk file invalid value type" }
			);
		}
	}
	return true;
}

/** Error thrown when no input is provided to parseBulkInputToObject */
export class NoInputError extends Error {
	constructor() {
		super("No input provided");
		this.name = "NoInputError";
	}
}

/** Result from parsing bulk secret input without nullable values, including metadata for analytics */
export type BulkInputResult = {
	content: Record<string, string>;
	secretSource: "file" | "stdin";
	secretFormat: "json" | "dotenv";
};

/** Result from parsing bulk secret input with nullable values, including metadata for analytics */
export type BulkInputNullableResult = {
	content: Record<string, string | null>;
	secretSource: "file" | "stdin";
	secretFormat: "json" | "dotenv";
};

/** Override for callers that need non-nullable */
export async function parseBulkInputToObject(
	input?: string,
	includeNull?: false
): Promise<BulkInputResult | undefined>;

/** Override for callers that need nullable */
export async function parseBulkInputToObject(
	input?: string,
	includeNull?: true
): Promise<BulkInputNullableResult | undefined>;

export async function parseBulkInputToObject(
	input?: string,
	includeNull: boolean = false
): Promise<BulkInputResult | BulkInputNullableResult | undefined> {
	let content: Record<string, string | null>;
	let secretSource: "file" | "stdin";
	let secretFormat: "json" | "dotenv";

	if (input) {
		secretSource = "file";
		const jsonFilePath = path.resolve(input);
		const fileContent = readFileSync(jsonFilePath);
		try {
			content = parseJSON(fileContent) as Record<string, string | null>;
			secretFormat = "json";
		} catch {
			content = dotenvParse(fileContent);
			secretFormat = "dotenv";
			// dotenvParse does not error unless fileContent is undefined, no keys === error
			if (Object.keys(content).length === 0) {
				throw new UserError(`The contents of "${input}" is not valid.`, {
					telemetryMessage: "secret bulk invalid input",
				});
			}
		}
	} else {
		secretSource = "stdin";
		try {
			const rl = readline.createInterface({ input: process.stdin });
			const pipedInputLines: string[] = [];
			for await (const line of rl) {
				pipedInputLines.push(line);
			}
			const pipedInput = pipedInputLines.join("\n");
			try {
				content = parseJSON(pipedInput) as Record<string, string | null>;
				secretFormat = "json";
			} catch (e) {
				content = dotenvParse(pipedInput);
				secretFormat = "dotenv";
				// dotenvParse does not error unless fileContent is undefined, no keys === error
				if (Object.keys(content).length === 0) {
					throw e;
				}
			}
		} catch {
			return;
		}
	}
	validateFileSecrets(content, input ?? "piped input");
	if (!includeNull) {
		content = Object.fromEntries(
			Object.entries(content).filter(
				(entry): entry is [string, string] => entry[1] != null
			)
		);
	}
	return { content, secretSource, secretFormat };
}
