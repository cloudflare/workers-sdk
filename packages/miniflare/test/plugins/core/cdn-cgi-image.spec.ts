import { Miniflare } from "miniflare";
import sharp from "sharp";
import { describe, test } from "vitest";
import { useServer } from "../../test-shared/http";
import type { MiniflareOptions } from "miniflare";

// A simple user worker that just records that it was hit — we want to assert
// that `/cdn-cgi/image/...` requests never reach the user worker code.
const WORKER_SCRIPT = `
export default {
	async fetch(request) {
		return new Response("user worker reached: " + new URL(request.url).pathname, {
			status: 418,
		});
	},
};
`;

async function makeMiniflare(opts: {
	enabled?: boolean;
	srcUrl: string;
	sourcePng: Buffer;
}): Promise<{ mf: Miniflare; cleanup: () => Promise<void> }> {
	const optsBlock: Record<string, unknown> = {
		binding: "IMAGES",
	};
	if (opts.enabled !== undefined) {
		optsBlock.urlTransformations = { enabled: opts.enabled };
	}
	const mf = new Miniflare({
		modules: true,
		script: WORKER_SCRIPT,
		images: optsBlock,
	} satisfies MiniflareOptions);
	return { mf, cleanup: () => mf.dispose() };
}

describe("/cdn-cgi/image/ local transforms", () => {
	test("transforms when url_transformations.enabled is true", async ({
		expect,
	}) => {
		const sourcePng = await sharp({
			create: {
				width: 200,
				height: 100,
				channels: 3,
				background: { r: 255, g: 0, b: 0 },
			},
		})
			.png()
			.toBuffer();

		const { http: originUrl } = await useServer((req, res) => {
			res.writeHead(200, { "content-type": "image/png" });
			res.end(sourcePng);
		});

		const { mf, cleanup } = await makeMiniflare({
			enabled: true,
			srcUrl: `${originUrl}img.png`,
			sourcePng,
		});

		try {
			const res = await mf.dispatchFetch(
				`http://localhost/cdn-cgi/image/width=50/${originUrl}img.png`
			);
			expect(res.status).toBe(200);
			expect(res.headers.get("cf-resized")).toBe("internal=ok/m");
			const body = Buffer.from(await res.arrayBuffer());
			const meta = await sharp(body).metadata();
			expect(meta.width).toBe(50);
			expect(meta.height).toBe(25);
		} finally {
			await cleanup();
		}
	});

	test("falls through to the user worker when url_transformations is absent", async ({
		expect,
	}) => {
		const sourcePng = await sharp({
			create: {
				width: 10,
				height: 10,
				channels: 3,
				background: { r: 0, g: 255, b: 0 },
			},
		})
			.png()
			.toBuffer();

		const { http: originUrl } = await useServer((_req, res) => {
			res.writeHead(200, { "content-type": "image/png" });
			res.end(sourcePng);
		});

		const { mf, cleanup } = await makeMiniflare({
			srcUrl: `${originUrl}img.png`,
			sourcePng,
		});

		try {
			const res = await mf.dispatchFetch(
				`http://localhost/cdn-cgi/image/width=10/${originUrl}img.png`
			);
			expect(res.status).toBe(418);
			expect(res.headers.get("cf-resized")).toBe(null);
			expect(await res.text()).toMatch(/user worker reached/);
		} finally {
			await cleanup();
		}
	});

	test("falls through to the user worker when url_transformations.enabled is false", async ({
		expect,
	}) => {
		const sourcePng = await sharp({
			create: {
				width: 10,
				height: 10,
				channels: 3,
				background: { r: 0, g: 0, b: 255 },
			},
		})
			.png()
			.toBuffer();

		const { http: originUrl } = await useServer((_req, res) => {
			res.writeHead(200, { "content-type": "image/png" });
			res.end(sourcePng);
		});

		const { mf, cleanup } = await makeMiniflare({
			enabled: false,
			srcUrl: `${originUrl}img.png`,
			sourcePng,
		});

		try {
			const res = await mf.dispatchFetch(
				`http://localhost/cdn-cgi/image/width=10/${originUrl}img.png`
			);
			expect(res.status).toBe(418);
			await res.arrayBuffer();
		} finally {
			await cleanup();
		}
	});

	test("parses comma-separated options including format", async ({
		expect,
	}) => {
		const sourcePng = await sharp({
			create: {
				width: 200,
				height: 200,
				channels: 3,
				background: { r: 0, g: 0, b: 0 },
			},
		})
			.png()
			.toBuffer();
		const { http: originUrl } = await useServer((_req, res) => {
			res.writeHead(200, { "content-type": "image/png" });
			res.end(sourcePng);
		});
		const { mf, cleanup } = await makeMiniflare({
			enabled: true,
			srcUrl: `${originUrl}img.png`,
			sourcePng,
		});
		try {
			const res = await mf.dispatchFetch(
				`http://localhost/cdn-cgi/image/width=80,height=80,fit=cover,format=webp/${originUrl}img.png`
			);
			expect(res.status).toBe(200);
			expect(res.headers.get("content-type")).toBe("image/webp");
			const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
			expect(meta.width).toBe(80);
			expect(meta.height).toBe(80);
			expect(meta.format).toBe("webp");
		} finally {
			await cleanup();
		}
	});

	test("forwards origin status when source fetch fails", async ({ expect }) => {
		const { http: originUrl } = await useServer((_req, res) => {
			res.writeHead(404, { "content-type": "text/plain" });
			res.end("nope");
		});
		const { mf, cleanup } = await makeMiniflare({
			enabled: true,
			srcUrl: `${originUrl}missing.png`,
			sourcePng: Buffer.from([]),
		});
		try {
			const res = await mf.dispatchFetch(
				`http://localhost/cdn-cgi/image/width=50/${originUrl}missing.png`
			);
			expect(res.status).toBe(404);
			await res.arrayBuffer();
		} finally {
			await cleanup();
		}
	});

	test("malformed /cdn-cgi/image/ paths return 404 without invoking sharp", async ({
		expect,
	}) => {
		const { mf, cleanup } = await makeMiniflare({
			enabled: true,
			srcUrl: "ignored",
			sourcePng: Buffer.from([]),
		});
		try {
			// Missing source segment entirely.
			const res = await mf.dispatchFetch(
				`http://localhost/cdn-cgi/image/width=80`
			);
			expect(res.status).toBe(404);
			await res.arrayBuffer();
		} finally {
			await cleanup();
		}
	});

	test("the flow adapter is treated like the default", async ({ expect }) => {
		const sourcePng = await sharp({
			create: {
				width: 100,
				height: 50,
				channels: 3,
				background: { r: 12, g: 34, b: 56 },
			},
		})
			.png()
			.toBuffer();
		const { http: originUrl } = await useServer((_req, res) => {
			res.writeHead(200, { "content-type": "image/png" });
			res.end(sourcePng);
		});
		const { mf, cleanup } = await makeMiniflare({
			enabled: true,
			srcUrl: `${originUrl}img.png`,
			sourcePng,
		});
		try {
			const res = await mf.dispatchFetch(
				`http://localhost/cdn-cgi/image/flow/width=25/${originUrl}img.png`
			);
			expect(res.status).toBe(200);
			const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
			expect(meta.width).toBe(25);
		} finally {
			await cleanup();
		}
	});
});
