import { env, SELF } from "cloudflare:test";
import { afterEach, describe, it } from "vitest";

const TINY_PNG = new Uint8Array([
	137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 18, 0,
	0, 0, 18, 8, 6, 0, 0, 0, 86, 206, 142, 87, 0, 0, 0, 4, 103, 65, 77, 65, 0, 0,
	177, 143, 11, 252, 97, 5, 0, 0, 0, 32, 99, 72, 82, 77, 0, 0, 122, 38, 0, 0,
	128, 132, 0, 0, 250, 0, 0, 0, 128, 232, 0, 0, 117, 48, 0, 0, 234, 96, 0, 0,
	58, 152, 0, 0, 23, 112, 156, 186, 81, 60, 0, 0, 0, 120, 101, 88, 73, 102, 77,
	77, 0, 42, 0, 0, 0, 8, 0, 4, 1, 18, 0, 3, 0, 0, 0, 1, 0, 1, 0, 0, 1, 26, 0, 5,
	0, 0, 0, 1, 0, 0, 0, 62, 1, 27, 0, 5, 0, 0, 0, 1, 0, 0, 0, 70, 135, 105, 0, 4,
	0, 0, 0, 1, 0, 0, 0, 78, 0, 0, 0, 0, 0, 0, 0, 72, 0, 0, 0, 1, 0, 0, 0, 72, 0,
	0, 0, 1, 0, 3, 160, 1, 0, 3, 0, 0, 0, 1, 0, 1, 0, 0, 160, 2, 0, 4, 0, 0, 0, 1,
	0, 0, 0, 18, 160, 3, 0, 4, 0, 0, 0, 1, 0, 0, 0, 18, 0, 0, 0, 0, 117, 55, 28,
	226, 0, 0, 0, 9, 112, 72, 89, 115, 0, 0, 11, 19, 0, 0, 11, 19, 1, 0, 154, 156,
	24, 0, 0, 2, 146, 105, 84, 88, 116, 88, 77, 76, 58, 99, 111, 109, 46, 97, 100,
	111, 98, 101, 46, 120, 109, 112, 0, 0, 0, 0, 0, 60, 120, 58, 120, 109, 112,
	109, 101, 116, 97, 32, 120, 109, 108, 110, 115, 58, 120, 61, 34, 97, 100, 111,
	98, 101, 58, 110, 115, 58, 109, 101, 116, 97, 47, 34, 32, 120, 58, 120, 109,
	112, 116, 107, 61, 34, 88, 77, 80, 32, 67, 111, 114, 101, 32, 54, 46, 48, 46,
	48, 34, 62, 10, 32, 32, 32, 60, 114, 100, 102, 58, 82, 68, 70, 32, 120, 109,
	108, 110, 115, 58, 114, 100, 102, 61, 34, 104, 116, 116, 112, 58, 47, 47, 119,
	119, 119, 46, 119, 51, 46, 111, 114, 103, 47, 49, 57, 57, 57, 47, 48, 50, 47,
	50, 50, 45, 114, 100, 102, 45, 115, 121, 110, 116, 97, 120, 45, 110, 115, 35,
	34, 62, 10, 32, 32, 32, 32, 32, 32, 60, 114, 100, 102, 58, 68, 101, 115, 99,
	114, 105, 112, 116, 105, 111, 110, 32, 114, 100, 102, 58, 97, 98, 111, 117,
	116, 61, 34, 34, 10, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 120, 109,
	108, 110, 115, 58, 116, 105, 102, 102, 61, 34, 104, 116, 116, 112, 58, 47, 47,
	110, 115, 46, 97, 100, 111, 98, 101, 46, 99, 111, 109, 47, 116, 105, 102, 102,
	47, 49, 46, 48, 47, 34, 10, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32,
	120, 109, 108, 110, 115, 58, 101, 120, 105, 102, 61, 34, 104, 116, 116, 112,
	58, 47, 47, 110, 115, 46, 97, 100, 111, 98, 101, 46, 99, 111, 109, 47, 101,
	120, 105, 102, 47, 49, 46, 48, 47, 34, 62, 10, 32, 32, 32, 32, 32, 32, 32, 32,
	32, 60, 116, 105, 102, 102, 58, 89, 82, 101, 115, 111, 108, 117, 116, 105,
	111, 110, 62, 55, 50, 60, 47, 116, 105, 102, 102, 58, 89, 82, 101, 115, 111,
	108, 117, 116, 105, 111, 110, 62, 10, 32, 32, 32, 32, 32, 32, 32, 32, 32, 60,
	116, 105, 102, 102, 58, 88, 82, 101, 115, 111, 108, 117, 116, 105, 111, 110,
	62, 55, 50, 60, 47, 116, 105, 102, 102, 58, 88, 82, 101, 115, 111, 108, 117,
	116, 105, 111, 110, 62, 10, 32, 32, 32, 32, 32, 32, 32, 32, 32, 60, 116, 105,
	102, 102, 58, 79, 114, 105, 101, 110, 116, 97, 116, 105, 111, 110, 62, 49, 60,
	47, 116, 105, 102, 102, 58, 79, 114, 105, 101, 110, 116, 97, 116, 105, 111,
	110, 62, 10, 32, 32, 32, 32, 32, 32, 32, 32, 32, 60, 101, 120, 105, 102, 58,
	80, 105, 120, 101, 108, 88, 68, 105, 109, 101, 110, 115, 105, 111, 110, 62,
	54, 52, 60, 47, 101, 120, 105, 102, 58, 80, 105, 120, 101, 108, 88, 68, 105,
	109, 101, 110, 115, 105, 111, 110, 62, 10, 32, 32, 32, 32, 32, 32, 32, 32, 32,
	60, 101, 120, 105, 102, 58, 67, 111, 108, 111, 114, 83, 112, 97, 99, 101, 62,
	49, 60, 47, 101, 120, 105, 102, 58, 67, 111, 108, 111, 114, 83, 112, 97, 99,
	101, 62, 10, 32, 32, 32, 32, 32, 32, 32, 32, 32, 60, 101, 120, 105, 102, 58,
	80, 105, 120, 101, 108, 89, 68, 105, 109, 101, 110, 115, 105, 111, 110, 62,
	54, 52, 60, 47, 101, 120, 105, 102, 58, 80, 105, 120, 101, 108, 89, 68, 105,
	109, 101, 110, 115, 105, 111, 110, 62, 10, 32, 32, 32, 32, 32, 32, 60, 47,
	114, 100, 102, 58, 68, 101, 115, 99, 114, 105, 112, 116, 105, 111, 110, 62,
	10, 32, 32, 32, 60, 47, 114, 100, 102, 58, 82, 68, 70, 62, 10, 60, 47, 120,
	58, 120, 109, 112, 109, 101, 116, 97, 62, 10, 104, 194, 171, 3, 0, 0, 2, 38,
	73, 68, 65, 84, 56, 17, 221, 83, 75, 104, 19, 81, 20, 61, 239, 51, 153, 73,
	172, 197, 46, 84, 208, 69, 141, 165, 65, 4, 65, 232, 78, 193, 79, 93, 73, 169,
	136, 216, 224, 70, 16, 92, 21, 4, 17, 177, 59, 237, 168, 117, 229, 66, 5, 247,
	130, 203, 180, 43, 215, 74, 179, 113, 227, 194, 141, 32, 130, 24, 20, 162, 96,
	45, 90, 219, 152, 100, 38, 243, 222, 243, 188, 244, 131, 17, 68, 196, 149, 94,
	114, 185, 111, 114, 207, 59, 247, 158, 123, 103, 128, 127, 202, 220, 4, 148,
	171, 208, 29, 68, 247, 28, 67, 255, 177, 0, 79, 240, 171, 75, 158, 248, 231,
	92, 79, 133, 56, 134, 156, 222, 75, 208, 75, 8, 81, 70, 150, 222, 24, 26, 113,
	210, 92, 200, 12, 74, 82, 98, 73, 65, 206, 229, 174, 214, 30, 8, 1, 114, 17,
	3, 48, 172, 218, 6, 179, 35, 137, 136, 97, 215, 19, 233, 76, 241, 44, 145, 15,
	181, 18, 176, 214, 49, 201, 76, 32, 209, 106, 102, 115, 133, 107, 239, 38, 92,
	165, 162, 102, 81, 70, 185, 12, 227, 239, 116, 137, 214, 73, 86, 226, 161,
	109, 188, 182, 95, 106, 219, 128, 21, 79, 36, 16, 117, 44, 82, 226, 40, 211,
	55, 1, 211, 215, 159, 15, 147, 47, 175, 46, 69, 55, 113, 215, 19, 116, 71, 80,
	38, 218, 15, 81, 204, 194, 52, 103, 74, 59, 133, 75, 159, 70, 129, 28, 252,
	150, 202, 140, 215, 188, 108, 118, 40, 200, 183, 106, 66, 230, 76, 96, 63, 40,
	51, 48, 254, 58, 127, 108, 116, 50, 121, 113, 238, 109, 116, 6, 111, 124, 86,
	163, 66, 48, 251, 210, 162, 51, 22, 68, 122, 112, 101, 185, 157, 8, 91, 15,
	169, 222, 119, 176, 65, 226, 193, 78, 66, 181, 23, 224, 242, 71, 199, 134,
	177, 88, 125, 172, 228, 102, 99, 30, 141, 220, 81, 39, 170, 87, 132, 139, 119,
	69, 137, 20, 183, 89, 250, 180, 177, 217, 118, 200, 126, 136, 190, 97, 54,
	162, 5, 4, 21, 117, 157, 124, 66, 195, 101, 45, 232, 61, 199, 17, 30, 58, 233,
	204, 179, 123, 214, 53, 107, 50, 232, 111, 136, 236, 243, 194, 148, 78, 148,
	184, 31, 22, 228, 249, 70, 131, 29, 216, 101, 131, 168, 36, 100, 113, 148, 83,
	9, 233, 84, 167, 2, 138, 99, 244, 59, 202, 69, 8, 15, 142, 243, 153, 53, 118,
	28, 0, 26, 187, 59, 230, 227, 124, 78, 186, 250, 164, 200, 110, 21, 157, 234,
	174, 196, 47, 148, 149, 93, 27, 72, 222, 123, 37, 60, 175, 185, 63, 123, 145,
	75, 244, 139, 207, 25, 231, 129, 218, 101, 32, 220, 199, 77, 14, 192, 180,
	117, 71, 167, 153, 61, 165, 148, 242, 189, 19, 149, 209, 11, 252, 177, 90,
	143, 249, 119, 147, 203, 43, 108, 129, 90, 172, 65, 213, 167, 128, 77, 220,
	187, 225, 127, 73, 139, 111, 126, 250, 181, 7, 254, 55, 15, 28, 246, 239, 190,
	159, 35, 107, 252, 85, 70, 158, 15, 79, 51, 94, 167, 255, 96, 159, 182, 250,
	33, 252, 175, 246, 29, 136, 209, 199, 77, 51, 27, 182, 48, 0, 0, 0, 0, 73, 69,
	78, 68, 174, 66, 96, 130,
]);

