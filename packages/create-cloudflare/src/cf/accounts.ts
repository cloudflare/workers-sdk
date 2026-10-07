import { CancelError } from "@cloudflare/cli-shared-helpers/error";
import { runWranglerCommand } from "helpers/command";
import { detectPackageManager } from "helpers/packageManagers";

/** The subset of the JSON printed by `cf auth whoami` that C3 relies on. */
type CfWhoami = {
	authenticated?: boolean;
	tokenValid?: boolean;
	accounts?: { id: string; name: string }[];
};

async function cfWhoami(): Promise<CfWhoami> {
	const { npx } = detectPackageManager();
	try {
		const output = await runWranglerCommand([npx, "cf", "auth", "whoami"], {
			silent: true,
		});
		// Skip anything, such as warnings, printed around the JSON object
		return JSON.parse(
			output.slice(output.indexOf("{"), output.lastIndexOf("}") + 1)
		) as CfWhoami;
	} catch (e) {
		if (e instanceof CancelError) {
			throw e;
		}
		return {};
	}
}

/**
 * Checks whether the `cf` CLI is authenticated with valid credentials.
 *
 * @returns `true` if `cf` can make authenticated requests.
 */
export async function isLoggedIn(): Promise<boolean> {
	const { authenticated, tokenValid } = await cfWhoami();
	return authenticated === true && tokenValid !== false;
}

/**
 * Lists the accounts available to the `cf` CLI's credentials.
 *
 * @returns A map of account names to account IDs.
 */
export async function listAccounts(): Promise<Record<string, string>> {
	const { accounts = [] } = await cfWhoami();
	return Object.fromEntries(accounts.map(({ name, id }) => [name, id]));
}

/**
 * Logs in with `cf auth login`.
 *
 * The command runs with inherited stdio because its default device
 * authorization flow prints a code that the user must confirm in the browser.
 *
 * @returns `true` if `cf` is authenticated once the login flow completes.
 */
export async function login(): Promise<boolean> {
	const { npx } = detectPackageManager();
	try {
		await runWranglerCommand([npx, "cf", "auth", "login"]);
	} catch (e) {
		if (e instanceof CancelError) {
			throw e;
		}
		return false;
	}
	return isLoggedIn();
}
