import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import * as cliPackages from "@cloudflare/cli/packages";
import { beforeEach, describe, it, vi } from "vitest";
import { Vike } from "../../../autoconfig/frameworks/vike";
import { NpmPackageManager } from "../../../package-manager";
import { runInTempDir } from "../../helpers/run-in-tmp";

vi.mock("../../../autoconfig/frameworks/utils/packages", () => ({
	isPackageInstalled: () => false,
}));

vi.mock("../../../autoconfig/frameworks/utils/vite-plugin", () => ({
	installCloudflareVitePlugin: async () => {},
}));

function getBaseOptions() {
	return {
		projectPath: process.cwd(),
		workerName: "my-vike-app",
		outputDir: "",
		dryRun: false,
		packageManager: NpmPackageManager,
		isWorkspaceRoot: false,
	};
}

describe("Vike framework configure()", () => {
	runInTempDir();

	beforeEach(() => {
		vi.spyOn(cliPackages, "installPackages").mockImplementation(async () => {});
	});

	describe("config file transformation", () => {
		it("handles the old format: `export default { ... } satisfies Config`", async ({
			expect,
		}) => {
			await mkdir(resolve("pages"), { recursive: true });
			await writeFile(
				resolve("pages/+config.ts"),
				`import type { Config } from "vike/types";
import vikeReact from "vike-react/config";

// Default config (can be overridden by pages)
// https://vike.dev/config

export default {
  // https://vike.dev/head-tags
  title: "My Vike App",
  description: "Demo showcasing Vike",

  extends: [vikeReact],
} satisfies Config;
`
			);

			const framework = new Vike({ id: "vike", name: "Vike" });
			await framework.configure(getBaseOptions());

			const result = await readFile(resolve("pages/+config.ts"), "utf8");
			expect(result).toContain('import vikePhoton from "vike-photon/config";');
			expect(result).toContain("extends: [vikeReact, vikePhoton]");
		});

		it("handles the new format: `const config: Config = { ... }; export default config;`", async ({
			expect,
		}) => {
			await mkdir(resolve("pages"), { recursive: true });
			await writeFile(
				resolve("pages/+config.ts"),
				`import type { Config } from "vike/types";
import vikeReact from "vike-react/config";

// Default config (can be overridden by pages)
// https://vike.dev/config

const config: Config = {
  // https://vike.dev/head-tags
  title: "My Vike App",
  description: "Demo showcasing Vike",

  extends: [vikeReact],
};

export default config;
`
			);

			const framework = new Vike({ id: "vike", name: "Vike" });
			await framework.configure(getBaseOptions());

			const result = await readFile(resolve("pages/+config.ts"), "utf8");
			expect(result).toContain('import vikePhoton from "vike-photon/config";');
			expect(result).toContain("extends: [vikeReact, vikePhoton]");
		});

		it("handles plain format: `export default { ... }`", async ({ expect }) => {
			await mkdir(resolve("pages"), { recursive: true });
			await writeFile(
				resolve("pages/+config.ts"),
				`import vikeReact from "vike-react/config";

export default {
  title: "My Vike App",
  extends: [vikeReact],
};
`
			);

			const framework = new Vike({ id: "vike", name: "Vike" });
			await framework.configure(getBaseOptions());

			const result = await readFile(resolve("pages/+config.ts"), "utf8");
			expect(result).toContain('import vikePhoton from "vike-photon/config";');
			expect(result).toContain("extends: [vikeReact, vikePhoton]");
		});

		it("handles `export default { ... } as Config` format", async ({
			expect,
		}) => {
			await mkdir(resolve("pages"), { recursive: true });
			await writeFile(
				resolve("pages/+config.ts"),
				`import type { Config } from "vike/types";
import vikeReact from "vike-react/config";

export default {
  title: "My Vike App",
  extends: [vikeReact],
} as Config;
`
			);

			const framework = new Vike({ id: "vike", name: "Vike" });
			await framework.configure(getBaseOptions());

			const result = await readFile(resolve("pages/+config.ts"), "utf8");
			expect(result).toContain('import vikePhoton from "vike-photon/config";');
			expect(result).toContain("extends: [vikeReact, vikePhoton]");
		});

		it("creates extends array if not present", async ({ expect }) => {
			await mkdir(resolve("pages"), { recursive: true });
			await writeFile(
				resolve("pages/+config.ts"),
				`import vikeReact from "vike-react/config";

export default {
  title: "My Vike App",
};
`
			);

			const framework = new Vike({ id: "vike", name: "Vike" });
			await framework.configure(getBaseOptions());

			const result = await readFile(resolve("pages/+config.ts"), "utf8");
			expect(result).toContain('import vikePhoton from "vike-photon/config";');
			expect(result).toContain("extends: [vikePhoton]");
		});

		it("creates extends array on variable-referenced config if not present", async ({
			expect,
		}) => {
			await mkdir(resolve("pages"), { recursive: true });
			await writeFile(
				resolve("pages/+config.ts"),
				`import type { Config } from "vike/types";

const config: Config = {
  title: "My Vike App",
};

export default config;
`
			);

			const framework = new Vike({ id: "vike", name: "Vike" });
			await framework.configure(getBaseOptions());

			const result = await readFile(resolve("pages/+config.ts"), "utf8");
			expect(result).toContain('import vikePhoton from "vike-photon/config";');
			expect(result).toContain("extends: [vikePhoton]");
		});

		it("does not duplicate import or extends entry on repeated calls", async ({
			expect,
		}) => {
			await mkdir(resolve("pages"), { recursive: true });
			await writeFile(
				resolve("pages/+config.ts"),
				`import vikeReact from "vike-react/config";
import vikePhoton from "vike-photon/config";

export default {
  title: "My Vike App",
  extends: [vikeReact, vikePhoton],
};
`
			);

			const framework = new Vike({ id: "vike", name: "Vike" });
			await framework.configure(getBaseOptions());

			const result = await readFile(resolve("pages/+config.ts"), "utf8");

			const importCount = (
				result.match(/import vikePhoton from "vike-photon\/config"/g) || []
			).length;
			expect(importCount).toBe(1);

			// Verify the extends array wasn't duplicated either
			expect(result).toContain("extends: [vikeReact, vikePhoton]");
		});

		it("does not duplicate extends entry when vike-photon is imported under a different name", async ({
			expect,
		}) => {
			await mkdir(resolve("pages"), { recursive: true });
			await writeFile(
				resolve("pages/+config.ts"),
				`import vikeReact from "vike-react/config";
import photon from "vike-photon/config";

export default {
  title: "My Vike App",
  extends: [vikeReact, photon],
};
`
			);

			const framework = new Vike({ id: "vike", name: "Vike" });
			await framework.configure(getBaseOptions());

			const result = await readFile(resolve("pages/+config.ts"), "utf8");

			// Should not add a second import
			const importCount = (result.match(/from "vike-photon\/config"/g) || [])
				.length;
			expect(importCount).toBe(1);

			// Should not duplicate the extends entry under any name
			expect(result).toContain("extends: [vikeReact, photon]");
			expect(result).not.toContain("vikePhoton");
		});

		it("uses .js config file as fallback", async ({ expect }) => {
			await mkdir(resolve("pages"), { recursive: true });
			await writeFile(
				resolve("pages/+config.js"),
				`import vikeReact from "vike-react/config";

export default {
  title: "My Vike App",
  extends: [vikeReact],
};
`
			);

			const framework = new Vike({ id: "vike", name: "Vike" });
			await framework.configure(getBaseOptions());

			const result = await readFile(resolve("pages/+config.js"), "utf8");
			expect(result).toContain('import vikePhoton from "vike-photon/config";');
			expect(result).toContain("extends: [vikeReact, vikePhoton]");
		});
	});

	describe("configure() return value", () => {
		beforeEach(async () => {
			await mkdir(resolve("pages"), { recursive: true });
			await writeFile(
				resolve("pages/+config.ts"),
				`import vikeReact from "vike-react/config";

export default {
  extends: [vikeReact],
};
`
			);
		});

		it("returns correct wranglerConfig", async ({ expect }) => {
			const framework = new Vike({ id: "vike", name: "Vike" });
			const result = await framework.configure(getBaseOptions());

			expect(result.wranglerConfig).toEqual({
				main: "virtual:photon:cloudflare:server-entry",
			});
		});

		it("returns correct packageJsonScriptsOverrides", async ({ expect }) => {
			const framework = new Vike({ id: "vike", name: "Vike" });
			const result = await framework.configure(getBaseOptions());

			expect(result.packageJsonScriptsOverrides).toEqual({
				preview: "vike build && vike preview",
				deploy: "vike build && wrangler deploy",
			});
		});
	});

	describe("dryRun mode", () => {
		it("does not modify config file in dryRun mode", async ({ expect }) => {
			await mkdir(resolve("pages"), { recursive: true });
			const originalContent = `import vikeReact from "vike-react/config";

export default {
  extends: [vikeReact],
};
`;
			await writeFile(resolve("pages/+config.ts"), originalContent);

			const framework = new Vike({ id: "vike", name: "Vike" });
			await framework.configure({ ...getBaseOptions(), dryRun: true });

			const result = await readFile(resolve("pages/+config.ts"), "utf8");
			expect(result).toBe(originalContent);
		});
	});
});
