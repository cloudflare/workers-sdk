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

	test("serves real uploaded captions but no fake local assets", async ({
		expect,
	}) => {
		const mf = createMiniflare();
		useDispose(mf);
		const stream = await mf.getStreamBinding("STREAM");

		const directUpload = await stream.createDirectUpload({
			maxDurationSeconds: 60,
		});
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

		const video = await stream.video(directUpload.id).details();
		await stream.video(directUpload.id).captions.upload(
			"en",
			new File(
				["WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nUploaded caption\n"],
				"captions.vtt",
				{
					type: "text/vtt",
				}
			)
		);

		const captionResponse = await mf.dispatchFetch(
			toDispatchUrl(
				`/cdn-cgi/handler/stream/STREAM/videos/${directUpload.id}/captions/en.vtt`
			)
		);
		expect(captionResponse.status).toBe(200);
		expect(await captionResponse.text()).toContain("Uploaded caption");

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

		await expect(
			stream.video(directUpload.id).captions.generate("fr")
		).rejects.toThrow(/Caption generation is not implemented/);
		await expect(stream.video(directUpload.id).downloads.get()).rejects.toThrow(
			/Downloads are not implemented/
		);
	});
});
