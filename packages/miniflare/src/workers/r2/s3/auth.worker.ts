// AWS Signature Version 4 verification for the local S3-compatible endpoint.
// Implements both authentication methods defined by the SigV4 spec:
// - HTTP `Authorization` header:
//   https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv-authentication-methods.html#aws-signing-authentication-methods-http
// - Presigned URL query parameters:
//   https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv-authentication-methods.html#aws-signing-authentication-methods-query
// Canonical request construction follows
// https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv-create-signed-request.html
// with the S3-specific deviation that the canonical URI is the request path
// used verbatim (single-encoded), not re-encoded.
//
// Error codes, messages, and check order mimic R2's S3 endpoint
// (<account>.r2.cloudflarestorage.com), which differs from AWS S3: R2 uses
// `InvalidArgument`/`InvalidRequest` for malformed auth, 401 `Unauthorized`
// for unknown access keys (never `InvalidAccessKeyId`), 403
// `SignatureDoesNotMatch` (with the canonical request and string-to-sign
// echoed for debugging, like AWS) for signature mismatches, and 403
// `ExpiredRequest` for expired presigned URLs.

/* eslint-disable no-unused-vars -- shared SigV4 helpers; the verifiers that
   call them land in the next two commits */
import { hex } from "./common.worker";
import { errorResponse } from "./errors.worker";
import type { S3Credentials } from "../constants";

const ALGORITHM = "AWS4-HMAC-SHA256";

const encoder = new TextEncoder();

async function sha256Hex(data: BufferSource): Promise<string> {
	return hex(await crypto.subtle.digest("SHA-256", data));
}

async function hmac(key: BufferSource, data: string): Promise<ArrayBuffer> {
	const cryptoKey = await crypto.subtle.importKey(
		"raw",
		key,
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"]
	);
	return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
}

/**
 * AWS `UriEncode`: percent-encode everything except RFC 3986 unreserved
 * characters, with uppercase hex. `encodeURIComponent` matches except it
 * leaves `!'()*` unescaped. Used for query parameters only; the S3
 * canonical URI is the request path verbatim.
 */
