import { Miniflare } from "miniflare";
import sharp from "sharp";
import { afterAll, beforeAll, describe, test } from "vitest";
import type { MiniflareOptions, Request as MiniflareRequest } from "miniflare";

// A worker that simply forwards to an origin URL with the given cf.image
// options, mirroring the production "transform via Workers" pattern.
const WORKER_SCRIPT = `
export default {
	async fetch(request) {
		const url = new URL(request.url);
		const src = url.searchParams.get("src");
		const opts = JSON.parse(url.searchParams.get("opts") || "null");
		const init = opts ? { cf: { image: opts } } : undefined;
		return fetch(src, init);
	},
};
`;

const ORIGIN = "https://origin.example";

describe("cf.image local transforms", () => {
	let mf: Miniflare;
	let sourcePng: Buffer;
	let seenVia: (string | null)[] = [];

	beforeAll(async () => {
		// A 200x100 red PNG to use as the origin image.
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

		mf = new Miniflare({
			modules: true,
			script: WORKER_SCRIPT,
			outboundService(request: MiniflareRequest) {
				seenVia.push(request.headers.get("via"));
				const url = new URL(request.url);
				if (url.pathname === "/not-ok") {
					return new Response("upstream error", { status: 503 });
				}
				if (url.pathname === "/not-an-image") {
					return new Response("this is definitely not an image", {
						headers: { "content-type": "image/png" },
					});
				}
				return new Response(sourcePng, {
					headers: { "content-type": "image/png" },
				});
			},
		} satisfies MiniflareOptions);
	});

	afterAll(() => mf.dispose());

	async function transform(
		opts: Record<string, unknown> | null,
		path = "/img.png"
	) {
		const params = new URLSearchParams({ src: `${ORIGIN}${path}` });
		if (opts !== null) {
			params.set("opts", JSON.stringify(opts));
		}
		const res = await mf.dispatchFetch(`http://localhost/?${params}`);
		const body = Buffer.from(await res.arrayBuffer());
		return { res, body };
	}

	test("resizes with fit:cover to exact dimensions", async ({ expect }) => {
		const { res, body } = await transform({
			width: 50,
			height: 50,
			fit: "cover",
		});
		expect(res.headers.get("cf-resized")).toBe("internal=ok/m");
		const meta = await sharp(body).metadata();
		expect(meta.width).toBe(50);
		expect(meta.height).toBe(50);
	});

	test("fit:scale-down never enlarges (production semantics)", async ({
		expect,
	}) => {
		// Source is 200x100 - width 400 must NOT enlarge it.
		const { body } = await transform({ width: 400, fit: "scale-down" });
		const meta = await sharp(body).metadata();
		expect(meta.width).toBe(200);
		expect(meta.height).toBe(100);
	});

	test("fit:contain preserves aspect ratio", async ({ expect }) => {
		const { body } = await transform({
			width: 50,
			height: 50,
			fit: "contain",
		});
		const meta = await sharp(body).metadata();
		expect(meta.width).toBe(50);
		expect(meta.height).toBe(25);
	});

	test("transcodes to the requested output format", async ({ expect }) => {
		const { res, body } = await transform({ width: 50, format: "webp" });
		expect(res.headers.get("content-type")).toBe("image/webp");
		const meta = await sharp(body).metadata();
		expect(meta.format).toBe("webp");
	});

	test("format:json returns the production cf.image JSON shape", async ({
		expect,
	}) => {
		const { res, body } = await transform({
			width: 50,
			height: 50,
			format: "json",
		});
		expect(res.headers.get("content-type")).toContain("application/json");
		expect(JSON.parse(body.toString())).toEqual({
			width: 50,
			height: 25,
			original: {
				file_size: expect.any(Number),
				width: 200,
				height: 100,
				format: "image/png",
			},
		});
	});

	test("stamps Via: image-resizing on the origin subrequest", async ({
		expect,
	}) => {
		seenVia = [];
		await transform({ width: 10 });
		expect(seenVia).toContain("image-resizing");
	});

	test("passes through requests without cf.image unchanged", async ({
		expect,
	}) => {
		const { res, body } = await transform(null);
		expect(res.headers.get("cf-resized")).toBe(null);
		// Original bytes expected
		expect(body.equals(sourcePng)).toBe(true);
	});

	test("fails open to the origin response when it is not OK", async ({
		expect,
	}) => {
		const { res } = await transform({ width: 50 }, "/not-ok");
		expect(res.status).toBe(503);
		expect(res.headers.get("cf-resized")).toBe(null);
	});

	test("fails open to source bytes when the image cannot be decoded", async ({
		expect,
	}) => {
		const { res, body } = await transform({ width: 50 }, "/not-an-image");
		expect(res.status).toBe(200);
		expect(res.headers.get("cf-resized")).toBe(null);
		expect(body.toString()).toBe("this is definitely not an image");
	});
});
