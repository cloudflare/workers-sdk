import { execa } from "execa";
import webpack from "webpack";
import {
	mockAccountId,
	mockApiToken,
} from "wrangler/src/__tests__/helpers/mock-account-id";
import { unsetAllMocks } from "wrangler/src/__tests__/helpers/mock-cfetch";
import { mockConsoleMethods } from "wrangler/src/__tests__/helpers/mock-console";
import { runInTempDir } from "wrangler/src/__tests__/helpers/run-in-tmp";
import { writeWorkerSource } from "wrangler/src/__tests__/helpers/write-worker-source";
import writeWranglerToml from "wrangler/src/__tests__/helpers/write-wrangler-toml";
import { WranglerJsCompatWebpackPlugin } from "../";
import { compareOutputs } from "./helpers/compare-outputs";
import { installWrangler1 } from "./helpers/install-wrangler";
import { mockConfigDir } from "./helpers/mock-config-dir";
import { cleanMessage } from "./helpers/pipe";

mockAccountId();
mockApiToken();
runInTempDir();
mockConfigDir();

afterEach(() => {
	unsetAllMocks();
});

describe("messaging", () => {
	const std = mockConsoleMethods();

	it('warns if target is not "weborker"', async () => {
		writeWorkerSource({ basePath: "." });
		writeWranglerToml();
		const config: webpack.Configuration = {
			entry: "./index.js",
			plugins: [new WranglerJsCompatWebpackPlugin()],
		};

		await expect(runWebpack(config)).resolves.not.toThrow();

		expect(cleanMessage(std.out)).toMatchInlineSnapshot(`""`);
		expect(cleanMessage(std.err)).toMatchInlineSnapshot(`""`);
		expect(cleanMessage(std.warn)).toMatchInlineSnapshot(`
      "Setting \`target\` to \\"webworker\\"...
      Running \`npm install\` in [dir]..."
    `);
	});
});

describe("wrangler 1 parity", () => {
	beforeAll(async () => {
		await installWrangler1();
		await execa("npm", ["run", "build:js"]); // ensure tests use latest changes
	});

	it("works with a basic configuration", async () => {
		const { wrangler1, wrangler2 } = await compareOutputs({
			webpackConfig: {
				entry: "./index.js",
				target: "webworker",
			},
			wranglerConfig: {
				main: "./worker/script.js",
			},
			worker: { type: "sw" },
		});

		expect(wrangler1.result).not.toBeInstanceOf(Error);
		expect(wrangler2.result).not.toBeInstanceOf(Error);

		expect(wrangler1.output).toStrictEqual(wrangler2.output);

		expect(wrangler1.std.out).toMatchInlineSnapshot(`
      "up to date, audited 1 package in [timing]
      found [some] vulnerabilities
      Built successfully, built project size is 503 bytes."
    `);
		expect(wrangler1.std.err).toMatchInlineSnapshot(`""`);
		expect(wrangler1.std.warn).toMatchInlineSnapshot(`""`);

		expect(wrangler2.std.out).toMatchInlineSnapshot(`
      "running: npm run build
      > build
      > webpack --no-color
      Hash: e96932fc5c1ce19ddd05
      Version: webpack 4.46.0
      Time: [timing]
      Built at: [time]
        Asset        Size  Chunks  Chunk Names
      main.js  1020 bytes       0  main
      Entrypoint main = main.js
      [0] ./index.js + 1 modules 163 bytes {0} [built]
          | ./index.js 140 bytes [built]
          | ./another.js 23 bytes [built]


      Uploaded test-name (TIMINGS)
      Published test-name (TIMINGS)
        https://test-name.test-sub-domain.workers.dev"
    `);
		expect(wrangler2.std.err).toMatchInlineSnapshot(`""`);
		expect(wrangler2.std.warn).toMatchInlineSnapshot(`
      "WARNING  in configuration
      The 'mode' option has not been set, webpack will fallback to 'production' for this value. Set 'mode' option to 'development' or 'production' to enable defaults for each environment.
      You can also set it to 'none' to disable any default behavior. Learn more: https://webpack.js.org/configuration/mode/"
    `);
	});

	it.todo("works with webassembly");

	it.todo("works with sites");
});

async function runWebpack(
	config: webpack.Configuration
): Promise<webpack.Stats> {
	const compiler = webpack(config);
	return await new Promise((resolve, reject) => {
		compiler.run((error, stats) => {
			if (error) {
				reject(error);
			} else {
				resolve(stats);
			}
		});
	});
}
