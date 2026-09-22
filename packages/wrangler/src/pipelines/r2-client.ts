import { setTimeout } from "node:timers/promises";
import { AwsV4Signer } from "aws4fetch";
import { fetch } from "undici";

const EMPTY_PAYLOAD_SHA256 =
	"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const MAX_ATTEMPTS = 3;
const INITIAL_RETRY_DELAY_MS = 100;
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

class R2RequestError extends Error {
	readonly status: number;

	constructor(status: number, statusText: string) {
		const statusDescription = statusText ? ` ${statusText}` : "";
		super(`R2 request failed with status ${status}${statusDescription}`);
		this.name = "R2RequestError";
		this.status = status;
	}
}

/**
 * A minimal client for the two S3 operations used to validate R2 credentials.
 *
 * @param endpoint - The account-level R2 S3 endpoint.
 * @param accessKeyId - The explicitly supplied R2 access key ID.
 * @param secretAccessKey - The explicitly supplied R2 secret access key.
 */
export class R2Client {
	private readonly accessKeyId: string;
	private readonly endpoint: string;
	private readonly secretAccessKey: string;
	private readonly signingKeyCache = new Map<string, ArrayBuffer>();

	constructor(endpoint: string, accessKeyId: string, secretAccessKey: string) {
		this.endpoint = endpoint;
		this.accessKeyId = accessKeyId;
		this.secretAccessKey = secretAccessKey;
	}

	/**
	 * Check whether these credentials can access a bucket.
	 *
	 * @param bucketName - The R2 bucket to check.
	 */
	async headBucket(bucketName: string): Promise<void> {
		await this.request("HEAD", this.getBucketUrl(bucketName));
	}

	/**
	 * List a bounded number of objects to validate credentials without downloading
	 * object data.
	 *
	 * @param bucketName - The R2 bucket to check.
	 * @param maxKeys - The maximum number of object keys to return.
	 */
	async listObjectsV2(bucketName: string, maxKeys: number): Promise<void> {
		const url = this.getBucketUrl(bucketName);
		url.searchParams.set("list-type", "2");
		url.searchParams.set("max-keys", maxKeys.toString());
		await this.request("GET", url);
	}

	private getBucketUrl(bucketName: string): URL {
		const url = new URL(this.endpoint);
		url.pathname = `/${encodeURIComponent(bucketName)}/`;
		return url;
	}

	private async request(method: "GET" | "HEAD", url: URL): Promise<void> {
		for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
			const signer = new AwsV4Signer({
				method,
				url: url.href,
				headers: { "X-Amz-Content-Sha256": EMPTY_PAYLOAD_SHA256 },
				accessKeyId: this.accessKeyId,
				secretAccessKey: this.secretAccessKey,
				service: "s3",
				region: "auto",
				cache: this.signingKeyCache,
			});
			const signedRequest = await signer.sign();

			try {
				const response = await fetch(signedRequest.url, {
					method: signedRequest.method,
					headers: Object.fromEntries(signedRequest.headers),
					redirect: "manual",
				});
				await response.arrayBuffer();

				if (response.ok) {
					return;
				}

				const error = new R2RequestError(response.status, response.statusText);
				if (
					attempt === MAX_ATTEMPTS ||
					!RETRYABLE_STATUS_CODES.has(response.status)
				) {
					throw error;
				}
			} catch (error) {
				if (
					attempt === MAX_ATTEMPTS ||
					(error instanceof R2RequestError &&
						!RETRYABLE_STATUS_CODES.has(error.status))
				) {
					throw error;
				}
			}

			const maximumDelay = INITIAL_RETRY_DELAY_MS * 2 ** (attempt - 1);
			await setTimeout(Math.random() * maximumDelay);
		}
	}
}
