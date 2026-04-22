import { Miniflare } from "miniflare";
import { describe, test } from "vitest";
import { useDispose } from "../../test-shared";
import type { ImageList, ImageMetadata } from "@cloudflare/workers-types";
import type { MiniflareOptions } from "miniflare";

// The worker stores and retrieves bytes without validation, so we don't need a real image.
const TEST_IMAGE_BYTES = new Uint8Array([1, 2, 3, 4, 5]);

const WORKER_SCRIPT = `
export default {
	async fetch(request, env) {
		try {
			const { op, args } = await request.json();
			const result = await handleCommand(env.IMAGES, op, args || {});
			return Response.json({ ok: true, result });
		} catch (err) {
			return Response.json(
				{ ok: false, error: err.message },
				{ status: 200 }
			);
		}
	}
};

async function handleCommand(images, op, args) {
	const hosted = images.hosted;
	switch (op) {
		case "upload": {
			const bytes = new Uint8Array(args.bytes);
			return hosted.upload(bytes.buffer, args.options);
		}
		case "bytes": {
			const stream = await hosted.image(args.id).bytes();
			if (stream === null) return null;
			const buffer = await new Response(stream).arrayBuffer();
			return Array.from(new Uint8Array(buffer));
		}
		case "details":
			return hosted.image(args.id).details();
		case "update":
			return hosted.image(args.id).update(args.options);
		case "delete":
			return hosted.image(args.id).delete();
		case "list":
			return hosted.list(args.options);
		default:
			throw new Error("Unknown op: " + op);
	}
}
`;

function createMiniflare(): Miniflare {
	return new Miniflare({
		compatibilityDate: "2025-04-01",
		images: { binding: "IMAGES" },
		imagesPersist: false,
		modules: true,
		script: WORKER_SCRIPT,
	} satisfies MiniflareOptions);
}

async function sendCmd<T>(
	mf: Miniflare,
	op: string,
	args: Record<string, unknown> = {}
): Promise<T> {
	const resp = await mf.dispatchFetch("http://placeholder", {
		method: "POST",
		body: JSON.stringify({ op, args }),
		headers: { "Content-Type": "application/json" },
	});
	const data = (await resp.json()) as {
		ok: boolean;
		result: T;
		error?: string;
	};
	if (!data.ok) {
		throw new Error(data.error);
	}
	return data.result;
}

function upload(
	mf: Miniflare,
	bytes: Uint8Array,
	options?: Record<string, unknown>
): Promise<ImageMetadata> {
	return sendCmd(mf, "upload", {
		bytes: Array.from(bytes),
		options,
	});
}

describe("Images local delivery", () => {
	test("variant URLs are absolute and use /cdn-cgi/imagedelivery/ path", async ({
		expect,
	}) => {
		const mf = createMiniflare();
		useDispose(mf);
		const url = await mf.ready;

		const metadata = await upload(mf, TEST_IMAGE_BYTES, { id: "variant-test" });
		expect(metadata.variants).toHaveLength(1);
		expect(metadata.variants[0]).toBe(
			`${url.origin}/cdn-cgi/imagedelivery/variant-test/public`
		);
	});

	test("image delivery endpoint serves image bytes", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);
		const url = await mf.ready;

		await upload(mf, TEST_IMAGE_BYTES, { id: "delivery-test" });

		const response = await mf.dispatchFetch(
			`${url.origin}/cdn-cgi/imagedelivery/delivery-test/public`
		);
		expect(response.status).toBe(200);
		const data = new Uint8Array(await response.arrayBuffer());
		expect(data).toEqual(TEST_IMAGE_BYTES);
	});

	test("image delivery returns 404 for non-existent image", async ({
		expect,
	}) => {
		const mf = createMiniflare();
		useDispose(mf);

		const url = await mf.ready;
		const response = await mf.dispatchFetch(
			`${url.origin}/cdn-cgi/imagedelivery/does-not-exist/public`
		);
		expect(response.status).toBe(404);
		await response.arrayBuffer();
	});
});

