import { WorkerEntrypoint } from "cloudflare:workers";

let screenshot: Uint8Array | undefined;

export default class MockBrowser extends WorkerEntrypoint {
	setScreenshot(bytes: number[]) {
		screenshot = Uint8Array.from(bytes);
	}

	async quickAction(action: "screenshot", options: { html: string }) {
		if (screenshot === undefined) {
			throw new Error("Mock screenshot has not been configured.");
		}

		return new Response(screenshot, {
			headers: { "content-type": "image/png" },
		});
	}
}
