import assert from "node:assert";

export const isWindows = process.platform === "win32";
export const TEST_TIMEOUT = 1000 * 60 * 5;
export const LONG_TIMEOUT = 1000 * 60 * 10;

// Environment variables that control the E2E tests.
// See .env.example for more details
export const CLOUDFLARE_ACCOUNT_ID =
	process.env.CLOUDFLARE_ACCOUNT_ID ?? "8d783f274e1f82dc46744c297b015a2f";
export const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
export const isExperimental = process.env.E2E_EXPERIMENTAL === "true";
export const workerToTestFilter = process.env.E2E_WORKER_TEST_FILTER;
export const frameworkToTestFilter = process.env.E2E_FRAMEWORK_TEST_FILTER;
export const testPackageManager = isOneOf(
	"E2E_TEST_PM",
	["pnpm", "npm", "yarn", "bun"] as const,
	"pnpm",
);
export const testPackageManagerVersion = process.env.E2E_TEST_PM_VERSION ?? "";
export const runDeployTests = process.env.E2E_RUN_DEPLOY_TESTS === "true";
export const customTempProjectPath = process.env.E2E_PROJECT_PATH;
export const testRetries = process.env.E2E_TEST_RETRIES
	? parseInt(process.env.E2E_TEST_RETRIES)
	: 1;

/** Key codes for interactive prompts. */
export const keys = {
	enter: "\x0d",
	backspace: "\x7f",
	escape: "\x1b",
	up: "\x1b\x5b\x41",
	down: "\x1b\x5b\x42",
	right: "\x1b\x5b\x43",
	left: "\x1b\x5b\x44",
};

function isOneOf<Options extends readonly string[]>(
	key: string,
	possibleValues: Options,
	defaultValue: Options[number],
): Options[number] {
	const value = process.env[key] ?? defaultValue;
	assert(
		possibleValues.includes(value),
		`Invalid environment variable "${key}". Expected one of: ${possibleValues.join(", ")}`,
	);
	return value;
}
