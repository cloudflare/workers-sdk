import type { TimerOptions } from "timers";
import { setTimeout } from "timers/promises";
import { request } from "undici";

function attemptDelay(attempts: number) {
	if (attempts < 10) return 10;
	if (attempts < 20) return 50;
	if (attempts < 30) return 100;
	return 1000;
}

export async function waitForRequest(...options: Parameters<typeof request>) {
	let attempts = 0;
	const signal = options[1]?.signal as AbortSignal | undefined;
	const timeoutOptions: TimerOptions = { signal };

	while (!signal?.aborted) {
		try {
			const res = await request(...options);
			const code = res.statusCode;
			if (code !== undefined && 200 <= code && code < 300) return;
		} catch (e: any) {
			const code = e.code;
			if (code === "UND_ERR_ABORTED") return;
			if (
				// Adapted from https://github.com/dwmkerr/wait-port/blob/0d58d29a6d6b8ea996de9c6829706bb3b0952ee8/lib/wait-port.js
				code !== "ECONNREFUSED" &&
				code !== "ECONNTIMEOUT" &&
				code !== "ECONNRESET" &&
				code !== "ENOTFOUND" &&
				// Docker published port, but not bound in container
				code !== "ECONNRESET" &&
				code !== "UND_ERR_SOCKET"
			) {
				throw e;
			}
		}
		attempts++;

		if (signal?.aborted) return;
		try {
			await setTimeout(attemptDelay(attempts), undefined, timeoutOptions);
		} catch (e: any) {
			if (e.code === "ABORT_ERR") return;
			throw e;
		}
	}
}
