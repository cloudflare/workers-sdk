export const isWindows = process.platform === "win32";
export const TEST_TIMEOUT = 1000 * 60 * 5;
export const LONG_TIMEOUT = 1000 * 60 * 10;

// Environment variables that control the E2E tests.
// See .env.example for more details
export const CLOUDFLARE_ACCOUNT_ID =
	process.env.CLOUDFLARE_ACCOUNT_ID ?? "8d783f274e1f82dc46744c297b015a2f";
export const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
export const E2E_EXPERIMENTAL = process.env.E2E_EXPERIMENTAL === "true";
export const E2E_WORKER_TEST_FILTER = process.env.E2E_WORKER_TEST_FILTER ?? "";
export const E2E_FRAMEWORK_TEST_FILTER =
	process.env.E2E_FRAMEWORK_TEST_FILTER ?? "";
export const E2E_TEST_PM = process.env.E2E_TEST_PM ?? "";
export const NO_DEPLOY = process.env.E2E_NO_DEPLOY ?? true;
export const E2E_PROJECT_PATH = process.env.E2E_PROJECT_PATH;
export const E2E_TEST_RETRIES = process.env.E2E_TEST_RETRIES
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
