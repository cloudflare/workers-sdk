import { writeFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import { createFileHasher } from "../src/asset-hash";

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
		hash: "f9bc91770fa5e997cbd47fba833629fc",
	},
	{
		label: "hello world (html)",
		content: Buffer.from("hello world"),
		ext: ".html",
		hash: "b21ba0581fdc5f20b592c79af3d230e2",
	},
	{
		label: "test file content (js)",
		content: Buffer.from("test file content"),
		ext: ".js",
		hash: "b41bdcbc16962c4e5d7e14d7c9103695",
	},
	{
		label: "1x1 PNG",
		content: Buffer.from(
			"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
			"base64"
		),
		ext: ".png",
		hash: "226c49eec5fdea01c6810b84ccceb008",
	},
	{
		label: "Unicode contents and extension",
		content: Buffer.from("Hello 🌍 — こんにちは\0"),
		ext: ".文本",
		hash: "fc71cbcfacb54f3c9e487589d6179e98",
	},
	{
		label: "extensionless file",
		content: Buffer.from("hello world"),
		ext: "",
		hash: "86163d1f5b780aa3e7d8c101d698cbcb",
	},
	{
		label: "all byte values",
		content: Buffer.from(Array.from({ length: 256 }, (_, index) => index)),
		ext: ".bin",
		hash: "04c51b7bb2984817f8bb7099dde4021f",
	},
	{
		label: "file larger than the WASM input buffer",
		content: Buffer.alloc(128 * 1024 + 1, 0xa5),
		ext: ".bin",
		hash: "3662f8d15287bf06c100e7c7c9d32a9d",
	},
];

describe("createFileHasher", () => {
	runInTempDir();

	for (const { label, content, ext, hash } of GOLDEN_VALUES) {
		it(`produces stable hash for ${label}`, async ({ expect }) => {
			const hashFile = await createFileHasher();
			const filepath = `file${ext}`;
			writeFileSync(filepath, content);
			expect(hashFile(filepath)).toBe(hash);
		});
	}

	it("reuses an initialized hasher across concurrent asset callbacks", async ({
		expect,
	}) => {
		const hashFile = await createFileHasher();
		const files = GOLDEN_VALUES.map(({ content, ext }, index) => ({
			filepath: `file${index}${ext}`,
			content,
		}));
		await seed(
			Object.fromEntries(
				files.map(({ filepath, content }) => [filepath, content])
			)
		);

		const hashes = await Promise.all(
			files.map(async ({ filepath }) => {
				await stat(filepath);
				const hash = hashFile(filepath);
				expect(typeof hash).toBe("string");
				return hash;
			})
		);

		expect(hashes).toEqual(GOLDEN_VALUES.map(({ hash }) => hash));
	});

	it("rereads changed assets when reusing the hasher in local development", async ({
		expect,
	}) => {
		const hashFile = await createFileHasher();
		writeFileSync("index.html", "hello world");
		const originalHash = hashFile("index.html");

		writeFileSync("index.html", "updated content");
		expect(hashFile("index.html")).not.toBe(originalHash);

		writeFileSync("index.html", "hello world");
		expect(hashFile("index.html")).toBe(originalHash);
	});
});
