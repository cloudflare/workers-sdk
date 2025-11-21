import { http, HttpResponse } from "msw";
import { createFetchResult } from "../index";

type StorageClass = "Standard" | "InfrequentAccess";

function isValidStorageClass(
	storageClass: string
): storageClass is StorageClass {
	return storageClass === "Standard" || storageClass === "InfrequentAccess";
}

export const mswR2handlers = [
	// List endpoint r2Buckets
	http.get(
		"*/accounts/:accountId/r2/buckets",
		() =>
			HttpResponse.json(
				createFetchResult({
					buckets: [
						{ name: "bucket-1", creation_date: "01-01-2001" },
						{ name: "bucket-2", creation_date: "01-01-2001" },
					],
				})
			),
		{ once: true }
	),
	http.post(
		"*/accounts/:accountId/r2/buckets",
		async ({ request }) => {
			const { storageClass } = (await request.json()) as Record<string, string>;
			if (storageClass !== null && !isValidStorageClass(storageClass)) {
				return HttpResponse.json(
					{
						success: false,
						errors: [
							{
								code: 10040,
								message: "The JSON you provided was not well formed.",
							},
						],
						messages: [],
						result: null,
					},
					{ status: 400 }
				);
			}

			return HttpResponse.json(createFetchResult({}));
		},
		{ once: true }
	),
	http.put(
		"*/accounts/:accountId/r2/buckets/:bucketName",
		() => HttpResponse.json(createFetchResult({})),
		{ once: true }
	),
	http.delete(
		"*/accounts/:accountId/r2/buckets/:bucketName",
		() => HttpResponse.json(createFetchResult(null)),
		{ once: true }
	),
	http.get(
		"*/accounts/:accountId/r2/buckets/:bucketName/objects/:objectName",
		() => {
			const imageBuffer = Buffer.from("wormhole-img.png");
			return new HttpResponse(imageBuffer);
		},
		{ once: true }
	),
	http.put(
		"*/accounts/:accountId/r2/buckets/:bucketName/objects/:objectName",
		({ params }) => {
			const { accountId, bucketName, objectName } = params;
			return HttpResponse.json(
				createFetchResult({
					accountId,
					bucketName,
					objectName,
				})
			);
		},
		{
			once: true,
		}
	),
	http.put(
		"*/accounts/:accountId/r2/buckets/bulk-bucket/objects/:objectName",
		({ params }) => {
			const { accountId, objectName } = params;
			return HttpResponse.json(
				createFetchResult({
					accountId,
					bucketName: "bulk-bucket",
					objectName,
				})
			);
		},
		{
			// false to support bulk uploads in tests
			once: false,
		}
	),
	http.delete(
		"*/accounts/:accountId/r2/buckets/:bucketName/objects/:objectName",
		() => HttpResponse.json(createFetchResult(null)),
		{ once: true }
	),
	http.patch(
		"*/accounts/:accountId/r2/buckets/:bucketName",
		({ request }) => {
			const storageClassValue = request.headers.get("cf-r2-storage-class");
			if (
				storageClassValue === null ||
				!isValidStorageClass(storageClassValue)
			) {
				return HttpResponse.json(
					{
						success: false,
						errors: [
							{
								code: 10062,
								message: "The storage class specified is not valid.",
							},
						],
						messages: [],
						result: null,
					},
					{ status: 400 }
				);
			}

			return HttpResponse.json(createFetchResult(null));
		},
		{ once: true }
	),
];
