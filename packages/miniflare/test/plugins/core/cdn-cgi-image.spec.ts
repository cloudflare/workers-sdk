import { LogLevel, Miniflare } from "miniflare";
import sharp from "sharp";
import { beforeAll, describe, test } from "vitest";
import {
	singleModuleManifest,
	TestLog,
	useDispose,
	useServer,
} from "../../test-shared";
import type { WorkerOptions } from "miniflare";

// Serves a PNG for any path other than `/cdn-cgi/image/...`, which returns a
// 418 so tests can tell if the Worker was invoked
const WORKER_SCRIPT = `
let png;
export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		if (url.pathname.startsWith("/cdn-cgi/image")) {
			return new Response("user worker reached", { status: 418 });
		}
		if (url.pathname === "/missing.png") {
			return new Response("not found", { status: 404 });
		}
		png ??= Uint8Array.from(atob(env.PNG), (c) => c.charCodeAt(0));
		return new Response(png, { headers: { "content-type": "image/png" } });
	},
};
`;

type UrlTransformations = NonNullable<
	NonNullable<WorkerOptions["config"]["images"]>["urlTransformations"]
>;

let sourcePng: Buffer;

beforeAll(async () => {
	sourcePng = await sharp({
		create: {
			width: 200,
			height: 100,
			channels: 3,
			background: { r: 255, g: 0, b: 0 },
		},
	})
		.png()
		.toBuffer();
});

function createMiniflare(
	urlTransformations?: UrlTransformations,
	unsafeImageUrlTransformationsPassthrough?: boolean
): {
	mf: Miniflare;
	log: TestLog;
} {
	const log = new TestLog();
	const mf = new Miniflare({
		log,
		unsafeImageUrlTransformationsPassthrough,
		workers: [
			{
				config: {
					name: "worker",
					compatibilityDate: "2025-05-01",
					manifest: singleModuleManifest(WORKER_SCRIPT),
					env: {
						PNG: { type: "text", value: sourcePng.toString("base64") },
					},
					...(urlTransformations && { images: { urlTransformations } }),
				},
			},
		],
	});
	useDispose(mf);
	return { mf, log };
}

interface Origin {
	url: URL;
	requests: { url: string; headers: Record<string, unknown> }[];
}

/**
 * Starts a cross-zone origin. `/redirect?to=<url>` redirects, `/html` and
 * `/error` serve non-images, and anything else serves the source PNG.
 */
async function useOrigin(): Promise<Origin> {
	const requests: Origin["requests"] = [];
	const { http } = await useServer((req, res) => {
		requests.push({ url: req.url ?? "", headers: req.headers });
		const url = new URL(req.url ?? "/", "http://origin");
		if (url.pathname === "/redirect") {
			res.writeHead(302, { location: url.searchParams.get("to") ?? "/" });
			res.end();
		} else if (url.pathname === "/html") {
			res.writeHead(200, { "content-type": "text/html", "set-cookie": "a=b" });
			res.end("<script>alert(1)</script>");
		} else if (url.pathname === "/error") {
			res.writeHead(500, { "content-type": "text/html", "set-cookie": "a=b" });
			res.end("<p>oops</p>");
		} else {
			res.writeHead(200, { "content-type": "image/png" });
			res.end(sourcePng);
		}
	});
	// Use a different hostname to `localhost` so the origin is cross-zone
	http.hostname = "127.0.0.1";
	return { url: http, requests };
}

async function metadata(res: Response) {
	return sharp(Buffer.from(await res.arrayBuffer())).metadata();
}

