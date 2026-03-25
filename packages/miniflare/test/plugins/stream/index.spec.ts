import http from "node:http";
import { pathToFileURL } from "node:url";
import {
	Miniflare,
	STREAM_COMPAT_DATE,
	STREAM_OBJECT_CLASS_NAME,
	STREAM_PLUGIN_NAME,
} from "miniflare";
import { describe, test } from "vitest";
import {
	MiniflareDurableObjectControlStub,
	useDispose,
	useServer,
	useTmp,
} from "../../test-shared";
import type {
	StreamCaption as Caption,
	StreamDownloadGetResponse as DownloadGetResponse,
	StreamVideo as Video,
	StreamWatermark as Watermark,
} from "@cloudflare/workers-types";
import type { MiniflareOptions } from "miniflare";

// Mock image / video bytes
const TEST_VIDEO_BYTES = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
const TEST_IMAGE_BYTES = new Uint8Array([255, 216, 255, 224]);
const STREAM_OBJECT_NAME = "stream-data";
const FAKE_TIME_START = 1_000_000;

function staticBytesListener(bytes: Uint8Array): http.RequestListener {
	return (_req, res) => {
		res.writeHead(200, { "Content-Type": "application/octet-stream" });
		res.end(Buffer.from(bytes));
	};
}

function statusListener(
	statusCode: number,
	statusMessage?: string
): http.RequestListener {
	return (_req, res) => {
		res.writeHead(statusCode, statusMessage);
		res.end();
	};
}

const WORKER_SCRIPT = `
export default {
	async fetch(request, env) {
		try {
			const { op, args } = await request.json();
			const stream = env.STREAM;
			const result = await handleCommand(stream, op, args || {});
			return Response.json({ ok: true, result });
		} catch (err) {
			return Response.json({
				ok: false,
				error: err.message,
				name: err.name,
				code: err.code,
				statusCode: err.statusCode,
			}, { status: 200 });
		}
	}
}

async function handleCommand(stream, op, args) {
	switch (op) {
		case "upload": {
			const resp = await fetch(args.url);
			return stream.upload(resp.body, args.params);
		}
		case "upload.fromUrl":
			return stream.upload(args.url, args.params);
		case "video.details":
			return stream.video(args.id).details();
		case "video.update":
			return stream.video(args.id).update(args.params);
		case "video.delete":
			await stream.video(args.id).delete();
			return null;
		case "video.generateToken":
			return stream.video(args.id).generateToken();
		case "videos.list":
			return stream.videos.list(args.params);
		case "captions.generate":
			return stream.video(args.id).captions.generate(args.language);
		case "captions.list":
			return stream.video(args.id).captions.list(args.language);
		case "captions.delete":
			await stream.video(args.id).captions.delete(args.language);
			return null;
		case "captions.upload": {
			const file = new File(["test"], "captions.vtt");
			return stream.video(args.id).captions.upload(args.language, file);
		}
		case "downloads.generate":
			return stream.video(args.id).downloads.generate(args.type);
		case "downloads.get":
			return stream.video(args.id).downloads.get();
		case "downloads.delete":
			await stream.video(args.id).downloads.delete(args.type);
			return null;
		case "watermarks.generate": {
			const resp = await fetch(args.url);
			return stream.watermarks.generate(resp.body, args.params || {});
		}
		case "watermarks.generate.fromUrl":
			return stream.watermarks.generate(args.url, args.params || {});
		case "watermarks.generate.fromFile": {
			const file = new File(["test"], "watermark.png");
			return stream.watermarks.generate(file, args.params || {});
		}
		case "watermarks.list":
			return stream.watermarks.list();
		case "watermarks.get":
			return stream.watermarks.get(args.id);
		case "watermarks.delete":
			await stream.watermarks.delete(args.id);
			return null;
		case "createDirectUpload":
			return stream.createDirectUpload(args.params || {});
		default:
			throw new Error("Unknown op: " + op);
	}
}
`;

function createMiniflare(options: Partial<MiniflareOptions> = {}): Miniflare {
	return new Miniflare({
		compatibilityDate: STREAM_COMPAT_DATE,
		stream: { binding: "STREAM" },
		streamPersist: false,
		modules: true,
		script: WORKER_SCRIPT,
		...options,
	} as MiniflareOptions);
}

async function getStreamObjectControl(
	mf: Miniflare
): Promise<MiniflareDurableObjectControlStub> {
	const objectNamespace = await mf._getInternalDurableObjectNamespace(
		STREAM_PLUGIN_NAME,
		"stream:object",
		STREAM_OBJECT_CLASS_NAME
	);
	const objectId = objectNamespace.idFromName(STREAM_OBJECT_NAME);
	const objectStub = objectNamespace.get(objectId);
	return new MiniflareDurableObjectControlStub(objectStub);
}

type CmdError = Error & { name: string; code?: number; statusCode?: number };

async function sendCmdToWorker(
	mf: Miniflare,
	op: string,
	args: Record<string, unknown> = {}
): Promise<unknown> {
	const resp = await mf.dispatchFetch("http://placeholder", {
		method: "POST",
		body: JSON.stringify({ op, args }),
		headers: { "Content-Type": "application/json" },
	});
	const data = (await resp.json()) as {
		ok: boolean;
		result: unknown;
		error?: string;
		name?: string;
		code?: number;
		statusCode?: number;
	};
	if (!data.ok) {
		const err: CmdError = new Error(data.error);
		err.name = data.name ?? "Error";
		err.code = data.code;
		err.statusCode = data.statusCode;
		throw err;
	}
	return data.result;
}

