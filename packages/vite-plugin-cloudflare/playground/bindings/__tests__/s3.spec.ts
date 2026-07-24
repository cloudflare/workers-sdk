import {
	GetObjectCommand,
	PutObjectCommand,
	S3Client,
	S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { assert, onTestFinished, test } from "vitest";
import { viteTestUrl } from "../../__test-utils__";

// Must match `experimental_local_s3_credentials` in ../wrangler.jsonc
const credentials = {
	accessKeyId: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
	secretAccessKey: "local-secret-access-key",
};

function s3Client(secretAccessKey = credentials.secretAccessKey) {
	const client = new S3Client({
		region: "auto",
		endpoint: `${viteTestUrl}/cdn-cgi/local/r2/s3`,
		credentials: { ...credentials, secretAccessKey },
		forcePathStyle: true,
	});
	// The SDK sends `Expect: 100-continue` on requests with bodies, but
	// workerd never responds with `100 Continue`, so the SDK would wait
	// for it indefinitely before sending the body
	client.middlewareStack.remove("addExpectContinueMiddleware");
	onTestFinished(() => client.destroy());
	return client;
}

// Regression test for SigV4 verification through the Vite dev server routing:
// signatures cover the exact host, path, and query the client sent, so any
// rewriting between the client and the S3 worker breaks verification.
test("r2 local S3-compatible API verifies SigV4 requests", async ({
	expect,
}) => {
	const client = s3Client();
	await client.send(
		new PutObjectCommand({
			Bucket: "s3-test-bucket",
			Key: "key.txt",
			Body: "body contents",
		})
	);
	const object = await client.send(
		new GetObjectCommand({ Bucket: "s3-test-bucket", Key: "key.txt" })
	);
	await expect(object.Body?.transformToString()).resolves.toBe("body contents");

	// Presigned URLs authenticate via query parameters instead of the
	// `Authorization` header, so exercise that path through the dev server too
	const presignedUrl = await getSignedUrl(
		client,
		new GetObjectCommand({ Bucket: "s3-test-bucket", Key: "key.txt" }),
		{ expiresIn: 300 }
	);
	const presignedResponse = await fetch(presignedUrl);
	expect(presignedResponse.status).toBe(200);
	await expect(presignedResponse.text()).resolves.toBe("body contents");

	// Verification must still reject bad signatures (i.e. requests are not
	// implicitly trusted for having come through the dev server)
	const error = await s3Client("wrong")
		.send(new GetObjectCommand({ Bucket: "s3-test-bucket", Key: "key.txt" }))
		.then(
			() => undefined,
			(e: unknown) => e
		);
	assert(error instanceof S3ServiceException);
	expect(error.$metadata.httpStatusCode).toBe(403);
	expect(error.name).toBe("SignatureDoesNotMatch");
});