describe("Images binding", () => {
	afterEach(async () => {
		const list = await env.IMAGES.hosted.list();
		for (const image of list.images) {
			await env.IMAGES.hosted.delete(image.id);
		}
	});

	it("can upload an image", async ({ expect }) => {
		const metadata = await env.IMAGES.hosted.upload(TINY_PNG.buffer, {
			id: "test-123",
		});
		expect(metadata.id).toBe("test-123");
		expect(metadata.filename).toBe("uploaded.jpg");
	});

	it("can upload a base64-encoded image", async ({ expect }) => {
		const base64String = btoa(String.fromCharCode(...TINY_PNG));
		const base64Bytes = new TextEncoder().encode(base64String);

		const metadata = await env.IMAGES.hosted.upload(base64Bytes, {
			id: "base64-test",
			encoding: "base64",
		});
		expect(metadata.id).toBe("base64-test");

		const retrievedStream = await env.IMAGES.hosted.image("base64-test");
		const data = await new Response(retrievedStream).arrayBuffer();
		expect(new Uint8Array(data)).toEqual(TINY_PNG);
	});

	it("can get image metadata", async ({ expect }) => {
		await env.IMAGES.hosted.upload(TINY_PNG.buffer, { id: "get-test" });

		const metadata = await env.IMAGES.hosted.details("get-test");
		expect(metadata).not.toBeNull();
		expect(metadata?.id).toBe("get-test");
	});

	it("can get image data", async ({ expect }) => {
		await env.IMAGES.hosted.upload(TINY_PNG.buffer, { id: "blob-test" });

		const stream = await env.IMAGES.hosted.image("blob-test");
		expect(stream).not.toBeNull();

		const data = await new Response(stream).arrayBuffer();
		expect(new Uint8Array(data)).toEqual(TINY_PNG);
	});

	it("can update image metadata", async ({ expect }) => {
		await env.IMAGES.hosted.upload(TINY_PNG.buffer, { id: "update-test" });

		const metadata = await env.IMAGES.hosted.update("update-test", {
			requireSignedURLs: true,
		});
		expect(metadata.requireSignedURLs).toBe(true);
	});

	it("can delete an image", async ({ expect }) => {
		await env.IMAGES.hosted.upload(TINY_PNG.buffer, { id: "delete-test" });

		const deleted = await env.IMAGES.hosted.delete("delete-test");
		expect(deleted).toBe(true);

		// Verify it's gone
		const metadata = await env.IMAGES.hosted.details("delete-test");
		expect(metadata).toBe(null);
	});

	it("can list images", async ({ expect }) => {
		await env.IMAGES.hosted.upload(TINY_PNG.buffer);

		const list = await env.IMAGES.hosted.list();
		expect(list.listComplete).toBe(true);
		expect(Array.isArray(list.images)).toBe(true);
	});

	it("can list images filtered by creator", async ({ expect }) => {
		await env.IMAGES.hosted.upload(TINY_PNG.buffer, {
			id: "img1",
			creator: "socrates",
		});
		await env.IMAGES.hosted.upload(TINY_PNG.buffer, { id: "img2", creator: "plato" });
		const list = await env.IMAGES.hosted.list({ creator: "plato" });
		expect(list.images.length).toBe(1);
		expect(list.images[0].id).toBe("img2");
	});

	it("can use list images with a cursor", async ({ expect }) => {
		const imageIds = ["img1", "img2", "img3", "img4", "img5"];

		for (const id of imageIds) {
			await env.IMAGES.hosted.upload(TINY_PNG.buffer, { id });
		}

		const page1 = await env.IMAGES.hosted.list({ limit: 2 });
		expect(page1.images.length).toBe(2);
		expect(page1.cursor).toBeDefined();
		expect(page1.listComplete).toBe(false);

		const page2 = await env.IMAGES.hosted.list({ limit: 2, cursor: page1.cursor });
		expect(page2.images.length).toBe(2);
		expect(page2.cursor).toBeDefined();
		expect(page2.listComplete).toBe(false);

		const page3 = await env.IMAGES.hosted.list({ limit: 2, cursor: page2.cursor });
		expect(page3.images.length).toBe(1);
		expect(page3.cursor).toBeUndefined();
		expect(page3.listComplete).toBe(true);

		const allFetchedIds = [
			...page1.images.map((img) => img.id),
			...page2.images.map((img) => img.id),
			...page3.images.map((img) => img.id),
		];
		expect(new Set(allFetchedIds).size).toBe(5);
	});

	it("returns null for non-existent image metadata", async ({ expect }) => {
		const metadata = await env.IMAGES.hosted.details("does-not-exist");
		expect(metadata).toBe(null);
	});

	it("returns null for non-existent image blob", async ({ expect }) => {
		const stream = await env.IMAGES.hosted.image("does-not-exist");
		expect(stream).toBe(null);
	});

	it("can return image info", async ({ expect }) => {
		// This test uses SELF.fetch because info() goes through our HTTP handler
		const resp = await SELF.fetch("https://example.com/info", {
			method: "POST",
			body: new Blob([TINY_PNG]).stream(),
		});
		const result = (await resp.json()) as { format: string };
		expect(result.format).toEqual("image/png");
	});
});