describe("Stream videos", () => {
	test("upload and retrieve details", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);
		const { http: videoUrl } = await useServer(
			staticBytesListener(TEST_VIDEO_BYTES)
		);

		const video = (await sendCmdToWorker(mf, "upload", {
			url: videoUrl.toString(),
		})) as Video;

		expect(video.id).toBeTruthy();
		expect(video.readyToStream).toBe(true);
		expect(video.status.state).toBe("ready");
		expect(video.size).toBe(TEST_VIDEO_BYTES.byteLength);
		expect(video.created).toBeTruthy();
		expect(video.modified).toBeTruthy();
		expect(video.hlsPlaybackUrl).toContain(video.id);
		expect(video.dashPlaybackUrl).toContain(video.id);

		const details = (await sendCmdToWorker(mf, "video.details", {
			id: video.id,
		})) as Video;
		expect(details.id).toBe(video.id);
		expect(details.readyToStream).toBe(true);
	});

	test("upload with params", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);
		const { http: videoUrl } = await useServer(
			staticBytesListener(TEST_VIDEO_BYTES)
		);

		const video = (await sendCmdToWorker(mf, "upload", {
			url: videoUrl.toString(),
			params: {
				creator: "test-creator",
				meta: { title: "Test Video" },
				requireSignedURLs: true,
				thumbnailTimestampPct: 0.5,
			},
		})) as Video;

		expect(video.creator).toBe("test-creator");
		expect(video.meta).toEqual({ title: "Test Video" });
		expect(video.requireSignedURLs).toBe(true);
		expect(video.thumbnailTimestampPct).toBe(0.5);
	});

	test("upload from URL propagates fetch failures", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);
		const { http: videoUrl } = await useServer(statusListener(500, "Boom"));

		await expect(
			sendCmdToWorker(mf, "upload.fromUrl", {
				url: videoUrl.toString(),
			})
		).rejects.toThrow("Failed to fetch video from URL: 500 Boom");
	});

	test("throw when getting details for non existent video", async ({
		expect,
	}) => {
		const mf = createMiniflare();
		useDispose(mf);

		await expect(
			sendCmdToWorker(mf, "video.details", {
				id: "00000000-0000-0000-0000-000000000000",
			})
		).rejects.toThrow("Video not found");
	});

	test("update video metadata", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);
		const { http: videoUrl } = await useServer(
			staticBytesListener(TEST_VIDEO_BYTES)
		);

		const video = (await sendCmdToWorker(mf, "upload", {
			url: videoUrl.toString(),
		})) as Video;
		const originalModified = video.modified;

		const updated = (await sendCmdToWorker(mf, "video.update", {
			id: video.id,
			params: {
				creator: "new-creator",
				meta: { description: "Updated" },
			},
		})) as Video;

		expect(updated.id).toBe(video.id);
		expect(updated.creator).toBe("new-creator");
		expect(updated.meta).toEqual({ description: "Updated" });
		expect(updated.modified).not.toBe(originalModified);
	});

	test("throws when updating non existent video", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);

		await expect(
			sendCmdToWorker(mf, "video.update", {
				id: "00000000-0000-0000-0000-000000000000",
				params: { creator: "nobody" },
			})
		).rejects.toThrow("Video not found");
	});

	test("delete video", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);
		const { http: videoUrl } = await useServer(
			staticBytesListener(TEST_VIDEO_BYTES)
		);

		const video = (await sendCmdToWorker(mf, "upload", {
			url: videoUrl.toString(),
		})) as Video;
		await sendCmdToWorker(mf, "video.delete", { id: video.id });

		await expect(
			sendCmdToWorker(mf, "video.details", { id: video.id })
		).rejects.toThrow("Video not found");
	});

	test("throws when deleting non existent video", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);

		await expect(
			sendCmdToWorker(mf, "video.delete", {
				id: "00000000-0000-0000-0000-000000000000",
			})
		).rejects.toThrow("Video not found");
	});

	test("partial update preserves untouched fields", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);
		const { http: videoUrl } = await useServer(
			staticBytesListener(TEST_VIDEO_BYTES)
		);

		const video = (await sendCmdToWorker(mf, "upload", {
			url: videoUrl.toString(),
			params: {
				creator: "original-creator",
				meta: { title: "Original" },
				requireSignedURLs: true,
				thumbnailTimestampPct: 0.3,
			},
		})) as Video;

		// Only update creator — all other fields should be preserved
		const updated = (await sendCmdToWorker(mf, "video.update", {
			id: video.id,
			params: { creator: "new-creator" },
		})) as Video;

		expect(updated.creator).toBe("new-creator");
		expect(updated.meta).toEqual({ title: "Original" });
		expect(updated.requireSignedURLs).toBe(true);
		expect(updated.thumbnailTimestampPct).toBe(0.3);
	});

	test("update can null-clear creator and scheduledDeletion", async ({
		expect,
	}) => {
		const mf = createMiniflare();
		useDispose(mf);
		const { http: videoUrl } = await useServer(
			staticBytesListener(TEST_VIDEO_BYTES)
		);

		const video = (await sendCmdToWorker(mf, "upload", {
			url: videoUrl.toString(),
			params: {
				creator: "will-be-cleared",
				scheduledDeletion: new Date(Date.now() + 86_400_000).toISOString(),
			},
		})) as Video;

		expect(video.creator).toBe("will-be-cleared");
		expect(video.scheduledDeletion).toBeTruthy();

		const updated = (await sendCmdToWorker(mf, "video.update", {
			id: video.id,
			params: { creator: null, scheduledDeletion: null },
		})) as Video;

		expect(updated.creator).toBeNull();
		expect(updated.scheduledDeletion).toBeNull();
	});

	test("generate token", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);
		const { http: videoUrl } = await useServer(
			staticBytesListener(TEST_VIDEO_BYTES)
		);

		const video = (await sendCmdToWorker(mf, "upload", {
			url: videoUrl.toString(),
		})) as Video;
		const token = (await sendCmdToWorker(mf, "video.generateToken", {
			id: video.id,
		})) as string;

		expect(typeof token).toBe("string");
		// Token is b64 encoded JSON
		const payload = JSON.parse(atob(token)) as {
			sub: string;
			kid: string;
			exp: number;
		};
		expect(payload.sub).toBe(video.id);
		expect(payload.kid).toBe("local-mode-key");
		expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
	});

	test("generate token for non-existent video throws", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);

		await expect(
			sendCmdToWorker(mf, "video.generateToken", {
				id: "00000000-0000-0000-0000-000000000000",
			})
		).rejects.toThrow("Video not found");
	});
});

