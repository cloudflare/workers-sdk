import * as url from "url";
import { jest } from "@jest/globals";
import chalk from "chalk";
import fetchMock from "jest-fetch-mock";
import { MockWebSocket } from "./helpers/mock-web-socket";
import { msw } from "./helpers/msw";

import type * as metricsConfig from "../metrics/metrics-config";
import type { generateAuthUrl } from "../user/generate-auth-url";
import type { generateRandomState } from "../user/generate-random-state";
import type getPort from "get-port";

global.__filename = url.fileURLToPath(import.meta.url);
global.__dirname = url.fileURLToPath(new URL(".", import.meta.url));
global.jest = jest;

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

// Mock out getPort since we don't actually care about what ports are open in unit tests.
jest.unstable_mockModule("get-port", () => {
	return {
		__esModule: true,
		default: jest
			.fn<typeof getPort>()
			.mockImplementation(
				async (options) => options?.port as unknown as Promise<number>
			),
	};
});

jest.unstable_mockModule("child_process", async () => {
	const childProcess = await import("child_process");

	return {
		__esModule: true,
		...childProcess,
		default: childProcess,
		spawnSync: jest.fn().mockImplementation((binary, ...args) => {
			if (binary === "cloudflared") return { error: true };
			return (
				childProcess
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					.spawnSync(binary as string, ...(args as any))
			);
		}),
	};
});

jest.unstable_mockModule("ws", async () => {
	// `miniflare` needs to use the real `ws` module, but tail tests require us
	// to mock `ws`. `esbuild-jest` won't let us use type annotations in our tests
	// if those files contain `jest.mock()` calls, so we mock here, pass-through
	// by default, and allow mocking conditionally.
	const realModule = await import("ws");
	const module = {
		__esModule: true,
		useOriginal: true,
	};
	Object.defineProperties(module, {
		default: {
			get() {
				return module.useOriginal ? realModule.default : MockWebSocket;
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

jest.unstable_mockModule("undici", async () => {
	return {
		...(await import("undici")),
		fetch: await import("jest-fetch-mock"),
	};
});

fetchMock.doMock(() => {
	// Any un-mocked fetches should throw
	throw new Error("Unexpected fetch request");
});

jest.unstable_mockModule(
	"../package-manager",
	async () => await import("../package-manager")
);

// requests not mocked with `jest-fetch-mock` fall through
// to `mock-service-worker`
fetchMock.dontMock();
beforeAll(() => {
	msw.listen({
		onUnhandledRequest: (request) => {
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

jest.unstable_mockModule("../dev/dev", async () => {
	const { useApp } = await import("ink");
	const { useEffect } = await import("react");
	return jest.fn().mockImplementation(() => {
		const { exit } = useApp();
		useEffect(() => {
			exit();
		});
		return null;
	});
});

// Make sure that we don't accidentally try to open a browser window when running tests.
// We will actually provide a mock implementation for `openInBrowser()` within relevant tests.
jest.unstable_mockModule(
	"../open-in-browser",
	async () => await import("../open-in-browser")
);

// Mock the functions involved in getAuthURL so we don't take snapshots of the constantly changing URL.
jest.unstable_mockModule("../user/generate-auth-url", () => {
	return {
		generateRandomState: jest
			.fn<typeof generateRandomState>()
			.mockImplementation(() => "MOCK_STATE_PARAM"),
		generateAuthUrl: jest
			.fn<typeof generateAuthUrl>()
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

jest.unstable_mockModule("../is-ci", () => {
	return { CI: { isCI: jest.fn().mockImplementation(() => false) } };
});

jest.unstable_mockModule("../user/generate-random-state", () => {
	return {
		generateRandomState: jest.fn().mockImplementation(() => "MOCK_STATE_PARAM"),
	};
});

jest.unstable_mockModule("xdg-app-paths", () => {
	return {
		__esModule: true,
		default: jest.fn().mockImplementation(() => {
			return {
				async config() {
					return await import("node:path").then(({ resolve }) =>
						resolve("test-xdg-config")
					);
				},
			};
		}),
	};
});

jest.unstable_mockModule("../metrics/metrics-config", async () => {
	const realModule = await import("../metrics/metrics-config");
	const fakeModule = {
		...realModule,
		// Although we mock out the getMetricsConfig() function in most tests,
		// we need a way to reinstate it for the metrics specific tests.
		// This is what `useOriginal` is for.
		useOriginal: false,
		getMetricsConfig: (...args: [metricsConfig.MetricsConfigOptions]) =>
			fakeModule.useOriginal
				? realModule.getMetricsConfig(...args)
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
jest.unstable_mockModule("prompts", () => {
	return {
		__esModule: true,
		default: jest.fn((...args) => {
			throw new Error(
				`Unexpected call to \`prompts("${JSON.stringify(
					args
				)}")\`.\nYou should use \`mockConfirm()/mockSelect()/mockPrompt()\` to mock calls to \`confirm()\` with expectations.`
			);
		}),
	};
});

jest.unstable_mockModule("execa", async () => {
	const realModule = await import("execa");

	return {
		...realModule,
		execa: jest.fn((...args: unknown[]) => {
			return args[0] === "mockpm"
				? Promise.resolve()
				: realModule.execa(...(args as [string, string[]]));
		}),
	};
});

afterEach(() => {
	// It is important that we clear mocks between tests to avoid leakage.
	jest.clearAllMocks();
});
