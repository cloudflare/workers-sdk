import chalk from "chalk";
import { vi, beforeAll, afterAll, afterEach } from "vitest";
import createFetchMock from 'vitest-fetch-mock';
import { MockWebSocket } from "./helpers/mock-web-socket";
import { msw } from "./helpers/msw";
import type * as MetricsConfig from "../metrics/metrics-config"
import type * as  ChildProcess from "child_process";
import type * as Execa from "execa"
import type * as Ink from "ink";
import type * as NodePath from "node:path"
import type * as React from "react";
import type { WebSocket } from "ws"



const fetchMocker = createFetchMock(vi);

// sets globalThis.fetch and globalThis.fetchMock to our mocked version
fetchMocker.enableMocks();

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
vi.mock("get-port", () => {
	return {
		__esModule: true,
		default: vi.fn().mockImplementation(async (options) => options.port),
	};
});

vi.mock("child_process", () => {
	return {
		__esModule: true,
		...vi.importActual("child_process"),
		spawnSync: vi.fn().mockImplementation(async (binary, ...args) => {
			if (binary === "cloudflared") return { error: true };


			return (await vi.importActual<typeof ChildProcess>("child_process")).spawnSync(binary, ...args);
		}),
	};
});

vi.mock("ws", async () => {
	// `miniflare` needs to use the real `ws` module, but tail tests require us
	// to mock `ws`. `esbuild-vi` won't let us use type annotations in our tests
	// if those files contain `vi.mock()` calls, so we mock here, pass-through
	// by default, and allow mocking conditionally.
	const realModule = (await vi.importActual<typeof WebSocket>("ws"));
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

vi.mock("undici", () => {
	return {
		...vi.importActual("undici"),
		fetch: vi.importActual("vi-fetch-mock"),
	};
});

fetchMock.doMock(() => {
	// Any un-mocked fetches should throw
	throw new Error("Unexpected fetch request");
});

vi.mock("../package-manager");

// requests not mocked with `vi-fetch-mock` fall through
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

vi.mock("../dev/dev", async () => {
	const { useApp } = (await vi.importActual<typeof Ink>("ink"));
	const { useEffect } = (await vi.importActual<typeof React>("react"));
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
					return (vi.importActual<typeof NodePath>("node:path").then(pkg => pkg.resolve("test-xdg-config")))
				},
			};
		}),
	};
});

vi.mock("../metrics/metrics-config", async () => {
	const realModule = (await vi.importActual<typeof MetricsConfig>("../metrics/metrics-config"));
	const fakeModule = {
		...realModule,
		// Although we mock out the getMetricsConfig() function in most tests,
		// we need a way to reinstate it for the metrics specific tests.
		// This is what `useOriginal` is for.
		useOriginal: false,
		getMetricsConfig: (...args: [MetricsConfig.MetricsConfigOptions]) =>
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

vi.mock("execa", async () => {
	const realModule = (await vi.importActual<typeof Execa>("execa"));

	return {
		...realModule,
		execa: vi.fn((...args: [string]) => {
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
