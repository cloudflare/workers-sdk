import { brandColor, dim } from "@cloudflare/cli/colors";
import { inputPrompt, spinner } from "@cloudflare/cli/interactive";
import { runCommand } from "helpers/command";
import { detectPackageManager } from "helpers/packageManagers";
import { reporter } from "../metrics";
import type { C3Context } from "types";

export const chooseAccount = async (ctx: C3Context) => {
	const s = spinner();
	s.start(`Selecting Cloudflare account ${dim("retrieving accounts")}`);
	const accounts = await listAccounts();

	let accountId: string;

	const numAccounts = Object.keys(accounts).length;
	if (numAccounts === 0) {
		throw new Error(
			"Unable to find any accounts to deploy to! Please ensure you're logged in as a user that can deploy Workers.",
		);
	} else if (numAccounts === 1) {
		const accountName = Object.keys(accounts)[0];
		accountId = accounts[accountName];
		s.stop(`${brandColor("account")} ${dim(accountName)}`);
	} else {
		s.stop(
			`${brandColor("account")} ${dim("more than one account available")}`,
		);
		const accountOptions = Object.entries(accounts).map(
			([accountName, id]) => ({
				label: accountName,
				value: id,
			}),
		);

		accountId = await inputPrompt({
			type: "select",
			question: "Which account do you want to use?",
			options: accountOptions,
			label: "account",
			defaultValue: accountOptions[0].value,
		});
	}
	const accountName = Object.keys(accounts).find(
		(account) => accounts[account] == accountId,
	) as string;

	ctx.account = { id: accountId, name: accountName };
};

export const wranglerLogin = async (ctx: C3Context) => {
	return reporter.collectAsyncMetrics({
		eventPrefix: "c3 login",
		props: {
			args: ctx.args,
		},
		async promise() {
			const { npx } = detectPackageManager();

			const s = spinner();
			s.start(
				`Logging into Cloudflare ${dim("checking authentication status")}`,
			);
			const isAlreadyLoggedIn = await isLoggedIn();
			s.stop(brandColor(isAlreadyLoggedIn ? "logged in" : "not logged in"));

			reporter.setEventProperty("isAlreadyLoggedIn", isAlreadyLoggedIn);

			if (isAlreadyLoggedIn) {
				return true;
			}

			s.start(
				`Logging into Cloudflare ${dim("This will open a browser window")}`,
			);

			// We're using a custom spinner since this is a little complicated.
			// We want to vary the done status based on the output
			const output = await runCommand([npx, "wrangler", "login"], {
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

export const listAccounts = async () => {
	const { npx } = detectPackageManager();

	const output = await runCommand([npx, "wrangler", "whoami"], {
		silent: true,
	});

	const accounts: Record<string, string> = {};
	output.split("\n").forEach((line) => {
		const match = line.match(/│\s+(.+)\s+│\s+(\w{32})\s+│/);
		if (match) {
			accounts[match[1].trim()] = match[2].trim();
		}
	});

	return accounts;
};

export const isLoggedIn = async () => {
	const { npx } = detectPackageManager();
	try {
		const output = await runCommand([npx, "wrangler", "whoami"], {
			silent: true,
		});
		return /You are logged in/.test(output);
	} catch (error) {
		return false;
	}
};
