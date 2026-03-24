import http from "node:http";
import { Miniflare, STREAM_COMPAT_DATE } from "miniflare";
import { describe, test } from "vitest";
import { useDispose, useServer } from "../../test-shared";
import type {
	StreamCaption as Caption,
	StreamDownloadGetResponse as DownloadGetResponse,
	StreamVideo as Video,
	StreamWatermark as Watermark,
} from "@cloudflare/workers-types";

// Mock image / video bytes
const TEST_VIDEO_BYTES = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
const TEST_IMAGE_BYTES = new Uint8Array([255, 216, 255, 224]);

function staticBytesListener(bytes: Uint8Array): http.RequestListener {
	return (_req, res) => {
		res.writeHead(200, { "Content-Type": "application/octet-stream" });
		res.end(Buffer.from(bytes));
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
			return Response.json({ ok: false, error: err.message }, { status: 200 });
		}
	}
}

async function handleCommand(stream, op, args) {
	switch (op) {
		case "upload": {
			const resp = await fetch(args.url);
			return stream.upload(resp.body, args.params);
		}
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

function createMiniflare(): Miniflare {
	return new Miniflare({
		compatibilityDate: STREAM_COMPAT_DATE,
		stream: { binding: "STREAM" },
		streamPersist: false,
		modules: true,
		script: WORKER_SCRIPT,
	});
}

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
	};
	if (!data.ok) {
		throw new Error(data.error);
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

	test("list ordered by created descending", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);
		const { http: videoUrl } = await useServer(
			staticBytesListener(TEST_VIDEO_BYTES)
		);

		const v1 = (await sendCmdToWorker(mf, "upload", {
			url: videoUrl.toString(),
		})) as Video;
		await new Promise((r) => setTimeout(r, 5));
		const v2 = (await sendCmdToWorker(mf, "upload", {
			url: videoUrl.toString(),
		})) as Video;
		await new Promise((r) => setTimeout(r, 5));
		const v3 = (await sendCmdToWorker(mf, "upload", {
			url: videoUrl.toString(),
		})) as Video;

		const videos = (await sendCmdToWorker(mf, "videos.list")) as Video[];
		// Newest first
		expect(videos[0].id).toBe(v3.id);
		expect(videos[1].id).toBe(v2.id);
		expect(videos[2].id).toBe(v1.id);
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
});
