/* eslint-disable @typescript-eslint/consistent-type-imports */
import { resolve } from "path";
import { PassThrough } from "stream";
import chalk from "chalk";
import { passthrough } from "msw";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { msw } from "./helpers/msw";

//turn off chalk for tests due to inconsistencies between operating systems
chalk.level = 0;

// In general we don't want the ConfigController to watch the config files
// as this tends to make the tests flaky.
vi.stubEnv("WRANGLER_CI_DISABLE_CONFIG_WATCHING", "true");

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

vi.mock("undici", async (importOriginal) => {
	return {
		...(await importOriginal<typeof import("undici")>()),
		/**
		 * So... Why do we have this hacky mock?
		 * First, the requirements that necessitated it (if you're looking at this code in horror at some point in the future and these no longer apply, feel free to adjust this implementation!)
		 * - Wrangler supports Node v16. Once Wrangler only supports Node v18 we can use globalThis.fetch directly and remove this hack
		 * - MSW makes it difficult to use custom interceptors, and _really_ wants you to use globalThis.fetch. In particular, it doesn't support intercepting undici.fetch
		 * Because Wrangler supports Node v16, we have to use undici's fetch directly rather than using globalThis.fetch. We'd also like to intercept requests with MSW
		 * Therefore, we mock undici in tests to replace the imported fetch with globalThis.fetch (which MSW will replace with a mocked version—hence the getter, so that we always get the up to date mocked version)
		 * We're able to delegate to globalThis.fetch in our tests because we run our test in Node v18
		 */
		get fetch() {
			// Here be dragons (see above)
			return globalThis.fetch;
		},
	};
});

vi.mock("../package-manager");

vi.mock("../update-check");

beforeAll(() => {
	msw.listen({
		onUnhandledRequest: (request) => {
			const { hostname, href } = new URL(request.url);
			const localHostnames = ["localhost", "127.0.0.1"]; // TODO: add other local hostnames if you need them
			if (localHostnames.includes(hostname)) {
				return passthrough();
			}

			throw new Error(
				`No mock found for ${request.method} ${href}
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

vi.mock("../is-ci", async (importOriginal) => {
	const original = await importOriginal<typeof import("../is-ci")>();
	return { ...original, CI: { isCI: vi.fn().mockImplementation(() => false) } };
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
	vi.spyOn(realModule, "getMetricsConfig").mockImplementation(() => {
		return {
			enabled: false,
			deviceId: "mock-device",
			userId: undefined,
		};
	});
	return realModule;
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
		execa: vi.fn((...args: Parameters<typeof realModule.execa>) => {
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

vi.mock("@cloudflare/cli/streams", async () => {
	const stdout = new PassThrough();
	const stderr = new PassThrough();

	return {
		__esModule: true,
		stdout,
		stderr,
	};
});

vi.mock("../../package.json", () => {
	return {
		version: "x.x.x",
	};
});

// Disable subdomain mixed state check for tests (specific test will enable it).
beforeEach(() => {
	vi.stubEnv("WRANGLER_DISABLE_SUBDOMAIN_MIXED_STATE_CHECK", "true");
});
