import { SELF } from "cloudflare:test";
import { expect, it, describe } from "vitest";

describe("Images binding CRUD operations", () => {
	it("can upload an image", async () => {
		const imageData = new Uint8Array([0xff, 0xd8, 0xff]); // Minimal JPEG header
		const resp = await SELF.fetch("https://example.com/upload?id=test-123", {
			method: "POST",
			body: imageData,
		});

		const result = (await resp.json()) as { success: boolean; metadata: { id: string } };
		expect(result.success).toBe(true);
		expect(result.metadata.id).toBe("test-123");
	});

	it("can get image metadata", async () => {
		// First upload
		const imageData = new Uint8Array([0xff, 0xd8, 0xff]);
		await SELF.fetch("https://example.com/upload?id=get-test", {
			method: "POST",
			body: imageData,
		});

		// Then get
		const resp = await SELF.fetch("https://example.com/get?id=get-test");
		const result = (await resp.json()) as { success: boolean; metadata: { id: string } };
		expect(result.success).toBe(true);
		expect(result.metadata.id).toBe("get-test");
	});

	it("can get image data", async () => {
		// First upload
		const imageData = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
		await SELF.fetch("https://example.com/upload?id=blob-test", {
			method: "POST",
			body: imageData,
		});

		// Then get the image data
		const resp = await SELF.fetch("https://example.com/getImage?id=blob-test");
		expect(resp.headers.get("content-type")).toBe("image/jpeg");

		const data = new Uint8Array(await resp.arrayBuffer());
		expect(data.length).toBe(4);
	});

	it("can update image metadata", async () => {
		// First upload
		const imageData = new Uint8Array([0xff, 0xd8, 0xff]);
		await SELF.fetch("https://example.com/upload?id=update-test", {
			method: "POST",
			body: imageData,
		});

		// Then update
		const resp = await SELF.fetch("https://example.com/update?id=update-test", {
			method: "POST",
		});
		const result = (await resp.json()) as { success: boolean; metadata: { requireSignedURLs: boolean } };
		expect(result.success).toBe(true);
		expect(result.metadata.requireSignedURLs).toBe(true);
	});

	it("can delete an image", async () => {
		// First upload
		const imageData = new Uint8Array([0xff, 0xd8, 0xff]);
		await SELF.fetch("https://example.com/upload?id=delete-test", {
			method: "POST",
			body: imageData,
		});

		// Then delete
		const resp = await SELF.fetch("https://example.com/delete?id=delete-test", {
			method: "POST",
		});
		const result = (await resp.json()) as { success: boolean; deleted: boolean };
		expect(result.success).toBe(true);
		expect(result.deleted).toBe(true);

		// Verify it's gone
		const getResp = await SELF.fetch("https://example.com/get?id=delete-test");
		const getResult = (await getResp.json()) as { metadata: null };
		expect(getResult.metadata).toBe(null);
	});

	it("can list images", async () => {
		const resp = await SELF.fetch("https://example.com/list");
		const result = (await resp.json()) as { success: boolean; list: { images: unknown[]; listComplete: boolean } };
		expect(result.success).toBe(true);
		expect(result.list.listComplete).toBe(true);
		expect(Array.isArray(result.list.images)).toBe(true);
	});

	it("returns null for non-existent image", async () => {
		const resp = await SELF.fetch("https://example.com/get?id=does-not-exist");
		const result = (await resp.json()) as { metadata: null };
		expect(result.metadata).toBe(null);
	});
});
