import { Miniflare } from "miniflare";
import { describe, test } from "vitest";
import { singleModuleManifest, useDispose } from "../../test-shared";
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
		case "signedUrl":
			return hosted.image(args.id).signedUrl(args.options);
		case "createDirectUpload":
			return hosted.createDirectUpload(args.options);
		case "list":
			return hosted.list(args.options);
		default:
			throw new Error("Unknown op: " + op);
	}
}
`;

function createMiniflare(): Miniflare {
	return new Miniflare({
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-04-01",
					env: { IMAGES: { type: "images" } },
					manifest: singleModuleManifest(WORKER_SCRIPT),
				},
			},
		],
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
	test("variant URLs are absolute and use /__cf_local/imagedelivery/ path", async ({
		expect,
	}) => {
		const mf = createMiniflare();
		useDispose(mf);
		const url = await mf.ready;

		const metadata = await upload(mf, TEST_IMAGE_BYTES, { id: "variant-test" });
		expect(metadata.variants).toHaveLength(1);
		expect(metadata.variants[0]).toBe(
			`${url.origin}/__cf_local/imagedelivery/variant-test/public`
		);
	});

	test("image delivery endpoint serves image bytes", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);
		const url = await mf.ready;

		await upload(mf, TEST_IMAGE_BYTES, { id: "delivery-test" });

		const response = await mf.dispatchFetch(
			`${url.origin}/__cf_local/imagedelivery/delivery-test/public`
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
			`${url.origin}/__cf_local/imagedelivery/does-not-exist/public`
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

	test("list images filtered by metadata", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);

		await upload(mf, TEST_IMAGE_BYTES, {
			id: "meta-1",
			metadata: { status: "active", priority: 1, config: { region: "eu" } },
		});
		await upload(mf, TEST_IMAGE_BYTES, {
			id: "meta-2",
			metadata: { status: "archived", priority: 5, config: { region: "us" } },
		});

		const list = await sendCmd<ImageList>(mf, "list", {
			options: { filter: { metadata: { status: "active" } } },
		});
		expect(list.images).toHaveLength(1);
		expect(list.images[0].id).toBe("meta-1");
	});

	test("list images filtered by metadata with range operators", async ({
		expect,
	}) => {
		const mf = createMiniflare();
		useDispose(mf);

		await upload(mf, TEST_IMAGE_BYTES, {
			id: "range-1",
			metadata: { priority: 1 },
		});
		await upload(mf, TEST_IMAGE_BYTES, {
			id: "range-2",
			metadata: { priority: 5 },
		});
		await upload(mf, TEST_IMAGE_BYTES, {
			id: "range-3",
			metadata: { priority: 9 },
		});

		const list = await sendCmd<ImageList>(mf, "list", {
			options: { filter: { metadata: { priority: { gte: 2, lte: 8 } } } },
		});
		expect(list.images).toHaveLength(1);
		expect(list.images[0].id).toBe("range-2");
	});

	test("list images filtered by metadata with in operator", async ({
		expect,
	}) => {
		const mf = createMiniflare();
		useDispose(mf);

		await upload(mf, TEST_IMAGE_BYTES, {
			id: "in-1",
			metadata: { region: "us-east" },
		});
		await upload(mf, TEST_IMAGE_BYTES, {
			id: "in-2",
			metadata: { region: "eu-west" },
		});
		await upload(mf, TEST_IMAGE_BYTES, {
			id: "in-3",
			metadata: { region: "ap-south" },
		});

		const list = await sendCmd<ImageList>(mf, "list", {
			options: {
				filter: { metadata: { region: { in: ["us-east", "eu-west"] } } },
			},
		});
		expect(list.images.map((i) => i.id).sort()).toEqual(["in-1", "in-2"]);
	});

	test("list images filtered by nested metadata field", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);

		await upload(mf, TEST_IMAGE_BYTES, {
			id: "nested-1",
			metadata: { config: { region: "eu-west" } },
		});
		await upload(mf, TEST_IMAGE_BYTES, {
			id: "nested-2",
			metadata: { config: { region: "us-east" } },
		});

		const list = await sendCmd<ImageList>(mf, "list", {
			options: { filter: { metadata: { "config.region": "eu-west" } } },
		});
		expect(list.images).toHaveLength(1);
		expect(list.images[0].id).toBe("nested-1");
	});

	test("list images filtered by multiple metadata fields (AND logic)", async ({
		expect,
	}) => {
		const mf = createMiniflare();
		useDispose(mf);

		await upload(mf, TEST_IMAGE_BYTES, {
			id: "and-1",
			metadata: { status: "active", priority: 5 },
		});
		await upload(mf, TEST_IMAGE_BYTES, {
			id: "and-2",
			metadata: { status: "active", priority: 1 },
		});

		const list = await sendCmd<ImageList>(mf, "list", {
			options: {
				filter: { metadata: { status: "active", priority: { gte: 3 } } },
			},
		});
		expect(list.images).toHaveLength(1);
		expect(list.images[0].id).toBe("and-1");
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

describe("Images signed URLs", () => {
	test("signed URL includes a signature and requested variant", async ({
		expect,
	}) => {
		const mf = createMiniflare();
		useDispose(mf);

		await upload(mf, TEST_IMAGE_BYTES, {
			id: "signed-1",
			requireSignedURLs: true,
		});

		const signedUrl = await sendCmd<string>(mf, "signedUrl", {
			id: "signed-1",
			options: { variant: "public" },
		});

		const url = new URL(signedUrl);
		expect(url.pathname).toBe("/__cf_local/imagedelivery/signed-1/public");
		expect(url.searchParams.get("sig")).toMatch(/^[0-9a-f]{64}$/);
		expect(url.searchParams.get("exp")).toBeNull();
	});

	test("signed URL includes an exp param when expiresIn is provided", async ({
		expect,
	}) => {
		const mf = createMiniflare();
		useDispose(mf);

		await upload(mf, TEST_IMAGE_BYTES, {
			id: "signed-2",
			requireSignedURLs: true,
		});

		const before = Math.floor(Date.now() / 1000);
		const signedUrl = await sendCmd<string>(mf, "signedUrl", {
			id: "signed-2",
			options: { variant: "public", expiresIn: 60 },
		});
		const url = new URL(signedUrl);
		const exp = Number(url.searchParams.get("exp"));
		expect(exp).toBeGreaterThanOrEqual(before + 60);
		expect(exp).toBeLessThanOrEqual(before + 61);
	});

	test("rejects a variant containing invalid URL path characters", async ({
		expect,
	}) => {
		const mf = createMiniflare();
		useDispose(mf);

		await upload(mf, TEST_IMAGE_BYTES, {
			id: "signed-3",
			requireSignedURLs: true,
		});

		await expect(
			sendCmd(mf, "signedUrl", {
				id: "signed-3",
				options: { variant: "public?evil=1" },
			})
		).rejects.toThrow();
	});

	test("rejects a non-positive-integer expiresIn", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);

		await upload(mf, TEST_IMAGE_BYTES, {
			id: "signed-4",
			requireSignedURLs: true,
		});

		await expect(
			sendCmd(mf, "signedUrl", {
				id: "signed-4",
				options: { variant: "public", expiresIn: 0 },
			})
		).rejects.toThrow();
	});

	test("a signed URL can be used to fetch a private image", async ({
		expect,
	}) => {
		const mf = createMiniflare();
		useDispose(mf);

		await upload(mf, TEST_IMAGE_BYTES, {
			id: "signed-fetch-1",
			requireSignedURLs: true,
		});

		const signedUrl = await sendCmd<string>(mf, "signedUrl", {
			id: "signed-fetch-1",
			options: { variant: "public" },
		});

		const response = await mf.dispatchFetch(signedUrl);
		expect(response.status).toBe(200);
		const data = new Uint8Array(await response.arrayBuffer());
		expect(data).toEqual(TEST_IMAGE_BYTES);
	});

	test("fetching a private image without a signature is rejected", async ({
		expect,
	}) => {
		const mf = createMiniflare();
		useDispose(mf);
		const url = await mf.ready;

		await upload(mf, TEST_IMAGE_BYTES, {
			id: "signed-fetch-2",
			requireSignedURLs: true,
		});

		const response = await mf.dispatchFetch(
			`${url.origin}/__cf_local/imagedelivery/signed-fetch-2/public`
		);
		expect(response.status).toBe(401);
		await response.arrayBuffer();
	});

	test("fetching a private image with a tampered signature is rejected", async ({
		expect,
	}) => {
		const mf = createMiniflare();
		useDispose(mf);

		await upload(mf, TEST_IMAGE_BYTES, {
			id: "signed-fetch-3",
			requireSignedURLs: true,
		});

		const signedUrl = await sendCmd<string>(mf, "signedUrl", {
			id: "signed-fetch-3",
			options: { variant: "public" },
		});
		const url = new URL(signedUrl);
		url.searchParams.set("sig", "0".repeat(64));

		const response = await mf.dispatchFetch(url.toString());
		expect(response.status).toBe(401);
		await response.arrayBuffer();
	});

	test("fetching a private image with an expired signature is rejected", async ({
		expect,
	}) => {
		const mf = createMiniflare();
		useDispose(mf);

		await upload(mf, TEST_IMAGE_BYTES, {
			id: "signed-fetch-4",
			requireSignedURLs: true,
		});

		const signedUrl = await sendCmd<string>(mf, "signedUrl", {
			id: "signed-fetch-4",
			options: { variant: "public", expiresIn: 60 },
		});
		// Manually forge an expired timestamp; the sig will no longer match
		// but the expiry check should reject the request before that anyway.
		const url = new URL(signedUrl);
		url.searchParams.set("exp", String(Math.floor(Date.now() / 1000) - 60));

		const response = await mf.dispatchFetch(url.toString());
		expect(response.status).toBe(401);
		await response.arrayBuffer();
	});

	test("fetching a public image never requires a signature", async ({
		expect,
	}) => {
		const mf = createMiniflare();
		useDispose(mf);
		const url = await mf.ready;

		await upload(mf, TEST_IMAGE_BYTES, { id: "public-fetch-1" });

		const response = await mf.dispatchFetch(
			`${url.origin}/__cf_local/imagedelivery/public-fetch-1/public`
		);
		expect(response.status).toBe(200);
		await response.arrayBuffer();
	});
});

// `dispatchFetch()` doesn't preserve the auto-generated multipart boundary
// when given a `FormData` body directly, so the body is built manually here
// with an explicit `Content-Type` header instead.
function completeDirectUpload(
	mf: Miniflare,
	uploadURL: string,
	bytes: Uint8Array,
	filename = "upload.jpg"
): Promise<Response> {
	const boundary = "----MiniflareDirectUploadTestBoundary";
	const encoder = new TextEncoder();
	const head = encoder.encode(
		`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`
	);
	const tail = encoder.encode(`\r\n--${boundary}--\r\n`);
	const body = new Uint8Array(head.length + bytes.length + tail.length);
	body.set(head, 0);
	body.set(bytes, head.length);
	body.set(tail, head.length + bytes.length);

	return mf.dispatchFetch(uploadURL, {
		method: "POST",
		headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
		body,
	});
}

describe("Images direct upload", () => {
	test("createDirectUpload returns an id and upload URL", async ({
		expect,
	}) => {
		const mf = createMiniflare();
		useDispose(mf);
		const url = await mf.ready;

		const result = await sendCmd<{ id: string; uploadURL: string }>(
			mf,
			"createDirectUpload"
		);
		expect(result.id).toBeTruthy();
		expect(result.uploadURL).toBe(
			`${url.origin}/__cf_local/imageupload/${result.id}`
		);
	});

	test("createDirectUpload rejects a custom id that is a UUID", async ({
		expect,
	}) => {
		const mf = createMiniflare();
		useDispose(mf);

		await expect(
			sendCmd(mf, "createDirectUpload", {
				options: { id: "3ce3b103-2ac0-4836-954f-937a2f04ccbe" },
			})
		).rejects.toThrow();
	});

	test("createDirectUpload rejects requireSignedURLs with a custom id", async ({
		expect,
	}) => {
		const mf = createMiniflare();
		useDispose(mf);

		await expect(
			sendCmd(mf, "createDirectUpload", {
				options: { id: "custom-id", requireSignedURLs: true },
			})
		).rejects.toThrow();
	});

	test("createDirectUpload rejects an expiresIn outside the accepted bounds", async ({
		expect,
	}) => {
		const mf = createMiniflare();
		useDispose(mf);

		await expect(
			sendCmd(mf, "createDirectUpload", { options: { expiresIn: 60 } })
		).rejects.toThrow();
		await expect(
			sendCmd(mf, "createDirectUpload", { options: { expiresIn: 21601 } })
		).rejects.toThrow();
	});

	test("a completed direct upload is retrievable and no longer a draft", async ({
		expect,
	}) => {
		const mf = createMiniflare();
		useDispose(mf);

		const { id, uploadURL } = await sendCmd<{
			id: string;
			uploadURL: string;
		}>(mf, "createDirectUpload", {
			options: { metadata: { source: "direct-upload" } },
		});

		const beforeUpload = await sendCmd<ImageMetadata | null>(mf, "details", {
			id,
		});
		expect(beforeUpload?.draft).toBe(true);

		const response = await completeDirectUpload(
			mf,
			uploadURL,
			TEST_IMAGE_BYTES
		);
		expect(response.status).toBe(200);
		await response.arrayBuffer();

		const afterUpload = await sendCmd<ImageMetadata | null>(mf, "details", {
			id,
		});
		expect(afterUpload?.draft).toBe(false);
		expect(afterUpload?.meta).toEqual({ source: "direct-upload" });

		const data = await sendCmd<number[]>(mf, "bytes", { id });
		expect(new Uint8Array(data)).toEqual(TEST_IMAGE_BYTES);
	});

	test("completing an unknown upload link returns 404", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);
		const url = await mf.ready;

		const response = await completeDirectUpload(
			mf,
			`${url.origin}/__cf_local/imageupload/does-not-exist`,
			TEST_IMAGE_BYTES
		);
		expect(response.status).toBe(404);
		await response.arrayBuffer();
	});

	test("completing an already-used upload link returns 409", async ({
		expect,
	}) => {
		const mf = createMiniflare();
		useDispose(mf);

		const { uploadURL } = await sendCmd<{ id: string; uploadURL: string }>(
			mf,
			"createDirectUpload"
		);

		const first = await completeDirectUpload(mf, uploadURL, TEST_IMAGE_BYTES);
		expect(first.status).toBe(200);
		await first.arrayBuffer();

		const second = await completeDirectUpload(mf, uploadURL, TEST_IMAGE_BYTES);
		expect(second.status).toBe(409);
		await second.arrayBuffer();
	});
});