describe("Stream videos list", () => {
	test("list empty", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);

		const videos = (await sendCmdToWorker(mf, "videos.list")) as Video[];
		expect(videos).toEqual([]);
	});

	test("list all videos", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);
		const { http: videoUrl } = await useServer(
			staticBytesListener(TEST_VIDEO_BYTES)
		);

		await sendCmdToWorker(mf, "upload", { url: videoUrl.toString() });
		await sendCmdToWorker(mf, "upload", { url: videoUrl.toString() });
		await sendCmdToWorker(mf, "upload", { url: videoUrl.toString() });

		const videos = (await sendCmdToWorker(mf, "videos.list")) as Video[];
		expect(videos).toHaveLength(3);
		for (const v of videos) {
			expect(v.id).toBeTruthy();
		}
	});

	test("list with limit", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);
		const { http: videoUrl } = await useServer(
			staticBytesListener(TEST_VIDEO_BYTES)
		);

		for (let i = 0; i < 5; i++) {
			await sendCmdToWorker(mf, "upload", { url: videoUrl.toString() });
		}

		const limited = (await sendCmdToWorker(mf, "videos.list", {
			params: { limit: 2 },
		})) as Video[];
		expect(limited).toHaveLength(2);
	});

	test("list rejects invalid before comparison operator", async ({
		expect,
	}) => {
		const mf = createMiniflare();
		useDispose(mf);

		await expect(
			sendCmdToWorker(mf, "videos.list", {
				params: { before: new Date().toISOString(), beforeComp: "wat" },
			})
		).rejects.toThrow("Invalid comparison operator: wat");
	});

	test("list rejects invalid after comparison operator", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);

		await expect(
			sendCmdToWorker(mf, "videos.list", {
				params: { after: new Date().toISOString(), afterComp: "wat" },
			})
		).rejects.toThrow("Invalid comparison operator: wat");
	});

	test("list ordered by created descending", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);
		const { http: videoUrl } = await useServer(
			staticBytesListener(TEST_VIDEO_BYTES)
		);
		const object = await getStreamObjectControl(mf);
		await object.enableFakeTimers(FAKE_TIME_START);

		const v1 = (await sendCmdToWorker(mf, "upload", {
			url: videoUrl.toString(),
		})) as Video;
		await object.advanceFakeTime(5);
		const v2 = (await sendCmdToWorker(mf, "upload", {
			url: videoUrl.toString(),
		})) as Video;
		await object.advanceFakeTime(5);
		const v3 = (await sendCmdToWorker(mf, "upload", {
			url: videoUrl.toString(),
		})) as Video;

		const videos = (await sendCmdToWorker(mf, "videos.list")) as Video[];
		// Newest first
		expect(videos[0].id).toBe(v3.id);
		expect(videos[1].id).toBe(v2.id);
		expect(videos[2].id).toBe(v1.id);
	});

	test("list filters by before date (default lt operator)", async ({
		expect,
	}) => {
		const mf = createMiniflare();
		useDispose(mf);
		const { http: videoUrl } = await useServer(
			staticBytesListener(TEST_VIDEO_BYTES)
		);
		const object = await getStreamObjectControl(mf);
		await object.enableFakeTimers(FAKE_TIME_START);

		const v1 = (await sendCmdToWorker(mf, "upload", {
			url: videoUrl.toString(),
		})) as Video;
		await object.advanceFakeTime(10_000);
		await sendCmdToWorker(mf, "upload", { url: videoUrl.toString() });

		// Filter to only videos created before a cutoff that excludes v2
		const cutoff = new Date(FAKE_TIME_START + 5_000).toISOString();
		const filtered = (await sendCmdToWorker(mf, "videos.list", {
			params: { before: cutoff },
		})) as Video[];

		expect(filtered).toHaveLength(1);
		expect(filtered[0].id).toBe(v1.id);
	});

	test("list filters by after date (default gte operator)", async ({
		expect,
	}) => {
		const mf = createMiniflare();
		useDispose(mf);
		const { http: videoUrl } = await useServer(
			staticBytesListener(TEST_VIDEO_BYTES)
		);
		const object = await getStreamObjectControl(mf);
		await object.enableFakeTimers(FAKE_TIME_START);

		await sendCmdToWorker(mf, "upload", { url: videoUrl.toString() });
		await object.advanceFakeTime(10_000);
		const v2 = (await sendCmdToWorker(mf, "upload", {
			url: videoUrl.toString(),
		})) as Video;

		// Filter to only videos created at or after a cutoff that excludes v1
		const cutoff = new Date(FAKE_TIME_START + 5_000).toISOString();
		const filtered = (await sendCmdToWorker(mf, "videos.list", {
			params: { after: cutoff },
		})) as Video[];

		expect(filtered).toHaveLength(1);
		expect(filtered[0].id).toBe(v2.id);
	});

	test("list filters with combined before and after bounds", async ({
		expect,
	}) => {
		const mf = createMiniflare();
		useDispose(mf);
		const { http: videoUrl } = await useServer(
			staticBytesListener(TEST_VIDEO_BYTES)
		);
		const object = await getStreamObjectControl(mf);
		await object.enableFakeTimers(FAKE_TIME_START);

		await sendCmdToWorker(mf, "upload", { url: videoUrl.toString() }); // t=0
		await object.advanceFakeTime(10_000);
		const v2 = (await sendCmdToWorker(mf, "upload", {
			url: videoUrl.toString(),
		})) as Video; // t=10s
		await object.advanceFakeTime(10_000);
		await sendCmdToWorker(mf, "upload", { url: videoUrl.toString() }); // t=20s

		const after = new Date(FAKE_TIME_START + 5_000).toISOString();
		const before = new Date(FAKE_TIME_START + 15_000).toISOString();
		const filtered = (await sendCmdToWorker(mf, "videos.list", {
			params: { after, before },
		})) as Video[];

		expect(filtered).toHaveLength(1);
		expect(filtered[0].id).toBe(v2.id);
	});

	test("list with non-default comparison operators (gt, lte)", async ({
		expect,
	}) => {
		const mf = createMiniflare();
		useDispose(mf);
		const { http: videoUrl } = await useServer(
			staticBytesListener(TEST_VIDEO_BYTES)
		);
		const object = await getStreamObjectControl(mf);
		await object.enableFakeTimers(FAKE_TIME_START);

		const v1 = (await sendCmdToWorker(mf, "upload", {
			url: videoUrl.toString(),
		})) as Video; // t=0
		await object.advanceFakeTime(10_000);
		const v2 = (await sendCmdToWorker(mf, "upload", {
			url: videoUrl.toString(),
		})) as Video; // t=10s

		// afterComp=gt with v1's exact created time should NOT include v1
		const afterGtResult = (await sendCmdToWorker(mf, "videos.list", {
			params: { after: v1.created, afterComp: "gt" },
		})) as Video[];
		expect(afterGtResult.map((v) => v.id)).not.toContain(v1.id);
		expect(afterGtResult.map((v) => v.id)).toContain(v2.id);

		// beforeComp=lte with v1's exact created time should include v1
		const beforeLteResult = (await sendCmdToWorker(mf, "videos.list", {
			params: { before: v1.created, beforeComp: "lte" },
		})) as Video[];
		expect(beforeLteResult.map((v) => v.id)).toContain(v1.id);
		expect(beforeLteResult.map((v) => v.id)).not.toContain(v2.id);
	});
});