describe("/cdn-cgi/image/ local transforms", () => {
	test("returns 404 without invoking the Worker when not configured", async ({
		expect,
	}) => {
		const { mf, log } = createMiniflare();

		for (let i = 0; i < 2; i++) {
			const res = await mf.dispatchFetch(
				"http://localhost/cdn-cgi/image/width=50/img.png"
			);
			expect(res.status).toBe(404);
			expect(await res.text()).toBe("");
		}

		const warnings = log
			.logsAtLevel(LogLevel.WARN)
			.filter((message) => message.includes("/cdn-cgi/image/"));
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain("images.url_transformations.enabled");
	});

	test("passes requests through to the Worker when configured to", async ({
		expect,
	}) => {
		const { mf } = createMiniflare({ enabled: true }, true);

		const res = await mf.dispatchFetch(
			"http://localhost/cdn-cgi/image/width=50/img.png"
		);
		expect(res.status).toBe(418);
		expect(await res.text()).toBe("user worker reached");
	});

	test("returns 404 when disabled", async ({ expect }) => {
		const { mf } = createMiniflare({ enabled: false });

		const res = await mf.dispatchFetch(
			"http://localhost/cdn-cgi/image/width=50/img.png"
		);
		expect(res.status).toBe(404);
		await res.arrayBuffer();
	});

	test("transforms same-zone images fetched through the Worker", async ({
		expect,
	}) => {
		const { mf, log } = createMiniflare({ enabled: true });

		const res = await mf.dispatchFetch(
			"http://localhost/cdn-cgi/image/width=50/img.png"
		);
		expect(res.status).toBe(200);
		expect(res.headers.get("cf-resized")).toBe("internal=ok/m");
		expect(res.headers.get("content-type")).toBe("image/png");
		expect(res.headers.get("content-security-policy")).toBe(
			"default-src 'none'"
		);
		const meta = await metadata(res);
		expect(meta.width).toBe(50);
		expect(meta.height).toBe(25);

		expect(
			log
				.logsAtLevel(LogLevel.WARN)
				.filter((message) => message.includes("low-fidelity"))
		).toHaveLength(1);
	});

	test("parses comma-separated options and aliases", async ({ expect }) => {
		const { mf } = createMiniflare({ enabled: true });

		const res = await mf.dispatchFetch(
			"http://localhost/cdn-cgi/image/w=80,h=80,fit=cover,f=webp,q=50/img.png"
		);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("image/webp");
		const meta = await metadata(res);
		expect(meta.format).toBe("webp");
		expect(meta.width).toBe(80);
		expect(meta.height).toBe(80);
	});

	test("negotiates format=auto from the Accept header", async ({ expect }) => {
		const { mf } = createMiniflare({ enabled: true });

		const webp = await mf.dispatchFetch(
			"http://localhost/cdn-cgi/image/width=20,format=auto/img.png",
			{ headers: { accept: "image/webp,*/*" } }
		);
		expect(webp.headers.get("content-type")).toBe("image/webp");
		await webp.arrayBuffer();

		const original = await mf.dispatchFetch(
			"http://localhost/cdn-cgi/image/width=20,format=auto/img.png",
			{ headers: { accept: "*/*" } }
		);
		expect(original.headers.get("content-type")).toBe("image/png");
		await original.arrayBuffer();
	});

	test("supports the flow adapter", async ({ expect }) => {
		const { mf } = createMiniflare({ enabled: true });

		const res = await mf.dispatchFetch(
			"http://localhost/cdn-cgi/image/flow/width=25/img.png"
		);
		expect(res.status).toBe(200);
		expect((await metadata(res)).width).toBe(25);
	});

	test("redirects to same-zone sources that can't be transformed", async ({
		expect,
	}) => {
		const { mf } = createMiniflare({ enabled: true });

		const res = await mf.dispatchFetch(
			"http://localhost/cdn-cgi/image/width=50/missing.png",
			{ redirect: "manual" }
		);
		expect(res.status).toBe(307);
		expect(res.headers.get("location")).toBe("http://localhost/missing.png");
		expect(res.headers.get("cf-not-resized")).toBe("err=9524");
		expect(await res.text()).toBe(
			"Error 9524: image could not be resized (404)"
		);
	});

	test("doesn't pass through cross-zone sources that can't be transformed", async ({
		expect,
	}) => {
		const origin = await useOrigin();
		const { mf } = createMiniflare({ enabled: true, allowedOrigins: ["*"] });

		const html = await mf.dispatchFetch(
			`http://localhost/cdn-cgi/image/width=50/${origin.url}html`
		);
		expect(html.status).toBe(500);
		expect(html.headers.get("set-cookie")).toBe(null);
		expect(html.headers.get("content-type")).toBe("text/plain;charset=UTF-8");
		expect(await html.text()).toBe(
			"Error 9524: image could not be resized (200)"
		);

		const error = await mf.dispatchFetch(
			`http://localhost/cdn-cgi/image/width=50/${origin.url}error`
		);
		expect(error.status).toBe(500);
		expect(error.headers.get("set-cookie")).toBe(null);
		expect(await error.text()).toBe(
			"Error 9524: image could not be resized (500)"
		);
	});

	test("only forwards credentials to same-host sources", async ({
		expect,
	}) => {
		const origin = await useOrigin();
		const { mf } = createMiniflare({ enabled: true, allowedOrigins: ["*"] });

		const res = await mf.dispatchFetch(
			`http://localhost/cdn-cgi/image/width=50/${origin.url}img.png`,
			{
				headers: {
					cookie: "session=secret",
					authorization: "Bearer secret",
					referer: "http://localhost/page",
				},
			}
		);
		expect(res.status).toBe(200);
		await res.arrayBuffer();

		const [request] = origin.requests;
		expect(request.headers.cookie).toBeUndefined();
		expect(request.headers.authorization).toBeUndefined();
		expect(request.headers.referer).toBe("http://localhost/page");
		expect(request.headers.via).toBe("image-resizing");
	});

	test("checks redirects against allowed origins", async ({ expect }) => {
		const origin = await useOrigin();
		const { mf } = createMiniflare({
			enabled: true,
			allowedOrigins: [`${origin.url.host}/redirect`, `${origin.url.host}/ok`],
		});

		const allowed = await mf.dispatchFetch(
			`http://localhost/cdn-cgi/image/width=50/${origin.url}redirect?to=/ok/img.png`
		);
		expect(allowed.status).toBe(200);
		expect((await metadata(allowed)).width).toBe(50);

		const forbidden = await mf.dispatchFetch(
			`http://localhost/cdn-cgi/image/width=50/${origin.url}redirect?to=/other/img.png`
		);
		expect(forbidden.status).toBe(403);
		await forbidden.arrayBuffer();
		expect(origin.requests.map(({ url }) => url)).not.toContain(
			"/other/img.png"
		);
	});

	test("rejects requests from the image resizer to avoid loops", async ({
		expect,
	}) => {
		const { mf } = createMiniflare({ enabled: true });

		const res = await mf.dispatchFetch(
			"http://localhost/cdn-cgi/image/width=50/img.png",
			{ headers: { via: "image-resizing" } }
		);
		expect(res.status).toBe(508);
		await res.arrayBuffer();
	});

	test("rejects malformed URLs and options", async ({ expect }) => {
		const { mf } = createMiniflare({ enabled: true });

		for (const path of [
			"/cdn-cgi/image/width=80",
			"/cdn-cgi/image/width=big/img.png",
			"/cdn-cgi/image/fastly/width=80/img.png",
			"/cdn-cgi/image/width=80/file:///etc/passwd",
		]) {
			const res = await mf.dispatchFetch(`http://localhost${path}`);
			expect(res.status, path).toBe(400);
			await res.arrayBuffer();
		}
	});

	test("rejects cross-zone sources without allowed origins", async ({
		expect,
	}) => {
		const origin = await useOrigin();
		const { mf } = createMiniflare({ enabled: true });

		const res = await mf.dispatchFetch(
			`http://localhost/cdn-cgi/image/width=50/${origin.url}img.png`
		);
		expect(res.status).toBe(403);
		expect(await res.text()).toBe("Forbidden");
	});

	test("transforms sources matching allowed origins", async ({ expect }) => {
		const origin = await useOrigin();
		const { mf } = createMiniflare({
			enabled: true,
			allowedOrigins: ["images.example.com", `${origin.url.host}/public`],
		});

		const allowed = await mf.dispatchFetch(
			`http://localhost/cdn-cgi/image/width=50/${origin.url}public/img.png`
		);
		expect(allowed.status).toBe(200);
		expect((await metadata(allowed)).width).toBe(50);

		const wrongPath = await mf.dispatchFetch(
			`http://localhost/cdn-cgi/image/width=50/${origin.url}private/img.png`
		);
		expect(wrongPath.status).toBe(403);
		expect(await wrongPath.text()).toBe(
			"ERROR 9401: Transformation origin is not in allowed origins list\n"
		);

		// Allowed origins are in addition to the Worker's own zone
		const sameZone = await mf.dispatchFetch(
			"http://localhost/cdn-cgi/image/width=50/img.png"
		);
		expect(sameZone.status).toBe(200);
		await sameZone.arrayBuffer();
	});

	test("allows any source with a wildcard allowed origin", async ({
		expect,
	}) => {
		const origin = await useOrigin();
		const { mf } = createMiniflare({ enabled: true, allowedOrigins: ["*"] });

		const res = await mf.dispatchFetch(
			`http://localhost/cdn-cgi/image/width=50/${encodeURIComponent(`${origin.url}img.png`)}`
		);
		expect(res.status).toBe(200);
		expect((await metadata(res)).width).toBe(50);
	});
});
