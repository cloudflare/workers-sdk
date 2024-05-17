/* eslint-disable @typescript-eslint/consistent-type-imports */
import path, { resolve } from "node:path";
import { PassThrough } from "node:stream";
import chalk from "chalk";
import { useApp } from "ink";
import fetchMock from "jest-fetch-mock";
import jestFetchMock from "jest-fetch-mock";
import { useEffect } from "react";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { MetricsConfigOptions } from "../metrics/metrics-config";
import { getBasePath } from "../paths";
import { MockWebSocket } from "./helpers/mock-web-socket";
import { msw } from "./helpers/msw";

//turn off chalk for tests due to inconsistencies between operating systems
chalk.level = 0;

/**
 * The relative path between the bundled code and the Wrangler package.
 * This is used as a reliable way to compute paths relative to the Wrangler package
 * in the source files, rather than relying upon `__dirname` which can change depending
 * on whether the source files have been bundled and the location of the outdir.
 *
 * This is exposed in the source via the `getBasePath()` function, which should be used
 * in place of `__dirname` and similar Node.js constants.
 */
(
	global as unknown as { __RELATIVE_PACKAGE_PATH__: string }
).__RELATIVE_PACKAGE_PATH__ = "..";

// Set `LC_ALL` to fix the language as English for the messages thrown by Yargs.
process.env.LC_ALL = "en";

vi.mock("ansi-escapes", () => {
	return {
		__esModule: true,
		default: vi.fn().mockImplementation(async (options) => options.port),
	};
});

// Mock out getPort since we don't actually care about what ports are open in unit tests.
vi.mock("get-port", async (importOriginal) => {
	const { default: getPort } =
		await importOriginal<typeof import("get-port")>();
	return {
		__esModule: true,
		default: vi.fn(getPort),
	};
});

vi.mock("child_process", async (importOriginal) => {
	const cp = await importOriginal<typeof import("child_process")>();
	return {
		__esModule: true,
		...cp,
		default: cp,
		spawnSync: vi.fn().mockImplementation((binary, ...args) => {
			if (binary === "cloudflared") {
				return { error: true };
			}
			return cp.spawnSync(binary, ...args);
		}),
	};
});

vi.mock("log-update", () => {
	const fn = function (..._: string[]) {};
	fn["clear"] = () => {};
	fn["done"] = () => {};
	fn["createLogUpdate"] = () => fn;
	return fn;
});

vi.mock("ws", async (importOriginal) => {
	// `miniflare` needs to use the real `ws` module, but tail tests require us
	// to mock `ws`. `esbuild-jest` won't let us use type annotations in our tests
	// if those files contain `vi.mock()` calls, so we mock here, pass-through
	// by default, and allow mocking conditionally.
	const realModule = await importOriginal<typeof import("ws")>();
	const module = {
		__esModule: true,
		useOriginal: true,
	};
	Object.defineProperties(module, {
		default: {
			get() {
				return module.useOriginal ? realModule : MockWebSocket;
			},
		},
		WebSocket: {
			get() {
				return module.useOriginal ? realModule.WebSocket : MockWebSocket;
			},
		},
		WebSocketServer: {
			get() {
				return realModule.WebSocketServer;
			},
		},
	});
	return module;
});

vi.mock("undici", async (importOriginal) => {
	return {
		...(await importOriginal<typeof import("undici")>()),
		fetch: jestFetchMock,
	};
});

fetchMock.doMock(() => {
	// Any un-mocked fetches should throw
	throw new Error("Unexpected fetch request");
});

vi.mock("../package-manager");

vi.mock("../update-check");

// requests not mocked with `jest-fetch-mock` fall through
// to `mock-service-worker`
fetchMock.dontMock();
beforeAll(() => {
	msw.listen({
		onUnhandledRequest: (request) => {
			const { hostname } = request.url;
			const localHostnames = ["localhost", "127.0.0.1"]; // TODO: add other local hostnames if you need them
			if (localHostnames.includes(hostname)) {
				return request.passthrough();
			}

			throw new Error(
				`No mock found for ${request.method} ${request.url.href}
				`
			);
		},
	});
});
afterEach(() => {
	msw.restoreHandlers();
	msw.resetHandlers();
});
afterAll(() => msw.close());

