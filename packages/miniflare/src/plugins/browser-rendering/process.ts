import WebSocket from "ws";
import type { Process } from "@puppeteer/browsers";

const BROWSER_CLOSE_TIMEOUT = 5_000;

type BrowserProcess = Pick<Process, "hasClosed" | "kill">;

function waitForGracefulClose(
	browserProcess: BrowserProcess,
	wsEndpoint: string,
	timeoutMs: number
): Promise<boolean> {
	return new Promise((resolve) => {
		const socket = new WebSocket(wsEndpoint);
		const timeout = setTimeout(() => finish(false), timeoutMs);
		let finished = false;

		function finish(closed: boolean) {
			if (finished) return;
			finished = true;
			clearTimeout(timeout);
			socket.terminate();
			resolve(closed);
		}

		void browserProcess.hasClosed().then(
			() => finish(true),
			() => finish(false)
		);
		socket.once("open", () => {
			socket.send(
				JSON.stringify({ id: 1, method: "Browser.close" }),
				(error) => {
					if (error) finish(false);
				}
			);
		});
		socket.once("error", () => finish(false));
	});
}

async function waitForExit(
	browserProcess: BrowserProcess,
	timeoutMs: number
): Promise<void> {
	let timeout: NodeJS.Timeout | undefined;
	await Promise.race([
		browserProcess.hasClosed().catch(() => {}),
		new Promise<void>((resolve) => {
			timeout = setTimeout(resolve, timeoutMs);
		}),
	]);
	clearTimeout(timeout);
}

export async function closeBrowserProcess(
	browserProcess: BrowserProcess,
	wsEndpoint: string,
	timeoutMs = BROWSER_CLOSE_TIMEOUT
): Promise<void> {
	if (await waitForGracefulClose(browserProcess, wsEndpoint, timeoutMs)) return;

	// Process.kill() terminates the whole process tree with taskkill on Windows
	// and SIGKILL on the detached process group on POSIX systems.
	browserProcess.kill();
	await waitForExit(browserProcess, timeoutMs);
}
