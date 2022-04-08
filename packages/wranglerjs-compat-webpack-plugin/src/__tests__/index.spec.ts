import { execa } from "execa";
import {
  mockAccountId,
  mockApiToken,
} from "wrangler/src/__tests__/helpers/mock-account-id";
import { unsetAllMocks } from "wrangler/src/__tests__/helpers/mock-cfetch";
import { runInTempDir } from "wrangler/src/__tests__/helpers/run-in-tmp";
import { compareOutputs } from "./helpers/compare-outputs";
import { installWrangler1 } from "./helpers/install-wrangler";
import { mockConfigDir } from "./helpers/mock-config-dir";

mockAccountId();
mockApiToken();
runInTempDir({ homedir: "./home" });
mockConfigDir({ homedir: "./home" });

beforeAll(async () => {
  await installWrangler1();
  await execa("npm", ["run", "build:js"]);
});

afterEach(() => {
  unsetAllMocks();
});

it("works with a basic webpack config", async () => {
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

  expect(wrangler1.std.out).toMatchInlineSnapshot(`
    "up to date, audited 1 package in [timing]
    found [some] vulnerabilities
    ✨  Built successfully, built project size is 503 bytes."
  `);
  expect(wrangler1.std.err).toMatchInlineSnapshot(`""`);
  expect(wrangler1.std.warn).toMatchInlineSnapshot(`""`);

  expect(wrangler2.std.out).toMatchInlineSnapshot(`
    "running: npm run build
    > build
    > webpack
    Hash: e96932fc5c1ce19ddd05
    Version: webpack 4.46.0
    Time: [timing]
    Built at: [time]
        Asset        Size  Chunks  Chunk Names
    worker.js  1020 bytes       0  main
    Entrypoint main = worker.js
    [0] ./index.js + 1 modules 163 bytes {0} [built]
        | ./index.js 140 bytes [built]
        | ./another.js 23 bytes [built]


    Uploaded test-name (TIMINGS)
    Published test-name (TIMINGS)
      test-name.test-sub-domain.workers.dev"
  `);
  expect(wrangler2.std.err).toMatchInlineSnapshot(
    `"You should set \`output.filename\` to \\"worker.js\\" in your webpack config."`
  );
  expect(wrangler2.std.warn).toMatchInlineSnapshot(`
    "WARNING  in configuration
    The 'mode' option has not been set, webpack will fallback to 'production' for this value. Set 'mode' option to 'development' or 'production' to enable defaults for each environment.
    You can also set it to 'none' to disable any default behavior. Learn more: https://webpack.js.org/configuration/mode/"
  `);
});