describe("Images hosted CRUD", () => {
	test("upload and retrieve metadata", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);

		const metadata = await upload(mf, TEST_IMAGE_BYTES, { id: "test-123" });
		expect(metadata.id).toBe("test-123");
		expect(metadata.filename).toBe("uploaded.jpg");
		expect(metadata.requireSignedURLs).toBe(false);
	});

	test("upload and retrieve image data", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);

		await upload(mf, TEST_IMAGE_BYTES, { id: "blob-test" });

		const data = await sendCmd<number[]>(mf, "bytes", { id: "blob-test" });
		expect(new Uint8Array(data)).toEqual(TEST_IMAGE_BYTES);
	});

	test("upload with base64 encoding", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);

		const base64String = btoa(String.fromCharCode(...TEST_IMAGE_BYTES));
		const base64Bytes = new TextEncoder().encode(base64String);

		const metadata = await upload(mf, base64Bytes, {
			id: "base64-test",
			encoding: "base64",
		});
		expect(metadata.id).toBe("base64-test");

		const data = await sendCmd<number[]>(mf, "bytes", { id: "base64-test" });
		expect(new Uint8Array(data)).toEqual(TEST_IMAGE_BYTES);
	});

	test("get details for non-existent image returns null", async ({
		expect,
	}) => {
		const mf = createMiniflare();
		useDispose(mf);

		const metadata = await sendCmd<ImageMetadata | null>(mf, "details", {
			id: "does-not-exist",
		});
		expect(metadata).toBe(null);
	});

	test("get image data for non-existent image returns null", async ({
		expect,
	}) => {
		const mf = createMiniflare();
		useDispose(mf);

		const data = await sendCmd<number[] | null>(mf, "bytes", {
			id: "does-not-exist",
		});
		expect(data).toBe(null);
	});

	test("update image metadata", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);

		await upload(mf, TEST_IMAGE_BYTES, { id: "update-test" });

		const metadata = await sendCmd<ImageMetadata>(mf, "update", {
			id: "update-test",
			options: { requireSignedURLs: true },
		});
		expect(metadata.requireSignedURLs).toBe(true);
	});

	test("delete image", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);

		await upload(mf, TEST_IMAGE_BYTES, { id: "delete-test" });

		const deleted = await sendCmd<boolean>(mf, "delete", { id: "delete-test" });
		expect(deleted).toBe(true);

		const metadata = await sendCmd<ImageMetadata | null>(mf, "details", {
			id: "delete-test",
		});
		expect(metadata).toBe(null);
	});

	test("delete non-existent image returns false", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);

		const deleted = await sendCmd<boolean>(mf, "delete", {
			id: "does-not-exist",
		});
		expect(deleted).toBe(false);
	});

	test("list images", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);

		await upload(mf, TEST_IMAGE_BYTES, { id: "list-1" });

		const list = await sendCmd<ImageList>(mf, "list");
		expect(list.listComplete).toBe(true);
		expect(list.images).toHaveLength(1);
		expect(list.images[0].id).toBe("list-1");
	});

	test("list images filtered by creator", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);

		await upload(mf, TEST_IMAGE_BYTES, { id: "img1", creator: "socrates" });
		await upload(mf, TEST_IMAGE_BYTES, { id: "img2", creator: "plato" });

		const list = await sendCmd<ImageList>(mf, "list", {
			options: { creator: "plato" },
		});
		expect(list.images).toHaveLength(1);
		expect(list.images[0].id).toBe("img2");
	});

	test("list images with cursor pagination", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);

		for (const id of ["img1", "img2", "img3", "img4", "img5"]) {
			await upload(mf, TEST_IMAGE_BYTES, { id });
		}

		const page1 = await sendCmd<ImageList>(mf, "list", {
			options: { limit: 2 },
		});
		expect(page1.images).toHaveLength(2);
		expect(page1.listComplete).toBe(false);
		expect(page1.cursor).toBeDefined();

		const page2 = await sendCmd<ImageList>(mf, "list", {
			options: { limit: 2, cursor: page1.cursor },
		});
		expect(page2.images).toHaveLength(2);
		expect(page2.listComplete).toBe(false);
		expect(page2.cursor).toBeDefined();

		const page3 = await sendCmd<ImageList>(mf, "list", {
			options: { limit: 2, cursor: page2.cursor },
		});
		expect(page3.images).toHaveLength(1);
		expect(page3.listComplete).toBe(true);

		const allIds = [
			...page1.images.map((i) => i.id),
			...page2.images.map((i) => i.id),
			...page3.images.map((i) => i.id),
		];
		expect(new Set(allIds).size).toBe(5);
	});
});
