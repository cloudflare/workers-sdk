import { Miniflare } from "miniflare";
import { describe, test } from "vitest";
import { useDispose } from "../../test-shared";

const TEST_VIDEO_BYTES = new Uint8Array([1, 2, 3, 4, 5]);

function createMiniflare(): Miniflare {
	return new Miniflare({
		compatibilityDate: "2025-04-01",
		stream: { binding: "STREAM" },
		streamPersist: false,
		modules: true,
		script: `export default { fetch() { return new Response(null, { status: 404 }); } }`,
	});
}

function createVideoFile() {
	return new File([TEST_VIDEO_BYTES], "test.mp4", { type: "video/mp4" });
}

function toDispatchUrl(path: string) {
	return new URL(path, "http://localhost").toString();
}

describe("Stream local binding", () => {
	test("uploads videos and stores metadata", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);
		const stream = await mf.getStreamBinding("STREAM");

		const video = await stream.upload(createVideoFile());
		expect(video.id).toBeDefined();
		expect(video.status.state).toBe("ready");
		expect(video.hlsPlaybackUrl).toBe(
			`/cdn-cgi/handler/stream/STREAM/videos/${video.id}/manifest/video.m3u8`
		);

		const details = await stream.video(video.id).details();
		expect(details.id).toBe(video.id);
		expect(details.size).toBe(TEST_VIDEO_BYTES.byteLength);

		const list = await stream.videos.list();
		expect(list).toHaveLength(1);
		expect(list[0].id).toBe(video.id);
	});

	test("updates captions and serves stored blobs", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);
		const stream = await mf.getStreamBinding("STREAM");

		const video = await stream.upload(createVideoFile());
		const updated = await stream.video(video.id).update({
			creator: "alice",
			meta: { title: "demo" },
			requireSignedURLs: true,
		});
		expect(updated.creator).toBe("alice");
		expect(updated.meta).toEqual({ title: "demo" });
		expect(updated.requireSignedURLs).toBe(true);

		const caption = await stream.video(video.id).captions.generate("en");
		expect(caption.generated).toBe(true);
		expect(caption.status).toBe("ready");

		const captions = await stream.video(video.id).captions.list();
		expect(captions).toHaveLength(1);
		expect(captions[0].language).toBe("en");

		const videoResponse = await mf.dispatchFetch(toDispatchUrl(video.preview));
		expect(videoResponse.status).toBe(200);
		expect(videoResponse.headers.get("content-type")).toContain("image/svg+xml");
		expect(await videoResponse.text()).toContain("<svg");

		const captionResponse = await mf.dispatchFetch(
			toDispatchUrl(
				`/cdn-cgi/handler/stream/STREAM/videos/${video.id}/captions/en.vtt`
			)
		);
		expect(captionResponse.status).toBe(200);
		expect(await captionResponse.text()).toContain("Lorem ipsum");

		await stream.video(video.id).captions.upload(
			"en",
			new File(
				["WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nUpdated caption\n"],
				"captions.vtt",
				{
					type: "text/vtt",
				}
			)
		);
		const replacedCaptionResponse = await mf.dispatchFetch(
			toDispatchUrl(
				`/cdn-cgi/handler/stream/STREAM/videos/${video.id}/captions/en.vtt`
			)
		);
		expect(replacedCaptionResponse.status).toBe(200);
		expect(await replacedCaptionResponse.text()).toContain("Updated caption");
	});

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

		const form = new FormData();
		form.set("file", createVideoFile());
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

		const secondUpload = await mf.dispatchFetch(toDispatchUrl(directUpload.uploadURL), {
			method: "POST",
			body: form,
		});
		expect(secondUpload.status).toBe(409);
	});

	test("restores direct upload tokens after invalid multipart submissions", async ({
		expect,
	}) => {
		const mf = createMiniflare();
		useDispose(mf);
		const stream = await mf.getStreamBinding("STREAM");

		const directUpload = await stream.createDirectUpload({
			maxDurationSeconds: 60,
		});

		const invalidForm = new FormData();
		invalidForm.set("not-file", "nope");
		const invalidUpload = await mf.dispatchFetch(toDispatchUrl(directUpload.uploadURL), {
			method: "POST",
			body: invalidForm,
		});
		expect(invalidUpload.status).toBe(400);

		const validForm = new FormData();
		validForm.set("file", createVideoFile());
		const validUpload = await mf.dispatchFetch(toDispatchUrl(directUpload.uploadURL), {
			method: "POST",
			body: validForm,
		});
		expect(validUpload.status).toBe(200);
	});

	test("deletes uploaded videos", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);
		const stream = await mf.getStreamBinding("STREAM");

		const video = await stream.upload(createVideoFile());
		await stream.video(video.id).delete();

		const list = await stream.videos.list();
		expect(list).toHaveLength(0);

		const response = await mf.dispatchFetch(toDispatchUrl(video.preview));
		expect(response.status).toBe(404);
	});

	test("paginates video listings using returned ids as cursors", async ({ expect }) => {
		const mf = createMiniflare();
		useDispose(mf);
		const stream = await mf.getStreamBinding("STREAM");

		const first = await stream.upload(
			new File([new Uint8Array([1])], "first.mp4", { type: "video/mp4" })
		);
		const second = await stream.upload(
			new File([new Uint8Array([2])], "second.mp4", { type: "video/mp4" })
		);
		const third = await stream.upload(
			new File([new Uint8Array([3])], "third.mp4", { type: "video/mp4" })
		);

		expect((await stream.videos.list()).map((video) => video.id)).toEqual([
			first.id,
			second.id,
			third.id,
		]);
		expect(
			(await stream.videos.list({ after: first.id })).map((video) => video.id)
		).toEqual([second.id, third.id]);
		expect(
			(await stream.videos.list({ before: third.id })).map((video) => video.id)
		).toEqual([first.id, second.id]);
	});
});