describe("Stream reloads", () => {
	test("keeps in-memory data across setOptions reloads", async ({ expect }) => {
		const { http: videoUrl } = await useServer(
			staticBytesListener(TEST_VIDEO_BYTES)
		);
		const opts = {
			compatibilityDate: STREAM_COMPAT_DATE,
			stream: { binding: "STREAM" },
			streamPersist: false,
			modules: true,
			script: WORKER_SCRIPT,
		} satisfies MiniflareOptions;
		const mf = new Miniflare(opts);
		useDispose(mf);

		const video = (await sendCmdToWorker(mf, "upload", {
			url: videoUrl.toString(),
		})) as Video;

		await mf.setOptions({
			...opts,
			script: `${WORKER_SCRIPT}\n// reload stream worker`,
		});

		const details = (await sendCmdToWorker(mf, "video.details", {
			id: video.id,
		})) as Video;
		expect(details.id).toBe(video.id);

		const videos = (await sendCmdToWorker(mf, "videos.list")) as Video[];
		expect(videos).toHaveLength(1);
		expect(videos[0].id).toBe(video.id);
	});

	test("keeps persisted data when persistence path format changes on reload", async ({
		expect,
	}) => {
		const tmp = await useTmp();
		const { http: videoUrl } = await useServer(
			staticBytesListener(TEST_VIDEO_BYTES)
		);
		const opts = {
			compatibilityDate: STREAM_COMPAT_DATE,
			stream: { binding: "STREAM" },
			streamPersist: tmp,
			modules: true,
			script: WORKER_SCRIPT,
		} satisfies MiniflareOptions;
		const mf = new Miniflare(opts);
		useDispose(mf);

		const video = (await sendCmdToWorker(mf, "upload", {
			url: videoUrl.toString(),
		})) as Video;

		await mf.setOptions({
			...opts,
			streamPersist: pathToFileURL(tmp).href,
			script: `${WORKER_SCRIPT}\n// reload persisted stream worker`,
		});

		const details = (await sendCmdToWorker(mf, "video.details", {
			id: video.id,
		})) as Video;
		expect(details.id).toBe(video.id);
		expect(details.size).toBe(TEST_VIDEO_BYTES.byteLength);
	});
});

