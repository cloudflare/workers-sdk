import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import {
	chmodSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	statSync,
	symlinkSync,
} from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import path from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { afterEach, describe, it, vi } from "vitest";
import { writeFileAtomically } from "../src/core/atomic-write";
import { createFileStorage } from "../src/core/file-storage";
import { createProcessOwner } from "../src/core/process-owner";
import { EncryptedFileCredentialStore } from "../src/credential-store/encrypted-file-store";
import { FileCredentialStore } from "../src/credential-store/file-store";
import { getRefreshLockPath } from "../src/refresh-lock";
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

	function temporaryCopy(filePath: string, owner: string): string {
		const prefix = createHash("sha256")
			.update(filePath)
			.digest("hex")
			.slice(0, 16);
		const directory = path.join(
			path.dirname(filePath),
			`.auth-${prefix}-${owner}`
		);
		mkdirSync(directory, { recursive: true });
		fs.writeFileSync(path.join(directory, "data"), "abandoned secret", {
			mode: 0o600,
		});
		return directory;
	}

	it("removes abandoned copies on replacement and clear, but preserves live writers and other destinations", ({
		expect,
	}) => {
		for (const storage of stores()) {
			storage.write({ refresh_token: "original" });
			const dead = temporaryCopy(
				storage.path(),
				`owner-999999999-${randomUUID()}`
			);
			const live = temporaryCopy(storage.path(), createProcessOwner());
			const unrelated = temporaryCopy(
				storage.path() + ".other",
				`owner-999999999-${randomUUID()}`
			);
			storage.write({ refresh_token: "replacement" });
			expect(existsSync(dead)).toBe(false);
			expect(existsSync(live)).toBe(true);
			expect(existsSync(unrelated)).toBe(true);
			const interrupted = temporaryCopy(
				storage.path(),
				`owner-999999999-${randomUUID()}`
			);
			storage.clear();
			expect(existsSync(interrupted)).toBe(false);
			expect(existsSync(storage.path())).toBe(false);
		}
	});

	it.skipIf(process.platform === "win32")(
		"preserves symlinks, shares their target's lock, and clears the target",
		({ expect }) => {
			const target = path.join(process.cwd(), "shared.json");
			const link = path.join(process.cwd(), "linked.json");
			writeFileAtomically(target, "original");
			symlinkSync("shared.json", link);
			writeFileAtomically(link, "replacement");
			expect(lstatSync(link).isSymbolicLink()).toBe(true);
			expect(readFileSync(target, "utf8")).toBe("replacement");
			expect(getRefreshLockPath(link)).toBe(getRefreshLockPath(target));
			const storage = createFileStorage("json", () => link);
			storage.clear();
			expect(lstatSync(link).isSymbolicLink()).toBe(true);
			expect(existsSync(target)).toBe(false);
			storage.write({ refresh_token: "new" });
			expect(lstatSync(link).isSymbolicLink()).toBe(true);
			expect(JSON.parse(readFileSync(target, "utf8"))).toEqual({
				refresh_token: "new",
			});
			expect(getRefreshLockPath(link)).toBe(getRefreshLockPath(target));
		}
	);

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
		"shares a linked profile's lock with encrypted migration before and after clearing plaintext",
		({ expect }) => {
			const plaintext = new FileCredentialStore(process.cwd());
			const shared = path.join(process.cwd(), "shared.toml");
			writeFileAtomically(shared, 'refresh_token = "original"');
			mkdirSync(path.dirname(plaintext.path()), { recursive: true });
			symlinkSync(shared, plaintext.path());
			const encrypted = new EncryptedFileCredentialStore(process.cwd(), {
				getKey: () => new Uint8Array(32),
				setKey: () => {},
				deleteKey: () => {},
				describe: () => "test key",
			});
			const lock = getRefreshLockPath(shared);
			expect(getRefreshLockPath(plaintext.path())).toBe(lock);
			expect(getRefreshLockPath(encrypted.path())).toBe(lock);
			expect(encrypted.read()?.refresh_token).toBe("original");
			expect(getRefreshLockPath(plaintext.path())).toBe(lock);
			expect(getRefreshLockPath(encrypted.path())).toBe(lock);
		}
	);

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
