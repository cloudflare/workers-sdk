import { Buffer } from "node:buffer";
import { test } from "vitest";
import {
	captureRawForBodyRow,
	captureRawForJsonRow,
	captureTextAndHtmlForJsonRow,
	jsonByteLength,
	MAX_EMAIL_BODY_BYTES,
	MAX_EMAIL_ROW_VALUE_BYTES,
	stripEmailHeader,
} from "../../../src/workers/email/capture";

test("fits raw Base64 into a body row", ({ expect }) => {
	const raw = new TextEncoder().encode("x".repeat(2_000_000));
	const captured = captureRawForBodyRow(raw);

	expect(captured.truncated).toBe(true);
	expect(captured.rawBase64.length).toBeLessThanOrEqual(
		MAX_EMAIL_ROW_VALUE_BYTES
	);
	expect(Buffer.from(captured.rawBase64, "base64").byteLength).toBe(
		MAX_EMAIL_BODY_BYTES
	);
});

test("preserves the exact binary prefix when truncating raw MIME", ({
	expect,
}) => {
	const raw = new Uint8Array(MAX_EMAIL_BODY_BYTES + 1);
	raw.fill(0x80, MAX_EMAIL_BODY_BYTES - 100);

	const captured = captureRawForBodyRow(raw);
	const decoded = Buffer.from(captured.rawBase64, "base64");

	expect(decoded.byteLength).toBe(MAX_EMAIL_BODY_BYTES);
	expect(decoded.subarray(-100)).toEqual(Buffer.alloc(100, 0x80));
});

test("reserves JSON metadata before capturing raw Base64", ({ expect }) => {
	const metadata = {
		from: "sender@example.com",
		to: ["recipient@example.com"],
		subject: "Metadata first",
		headers: {
			"X-Large": '"\\'.repeat(250_000),
		},
	};
	const raw = new TextEncoder().encode("x".repeat(2_000_000));
	const captured = captureRawForJsonRow(metadata, raw);

	expect(captured.email).toMatchObject(metadata);
	expect(captured.truncated).toBe(true);
	expect(jsonByteLength(captured.email)).toBeLessThanOrEqual(
		MAX_EMAIL_ROW_VALUE_BYTES
	);
	expect(captured.email.rawBase64).toBeDefined();
	expect(
		Buffer.from(captured.email.rawBase64 ?? "", "base64").byteLength
	).toBeLessThan(MAX_EMAIL_BODY_BYTES);

	const emptyMetadata = { subject: "" };
	const exactMetadata = {
		subject: "x".repeat(
			MAX_EMAIL_ROW_VALUE_BYTES - jsonByteLength(emptyMetadata)
		),
	};
	expect(jsonByteLength(exactMetadata)).toBe(MAX_EMAIL_ROW_VALUE_BYTES);

	const exactCaptured = captureRawForJsonRow(
		exactMetadata,
		new TextEncoder().encode("raw")
	);
	expect(exactCaptured.email).toEqual(exactMetadata);
	expect(exactCaptured.email).not.toHaveProperty("rawBase64");
	expect(exactCaptured.truncated).toBe(true);

	const empty = captureRawForJsonRow(exactMetadata, new Uint8Array());
	expect(empty.email).toEqual(exactMetadata);
	expect(empty.email).not.toHaveProperty("rawBase64");
	expect(empty.truncated).toBe(false);
});

test("gives MessageBuilder text priority over html", ({ expect }) => {
	const metadata = {
		from: "sender@example.com",
		to: ["recipient@example.com"],
		subject: "Text first",
		headers: {
			"X-Escaped": '"\\'.repeat(100_000),
		},
	};
	const text = "t".repeat(1_000_000);
	const html = "h".repeat(2_000_000);
	const captured = captureTextAndHtmlForJsonRow(metadata, text, html);

	expect(captured.email).toMatchObject(metadata);
	expect(captured.email.text).toBe(text);
	expect(captured.email.html?.length).toBeGreaterThan(0);
	expect(captured.email.html?.length).toBeLessThan(html.length);
	expect(captured.truncated).toBe(true);
	expect(jsonByteLength(captured.email)).toBeLessThanOrEqual(
		MAX_EMAIL_ROW_VALUE_BYTES
	);

	const emptyMetadata = { subject: "" };
	const exactMetadata = {
		subject: "x".repeat(
			MAX_EMAIL_ROW_VALUE_BYTES - jsonByteLength(emptyMetadata)
		),
	};
	expect(jsonByteLength(exactMetadata)).toBe(MAX_EMAIL_ROW_VALUE_BYTES);

	const exactCaptured = captureTextAndHtmlForJsonRow(
		exactMetadata,
		"text",
		"html"
	);
	expect(exactCaptured.email).toEqual(exactMetadata);
	expect(exactCaptured.email).not.toHaveProperty("text");
	expect(exactCaptured.email).not.toHaveProperty("html");
	expect(exactCaptured.truncated).toBe(true);

	const empty = captureTextAndHtmlForJsonRow(exactMetadata, "", "");
	expect(empty.email).toEqual(exactMetadata);
	expect(empty.email).not.toHaveProperty("text");
	expect(empty.email).not.toHaveProperty("html");
	expect(empty.truncated).toBe(false);
});

test("omits html when text consumes the remaining row", ({ expect }) => {
	const captured = captureTextAndHtmlForJsonRow(
		{
			from: "sender@example.com",
			to: ["recipient@example.com"],
			subject: "No HTML budget",
		},
		"t".repeat(2_000_000),
		"h".repeat(2_000_000)
	);

	expect(captured.email.text?.length).toBeGreaterThan(0);
	expect(captured.email).not.toHaveProperty("html");
	expect(captured.truncated).toBe(true);
	expect(jsonByteLength(captured.email)).toBeLessThanOrEqual(
		MAX_EMAIL_ROW_VALUE_BYTES
	);
});

test("rejects metadata that cannot fit in a row", ({ expect }) => {
	expect(() =>
		captureTextAndHtmlForJsonRow(
			{
				from: "sender@example.com",
				to: ["recipient@example.com"],
				subject: "Metadata overflow",
				headers: { "X-Large": "x".repeat(MAX_EMAIL_ROW_VALUE_BYTES) },
			},
			"text",
			"html"
		)
	).toThrow("Email metadata exceeds the 2 MB storage row limit");
});

test("strips Bcc headers without modifying the captured body", ({ expect }) => {
	const raw = new TextEncoder().encode(
		[
			"From: sender@example.com",
			"Bcc: hidden@example.com",
			"\tsecond-hidden@example.com",
			"Subject: BCC privacy",
			"",
			"Body with \u0000 binary data.",
		].join("\r\n")
	);

	const stripped = new TextDecoder().decode(stripEmailHeader(raw, "bcc"));
	expect(stripped).toBe(
		[
			"From: sender@example.com",
			"Subject: BCC privacy",
			"",
			"Body with \u0000 binary data.",
		].join("\r\n")
	);
});
