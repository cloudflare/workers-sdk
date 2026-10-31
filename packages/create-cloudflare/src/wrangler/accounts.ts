import { updateStatus } from "@cloudflare/cli-shared-helpers";
import { brandColor, dim } from "@cloudflare/cli-shared-helpers/colors";
import {
	inputPrompt,
	spinner,
} from "@cloudflare/cli-shared-helpers/interactive";
import { runWranglerCommand } from "helpers/command";
import { detectPackageManager } from "helpers/packageManagers";
import * as cf from "../cf/accounts";
import { usesCfCli } from "../cf/config";
import { reporter } from "../metrics";
import type { C3Context } from "types";

/** Select an account by ID, keeping display names independent of identity. */
export async function chooseAccount(ctx: C3Context) {
	// Check if account ID is provided via environment variable (matching wrangler's behavior)
	const accountIdFromEnv = process.env.CLOUDFLARE_ACCOUNT_ID;
	if (accountIdFromEnv) {
		updateStatus(`Using CLOUDFLARE_ACCOUNT_ID from the environment`);
		ctx.account = { id: accountIdFromEnv, name: "" };
		return;
	}

	const s = spinner();
	s.start(`Selecting Cloudflare account ${dim("retrieving accounts")}`);
	const accounts = usesCfCli(ctx.project.path)
		? await cf.listAccounts()
		: await listAccounts();

	if (accounts.length === 0) {
		throw new Error(
			"Unable to find any accounts to deploy to! Please ensure you're logged in as a user that can deploy Workers."
		);
	}

	let account: C3Context["account"];
	if (accounts.length === 1) {
		account = accounts[0];
		s.stop(`${brandColor("account")} ${dim(account.name)}`);
	} else {
		s.stop(
			`${brandColor("account")} ${dim("more than one account available")}`
		);
		const accountOptions = accounts.map(({ name, id }) => ({
			label: `${name} (${id})`,
			value: id,
		}));

		const accountId = await inputPrompt({
			type: "select",
			question: "Which account do you want to use?",
			options: accountOptions,
			label: "account",
			defaultValue: accountOptions[0].value,
		});
		const selectedAccount = accounts.find(({ id }) => id === accountId);
		if (!selectedAccount) {
			throw new Error("Unable to find the selected Cloudflare account.");
		}
		account = selectedAccount;
	}

	ctx.account = account;
}

/**
 * Ensures the user is logged in to Cloudflare, prompting a browser login if not.
 *
 * Projects that use the `cf` CLI are logged in with `cf`, since it does not
 * share credentials with Wrangler.
 *
 * @param ctx The C3 context.
 * @returns `true` if the user is logged in.
 */
export const login = async (ctx: C3Context) => {
	return reporter.collectAsyncMetrics({
		eventPrefix: "c3 login",
		props: {
			args: ctx.args,
		},
		async promise() {
			const { npx } = detectPackageManager();
			const useCf = usesCfCli(ctx.project.path);

			const s = spinner();
			s.start(
				`Logging into Cloudflare ${dim("checking authentication status")}`
			);
			const isAlreadyLoggedIn = useCf
				? await cf.isLoggedIn()
				: await isLoggedIn();
			s.stop(brandColor(isAlreadyLoggedIn ? "logged in" : "not logged in"));

			reporter.setEventProperty("isAlreadyLoggedIn", isAlreadyLoggedIn);

			if (isAlreadyLoggedIn) {
				return true;
			}

			if (useCf) {
				const success = await cf.login();
				updateStatus(
					`${brandColor(success ? "allowed" : "denied")} ${dim("via `cf auth login`")}`
				);
				reporter.setEventProperty("isLoginSuccessful", success);
				return success;
			}

			s.start(
				`Logging into Cloudflare ${dim("This will open a browser window")}`
			);

			// We're using a custom spinner since this is a little complicated.
			// We want to vary the done status based on the output
			const output = await runWranglerCommand([npx, "wrangler", "login"], {
				silent: true,
			});
			const success = /Successfully logged in/.test(output);

			const verb = success ? "allowed" : "denied";
			s.stop(`${brandColor(verb)} ${dim("via `wrangler login`")}`);

			reporter.setEventProperty("isLoginSuccessful", success);

			return success;
		},
	});
};

/** List every account returned by Wrangler without using display names as keys. */
export async function listAccounts() {
	const { npx } = detectPackageManager();

	const output = await runWranglerCommand([npx, "wrangler", "whoami"], {
		silent: true,
	});

	const accounts: { id: string; name: string }[] = [];
	output.split("\n").forEach((line) => {
		const match = line.match(/│\s+(.+)\s+│\s+(\w{32})\s+│/);
		if (match) {
			accounts.push({ name: match[1].trim(), id: match[2].trim() });
		}
	});

	return accounts;
}

export const isLoggedIn = async () => {
	const { npx } = detectPackageManager();
	try {
		const output = await runWranglerCommand([npx, "wrangler", "whoami"], {
			silent: true,
		});
		return /You are logged in/.test(output);
	} catch {
		return false;
	}
};
