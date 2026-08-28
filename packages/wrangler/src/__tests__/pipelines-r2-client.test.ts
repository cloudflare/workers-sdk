import { http, HttpResponse } from "msw";
import { afterEach, describe, it, vi } from "vitest";
import { R2Client } from "../pipelines/r2-client";
import { msw } from "./helpers/msw";

const endpoint = "https://account.r2.cloudflarestorage.com";
const accessKeyId = "AKIDEXAMPLE";
const secretAccessKey = "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY";

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("Pipelines R2 client", () => {
	it("performs a signed, path-style HeadBucket request", async ({ expect }) => {
		vi.useFakeTimers({
			now: new Date("2025-01-01T00:00:00.000Z"),
			toFake: ["Date"],
		});
		let authorization: string | null = null;
		let payloadHash: string | null = null;

		msw.use(
			http.head(`${endpoint}/bucket%20name/`, ({ request }) => {
				authorization = request.headers.get("authorization");
				payloadHash = request.headers.get("x-amz-content-sha256");
				return new HttpResponse(null, { status: 200 });
			})
		);

		const client = new R2Client(endpoint, accessKeyId, secretAccessKey);
		await client.headBucket("bucket name");

		expect(payloadHash).toBe(
			"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
		);
		expect(authorization).toMatchInlineSnapshot(
			`"AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20250101/auto/s3/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=5e47f7a0f28b7e16525295b3eceb9b22cb70003789f986113c548c1313193cf2"`
		);
	});

	it("performs ListObjectsV2 with MaxKeys set to one", async ({ expect }) => {
		let requestUrl: string | undefined;

		msw.use(
			http.get(`${endpoint}/bucket/`, ({ request }) => {
				requestUrl = request.url;
				return HttpResponse.xml("<ListBucketResult />");
			})
		);

		const client = new R2Client(endpoint, accessKeyId, secretAccessKey);
		await client.listObjectsV2("bucket", 1);

		expect(requestUrl).toBe(`${endpoint}/bucket/?list-type=2&max-keys=1`);
	});

	it("retries transient responses up to the S3 SDK default", async ({
		expect,
	}) => {
		vi.spyOn(Math, "random").mockReturnValue(0);
		let attempts = 0;

		msw.use(
			http.head(`${endpoint}/bucket/`, () => {
				attempts++;
				return new HttpResponse(null, {
					status: attempts < 3 ? 503 : 200,
				});
			})
		);

		const client = new R2Client(endpoint, accessKeyId, secretAccessKey);
		await client.headBucket("bucket");

		expect(attempts).toBe(3);
	});

	it("fails non-retryable responses immediately", async ({ expect }) => {
		let attempts = 0;

		msw.use(
			http.get(`${endpoint}/bucket/`, () => {
				attempts++;
				return HttpResponse.xml("<Error><Code>AccessDenied</Code></Error>", {
					status: 403,
				});
			})
		);

		const client = new R2Client(endpoint, accessKeyId, secretAccessKey);
		await expect(client.listObjectsV2("bucket", 1)).rejects.toMatchObject({
			name: "R2RequestError",
			status: 403,
		});
		expect(attempts).toBe(1);
	});
});
