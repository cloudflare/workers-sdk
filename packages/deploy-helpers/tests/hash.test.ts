import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { removeDirSync } from "@cloudflare/workers-utils";
import { beforeEach, describe, it } from "vitest";
import { hashFile } from "../src/deploy/helpers/hash";

// Golden values pre-computed from blake3-wasm@2.1.5 to lock in byte-for-byte
// compatibility with the previous implementation. These must never change —
// they form the asset manifest hash contract sent to the Cloudflare API, so any
// drift would break asset deploys.
const GOLDEN_VALUES: Array<{
	label: string;
	content: Buffer;
	ext: string;
	hash: string;
}> = [
	{
		label: "empty file (txt)",
		content: Buffer.alloc(0),
		ext: ".txt",
		// base64("") + "txt" = "txt"
		hash: "f9bc91770fa5e997cbd47fba833629fc",
	},
	{
		label: "hello world (html)",
		content: Buffer.from("hello world"),
		ext: ".html",
		// base64("hello world") + "html" = "aGVsbG8gd29ybGQ=html"
		hash: "b21ba0581fdc5f20b592c79af3d230e2",
	},
	{
		label: "test file content (js)",
		content: Buffer.from("test file content"),
		ext: ".js",
		// base64("test file content") + "js" = "dGVzdCBmaWxlIGNvbnRlbnQ=js"
		hash: "b41bdcbc16962c4e5d7e14d7c9103695",
	},
	{
		label: "Hello World! (png)",
		content: Buffer.from("Hello World!"),
		ext: ".png",
		// base64("Hello World!") + "png" = "SGVsbG8gV29ybGQhpng"
		hash: "e7eb728129ffbae300b54a927c95b0d5",
	},
];

describe("hashFile", () => {
	let tmpDir: string;

	beforeEach(({ onTestFinished }) => {
		tmpDir = mkdtempSync(join(tmpdir(), "hash-test-"));
		onTestFinished(() => removeDirSync(tmpDir));
	});

	for (const { label, content, ext, hash } of GOLDEN_VALUES) {
		it(`produces stable hash for ${label}`, async ({ expect }) => {
			const filepath = join(tmpDir, `file${ext}`);
			writeFileSync(filepath, content);
			expect(await hashFile(filepath)).toBe(hash);
		});
	}

	it("returns a 32-character hex string", async ({ expect }) => {
		const filepath = join(tmpDir, "test.js");
		writeFileSync(filepath, "console.log('hello')");
		expect(await hashFile(filepath)).toMatch(/^[0-9a-f]{32}$/);
	});
});
