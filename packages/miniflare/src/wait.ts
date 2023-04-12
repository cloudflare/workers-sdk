import http from "http";
import type { TimerOptions } from "timers";
import { setTimeout } from "timers/promises";

function attemptDelay(attempts: number) {
	if (attempts < 10) return 10;
	if (attempts < 20) return 50;
	if (attempts < 30) return 100;
	return 1000;
}

// Disable keep-alive for polling requests
const agent = new http.Agent({ keepAlive: false, maxSockets: 1 });

function request(options: http.RequestOptions) {
	return new Promise<number>((resolve, reject) => {
		const req = http.request(options, (res) => {
			resolve(res.statusCode ?? 0);
			res.destroy();
		});
		req.on("error", (err) => reject(err));
		req.end();
	});
}

export async function waitForRequest(options: http.RequestOptions) {
	options = { ...options, agent };

	let attempts = 0;
	const signal = options.signal;
	const timeoutOptions: TimerOptions = { signal };

	while (!signal?.aborted) {
		try {
			const code = await request(options);
			if (code !== undefined && 200 <= code && code < 300) return;
		} catch (e: any) {
			const code = e.code;
			if (code === "ABORT_ERR") return;
			if (
				// Adapted from https://github.com/dwmkerr/wait-port/blob/0d58d29a6d6b8ea996de9c6829706bb3b0952ee8/lib/wait-port.js
				code !== "ECONNREFUSED" &&
				code !== "ECONNTIMEOUT" &&
				code !== "ECONNRESET" &&
				code !== "ENOTFOUND"
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
