import { setTimeout } from "node:timers/promises";
import stripAnsi from "strip-ansi";
import type { ReadableStream } from "node:stream/web";

const TIMEOUT = Symbol.for("TIMEOUT");

export async function readUntil(
	lines: ReadableStream<string>,
	regExp: RegExp,
	timeout = 20_000
): Promise<RegExpMatchArray> {
	const timeoutPromise = setTimeout(timeout, TIMEOUT);
	const reader = lines.getReader();
	const readArray: string[] = [];
	const read = () => stripAnsi(readArray.join("\n"));
	try {
		// eslint-disable-next-line no-constant-condition
		while (true) {
			const result = await Promise.race([reader.read(), timeoutPromise]);
			if (result === TIMEOUT) {
				throw new Error(
					`readUntil() timed out matching ${regExp} in output:\n${read()}`
				);
			}
			if (result.done) {
				throw new Error(
					`readUntil() reached the end of the stream without matching ${regExp} in output:\n${read()}`
				);
			}
			const match = result.value.match(regExp);
			if (match !== null) {
				return match;
			}
			readArray.push(result.value);
		}
	} finally {
		try {
			reader.releaseLock();
		} catch (e) {
			console.error("Error while releasing lock", e);
		}
	}
}
