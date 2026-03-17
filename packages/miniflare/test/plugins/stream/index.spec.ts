import { Miniflare } from "miniflare";
import { describe, test } from "vitest";
import { useDispose, useServer } from "../../test-shared";

const TEST_VIDEO_BYTES = new Uint8Array([1, 2, 3, 4, 5]);
const TEST_WATERMARK_BYTES = new Uint8Array([137, 80, 78, 71]);

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

function createWatermarkFile() {
	return new File([TEST_WATERMARK_BYTES], "watermark.png", {
		type: "image/png",
	});
}

function createCaptionFile(text: string) {
	return new File(
		[`WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n${text}\n`],
		"captions.vtt",
		{
			type: "text/vtt",
		}
	);
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

	test("uploads videos from URLs and manages video records", async ({
		expect,
	}) => {
		const mf = createMiniflare();
		useDispose(mf);
		const stream = await mf.getStreamBinding("STREAM");
		const { http } = await useServer((req, res) => {
			if (req.url === "/missing.mp4") {
				res.statusCode = 404;
				res.end("missing");
				return;
			}

			res.setHeader("content-type", "video/mp4");
			res.end(TEST_VIDEO_BYTES);
		});

		const firstVideo = await stream.upload(
			new URL("/first.mp4", http).toString(),
			{
				creator: "alice",
				meta: { source: "url" },
			}
		);
		const secondVideo = await stream.upload(
			new URL("/second.mp4", http).toString()
		);

		expect(firstVideo.creator).toBe("alice");
		expect(firstVideo.meta).toEqual({ source: "url" });
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

		await expect(stream.upload(createVideoFile())).rejects.toThrow(
			/Not implemented/
		);
		await expect(
			stream.upload(new URL("/missing.mp4", http).toString())
		).rejects.toThrow(/Failed to fetch upload URL: 404/);

		await stream.video(firstVideo.id).delete();
		await expect(stream.video(firstVideo.id).details()).rejects.toThrow(
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
		const invalidForm = new FormData();
		invalidForm.set("note", "missing");
		const missingFileResponse = await mf.dispatchFetch(
			toDispatchUrl(missingFileUpload.uploadURL),
			{
				body: invalidForm,
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

		const fileWatermark = await stream.watermarks.generate(
			createWatermarkFile(),
			{
				name: "logo",
				opacity: 0.5,
				padding: 0.1,
				scale: 0.2,
			}
		);
		const remoteWatermark = await stream.watermarks.generate(
			"https://example.com/logo.png",
			{
				name: "remote",
				opacity: 0.8,
			}
		);

		const watermarkUrl = `/cdn-cgi/handler/stream/STREAM/watermarks/${fileWatermark.id}`;
		const remoteWatermarkUrl = `/cdn-cgi/handler/stream/STREAM/watermarks/${remoteWatermark.id}`;

		expect(await stream.watermarks.get(fileWatermark.id)).toEqual(
			expect.objectContaining({
				id: fileWatermark.id,
				name: "logo",
				opacity: 0.5,
				padding: 0.1,
				scale: 0.2,
			})
		);
		expect(await stream.watermarks.get(remoteWatermark.id)).toEqual(
			expect.objectContaining({
				id: remoteWatermark.id,
				name: "remote",
				opacity: 0.8,
			})
		);

		const listedWatermarks = await stream.watermarks.list();
		expect(listedWatermarks).toHaveLength(2);
		expect(listedWatermarks.map((watermark) => watermark.id)).toEqual(
			expect.arrayContaining([fileWatermark.id, remoteWatermark.id])
		);

		const watermarkResponse = await mf.dispatchFetch(
			toDispatchUrl(watermarkUrl)
		);
		expect(watermarkResponse.status).toBe(200);
		expect(watermarkResponse.headers.get("content-type")).toBe("image/png");
		expect(new Uint8Array(await watermarkResponse.arrayBuffer())).toEqual(
			TEST_WATERMARK_BYTES
		);

		const remoteWatermarkResponse = await mf.dispatchFetch(
			toDispatchUrl(remoteWatermarkUrl)
		);
		expect(remoteWatermarkResponse.status).toBe(404);
		await remoteWatermarkResponse.text();

		await stream.watermarks.delete(fileWatermark.id);
		await expect(stream.watermarks.get(fileWatermark.id)).rejects.toThrow(
			/Watermark not found/
		);
		const deletedWatermarkResponse = await mf.dispatchFetch(
			toDispatchUrl(watermarkUrl)
		);
		expect(deletedWatermarkResponse.status).toBe(404);
		await deletedWatermarkResponse.text();

		await stream.watermarks.delete(remoteWatermark.id);
		expect(await stream.watermarks.list()).toEqual([]);
	});

	test("serves real uploaded captions but no fake local assets", async ({
		expect,
	}) => {
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

		const videoHandle = stream.video(directUpload.id);
		const video = await videoHandle.details();
		await videoHandle.captions.upload(
			"en",
			createCaptionFile("Uploaded caption")
		);
		await videoHandle.captions.upload(
			"fr",
			createCaptionFile("French caption")
		);

		expect(await videoHandle.captions.list()).toEqual([
			{
				generated: false,
				label: "EN",
				language: "en",
				status: "ready",
			},
			{
				generated: false,
				label: "FR",
				language: "fr",
				status: "ready",
			},
		]);
		expect(await videoHandle.captions.list("fr")).toEqual([
			{
				generated: false,
				label: "FR",
				language: "fr",
				status: "ready",
			},
		]);

		await videoHandle.captions.upload(
			"en",
			createCaptionFile("Updated caption")
		);

		const captionResponse = await mf.dispatchFetch(
			toDispatchUrl(
				`/cdn-cgi/handler/stream/STREAM/videos/${directUpload.id}/captions/en.vtt`
			)
		);
		expect(captionResponse.status).toBe(200);
		expect(await captionResponse.text()).toContain("Updated caption");

		await videoHandle.captions.delete("fr");
		expect(await videoHandle.captions.list()).toEqual([
			{
				generated: false,
				label: "EN",
				language: "en",
				status: "ready",
			},
		]);

		const deletedCaptionResponse = await mf.dispatchFetch(
			toDispatchUrl(
				`/cdn-cgi/handler/stream/STREAM/videos/${directUpload.id}/captions/fr.vtt`
			)
		);
		expect(deletedCaptionResponse.status).toBe(404);
		await deletedCaptionResponse.text();

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

		await expect(videoHandle.captions.generate("fr")).rejects.toThrow(
			/Caption generation is not implemented/
		);
		await expect(videoHandle.downloads.get()).rejects.toThrow(
			/Downloads are not implemented/
		);
		await expect(videoHandle.downloads.generate()).rejects.toThrow(
			/Downloads are not implemented/
		);
		await expect(videoHandle.downloads.delete()).rejects.toThrow(
			/Downloads are not implemented/
		);
	});
});
