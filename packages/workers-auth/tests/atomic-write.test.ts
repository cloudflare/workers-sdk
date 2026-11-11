import fs from "node:fs";
import { chmodSync, readFileSync, readdirSync, statSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import path from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { afterEach, describe, it, vi } from "vitest";
import { writeFileAtomically } from "../src/core/atomic-write";
import { createFileStorage } from "../src/core/file-storage";
import { EncryptedFileCredentialStore } from "../src/credential-store/encrypted-file-store";
import { FileCredentialStore } from "../src/credential-store/file-store";
import type { AuthConfigStorage } from "../src/config-file/auth";

describe("atomic credential writes", () => {
	runInTempDir();
	afterEach(() => {
		vi.restoreAllMocks();
		syncBuiltinESMExports();
	});

	function stores(): AuthConfigStorage[] {
		return [
			new FileCredentialStore(process.cwd()),
			createFileStorage("json", () => path.join(process.cwd(), "direct.json")),
			new EncryptedFileCredentialStore(process.cwd(), {
				getKey: () => new Uint8Array(32),
				setKey: () => {},
				deleteKey: () => {},
				describe: () => "test key",
			}),
		];
	}

	it("leaves the previous complete credential file on a partial write failure", ({
		expect,
	}) => {
		for (const storage of stores()) {
			storage.write({ refresh_token: "original" });
			const original = readFileSync(storage.path(), "utf8");
			const write = fs.writeFileSync;
			const spy = vi.spyOn(fs, "writeFileSync").mockImplementation((file) => {
				write(file, "partial");
				throw new Error("disk full");
			});
			syncBuiltinESMExports();
			expect(() => storage.write({ refresh_token: "replacement" })).toThrow(
				"disk full"
			);
			spy.mockRestore();
			syncBuiltinESMExports();
			expect(readFileSync(storage.path(), "utf8")).toBe(original);
			expect(storage.read()?.refresh_token).toBe("original");
			expect(readdirSync(path.dirname(storage.path()))).not.toEqual(
				expect.arrayContaining([expect.stringMatching(/^\.auth-/)])
			);
		}
	});

	it("leaves the previous credential file when atomic replacement fails", ({
		expect,
	}) => {
		const file = path.join(process.cwd(), "credentials.json");
		writeFileAtomically(file, "original");
		vi.spyOn(fs, "renameSync").mockImplementation(() => {
			throw new Error("rename failed");
		});
		syncBuiltinESMExports();
		expect(() => writeFileAtomically(file, "replacement")).toThrow(
			"rename failed"
		);
		expect(readFileSync(file, "utf8")).toBe("original");
		expect(
			readdirSync(process.cwd()).filter((entry) => entry.startsWith(".auth-"))
		).toEqual([]);
	});

	it.skipIf(process.platform === "win32")(
		"tightens existing file permissions on replacement",
		({ expect }) => {
			const file = path.join(process.cwd(), "credentials.json");
			writeFileAtomically(file, "original");
			chmodSync(file, 0o644);
			writeFileAtomically(file, "replacement");
			expect(statSync(file).mode & 0o777).toBe(0o600);
		}
	);
});