vi.mock("../dev/dev", () => {
	return vi.fn().mockImplementation(() => {
		const { exit } = useApp();
		useEffect(() => {
			exit();
		});
		return null;
	});
});

// Make sure that we don't accidentally try to open a browser window when running tests.
// We will actually provide a mock implementation for `openInBrowser()` within relevant tests.
vi.mock("../open-in-browser");

// Mock the functions involved in getAuthURL so we don't take snapshots of the constantly changing URL.
vi.mock("../user/generate-auth-url", () => {
	return {
		generateRandomState: vi.fn().mockImplementation(() => "MOCK_STATE_PARAM"),
		generateAuthUrl: vi
			.fn()
			.mockImplementation(({ authUrl, clientId, callbackUrl, scopes }) => {
				return (
					authUrl +
					`?response_type=code&` +
					`client_id=${encodeURIComponent(clientId)}&` +
					`redirect_uri=${encodeURIComponent(callbackUrl)}&` +
					// we add offline_access manually for every request
					`scope=${encodeURIComponent(
						[...scopes, "offline_access"].join(" ")
					)}&` +
					`state=MOCK_STATE_PARAM&` +
					`code_challenge=${encodeURIComponent("MOCK_CODE_CHALLENGE")}&` +
					`code_challenge_method=S256`
				);
			}),
	};
});

vi.mock("../is-ci", () => {
	return { CI: { isCI: vi.fn().mockImplementation(() => false) } };
});

vi.mock("../user/generate-random-state", () => {
	return {
		generateRandomState: vi.fn().mockImplementation(() => "MOCK_STATE_PARAM"),
	};
});

vi.mock("xdg-app-paths", () => {
	return {
		__esModule: true,
		default: vi.fn().mockImplementation(() => {
			return {
				config() {
					return resolve("test-xdg-config");
				},
			};
		}),
	};
});

vi.mock("../metrics/metrics-config", async (importOriginal) => {
	const realModule =
		await importOriginal<typeof import("../metrics/metrics-config")>();
	const fakeModule = {
		...realModule,
		// Although we mock out the getMetricsConfig() function in most tests,
		// we need a way to reinstate it for the metrics specific tests.
		// This is what `useOriginal` is for.
		useOriginal: false,
		getMetricsConfig: (options: MetricsConfigOptions) =>
			fakeModule.useOriginal
				? realModule.getMetricsConfig(options)
				: async () => {
						return {
							enabled: false,
							deviceId: "mock-device",
							userId: undefined,
						};
					},
	};
	return fakeModule;
});
vi.mock("prompts", () => {
	return {
		__esModule: true,
		default: vi.fn((...args) => {
			throw new Error(
				`Unexpected call to \`prompts("${JSON.stringify(
					args
				)}")\`.\nYou should use \`mockConfirm()/mockSelect()/mockPrompt()\` to mock calls to \`confirm()\` with expectations.`
			);
		}),
	};
});

vi.mock("execa", async (importOriginal) => {
	const realModule = await importOriginal<typeof import("execa")>();

	return {
		...realModule,
		execa: vi.fn<Parameters<typeof realModule.execa>>((...args) => {
			return args[0] === "mockpm"
				? Promise.resolve()
				: realModule.execa(...args);
		}),
	};
});

afterEach(() => {
	// It is important that we clear mocks between tests to avoid leakage.
	vi.clearAllMocks();
});

// make jest understand virtual `worker:` imports
vi.mock("worker:startDevWorker/ProxyWorker", () => {
	return {
		__esModule: true,
		default: path.resolve(getBasePath(), `wrangler-dist/ProxyWorker.js`),
	};
});
vi.mock("worker:startDevWorker/InspectorProxyWorker", () => {
	return {
		__esModule: true,
		default: path.resolve(
			getBasePath(),
			`wrangler-dist/InspectorProxyWorker.js`
		),
	};
});

vi.mock("@cloudflare/cli/streams", async () => {
	const stdout = new PassThrough();
	const stderr = new PassThrough();

	return {
		__esModule: true,
		stdout,
		stderr,
	};
});
