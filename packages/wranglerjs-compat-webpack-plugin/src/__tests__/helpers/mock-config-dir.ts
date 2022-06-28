import fs from "node:fs";
import path from "node:path";

/**
 * Create an environment variable telling wrangler 1 where to look for
 * ~/.wrangler/config/default.toml
 */
export const mockConfigDir = ({ homedir = "." }: { homedir?: string }) => {
	beforeEach(() => {
		const mockHomeDir = path.join(process.cwd(), homedir);
		process.env.WRANGLER_HOME = mockHomeDir;
		fs.mkdirSync(path.join(mockHomeDir, "config"), { recursive: true });
		fs.writeFileSync(path.join(mockHomeDir, "config", "default.toml"), "");
	});
};