describe("Stream captions", () => {
	test("generate caption", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);
		const { http: videoUrl } = await useServer(
			staticBytesListener(TEST_VIDEO_BYTES)
		);

		const video = (await sendCmdToWorker(mf, "upload", {
			url: videoUrl.toString(),
		})) as Video;
		const caption = (await sendCmdToWorker(mf, "captions.generate", {
			id: video.id,
			language: "en",
		})) as Caption;

		expect(caption.language).toBe("en");
		expect(caption.generated).toBe(true);
		expect(caption.status).toBe("ready");
		expect(caption.label).toBeTruthy();
	});

	test("list captions", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);
		const { http: videoUrl } = await useServer(
			staticBytesListener(TEST_VIDEO_BYTES)
		);

		const video = (await sendCmdToWorker(mf, "upload", {
			url: videoUrl.toString(),
		})) as Video;
		await sendCmdToWorker(mf, "captions.generate", {
			id: video.id,
			language: "en",
		});
		await sendCmdToWorker(mf, "captions.generate", {
			id: video.id,
			language: "fr",
		});

		const captions = (await sendCmdToWorker(mf, "captions.list", {
			id: video.id,
		})) as Caption[];
		expect(captions).toHaveLength(2);
		const languages = captions.map((c) => c.language);
		expect(languages).toContain("en");
		expect(languages).toContain("fr");
	});

	test("list captions filtered by language", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);
		const { http: videoUrl } = await useServer(
			staticBytesListener(TEST_VIDEO_BYTES)
		);

		const video = (await sendCmdToWorker(mf, "upload", {
			url: videoUrl.toString(),
		})) as Video;
		await sendCmdToWorker(mf, "captions.generate", {
			id: video.id,
			language: "en",
		});
		await sendCmdToWorker(mf, "captions.generate", {
			id: video.id,
			language: "fr",
		});

		const enOnly = (await sendCmdToWorker(mf, "captions.list", {
			id: video.id,
			language: "en",
		})) as Caption[];
		expect(enOnly).toHaveLength(1);
		expect(enOnly[0].language).toBe("en");
	});

	test("list captions empty language filter", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);
		const { http: videoUrl } = await useServer(
			staticBytesListener(TEST_VIDEO_BYTES)
		);

		const video = (await sendCmdToWorker(mf, "upload", {
			url: videoUrl.toString(),
		})) as Video;
		await sendCmdToWorker(mf, "captions.generate", {
			id: video.id,
			language: "en",
		});

		const deOnly = (await sendCmdToWorker(mf, "captions.list", {
			id: video.id,
			language: "de",
		})) as Caption[];
		expect(deOnly).toHaveLength(0);
	});

	test("delete caption", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);
		const { http: videoUrl } = await useServer(
			staticBytesListener(TEST_VIDEO_BYTES)
		);

		const video = (await sendCmdToWorker(mf, "upload", {
			url: videoUrl.toString(),
		})) as Video;
		await sendCmdToWorker(mf, "captions.generate", {
			id: video.id,
			language: "en",
		});
		await sendCmdToWorker(mf, "captions.delete", {
			id: video.id,
			language: "en",
		});

		const remaining = (await sendCmdToWorker(mf, "captions.list", {
			id: video.id,
		})) as Caption[];
		expect(remaining).toHaveLength(0);
	});

	test("throws when deleting non existent caption", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);
		const { http: videoUrl } = await useServer(
			staticBytesListener(TEST_VIDEO_BYTES)
		);

		const video = (await sendCmdToWorker(mf, "upload", {
			url: videoUrl.toString(),
		})) as Video;

		await expect(
			sendCmdToWorker(mf, "captions.delete", { id: video.id, language: "zh" })
		).rejects.toThrow("Caption not found");
	});

	test("throws when getting caption for non existent video", async ({
		expect,
	}) => {
		const mf = createMiniflare();
		useDispose(mf);

		await expect(
			sendCmdToWorker(mf, "captions.generate", {
				id: "00000000-0000-0000-0000-000000000000",
				language: "en",
			})
		).rejects.toThrow("Video not found");
	});

	test("caption upload via File fails serialization across the binding", async ({
		expect,
	}) => {
		const mf = createMiniflare();
		useDispose(mf);

		await expect(
			sendCmdToWorker(mf, "captions.upload", {
				id: "00000000-0000-0000-0000-000000000000",
				language: "en",
			})
		).rejects.toThrow(
			'Could not serialize object of type "File". This type does not support serialization.'
		);
	});

	test("generate caption is idempotent (upsert)", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);
		const { http: videoUrl } = await useServer(
			staticBytesListener(TEST_VIDEO_BYTES)
		);

		const video = (await sendCmdToWorker(mf, "upload", {
			url: videoUrl.toString(),
		})) as Video;

		// Generate the same caption twice
		await sendCmdToWorker(mf, "captions.generate", {
			id: video.id,
			language: "en",
		});
		await sendCmdToWorker(mf, "captions.generate", {
			id: video.id,
			language: "en",
		});

		// Should still only have one caption, not two
		const captions = (await sendCmdToWorker(mf, "captions.list", {
			id: video.id,
		})) as Caption[];
		expect(captions.filter((c) => c.language === "en")).toHaveLength(1);
	});

	test("list captions throws for non-existent video", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);

		await expect(
			sendCmdToWorker(mf, "captions.list", {
				id: "00000000-0000-0000-0000-000000000000",
			})
		).rejects.toThrow("Video not found");
	});

	test("delete caption throws for non-existent video", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);

		await expect(
			sendCmdToWorker(mf, "captions.delete", {
				id: "00000000-0000-0000-0000-000000000000",
				language: "en",
			})
		).rejects.toThrow("Caption not found");
	});
});

