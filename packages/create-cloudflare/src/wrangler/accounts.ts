import { brandColor, dim } from "@cloudflare/cli/colors";
import { spinner } from "@cloudflare/cli/interactive";
import { runCommand } from "helpers/command";
import { detectPackageManager } from "helpers/packageManagers";

export const wranglerLogin = async () => {
	const { npx } = detectPackageManager();

	const s = spinner();
	s.start(`Logging into Cloudflare ${dim("checking authentication status")}`);
	const alreadyLoggedIn = await isLoggedIn();
	s.stop(brandColor(alreadyLoggedIn ? "logged in" : "not logged in"));
	if (alreadyLoggedIn) return true;

	s.start(`Logging into Cloudflare ${dim("This will open a browser window")}`);

	// We're using a custom spinner since this is a little complicated.
	// We want to vary the done status based on the output
	const output = await runCommand([npx, "wrangler", "login"], {
		silent: true,
	});
	const success = /Successfully logged in/.test(output);

	const verb = success ? "allowed" : "denied";
	s.stop(`${brandColor(verb)} ${dim("via `wrangler login`")}`);

	return success;
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
