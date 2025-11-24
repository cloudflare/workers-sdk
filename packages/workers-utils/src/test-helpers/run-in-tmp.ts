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
			// Don't block on deleting the tmp dir
			void rm(tmpDir).catch(() => {
				// Best effort - try once then just move on - they are only temp files after all.
				// It seems that Windows doesn't let us delete this, with errors like:
				//
				// Error: EBUSY: resource busy or locked, rmdir 'C:\Users\RUNNER~1\AppData\Local\Temp\wrangler-modules-pKJ7OQ'
				// ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
				// Serialized Error: {
				// 	"code": "EBUSY",
				// 	"errno": -4082,
				// 	"path": "C:\Users\RUNNER~1\AppData\Local\Temp\wrangler-modules-pKJ7OQ",
				// 	"syscall": "rmdir",
			});
		}
	});
}