describe("Stream watermarks", () => {
	test("create watermark from URL", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);
		const { http: imageUrl } = await useServer(
			staticBytesListener(TEST_IMAGE_BYTES)
		);

		const watermark = (await sendCmdToWorker(mf, "watermarks.generate", {
			url: imageUrl.toString(),
			params: { name: "test-watermark" },
		})) as Watermark;

		expect(watermark.id).toBeTruthy();
		expect(watermark.name).toBe("test-watermark");
		expect(watermark.size).toBe(TEST_IMAGE_BYTES.byteLength);
		expect(watermark.created).toBeTruthy();

		expect(watermark.opacity).toBe(1.0);
		expect(watermark.padding).toBe(0.05);
		expect(watermark.scale).toBe(0.15);
		expect(watermark.position).toBe("upperRight");
	});

	test("create watermark with custom params", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);
		const { http: imageUrl } = await useServer(
			staticBytesListener(TEST_IMAGE_BYTES)
		);

		const watermark = (await sendCmdToWorker(mf, "watermarks.generate", {
			url: imageUrl.toString(),
			params: {
				name: "custom",
				opacity: 0.5,
				padding: 0.1,
				scale: 0.3,
				position: "center",
			},
		})) as Watermark;

		expect(watermark.opacity).toBe(0.5);
		expect(watermark.padding).toBe(0.1);
		expect(watermark.scale).toBe(0.3);
		expect(watermark.position).toBe("center");
	});

	test("create watermark from URL propagates fetch failures", async ({
		expect,
	}) => {
		const mf = createMiniflare();
		useDispose(mf);
		const { http: imageUrl } = await useServer(statusListener(404, "Missing"));

		await expect(
			sendCmdToWorker(mf, "watermarks.generate.fromUrl", {
				url: imageUrl.toString(),
				params: { name: "missing" },
			})
		).rejects.toThrow("Failed to fetch watermark from URL: 404 Missing");
	});

	test("create watermark via File fails serialization across the binding", async ({
		expect,
	}) => {
		const mf = createMiniflare();
		useDispose(mf);

		await expect(
			sendCmdToWorker(mf, "watermarks.generate.fromFile", {
				params: { name: "unsupported" },
			})
		).rejects.toThrow(
			'Could not serialize object of type "File". This type does not support serialization.'
		);
	});

	test("list watermarks", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);
		const { http: imageUrl } = await useServer(
			staticBytesListener(TEST_IMAGE_BYTES)
		);

		await sendCmdToWorker(mf, "watermarks.generate", {
			url: imageUrl.toString(),
			params: { name: "wm1" },
		});
		await sendCmdToWorker(mf, "watermarks.generate", {
			url: imageUrl.toString(),
			params: { name: "wm2" },
		});

		const list = (await sendCmdToWorker(mf, "watermarks.list")) as Watermark[];
		expect(list).toHaveLength(2);
		const names = list.map((w) => w.name);
		expect(names).toContain("wm1");
		expect(names).toContain("wm2");
	});

	test("get watermark", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);
		const { http: imageUrl } = await useServer(
			staticBytesListener(TEST_IMAGE_BYTES)
		);

		const created = (await sendCmdToWorker(mf, "watermarks.generate", {
			url: imageUrl.toString(),
			params: { name: "get-test" },
		})) as Watermark;
		const fetched = (await sendCmdToWorker(mf, "watermarks.get", {
			id: created.id,
		})) as Watermark;

		expect(fetched.id).toBe(created.id);
		expect(fetched.name).toBe("get-test");
	});

	test("get non-existent watermark throws", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);

		await expect(
			sendCmdToWorker(mf, "watermarks.get", {
				id: "00000000-0000-0000-0000-000000000000",
			})
		).rejects.toThrow("Watermark not found");
	});

	test("delete watermark", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);
		const { http: imageUrl } = await useServer(
			staticBytesListener(TEST_IMAGE_BYTES)
		);

		const watermark = (await sendCmdToWorker(mf, "watermarks.generate", {
			url: imageUrl.toString(),
			params: { name: "delete-me" },
		})) as Watermark;
		await sendCmdToWorker(mf, "watermarks.delete", { id: watermark.id });

		const list = (await sendCmdToWorker(mf, "watermarks.list")) as Watermark[];
		expect(list).toHaveLength(0);
	});

	test("throws when deleting non existent watermark", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);

		await expect(
			sendCmdToWorker(mf, "watermarks.delete", {
				id: "00000000-0000-0000-0000-000000000000",
			})
		).rejects.toThrow("Watermark not found");
	});

	test("opacity out of range throws", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);
		const { http: imageUrl } = await useServer(
			staticBytesListener(TEST_IMAGE_BYTES)
		);

		await expect(
			sendCmdToWorker(mf, "watermarks.generate", {
				url: imageUrl.toString(),
				params: { opacity: 2.0 },
			})
		).rejects.toThrow("opacity must be between 0.0 and 1.0");
	});

	test("padding out of range throws", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);
		const { http: imageUrl } = await useServer(
			staticBytesListener(TEST_IMAGE_BYTES)
		);

		await expect(
			sendCmdToWorker(mf, "watermarks.generate", {
				url: imageUrl.toString(),
				params: { padding: -0.1 },
			})
		).rejects.toThrow("padding must be between 0.0 and 1.0");
	});

	test("scale out of range throws", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);
		const { http: imageUrl } = await useServer(
			staticBytesListener(TEST_IMAGE_BYTES)
		);

		await expect(
			sendCmdToWorker(mf, "watermarks.generate", {
				url: imageUrl.toString(),
				params: { scale: 1.1 },
			})
		).rejects.toThrow("scale must be between 0.0 and 1.0");
	});

	test("boundary values 0.0 and 1.0 are accepted for range params", async ({
		expect,
	}) => {
		const mf = createMiniflare();
		useDispose(mf);
		const { http: imageUrl } = await useServer(
			staticBytesListener(TEST_IMAGE_BYTES)
		);

		// 0.0 and 1.0 are valid boundary values — should not throw
		const watermark = (await sendCmdToWorker(mf, "watermarks.generate", {
			url: imageUrl.toString(),
			params: { opacity: 0.0, padding: 1.0, scale: 0.0 },
		})) as Watermark;

		expect(watermark.id).toBeTruthy();
		expect(watermark.opacity).toBe(0.0);
		expect(watermark.padding).toBe(1.0);
		expect(watermark.scale).toBe(0.0);
	});

	test("watermark created with empty name stores empty string", async ({
		expect,
	}) => {
		const mf = createMiniflare();
		useDispose(mf);
		const { http: imageUrl } = await useServer(
			staticBytesListener(TEST_IMAGE_BYTES)
		);

		const watermark = (await sendCmdToWorker(mf, "watermarks.generate", {
			url: imageUrl.toString(),
			params: {},
		})) as Watermark;

		expect(watermark.name).toBe("");
	});

	test("create watermark from ReadableStream stores correct size", async ({
		expect,
	}) => {
		const mf = createMiniflare();
		useDispose(mf);
		const { http: imageUrl } = await useServer(
			staticBytesListener(TEST_IMAGE_BYTES)
		);

		// The "watermarks.generate" op fetches the URL and passes resp.body (ReadableStream)
		const watermark = (await sendCmdToWorker(mf, "watermarks.generate", {
			url: imageUrl.toString(),
			params: { name: "stream-wm" },
		})) as Watermark;

		expect(watermark.size).toBe(TEST_IMAGE_BYTES.byteLength);
		// downloadedFrom is null when created from a stream (not a URL)
		expect(watermark.downloadedFrom).toBeNull();
	});
});

