import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { redirects } from "../src/index";

describe("worker", () => {
	it("python workers", async () => {
		const resp = await SELF.fetch(`https://workers.new/python`, {
			redirect: "manual",
		});

		const location = resp.headers.get("Location");

		expect(location).toMatchInlineSnapshot(
			'"https://workers.cloudflare.com/playground/python"'
		);
	});

	it("templates list", async () => {
		const resp = await SELF.fetch(`https://workers.new/templates`, {
			redirect: "manual",
		});

		expect(await resp.text()).toMatchSnapshot();
	});

	it("static definitions", async () => {
		const redirectMapping = new Map();
		for (const [path] of Object.entries(redirects)) {
			const resp = await SELF.fetch(`https://workers.new${path}`, {
				redirect: "manual",
			});

			const location = resp.headers.get("Location");

			redirectMapping.set(path, location);
		}
		expect(redirectMapping).toMatchInlineSnapshot(`
			Map {
			  "/pages-image-sharing" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/pages-image-sharing?file=src%2Findex.tsx&title=Image%20Sharing%20Website%20with%20Pages%20Functions&terminal=start-stackblitz",
			  "/stream/auth/stripe" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/stream/auth/stripe?file=src%2Findex.html&title=Stream%20+%20Stripe%20Checkout&terminal=start-stackblitz",
			  "/worker-durable-objects" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/worker-durable-objects?file=index.js&title=Workers%20Durable%20Objects%20counter&terminal=start-stackblitz",
			  "/d1" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/worker-d1?file=src%2Findex.ts&title=Workers%20D1&terminal=start-stackblitz",
			  "/router" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/worker-router?file=index.js&title=Workers%20Router&terminal=start-stackblitz",
			  "/typescript" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/worker-typescript?file=src%2Findex.ts&title=Workers%20TypeScript&terminal=start-stackblitz",
			  "/websocket" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/worker-websocket?file=index.js&title=Workers%20WebSocket&terminal=start-stackblitz",
			  "/example-wordle" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/worker-example-wordle?file=src%2Findex.ts&title=Workers%20Wordle%20example&terminal=start-stackblitz",
			  "/example-request-scheduler" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/worker-example-request-scheduler?file=src%2Findex.ts&title=Workers%20Request%20Scheduler&terminal=start-stackblitz",
			  "/websocket-durable-objects" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/worker-websocket-durable-objects?file=src%2Findex.ts&title=Workers%20WebSocket%20Durable%20Objects&terminal=start-stackblitz",
			  "/worktop" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/worker-worktop?file=src%2Findex.ts&title=Workers%20Worktop&terminal=start-stackblitz",
			  "/pages-functions-cors" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/pages-functions-cors?file=functions%2Fapi%2F_middleware.ts&title=Pages%20Functions%20CORS&terminal=dev",
			  "/pages-plugin-static-forms" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/pages-plugin-static-forms?file=functions%2F_middleware.ts&title=Pages%20Plugin%20static%20forms&terminal=dev",
			  "/pages-example-forum-app" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/pages-example-forum-app?file=functions%2Fapi%2Fcode.ts&title=Pages%20Example%20Forum%20app&terminal=dev",
			  "/stream/stream-player" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/stream/playback/stream-player?file=src%2Findex.html&title=Cloudflare%20Stream%20Player&terminal=start-stackblitz",
			  "/stream/video-js" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/stream/playback/video-js?file=src%2Findex.html&title=Cloudflare%20Stream%20+%20Video.js&terminal=start-stackblitz",
			  "/stream/vidstack" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/stream/playback/vidstack?file=src%2Findex.html&title=Cloudflare%20Stream%20+%20Vidstack&terminal=start-stackblitz",
			  "/stream/hls-js" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/stream/playback/hls-js?file=src%2Findex.html&title=Cloudflare%20Stream%20+%20hls.js&terminal=start-stackblitz",
			  "/stream/dash-js" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/stream/playback/dash-js?file=src%2Findex.html&title=Cloudflare%20Stream%20+%20dash.js&terminal=start-stackblitz",
			  "/stream/shaka-player" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/stream/playback/shaka-player?file=src%2Findex.js&title=Cloudflare%20Stream%20+%20Shaka%20Player&terminal=start-stackblitz",
			  "/stream/direct-creator-uploads" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/stream/upload/direct-creator-uploads?file=src%2Findex.html&title=Direct%20Creator%20Uploads%20to%20Cloudflare%20Stream&terminal=start-stackblitz",
			  "/stream/direct-creator-uploads-tus" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/stream/upload/direct-creator-uploads-tus?file=src%2Findex.html&title=Direct%20Creator%20Uploads%20to%20Cloudflare%20Stream,%20using%20TUS&terminal=start-stackblitz",
			  "/stream/webrtc" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/stream/webrtc?file=src%2Findex.html&title=Stream%20live%20video%20(using%20WHIP)%20and%20playback%20(using%20WHEP)%20over%20WebRTC%20with%20Cloudflare%20Stream&terminal=start-stackblitz",
			  "/stream/webrtc-whip" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/stream/webrtc?file=src%2Findex.html&title=Stream%20live%20video%20(using%20WHIP)%20over%20WebRTC%20with%20Cloudflare%20Stream&terminal=start-stackblitz",
			  "/stream/webrtc-whep" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/stream/webrtc?file=src%2Findex.html&title=Play%20live%20video%20(using%20WHEP)%20over%20WebRTC%20with%20Cloudflare%20Stream&terminal=start-stackblitz",
			  "/stream/signed-urls-public-content" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/stream/auth/signed-urls-public-content?file=src%2Findex.html&title=Example%20of%20using%20Cloudflare%20Stream%20Signed%20URLs%20with%20public%20content&terminal=start-stackblitz",
			}
		`);
	});
});
