import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

/**
 * Create an environment variable telling wrangler 1 where to look for
 * ~/.wrangler/config/default.toml
 */
export const mockConfigDir = () => {
	beforeEach(() => {
		const homeDirPath = path.join(process.cwd(), homedir());
		process.env.WRANGLER_HOME = homeDirPath;
		fs.mkdirSync(path.join(homeDirPath, "config"), { recursive: true });
		fs.writeFileSync(path.join(homeDirPath, "config", "default.toml"), "");
	});
};