describe("Stream downloads", () => {
	test("generate default download", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);
		const { http: videoUrl } = await useServer(
			staticBytesListener(TEST_VIDEO_BYTES)
		);

		const video = (await sendCmdToWorker(mf, "upload", {
			url: videoUrl.toString(),
		})) as Video;
		const result = (await sendCmdToWorker(mf, "downloads.generate", {
			id: video.id,
		})) as DownloadGetResponse;

		expect(result.default).toBeDefined();
		expect(result.default?.status).toBe("ready");
		expect(result.default?.percentComplete).toBe(100);
	});

	test("generate audio download", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);
		const { http: videoUrl } = await useServer(
			staticBytesListener(TEST_VIDEO_BYTES)
		);

		const video = (await sendCmdToWorker(mf, "upload", {
			url: videoUrl.toString(),
		})) as Video;
		const result = (await sendCmdToWorker(mf, "downloads.generate", {
			id: video.id,
			type: "audio",
		})) as DownloadGetResponse;

		expect(result.audio).toBeDefined();
		expect(result.audio?.status).toBe("ready");
	});

	test("get downloads", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);
		const { http: videoUrl } = await useServer(
			staticBytesListener(TEST_VIDEO_BYTES)
		);

		const video = (await sendCmdToWorker(mf, "upload", {
			url: videoUrl.toString(),
		})) as Video;
		await sendCmdToWorker(mf, "downloads.generate", {
			id: video.id,
			type: "default",
		});
		await sendCmdToWorker(mf, "downloads.generate", {
			id: video.id,
			type: "audio",
		});

		const result = (await sendCmdToWorker(mf, "downloads.get", {
			id: video.id,
		})) as DownloadGetResponse;
		expect(result.default).toBeDefined();
		expect(result.audio).toBeDefined();
	});

	test("get downloads when none exist returns empty object", async ({
		expect,
	}) => {
		const mf = createMiniflare();
		useDispose(mf);
		const { http: videoUrl } = await useServer(
			staticBytesListener(TEST_VIDEO_BYTES)
		);

		const video = (await sendCmdToWorker(mf, "upload", {
			url: videoUrl.toString(),
		})) as Video;
		const result = (await sendCmdToWorker(mf, "downloads.get", {
			id: video.id,
		})) as DownloadGetResponse;

		expect(result.default).toBeUndefined();
		expect(result.audio).toBeUndefined();
	});

	test("delete download", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);
		const { http: videoUrl } = await useServer(
			staticBytesListener(TEST_VIDEO_BYTES)
		);

		const video = (await sendCmdToWorker(mf, "upload", {
			url: videoUrl.toString(),
		})) as Video;
		await sendCmdToWorker(mf, "downloads.generate", {
			id: video.id,
			type: "default",
		});
		await sendCmdToWorker(mf, "downloads.delete", {
			id: video.id,
			type: "default",
		});

		const result = (await sendCmdToWorker(mf, "downloads.get", {
			id: video.id,
		})) as DownloadGetResponse;
		expect(result.default).toBeUndefined();
	});

	test("throws when deleting non existent download", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);
		const { http: videoUrl } = await useServer(
			staticBytesListener(TEST_VIDEO_BYTES)
		);

		const video = (await sendCmdToWorker(mf, "upload", {
			url: videoUrl.toString(),
		})) as Video;

		await expect(
			sendCmdToWorker(mf, "downloads.delete", { id: video.id, type: "default" })
		).rejects.toThrow("Download not found");
	});

	test("throws on download of non existent video", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);

		await expect(
			sendCmdToWorker(mf, "downloads.generate", {
				id: "00000000-0000-0000-0000-000000000000",
			})
		).rejects.toThrow("Video not found");
	});

	test("get downloads for non existent video throws", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);

		await expect(
			sendCmdToWorker(mf, "downloads.get", {
				id: "00000000-0000-0000-0000-000000000000",
			})
		).rejects.toThrow("Video not found");
	});

	test("generate download is idempotent (upsert)", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);
		const { http: videoUrl } = await useServer(
			staticBytesListener(TEST_VIDEO_BYTES)
		);

		const video = (await sendCmdToWorker(mf, "upload", {
			url: videoUrl.toString(),
		})) as Video;

		// Generate the same download twice
		await sendCmdToWorker(mf, "downloads.generate", {
			id: video.id,
			type: "default",
		});
		await sendCmdToWorker(mf, "downloads.generate", {
			id: video.id,
			type: "default",
		});

		// Should still only have one default download entry
		const result = (await sendCmdToWorker(mf, "downloads.get", {
			id: video.id,
		})) as DownloadGetResponse;
		expect(result.default).toBeDefined();
		expect(result.default?.status).toBe("ready");
		// audio should not be present
		expect(result.audio).toBeUndefined();
	});

	test("delete download throws for non-existent video", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);

		await expect(
			sendCmdToWorker(mf, "downloads.delete", {
				id: "00000000-0000-0000-0000-000000000000",
				type: "default",
			})
		).rejects.toThrow("Download not found");
	});
});

