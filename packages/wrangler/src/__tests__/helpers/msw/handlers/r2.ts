import { rest } from "msw";
import { createFetchResult } from "../index";

type StorageClass = "Standard" | "InfrequentAccess";

function isValidStorageClass(
	storageClass: string
): storageClass is StorageClass {
	return storageClass === "Standard" || storageClass === "InfrequentAccess";
}

export const mswR2handlers = [
	// List endpoint r2Buckets
	rest.get("*/accounts/:accountId/r2/buckets", (_, response, context) =>
		response.once(
			context.json(
				createFetchResult({
					buckets: [
						{ name: "bucket-1", creation_date: "01-01-2001" },
						{ name: "bucket-2", creation_date: "01-01-2001" },
					],
				})
			)
		)
	),
	rest.post(
		"*/accounts/:accountId/r2/buckets",
		async (request, response, context) => {
			const { storageClass } = await request.json();
			if (storageClass !== null && !isValidStorageClass(storageClass)) {
				return response.once(
					context.status(400),
					context.json({
						success: false,
						errors: [
							{
								code: 10040,
								message: "The JSON you provided was not well formed.",
							},
						],
						messages: [],
						result: null,
					})
				);
			}

			return response.once(context.json(createFetchResult({})));
		}
	),
	rest.put(
		"*/accounts/:accountId/r2/buckets/:bucketName",
		(_, response, context) => response.once(context.json(createFetchResult({})))
	),
	rest.delete(
		"*/accounts/:accountId/r2/buckets/:bucketName",
		(_, response, context) =>
			response.once(context.json(createFetchResult(null)))
	),
	rest.get(
		"*/accounts/:accountId/r2/buckets/:bucketName/objects/:objectName",
		(_, response, context) => {
			const imageBuffer = Buffer.from("wormhole-img.png");
			return response.once(
				context.set("Content-Length", imageBuffer.byteLength.toString()),
				context.set("Content-Type", "image/png"),

				context.body(imageBuffer)
			);
		}
	),
	rest.put(
		"*/accounts/:accountId/r2/buckets/:bucketName/objects/:objectName",
		(_, response, context) =>
			response.once(
				context.json(
					createFetchResult({
						accountId: "some-account-id",
						bucketName: "bucketName-object-test",
						objectName: "wormhole-img.png",
					})
				)
			)
	),
	rest.delete(
		"*/accounts/:accountId/r2/buckets/:bucketName/objects/:objectName",
		(_, response, context) =>
			response.once(context.json(createFetchResult(null)))
	),
	rest.patch(
		"*/accounts/:accountId/r2/buckets/:bucketName",
		(request, response, context) => {
			const storageClassValue = request.headers.get("cf-r2-storage-class");
			if (
				storageClassValue === null ||
				!isValidStorageClass(storageClassValue)
			) {
				return response.once(
					context.status(400),
					context.json({
						success: false,
						errors: [
							{
								code: 10062,
								message: "The storage class specified is not valid.",
							},
						],
						messages: [],
						result: null,
					})
				);
			}

			return response.once(context.json(createFetchResult(null)));
		}
	),
];
