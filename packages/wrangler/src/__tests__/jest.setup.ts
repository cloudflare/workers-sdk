import chalk from "chalk";
import fetchMock from "jest-fetch-mock";
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

// Mock out getPort since we don't actually care about what ports are open in unit tests.
jest.mock("get-port", () => {
	return {
		__esModule: true,
		default: jest.fn().mockImplementation(async (options) => options.port),
	};
});

jest.mock("child_process", () => {
	return {
		__esModule: true,
		...jest.requireActual("child_process"),
		spawnSync: jest.fn().mockImplementation(async (binary, ...args) => {
			if (binary === "cloudflared") return { error: true };
			return jest.requireActual("child_process").spawnSync(binary, ...args);
		}),
	};
});

jest.mock("ws", () => {
	return {
		__esModule: true,
		default: MockWebSocket,
	};
});

jest.mock("undici", () => {
	return {
		...jest.requireActual("undici"),
		fetch: jest.requireActual("jest-fetch-mock"),
	};
});

fetchMock.doMock(() => {
	// Any un-mocked fetches should throw
	throw new Error("Unexpected fetch request");
});

jest.mock("../package-manager");

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

jest.mock("../dev/dev", () => {
	const { useApp } = jest.requireActual("ink");
	const { useEffect } = jest.requireActual("react");
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
jest.mock("../open-in-browser");

// Mock the functions involved in getAuthURL so we don't take snapshots of the constantly changing URL.
jest.mock("../user/generate-auth-url", () => {
	return {
		generateRandomState: jest.fn().mockImplementation(() => "MOCK_STATE_PARAM"),
		generateAuthUrl: jest
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

jest.mock("../is-ci", () => {
	return { CI: { isCI: jest.fn().mockImplementation(() => false) } };
});

jest.mock("../user/generate-random-state", () => {
	return {
		generateRandomState: jest.fn().mockImplementation(() => "MOCK_STATE_PARAM"),
	};
});

jest.mock("xdg-app-paths", () => {
	return {
		__esModule: true,
		default: jest.fn().mockImplementation(() => {
			return {
				config() {
					return jest.requireActual("node:path").resolve("test-xdg-config");
				},
			};
		}),
	};
});

jest.mock("../metrics/metrics-config", () => {
	const realModule = jest.requireActual("../metrics/metrics-config");
	const fakeModule = {
		...realModule,
		// Although we mock out the getMetricsConfig() function in most tests,
		// we need a way to reinstate it for the metrics specific tests.
		// This is what `useOriginal` is for.
		useOriginal: false,
		getMetricsConfig: (...args: unknown[]) =>
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
jest.mock("prompts", () => {
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