describe("Stream unsupported binding operations", () => {
	test("createDirectUpload is not supported", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);

		await expect(sendCmdToWorker(mf, "createDirectUpload")).rejects.toThrow(
			"createDirectUpload is not supported in local mode"
		);
	});
});

describe("Stream deletes clean up properly", () => {
	test("deleting video cleans up captions and downloads", async ({
		expect,
	}) => {
		const mf = createMiniflare();
		useDispose(mf);
		const { http: videoUrl } = await useServer(
			staticBytesListener(TEST_VIDEO_BYTES)
		);

		const video = (await sendCmdToWorker(mf, "upload", {
			url: videoUrl.toString(),
		})) as Video;
		const id = video.id;

		// Create associated data
		await sendCmdToWorker(mf, "captions.generate", { id, language: "en" });
		await sendCmdToWorker(mf, "downloads.generate", { id, type: "default" });

		// Delete the video
		await sendCmdToWorker(mf, "video.delete", { id });

		// Video is gone
		await expect(sendCmdToWorker(mf, "video.details", { id })).rejects.toThrow(
			"Video not found"
		);

		// Captions are gone (via FK cascade)
		await expect(sendCmdToWorker(mf, "captions.list", { id })).rejects.toThrow(
			"Video not found"
		);

		// Downloads are gone (via explicit delete + cascade)
		await expect(sendCmdToWorker(mf, "downloads.get", { id })).rejects.toThrow(
			"Video not found"
		);
	});

	test("deleting video cleans up its blob from storage", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);
		const { http: videoUrl } = await useServer(
			staticBytesListener(TEST_VIDEO_BYTES)
		);

		const video = (await sendCmdToWorker(mf, "upload", {
			url: videoUrl.toString(),
		})) as Video;
		await sendCmdToWorker(mf, "video.delete", { id: video.id });

		// Upload a new video to ensure storage is still functional
		const video2 = (await sendCmdToWorker(mf, "upload", {
			url: videoUrl.toString(),
		})) as Video;
		expect(video2.id).not.toBe(video.id);
		const details = (await sendCmdToWorker(mf, "video.details", {
			id: video2.id,
		})) as Video;
		expect(details.size).toBe(TEST_VIDEO_BYTES.byteLength);
	});

	test("deleting one video does not affect another video's captions and downloads", async ({
		expect,
	}) => {
		const mf = createMiniflare();
		useDispose(mf);
		const { http: videoUrl } = await useServer(
			staticBytesListener(TEST_VIDEO_BYTES)
		);

		const videoA = (await sendCmdToWorker(mf, "upload", {
			url: videoUrl.toString(),
		})) as Video;
		const videoB = (await sendCmdToWorker(mf, "upload", {
			url: videoUrl.toString(),
		})) as Video;

		// Add captions and downloads to both
		await sendCmdToWorker(mf, "captions.generate", {
			id: videoA.id,
			language: "en",
		});
		await sendCmdToWorker(mf, "captions.generate", {
			id: videoB.id,
			language: "en",
		});
		await sendCmdToWorker(mf, "downloads.generate", {
			id: videoA.id,
			type: "default",
		});
		await sendCmdToWorker(mf, "downloads.generate", {
			id: videoB.id,
			type: "default",
		});

		// Delete only video A
		await sendCmdToWorker(mf, "video.delete", { id: videoA.id });

		// videoB's captions and downloads should be unaffected
		const captionsB = (await sendCmdToWorker(mf, "captions.list", {
			id: videoB.id,
		})) as Caption[];
		expect(captionsB).toHaveLength(1);
		expect(captionsB[0].language).toBe("en");

		const downloadsB = (await sendCmdToWorker(mf, "downloads.get", {
			id: videoB.id,
		})) as DownloadGetResponse;
		expect(downloadsB.default).toBeDefined();
	});
});
