import { http, HttpResponse } from "msw";
import { createFetchResult } from "../index";

export const mswSuccessR2handlers = [
	// List endpoint r2Buckets
	http.get(
		"*/accounts/:accountId/r2/buckets",
		() => {
			return HttpResponse.json(
				createFetchResult({
					buckets: [
						{ name: "bucket-1", creation_date: "01-01-2001" },
						{ name: "bucket-2", creation_date: "01-01-2001" },
					],
				})
			);
		},
		{ once: true }
	),
	http.post(
		"*/accounts/:accountId/r2/buckets",
		() => {
			return HttpResponse.json(createFetchResult({}));
		},
		{ once: true }
	),
	http.put(
		"*/accounts/:accountId/r2/buckets/:bucketName",
		() => {
			return HttpResponse.json(createFetchResult({}));
		},
		{ once: true }
	),
	http.delete(
		"*/accounts/:accountId/r2/buckets/:bucketName",
		() => {
			return HttpResponse.json(createFetchResult(null));
		},
		{ once: true }
	),
	http.get(
		"*/accounts/:accountId/r2/buckets/:bucketName/objects/:objectName",
		() => {
			const imageBuffer = Buffer.from("wormhole-img.png");

			return new HttpResponse(imageBuffer, {
				headers: {
					"Content-Length": imageBuffer.byteLength.toString(),
					"Content-Type": "image/png",
				},
			});
		},
		{ once: true }
	),
	http.put(
		"*/accounts/:accountId/r2/buckets/:bucketName/objects/:objectName",
		() => {
			return HttpResponse.json(
				createFetchResult({
					accountId: "some-account-id",
					bucketName: "bucketName-object-test",
					objectName: "wormhole-img.png",
				})
			);
		},
		{ once: true }
	),
	http.delete(
		"*/accounts/:accountId/r2/buckets/:bucketName/objects/:objectName",
		() => {
			return HttpResponse.json(createFetchResult(null));
		},
		{ once: true }
	),
];
