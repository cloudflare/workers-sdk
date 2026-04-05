import assert from "node:assert";
import { Miniflare } from "miniflare";
import { describe, test } from "vitest";
import { useDispose } from "../../test-shared";

// The worker stores and retrieves bytes without validation, so we don't need a real image.
const TEST_IMAGE_BYTES = new Uint8Array([1, 2, 3, 4, 5]);

function imageBuffer(): ArrayBuffer {
	return new Uint8Array(TEST_IMAGE_BYTES).buffer as ArrayBuffer;
}

function createMiniflare(): Miniflare {
	return new Miniflare({
		compatibilityDate: "2025-04-01",
		images: { binding: "IMAGES" },
		imagesPersist: false,
		modules: true,
		script: `export default { fetch() { return new Response(null, { status: 404 }); } }`,
	});
}

// Tests temporarily skipped pending workerd API change (https://github.com/cloudflare/workerd/pull/6288)
describe.skip("Images hosted CRUD", () => {
	test("upload and retrieve metadata", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);
		const images = await mf.getImagesBinding("IMAGES");

		const metadata = await images.hosted.upload(imageBuffer(), {
			id: "test-123",
		});
		expect(metadata.id).toBe("test-123");
		expect(metadata.filename).toBe("uploaded.jpg");
		expect(metadata.requireSignedURLs).toBe(false);
	});

	test("upload and retrieve image data", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);
		const images = await mf.getImagesBinding("IMAGES");

		await images.hosted.upload(imageBuffer(), { id: "blob-test" });

		const stream = await images.hosted.image("blob-test").bytes();
		assert(stream !== null);
		const data = new Uint8Array(await new Response(stream).arrayBuffer());
		expect(data).toEqual(TEST_IMAGE_BYTES);
	});

	test("upload with base64 encoding", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);
		const images = await mf.getImagesBinding("IMAGES");

		const base64String = btoa(String.fromCharCode(...TEST_IMAGE_BYTES));
		const base64Bytes = new TextEncoder().encode(base64String);

		const metadata = await images.hosted.upload(
			base64Bytes.buffer as ArrayBuffer,
			{
				id: "base64-test",
				encoding: "base64",
			}
		);
		expect(metadata.id).toBe("base64-test");

		const stream = await images.hosted.image("base64-test").bytes();
		assert(stream !== null);
		const data = new Uint8Array(await new Response(stream).arrayBuffer());
		expect(data).toEqual(TEST_IMAGE_BYTES);
	});

	test("get details for non-existent image returns null", async ({
		expect,
	}) => {
		const mf = createMiniflare();
		useDispose(mf);
		const images = await mf.getImagesBinding("IMAGES");

		const metadata = await images.hosted.image("does-not-exist").details();
		expect(metadata).toBe(null);
	});

	test("get image data for non-existent image returns null", async ({
		expect,
	}) => {
		const mf = createMiniflare();
		useDispose(mf);
		const images = await mf.getImagesBinding("IMAGES");

		const stream = await images.hosted.image("does-not-exist").bytes();
		expect(stream).toBe(null);
	});

	test("update image metadata", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);
		const images = await mf.getImagesBinding("IMAGES");

		await images.hosted.upload(imageBuffer(), { id: "update-test" });

		const metadata = await images.hosted.image("update-test").update({
			requireSignedURLs: true,
		});
		expect(metadata.requireSignedURLs).toBe(true);
	});

	test("delete image", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);
		const images = await mf.getImagesBinding("IMAGES");

		await images.hosted.upload(imageBuffer(), { id: "delete-test" });

		const deleted = await images.hosted.image("delete-test").delete();
		expect(deleted).toBe(true);

		const metadata = await images.hosted.image("delete-test").details();
		expect(metadata).toBe(null);
	});

	test("delete non-existent image returns false", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);
		const images = await mf.getImagesBinding("IMAGES");

		const deleted = await images.hosted.image("does-not-exist").delete();
		expect(deleted).toBe(false);
	});

	test("list images", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);
		const images = await mf.getImagesBinding("IMAGES");

		await images.hosted.upload(imageBuffer(), { id: "list-1" });

		const list = await images.hosted.list();
		expect(list.listComplete).toBe(true);
		expect(list.images).toHaveLength(1);
		expect(list.images[0].id).toBe("list-1");
	});

	test("list images filtered by creator", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);
		const images = await mf.getImagesBinding("IMAGES");

		await images.hosted.upload(imageBuffer(), {
			id: "img1",
			creator: "socrates",
		});
		await images.hosted.upload(imageBuffer(), {
			id: "img2",
			creator: "plato",
		});

		const list = await images.hosted.list({ creator: "plato" });
		expect(list.images).toHaveLength(1);
		expect(list.images[0].id).toBe("img2");
	});

	test("list images with cursor pagination", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);
		const images = await mf.getImagesBinding("IMAGES");

		for (const id of ["img1", "img2", "img3", "img4", "img5"]) {
			await images.hosted.upload(imageBuffer(), { id });
		}

		const page1 = await images.hosted.list({ limit: 2 });
		expect(page1.images).toHaveLength(2);
		expect(page1.listComplete).toBe(false);
		expect(page1.cursor).toBeDefined();

		const page2 = await images.hosted.list({
			limit: 2,
			cursor: page1.cursor,
		});
		expect(page2.images).toHaveLength(2);
		expect(page2.listComplete).toBe(false);
		expect(page2.cursor).toBeDefined();

		const page3 = await images.hosted.list({
			limit: 2,
			cursor: page2.cursor,
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