export function awsUriEncode(value: string): string {
	return encodeURIComponent(value).replace(
		/[!'()*]/g,
		(char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
	);
}

const invalidArgument = (message: string) =>
	errorResponse(400, "InvalidArgument", message);

const unauthorized = () => errorResponse(401, "Unauthorized", "Unauthorized");

function byteDump(value: string): string {
	return Array.from(encoder.encode(value), (byte) =>
		byte.toString(16).padStart(2, "0")
	).join(" ");
}

function signatureDoesNotMatch(
	computed: ComputedSignature,
	provided: string
): Response {
	return errorResponse(
		403,
		"SignatureDoesNotMatch",
		"The request signature we calculated does not match the signature you provided. Check your secret access key and signing method.",
		{
			StringToSign: computed.stringToSign,
			StringToSignBytes: byteDump(computed.stringToSign),
			CanonicalRequest: computed.canonicalRequest,
			CanonicalRequestBytes: byteDump(computed.canonicalRequest),
			SignatureProvided: provided,
		}
	);
}

const unsupportedAlgorithm = () =>
	errorResponse(400, "InvalidRequest", `Please use ${ALGORITHM}`);

interface ParsedCredential {
	accessKeyId: string;
	date: string;
	region: string;
	service: string;
}

/**
 * Parses `<access-key-id>/<yyyymmdd>/<region>/<service>/aws4_request`,
 * validating in R2's order: part count, then service, then termination
 * string. Access key validity is checked by the caller (R2 checks the key's
 * length here, but local credentials are user-configured so any mismatch is
 * just an invalid key, reported as 401 after the scope checks).
 */
function parseCredential(
	credential: string
): ParsedCredential | { error: Response } {
	const parts = credential.split("/");
	if (parts.length < 5) {
		return {
			error: invalidArgument(
				`Credential sigv4 header should have at least 5 slash-separated parts, not ${parts.length}`
			),
		};
	}

	// R2 allows extra slashes by treating everything before the last four
	// parts as the access key
	const accessKeyId = parts.slice(0, -4).join("/");
	const [date, region, service, terminator] = parts.slice(-4);
	if (service !== "s3") {
		return {
			error: invalidArgument(`Credential service should be s3, not ${service}`),
		};
	}
	if (terminator !== "aws4_request") {
		return {
			error: invalidArgument(
				`Credential termination string should be aws4_request, not ${terminator}`
			),
		};
	}
	if (date === undefined || region === undefined) {
		return { error: unauthorized() };
	}

	return { accessKeyId, date, region, service };
}

/** Dates must strictly be basic ISO 8601 format */
function parseAmzDate(value: string): Date | undefined {
	const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value);
	if (match === null) {
		return undefined;
	}

	const [, year, month, day, hour, minute, second] = match;
	const date = new Date(
		Date.UTC(
			Number(year),
			Number(month) - 1,
			Number(day),
			Number(hour),
			Number(minute),
			Number(second)
		)
	);

	return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * Canonical query string: each name and value `UriEncode`d, sorted by
 * encoded name (then value), joined with `&`. For presigned requests,
 * `X-Amz-Signature` is excluded.
 */
function canonicalQueryString(url: URL, excludeSignature: boolean): string {
	const params: [string, string][] = [];
	for (const [name, value] of url.searchParams) {
		if (excludeSignature && name === "X-Amz-Signature") {
			continue;
		}
		params.push([awsUriEncode(name), awsUriEncode(value)]);
	}
	params.sort(([name1, value1], [name2, value2]) => {
		if (name1 !== name2) {
			return name1 < name2 ? -1 : 1;
		}
		return value1 < value2 ? -1 : value1 > value2 ? 1 : 0;
	});
	return params.map(([name, value]) => `${name}=${value}`).join("&");
}

/**
 * Canonical headers: lowercase name, `:`, trimmed value with sequential
 * spaces collapsed, `\n`, for each signed header in the order given
 * (the spec requires the SignedHeaders list to already be sorted).
 *
 * Known limitation: `Headers.get()` joins repeated headers with `", "`,
 * while SigV4 canonicalizes them joined with a bare comma. The Fetch API
 * offers no way to recover the original values, so signing a repeated
 * header produces a signature mismatch.
 */
function canonicalHeaders(
	request: Request,
	url: URL,
	signedHeaders: string[]
): string {
	let result = "";
	for (const name of signedHeaders) {
		const value =
			request.headers.get(name) ?? (name === "host" ? url.host : "");
		result += `${name}:${value.trim().replace(/ +/g, " ")}\n`;
	}
	return result;
}

interface ComputedSignature {
	signature: string;
	canonicalRequest: string;
	stringToSign: string;
}

async function computeSignature(
	request: Request,
	url: URL,
	secretAccessKey: string,
	credential: ParsedCredential,
	amzDate: string,
	signedHeaders: string[],
	payloadHash: string,
	presigned: boolean
): Promise<ComputedSignature> {
	const canonicalRequest = [
		request.method,
		url.pathname,
		canonicalQueryString(url, presigned),
		canonicalHeaders(request, url, signedHeaders),
		signedHeaders.join(";"),
		payloadHash,
	].join("\n");

	const scope = `${credential.date}/${credential.region}/${credential.service}/aws4_request`;
	const stringToSign = [
		ALGORITHM,
		amzDate,
		scope,
		await sha256Hex(encoder.encode(canonicalRequest)),
	].join("\n");

	// DateKey = HMAC("AWS4" + secret, date); DateRegionKey = HMAC(DateKey,
	// region); DateRegionServiceKey = HMAC(.., service); SigningKey =
	// HMAC(.., "aws4_request")
	let key = await hmac(
		encoder.encode(`AWS4${secretAccessKey}`),
		credential.date
	);
	key = await hmac(key, credential.region);
	key = await hmac(key, credential.service);
	key = await hmac(key, "aws4_request");

	return {
		signature: hex(await hmac(key, stringToSign)),
		canonicalRequest,
		stringToSign,
	};
}

function timingSafeStringsEqual(expected: string, actual: string): boolean {
	const expectedBytes = encoder.encode(expected);
	const actualBytes = encoder.encode(actual);

	return actualBytes.byteLength === expectedBytes.byteLength
		? crypto.subtle.timingSafeEqual(expectedBytes, actualBytes)
		: !crypto.subtle.timingSafeEqual(expectedBytes, expectedBytes);
}

/**
 * Shared scope checks for both authentication methods: parse the credential,
 * match its signed date against the request date, then match the access key.
 * Real R2 reports the date mismatch as coming from the 'x-amz-date' header
 * even when the date came from the X-Amz-Date query parameter.
 */
function checkCredentialScope(
	credentialField: string,
	amzDate: string,
	credentials: S3Credentials
): ParsedCredential | { error: Response } {
	const credential = parseCredential(credentialField);
	if ("error" in credential) {
		return credential;
	}
	if (!amzDate.startsWith(credential.date)) {
		return {
			error: invalidArgument(
				`Credential signed date ${credential.date} does not match ${amzDate.slice(0, 8)} from 'x-amz-date' header`
			),
		};
	}
	if (credential.accessKeyId !== credentials.accessKeyId) {
		return { error: unauthorized() };
	}
	return credential;
}

function parseSignedHeaders(field: string): string[] | { error: Response } {
	const signedHeaders = field.split(";").map((name) => name.toLowerCase());
	// SigV4 requires the SignedHeaders list to include `host`
	if (!signedHeaders.includes("host")) {
		return { error: unauthorized() };
	}
	return signedHeaders;
}

async function checkSignature(
	request: Request,
	url: URL,
	credentials: S3Credentials,
	credential: ParsedCredential,
	amzDate: string,
	signedHeaders: string[],
	payloadHash: string,
	presigned: boolean,
	provided: string
): Promise<Response | undefined> {
	const computed = await computeSignature(
		request,
		url,
		credentials.secretAccessKey,
		credential,
		amzDate,
		signedHeaders,
		payloadHash,
		presigned
	);
	return timingSafeStringsEqual(computed.signature, provided)
		? undefined
		: signatureDoesNotMatch(computed, provided);
}

/**
 * Verifies a request against AWS Signature Version 4, returning an R2-style
 * XML error `Response` on failure, or `undefined` if authentication succeeds.
 */
export function verifyRequest(
	_request: Request,
	_credentials: S3Credentials
): Response | undefined {
	return invalidArgument("Authorization");
}
