import { Miniflare } from "miniflare";
import { describe, test } from "vitest";
import { useDispose } from "../../test-shared";

const TEST_VIDEO_BYTES = new Uint8Array([1, 2, 3, 4, 5]);

function createMiniflare(): Miniflare {
	return new Miniflare({
		compatibilityDate: "2026-03-16",
		stream: { binding: "STREAM" },
		streamPersist: false,
		modules: true,
		script: `export default { fetch() { return new Response(null, { status: 404 }); } }`,
	});
}

function createVideoFile() {
	return new File([TEST_VIDEO_BYTES], "test.mp4", { type: "video/mp4" });
}

function createUploadForm(file = createVideoFile()) {
	const form = new FormData();
	form.set("file", file);
	return form;
}

function toDispatchUrl(path: string) {
	return new URL(path, "http://localhost").toString();
}

describe("Stream local binding", () => {
	test("accepts direct uploads via reserved route", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);
		const stream = await mf.getStreamBinding("STREAM");

		const directUpload = await stream.createDirectUpload({
			maxDurationSeconds: 60,
			creator: "bob",
			meta: { source: "direct" },
		});
		expect(directUpload.uploadURL).toMatch(
			/^\/cdn-cgi\/handler\/stream\/STREAM\/direct-upload\//
		);

		const form = createUploadForm();
		const uploadResponse = await mf.dispatchFetch(
			toDispatchUrl(directUpload.uploadURL),
			{
				method: "POST",
				body: form,
			}
		);
		expect(uploadResponse.status).toBe(200);

		const body = (await uploadResponse.json()) as {
			success: boolean;
			result: { id: string };
		};
		expect(body.success).toBe(true);
		expect(body.result.id).toBe(directUpload.id);

		const details = await stream.video(directUpload.id).details();
		expect(details.creator).toBe("bob");
		expect(details.meta).toEqual({ source: "direct" });

		const secondUpload = await mf.dispatchFetch(
			toDispatchUrl(directUpload.uploadURL),
			{
				method: "POST",
				body: form,
			}
		);
		expect(secondUpload.status).toBe(409);
		await secondUpload.text();
	});

	test("manages video records created via direct uploads", async ({
		expect,
	}) => {
		const mf = createMiniflare();
		useDispose(mf);
		const stream = await mf.getStreamBinding("STREAM");

		const firstDirectUpload = await stream.createDirectUpload({
			creator: "alice",
			maxDurationSeconds: 60,
			meta: { source: "direct" },
		});
		const firstUploadResponse = await mf.dispatchFetch(
			toDispatchUrl(firstDirectUpload.uploadURL),
			{
				body: TEST_VIDEO_BYTES,
				headers: { "content-type": "video/mp4" },
				method: "PUT",
			}
		);
		expect(firstUploadResponse.status).toBe(200);
		await firstUploadResponse.text();

		const secondDirectUpload = await stream.createDirectUpload({
			maxDurationSeconds: 60,
		});
		const secondUploadResponse = await mf.dispatchFetch(
			toDispatchUrl(secondDirectUpload.uploadURL),
			{
				body: TEST_VIDEO_BYTES,
				headers: { "content-type": "video/mp4" },
				method: "PUT",
			}
		);
		expect(secondUploadResponse.status).toBe(200);
		await secondUploadResponse.text();

		const firstVideo = await stream.video(firstDirectUpload.id).details();
		const secondVideo = await stream.video(secondDirectUpload.id).details();

		expect(firstVideo.creator).toBe("alice");
		expect(firstVideo.meta).toEqual({ source: "direct" });
		expect(firstVideo.size).toBe(TEST_VIDEO_BYTES.byteLength);

		const listedVideos = await stream.videos.list();
		expect(listedVideos).toHaveLength(2);
		expect(listedVideos.map((video) => video.id)).toEqual(
			expect.arrayContaining([firstVideo.id, secondVideo.id])
		);

		const listedFirstVideo = listedVideos[0];
		const listedSecondVideo = listedVideos[1];
		if (!listedFirstVideo || !listedSecondVideo) {
			throw new Error("Expected listed videos");
		}

		expect(
			(await stream.videos.list({ limit: 1 })).map((video) => video.id)
		).toEqual([listedFirstVideo.id]);
		expect(
			(await stream.videos.list({ after: listedFirstVideo.id })).map(
				(video) => video.id
			)
		).toEqual([listedSecondVideo.id]);
		expect(
			(await stream.videos.list({ before: listedSecondVideo.id })).map(
				(video) => video.id
			)
		).toEqual([listedFirstVideo.id]);

		const updatedFirstVideo = await stream.video(firstVideo.id).update({
			creator: "carol",
			meta: { source: "updated" },
			allowedOrigins: ["https://example.com"],
			requireSignedURLs: true,
		});
		expect(updatedFirstVideo.creator).toBe("carol");
		expect(updatedFirstVideo.meta).toEqual({ source: "updated" });
		expect(updatedFirstVideo.allowedOrigins).toEqual(["https://example.com"]);
		expect(updatedFirstVideo.requireSignedURLs).toBe(true);

		const tokenPayload = JSON.parse(
			atob(await stream.video(firstVideo.id).generateToken())
		) as {
			binding: string;
			videoId: string;
		};
		expect(tokenPayload).toEqual({
			binding: "STREAM",
			videoId: firstVideo.id,
		});

		await stream.video(firstVideo.id).delete();
		expect(() => stream.video(firstVideo.id).details()).toThrow(
			/Video not found/
		);
		expect((await stream.videos.list()).map((video) => video.id)).toEqual([
			secondVideo.id,
		]);
	});

	test("validates direct uploads and accepts raw PUT bodies", async ({
		expect,
	}) => {
		const mf = createMiniflare();
		useDispose(mf);
		const stream = await mf.getStreamBinding("STREAM");

		const methodUpload = await stream.createDirectUpload({
			maxDurationSeconds: 60,
		});
		const methodResponse = await mf.dispatchFetch(
			toDispatchUrl(methodUpload.uploadURL)
		);
		expect(methodResponse.status).toBe(405);
		expect(methodResponse.headers.get("allow")).toBe("POST, PUT");
		await methodResponse.text();

		const unknownUploadResponse = await mf.dispatchFetch(
			toDispatchUrl("/cdn-cgi/handler/stream/STREAM/direct-upload/unknown"),
			{
				body: createUploadForm(),
				method: "POST",
			}
		);
		expect(unknownUploadResponse.status).toBe(404);
		await unknownUploadResponse.text();

		const missingFileUpload = await stream.createDirectUpload({
			maxDurationSeconds: 60,
		});
		const missingFileResponse = await mf.dispatchFetch(
			toDispatchUrl(missingFileUpload.uploadURL),
			{
				body: new URLSearchParams({ note: "missing" }),
				headers: {
					"content-type": "application/x-www-form-urlencoded",
				},
				method: "POST",
			}
		);
		expect(missingFileResponse.status).toBe(400);
		await missingFileResponse.text();

		const recoveredResponse = await mf.dispatchFetch(
			toDispatchUrl(missingFileUpload.uploadURL),
			{
				body: createUploadForm(),
				method: "POST",
			}
		);
		expect(recoveredResponse.status).toBe(200);
		const recoveredBody = (await recoveredResponse.json()) as {
			result: { id: string };
			success: boolean;
		};
		expect(recoveredBody.success).toBe(true);
		expect(recoveredBody.result.id).toBe(missingFileUpload.id);

		const rawUpload = await stream.createDirectUpload({
			maxDurationSeconds: 60,
			creator: "put",
		});
		const putResponse = await mf.dispatchFetch(
			toDispatchUrl(rawUpload.uploadURL),
			{
				body: TEST_VIDEO_BYTES,
				headers: { "content-type": "video/mp4" },
				method: "PUT",
			}
		);
		expect(putResponse.status).toBe(200);
		const putBody = (await putResponse.json()) as {
			result: { id: string };
			success: boolean;
		};
		expect(putBody.success).toBe(true);
		expect(putBody.result.id).toBe(rawUpload.id);

		const putDetails = await stream.video(rawUpload.id).details();
		expect(putDetails.creator).toBe("put");
		expect(putDetails.size).toBe(TEST_VIDEO_BYTES.byteLength);

		const secondPutResponse = await mf.dispatchFetch(
			toDispatchUrl(rawUpload.uploadURL),
			{
				body: TEST_VIDEO_BYTES,
				headers: { "content-type": "video/mp4" },
				method: "PUT",
			}
		);
		expect(secondPutResponse.status).toBe(409);
		await secondPutResponse.text();
	});

	test("manages watermark lifecycle and serves uploaded watermark files", async ({
		expect,
	}) => {
		const mf = createMiniflare();
		useDispose(mf);
		const stream = await mf.getStreamBinding("STREAM");

		const remoteWatermark = await stream.watermarks.generate(
			"https://example.com/logo.png",
			{
				name: "remote",
				opacity: 0.8,
			}
		);

		const remoteWatermarkUrl = `/cdn-cgi/handler/stream/STREAM/watermarks/${remoteWatermark.id}`;

		expect(await stream.watermarks.get(remoteWatermark.id)).toEqual(
			expect.objectContaining({
				id: remoteWatermark.id,
				name: "remote",
				opacity: 0.8,
			})
		);

		const listedWatermarks = await stream.watermarks.list();
		expect(listedWatermarks).toHaveLength(1);
		expect(listedWatermarks.map((watermark) => watermark.id)).toEqual([
			remoteWatermark.id,
		]);

		const remoteWatermarkResponse = await mf.dispatchFetch(
			toDispatchUrl(remoteWatermarkUrl)
		);
		expect(remoteWatermarkResponse.status).toBe(404);
		await remoteWatermarkResponse.text();

		await stream.watermarks.delete(remoteWatermark.id);
		expect(await stream.watermarks.list()).toEqual([]);
	});

	test("does not serve fake local assets", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);
		const stream = await mf.getStreamBinding("STREAM");

		const directUpload = await stream.createDirectUpload({
			maxDurationSeconds: 60,
		});
		const form = createUploadForm();
		const uploadResponse = await mf.dispatchFetch(
			toDispatchUrl(directUpload.uploadURL),
			{
				method: "POST",
				body: form,
			}
		);
		expect(uploadResponse.status).toBe(200);
		await uploadResponse.text();

		const videoHandle = stream.video(directUpload.id);
		const video = await videoHandle.details();

		const captionResponse = await mf.dispatchFetch(
			toDispatchUrl(
				`/cdn-cgi/handler/stream/STREAM/videos/${directUpload.id}/captions/en.vtt`
			)
		);
		expect(captionResponse.status).toBe(404);
		await captionResponse.text();

		const unsupportedUrls = [
			video.preview,
			video.thumbnail,
			video.hlsPlaybackUrl,
			video.dashPlaybackUrl,
		].filter((url): url is string => url !== undefined);
		expect(unsupportedUrls).toHaveLength(4);

		for (const url of unsupportedUrls) {
			const response = await mf.dispatchFetch(toDispatchUrl(url));
			expect(response.status).toBe(404);
			await response.text();
		}

		expect(() => videoHandle.captions.generate("fr")).toThrow(
			/Caption generation is not implemented/
		);
		expect(await videoHandle.captions.list()).toEqual([]);
		expect(() => videoHandle.downloads.get()).toThrow(
			/Downloads are not implemented/
		);
		expect(() => videoHandle.downloads.generate()).toThrow(
			/Downloads are not implemented/
		);
		expect(() => videoHandle.downloads.delete()).toThrow(
			/Downloads are not implemented/
		);
	});
});
