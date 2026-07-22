import { Miniflare } from "miniflare";
import sharp from "sharp";
import { afterAll, beforeAll, describe, test } from "vitest";
import type { MiniflareOptions } from "miniflare";

// A worker that runs env.IMAGES.input(...).transform(...).output(...) with
// the transform/format supplied via query params, mirroring the production
// Images binding transform pattern.
const WORKER_SCRIPT = `
export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		const transform = JSON.parse(url.searchParams.get("transform") || "{}");
		const format = url.searchParams.get("format") || "image/png";
		const result = await env.IMAGES.input(request.body)
			.transform(transform)
			.output({ format });
		return result.response();
	},
};
`;

describe("Images binding local transforms", () => {
	let mf: Miniflare;
	// 200x100, top half white, bottom half red - lets gravity-dependent crops
	// be distinguished by sampling a corner pixel.
	let sourcePng: Buffer;

	beforeAll(async () => {
		const top = await sharp({
			create: {
				width: 200,
				height: 50,
				channels: 3,
				background: { r: 255, g: 255, b: 255 },
			},
		})
			.png()
			.toBuffer();
		const bottom = await sharp({
			create: {
				width: 200,
				height: 50,
				channels: 3,
				background: { r: 255, g: 0, b: 0 },
			},
		})
			.png()
			.toBuffer();

		sourcePng = await sharp({
			create: { width: 200, height: 100, channels: 3, background: "#000000" },
		})
			.composite([
				{ input: top, top: 0, left: 0 },
				{ input: bottom, top: 50, left: 0 },
			])
			.png()
			.toBuffer();

		mf = new Miniflare({
			compatibilityDate: "2025-04-01",
			modules: true,
			script: WORKER_SCRIPT,
			images: { binding: "IMAGES" },
			imagesPersist: false,
		} satisfies MiniflareOptions);
	});

	afterAll(() => mf.dispose());

	async function transform(
		transformOpts: Record<string, unknown>,
		format = "image/png"
	) {
		const params = new URLSearchParams({
			transform: JSON.stringify(transformOpts),
			format,
		});
		const res = await mf.dispatchFetch(`http://localhost/?${params}`, {
			method: "POST",
			body: sourcePng,
		});
		const body = Buffer.from(await res.arrayBuffer());
		return { res, body };
	}

	async function pixelAt(body: Buffer, x: number, y: number) {
		const { data, info } = await sharp(body)
			.raw()
			.toBuffer({ resolveWithObject: true });
		const offset = (y * info.width + x) * info.channels;
		return {
			r: data[offset],
			g: data[offset + 1],
			b: data[offset + 2],
		};
	}

	test("fit:cover resizes to exact dimensions", async ({ expect }) => {
		const { body } = await transform({ width: 50, height: 50, fit: "cover" });
		const meta = await sharp(body).metadata();
		expect(meta.width).toBe(50);
		expect(meta.height).toBe(50);
	});

	test("default fit (unspecified) does not letterbox with black bars", async ({
		expect,
	}) => {
		// Before the fix this hardcoded sharp's fit:"contain" (letterbox to the
		// exact requested box), padding the extra space with black. With a
		// production-matching default the output instead shrinks to fit within
		// the box, preserving aspect ratio, with no padded dimensions at all.
		const { body } = await transform({ width: 50, height: 50 });
		const meta = await sharp(body).metadata();
		expect(meta.width).toBe(50);
		expect(meta.height).toBe(25);
	});

	test("gravity:top crops from the top of the image", async ({ expect }) => {
		const { body } = await transform({
			width: 50,
			height: 25,
			fit: "cover",
			gravity: "top",
		});
		const { r, g, b } = await pixelAt(body, 0, 0);
		// Top half of the source is white.
		expect([r, g, b]).toEqual([255, 255, 255]);
	});

	test("gravity:bottom crops from the bottom of the image", async ({
		expect,
	}) => {
		const { body } = await transform({
			width: 50,
			height: 25,
			fit: "cover",
			gravity: "bottom",
		});
		const { r, g, b } = await pixelAt(body, 0, 0);
		// Bottom half of the source is red.
		expect([r, g, b]).toEqual([255, 0, 0]);
	});

	test("fit:pad fills the padded area with the requested background", async ({
		expect,
	}) => {
		const { body } = await transform({
			width: 100,
			height: 100,
			fit: "pad",
			background: "#00ff00",
		});
		const meta = await sharp(body).metadata();
		expect(meta.width).toBe(100);
		expect(meta.height).toBe(100);
		// Top-left corner falls in the padded area for a 200x100 source
		// padded out to a 100x100 square - should be green, not black.
		const { r, g, b } = await pixelAt(body, 0, 0);
		expect([r, g, b]).toEqual([0, 255, 0]);
	});

	test("fit:pad without an explicit background defaults to white", async ({
		expect,
	}) => {
		const { body } = await transform({
			width: 100,
			height: 100,
			fit: "pad",
		});
		const { r, g, b } = await pixelAt(body, 0, 0);
		expect([r, g, b]).toEqual([255, 255, 255]);
	});
});
