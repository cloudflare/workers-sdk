/**
 * Based off of `wrangler/src/__tests__/helpers/run-in-tmp.ts`
 *
 * TODO: ideally we'd want this sort of helper functions to live
 * in a separate package in workers-sdk`, and be shared across
 * our packages
 */

import * as fs from "node:fs";
import os from "node:os";
import * as path from "node:path";
import { vi } from "vitest";

const originalCwd = process.cwd();

export function runInTempDir({ homedir } = { homedir: "./home" }) {
	let tmpDir: string;

	beforeEach(() => {
		// Use realpath because the temporary path can point to a symlink rather than the actual path.
		tmpDir = fs.realpathSync(
			fs.mkdtempSync(path.join(os.tmpdir(), "containers-shared-tests"))
		);

		process.chdir(tmpDir);
		process.env.PWD = tmpDir;

		// The path that is returned from `homedir()` should be absolute.
		const absHomedir = path.resolve(tmpDir, homedir);

		// Override where the home directory is so that we can write our own user config,
		// without destroying the real thing.
		fs.mkdirSync(absHomedir, { recursive: true });

		// Note it is very important that we use the "default" value from "node:os" (e.g. `import os from "node:os";`)
		// rather than an alias to the module (e.g. `import * as os from "node:os";`).
		// This is because the module gets transpiled so that the "method" `homedir()` gets converted to a
		// getter that is not configurable (and so cannot be spied upon).
		vi.spyOn(os, "homedir")?.mockReturnValue(absHomedir);
	});

	afterEach(() => {
		if (fs.existsSync(tmpDir)) {
			process.chdir(originalCwd);
			process.env.PWD = originalCwd;
			try {
				fs.rmSync(tmpDir, { recursive: true, force: true });
			} catch (e) {
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
				// }
			}
		}
	});
}
