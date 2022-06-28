import { PATH_TO_WRANGLER } from "./constants";
import type { WritableOptions } from "node:stream";

/**
 * Helper utility for use in piping child process outputs
 * into `console` functions
 *
 * @param logger Any function that takes a string as input
 * @returns an implementaion of WritableOptions.write
 */
export function pipe(
	logger: (message: string) => void
): WritableOptions["write"] {
	return (chunk, encoding, callback) => {
		let error: Error | null | undefined = undefined;

		try {
			const message = cleanMessage(stringifyChunk(chunk, encoding));
			if (message !== "") {
				logger(message);
			}
		} catch (e) {
			if (e === null || e === undefined || e instanceof Error) {
				error = e;
			} else {
				throw new Error(`Encountered unexpected error ${e}`);
			}
		}

		callback(error);
	};
}
/**
 * Even though they're not supposed to, sometimes `encoding` will be "buffer"
 * Which just means, like...it's a buffer. It really should be "utf-8" instead
 * but whatever.
 */
const stringifyChunk = (
	chunk: unknown,
	encoding: BufferEncoding | "buffer"
): string => {
	if (chunk instanceof Buffer) {
		if (encoding !== "buffer") {
			return chunk.toString(encoding);
		}

		return chunk.toString();
	}

	if (typeof chunk === "string") {
		return chunk;
	}

	throw new Error("Unsure what type of chunk this is.");
};
/**
 * Find-and-replace various things in console output that vary between
 * runs with standardized text
 */
export const cleanMessage = (message: string): string =>
	message
		.replaceAll(/^.*debugger.*$/gim, "") // remove debugger statements
		.replaceAll(/\d+ms/gm, "[timing]") // standardize timings
		.replaceAll(process.cwd(), "[dir]") // standardize directories
		.replaceAll(process.cwd().replaceAll("\\", "/"), "[dir]")
		.replaceAll(PATH_TO_WRANGLER, "[wrangler 1]") // standardize calls to wrangler 1
		.replaceAll(/found .+ vulnerabilities/gm, "found [some] vulnerabilities") // vuln counts
		.replaceAll(
			// remove specific paths to node, wranglerjs, and output file
			/(Error: failed to execute `)(\S*node\S*) (\S*wranglerjs\S*) \S*(--output-file=)(\S+)(.+)/gm,
			'$1"node" "wranglerjs" "$4[file]"$6'
		)
		.replaceAll("✨  ", "") // wrangler only does emojis on unix
		.replaceAll(/^Built at: .+$/gim, "Built at: [time]")
		.trim();
