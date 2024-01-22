import { resolve } from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { unstable_dev } from "wrangler";
import { redirects } from "../src/index";
import type { UnstableDevWorker } from "wrangler";

describe("worker", () => {
	let worker: UnstableDevWorker;

	beforeAll(async () => {
		worker = await unstable_dev(resolve(__dirname, "../src/index.ts"), {
			experimental: {
				disableExperimentalWarning: true,
			},
		});
	});

	afterAll(async () => {
		await worker.stop();
	});
	it("root", async () => {
		const resp = await worker.fetch(`https://workers.new`, {
			redirect: "manual",
		});

		const location = resp.headers.get("Location");

		expect(location).toMatchInlineSnapshot(
			'"https://workers.cloudflare.com/playground"'
		);
	});

	it("templates list", async () => {
		const resp = await worker.fetch(`https://workers.new/templates`, {
			redirect: "manual",
		});

		expect(await resp.text()).toMatchSnapshot();
	});

	it("static definitions", async () => {
		const redirectMapping = new Map();
		for (const [path] of Object.entries(redirects)) {
			const resp = await worker.fetch(`https://workers.new${path}`, {
				redirect: "manual",
			});

			const location = resp.headers.get("Location");

			redirectMapping.set(path, location);
		}
		expect(redirectMapping).toMatchInlineSnapshot(`
			Map {
			  "/pages-image-sharing" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/pages-image-sharing?file=src%2Findex.tsx&title=Image Sharing Website with Pages Functions&terminal=start-stackblitz",
			  "/stream/auth/stripe" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/stream/auth/stripe?file=src%2Findex.html&title=Stream + Stripe Checkout&terminal=start-stackblitz",
			  "/worker-durable-objects" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/worker-durable-objects?file=index.js&title=Workers Durable Objects counter&terminal=start-stackblitz",
			  "/d1" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/worker-d1?file=src%2Findex.ts&title=Workers D1&terminal=start-stackblitz",
			  "/router" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/worker-router?file=index.js&title=Workers Router&terminal=start-stackblitz",
			  "/typescript" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/worker-typescript?file=src%2Findex.ts&title=Workers TypeScript&terminal=start-stackblitz",
			  "/websocket" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/worker-websocket?file=index.js&title=Workers WebSocket&terminal=start-stackblitz",
			  "/example-wordle" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/worker-example-wordle?file=src%2Findex.ts&title=Workers Wordle example&terminal=start-stackblitz",
			  "/example-request-scheduler" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/worker-example-request-scheduler?file=src%2Findex.ts&title=Workers Request Scheduler&terminal=start-stackblitz",
			  "/websocket-durable-objects" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/worker-websocket-durable-objects?file=src%2Findex.ts&title=Workers WebSocket Durable Objects&terminal=start-stackblitz",
			  "/worktop" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/worker-worktop?file=src%2Findex.ts&title=Workers Worktop&terminal=start-stackblitz",
			  "/pages-functions-cors" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/pages-functions-cors?file=functions%2Fapi%2F_middleware.ts&title=Pages Functions CORS&terminal=dev",
			  "/pages-plugin-static-forms" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/pages-plugin-static-forms?file=functions%2F_middleware.ts&title=Pages Plugin static forms&terminal=dev",
			  "/pages-example-forum-app" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/pages-example-forum-app?file=functions%2Fapi%2Fcode.ts&title=Pages Example Forum app&terminal=dev",
			  "/stream/stream-player" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/stream/playback/stream-player?file=src%2Findex.html&title=Cloudflare Stream Player&terminal=start-stackblitz",
			  "/stream/video-js" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/stream/playback/video-js?file=src%2Findex.html&title=Cloudflare Stream + Video.js&terminal=start-stackblitz",
			  "/stream/vidstack" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/stream/playback/vidstack?file=src%2Findex.html&title=Cloudflare Stream + Vidstack&terminal=start-stackblitz",
			  "/stream/hls-js" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/stream/playback/hls-js?file=src%2Findex.html&title=Cloudflare Stream + hls.js&terminal=start-stackblitz",
			  "/stream/dash-js" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/stream/playback/dash-js?file=src%2Findex.html&title=Cloudflare Stream + dash.js&terminal=start-stackblitz",
			  "/stream/shaka-player" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/stream/playback/shaka-player?file=src%2Findex.js&title=Cloudflare Stream + Shaka Player&terminal=start-stackblitz",
			  "/stream/direct-creator-uploads" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/stream/upload/direct-creator-uploads?file=src%2Findex.html&title=Direct Creator Uploads to Cloudflare Stream&terminal=start-stackblitz",
			  "/stream/direct-creator-uploads-tus" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/stream/upload/direct-creator-uploads-tus?file=src%2Findex.html&title=Direct Creator Uploads to Cloudflare Stream, using TUS&terminal=start-stackblitz",
			  "/stream/webrtc" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/stream/webrtc?file=src%2Findex.html&title=Stream live video (using WHIP) and playback (using WHEP) over WebRTC with Cloudflare Stream&terminal=start-stackblitz",
			  "/stream/webrtc-whip" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/stream/webrtc?file=src%2Findex.html&title=Stream live video (using WHIP) over WebRTC with Cloudflare Stream&terminal=start-stackblitz",
			  "/stream/webrtc-whep" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/stream/webrtc?file=src%2Findex.html&title=Play live video (using WHEP) over WebRTC with Cloudflare Stream&terminal=start-stackblitz",
			  "/stream/signed-urls-public-content" => "https://stackblitz.com/fork/github/cloudflare/workers-sdk/tree/main/templates/stream/auth/signed-urls-public-content?file=src%2Findex.html&title=Example of using Cloudflare Stream Signed URLs with public content&terminal=start-stackblitz",
			}
		`);
	});
});
