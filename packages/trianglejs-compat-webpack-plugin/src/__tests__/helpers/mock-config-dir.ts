import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

/**
 * Create an environment variable telling Triangle v1 where to look for
 * ~/.triangle/config/default.toml
 */
export const mockConfigDir = () => {
	beforeEach(() => {
		const homeDirPath = path.join(process.cwd(), homedir());
		process.env.TRIANGLER_HOME = homeDirPath;
		fs.mkdirSync(path.join(homeDirPath, "config"), { recursive: true });
		fs.writeFileSync(path.join(homeDirPath, "config", "default.toml"), "");
	});
};
