import { Miniflare } from "miniflare";
import sharp from "sharp";
import { afterAll, beforeAll, describe, test } from "vitest";
import type { MiniflareOptions } from "miniflare";

// Drives the Images binding the way a user would: `env.IMAGES.input(...)`,
// one or more `.transform(...)` calls, then `.output(...)`.
const WORKER_SCRIPT = `
export default {
	async fetch(request, env) {
		const { bytes, transforms } = await request.json();
		const stream = new Blob([new Uint8Array(bytes)]).stream();

		let transformer = env.IMAGES.input(stream);
		for (const transform of transforms) {
			transformer = transformer.transform(transform);
		}

		const result = await transformer.output({ format: "image/png" });
		const buffer = await result.response().arrayBuffer();
		return Response.json(Array.from(new Uint8Array(buffer)));
	},
};
`;

describe("Images binding local transforms", () => {
	let mf: Miniflare;
	let sourcePng: Buffer;

	beforeAll(async () => {
		// A 200x100 red PNG, so aspect-ratio behaviour is observable.
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
			compatibilityDate: "2025-04-01",
			images: { binding: "IMAGES" },
			imagesPersist: false,
			modules: true,
			script: WORKER_SCRIPT,
		} satisfies MiniflareOptions);
	});

	afterAll(() => mf.dispose());

	async function transform(...transforms: Record<string, unknown>[]) {
		const res = await mf.dispatchFetch("http://placeholder", {
			method: "POST",
			body: JSON.stringify({
				bytes: Array.from(sourcePng),
				transforms,
			}),
			headers: { "Content-Type": "application/json" },
		});
		const bytes = (await res.json()) as number[];
		return Buffer.from(Uint8Array.from(bytes));
	}

	test("fit:cover crops to the exact requested dimensions", async ({
		expect,
	}) => {
		const meta = await sharp(
			await transform({ width: 50, height: 50, fit: "cover" })
		).metadata();
		expect(meta.width).toBe(50);
		expect(meta.height).toBe(50);
	});

	test("fit:contain preserves aspect ratio without padding", async ({
		expect,
	}) => {
		const meta = await sharp(
			await transform({ width: 50, height: 50, fit: "contain" })
		).metadata();
		expect(meta.width).toBe(50);
		expect(meta.height).toBe(25);
	});

	test("fit:pad pads to the exact dimensions", async ({ expect }) => {
		const meta = await sharp(
			await transform({ width: 50, height: 50, fit: "pad" })
		).metadata();
		expect(meta.width).toBe(50);
		expect(meta.height).toBe(50);
	});

	test("fit:pad fills with white by default, not black", async ({ expect }) => {
		const padded = sharp(
			await transform({ width: 50, height: 50, fit: "pad" })
		);
		// Top-left is padding, since the 200x100 source becomes 50x25 centred.
		const { data } = await padded.raw().toBuffer({ resolveWithObject: true });
		expect([data[0], data[1], data[2]]).toEqual([255, 255, 255]);
	});

	test("fit:pad honours an explicit background", async ({ expect }) => {
		const padded = sharp(
			await transform({
				width: 50,
				height: 50,
				fit: "pad",
				background: "#0000ff",
			})
		);
		const { data } = await padded.raw().toBuffer({ resolveWithObject: true });
		expect([data[0], data[1], data[2]]).toEqual([0, 0, 255]);
	});

	test("fit defaults to scale-down and never enlarges", async ({ expect }) => {
		const meta = await sharp(await transform({ width: 400 })).metadata();
		expect(meta.width).toBe(200);
		expect(meta.height).toBe(100);
	});

	test("rotate still applies alongside a resize", async ({ expect }) => {
		const meta = await sharp(
			await transform({ rotate: 90 }, { width: 50, height: 50, fit: "cover" })
		).metadata();
		expect(meta.width).toBe(50);
		expect(meta.height).toBe(50);
	});
});
