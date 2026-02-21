import * as fs from "node:fs";
import { rm } from "node:fs/promises";
import os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, vi } from "vitest";

const originalCwd = process.cwd();

export function runInTempDir({ homedir } = { homedir: "./home" }) {
	let tmpDir: string;

	beforeEach(() => {
		// Use realpath because the temporary path can point to a symlink rather than the actual path.
		tmpDir = fs.realpathSync(
			fs.mkdtempSync(path.join(os.tmpdir(), "wrangler-tests"))
		);

		process.chdir(tmpDir);
		vi.stubEnv("PWD", tmpDir);

		// Override where the home directory is so that we can write our own user config,
		// without destroying the real thing.
		// The path that is returned from `homedir()` should be absolute.
		const absHomedir = path.resolve(tmpDir, homedir);
		fs.mkdirSync(absHomedir, { recursive: true });
		vi.stubEnv("HOME", absHomedir);
		vi.stubEnv("XDG_CONFIG_HOME", path.resolve(absHomedir, ".config"));
	});

	afterEach(() => {
		if (fs.existsSync(tmpDir)) {
			process.chdir(originalCwd);
			// Don't block on deleting the tmp dir.
			// `maxRetries` handles transient `EBUSY` errors on Windows where
			// workerd may not have fully released file handles yet.
			void rm(tmpDir, {
				recursive: true,
				force: true,
				maxRetries: 5,
				retryDelay: 100,
			}).catch(() => {
				// Best effort - if retries are exhausted, just move on.
				// These are only temp files after all.
			});
		}
	});
}
