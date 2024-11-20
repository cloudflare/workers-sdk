import { readdir, readFile, stat } from "fs/promises";
import { homedir, userInfo } from "os";
import { exit } from "process";
import {
	crash,
	endSection,
	log,
	logRaw,
	newline,
	startSection,
	status,
	success,
	updateStatus,
} from "@cloudflare/cli";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { inputPrompt, spinner } from "@cloudflare/cli/interactive";
import { logger } from "../../logger";
import { pollSSHKeysUntilCondition } from "../cli";
import { SshPublicKeysService } from "../client";
import {
	checkEverythingIsSet,
	handleFailure,
	interactWithUser,
} from "../common";
import { wrap } from "../helpers/wrap";
import { validatePublicSSHKeyCLI, validateSSHKey } from "./validate";
import type { Config } from "../../config";
import type {
	CommonYargsArgvJSON,
	CommonYargsArgvSanitizedJSON,
	StrictYargsOptionsToInterfaceJSON,
} from "../../yargs-types";
import type {
	ListSSHPublicKeys,
	SSHPublicKeyID,
	SSHPublicKeyItem,
} from "../client";

function createSSHPublicKeyOptionalYargs(yargs: CommonYargsArgvJSON) {
	return yargs
		.option("name", {
			type: "string",
			describe:
				"The alias to your ssh key, you can put a recognisable name for you here",
		})
		.option("public-key", {
			type: "string",
			describe:
				"An SSH public key, you can specify either a path or the ssh key directly here",
		});
}

/**
 *  Tries to retrieve the SSH key if sshKeyPath is a path to a ssh key.
 *
 *  If the parameter is a ssh key, it will return it.
 *
 *  On both paths of the code we will validate the SSH key.
 */
async function retrieveSSHKey(
	sshKeyPath: string,
	{ json }: { json: boolean } = { json: false }
): Promise<string> {
	try {
		const file = (await readFile(sshKeyPath)).toString();
		validatePublicSSHKeyCLI(file, { json });
		return file;
	} catch (err) {
		if (!json) {
			logger.debug("couldn't read the file, assuming input is an ssh key");
		}
		validatePublicSSHKeyCLI(sshKeyPath, { json });
		return sshKeyPath;
	}
}

export async function sshPrompts(
	args: CommonYargsArgvSanitizedJSON,
	keys: ListSSHPublicKeys | undefined = undefined
): Promise<SSHPublicKeyID | undefined> {
	const [key, prompt] = await shouldPromptForNewSSHKeyAppear(keys);
	if (prompt) {
		const yes = await inputPrompt({
			question:
				"You didn't add any public keys from your .ssh folder, do you want to add one?",
			label: "",
			defaultValue: false,
			helpText:
				"If you don't add a public ssh key, you won't be able to ssh into your container unless you set it up",
			type: "confirm",
		});
		if (yes) {
			const sshKey = await promptForSSHKey({
				...args,
				name: undefined,
				publicKey: undefined,
			});
			updateStatus(
				"You will be able to ssh into containers where you add this ssh key from now on!"
			);
			return sshKey.id;
		}

		return key || undefined;
	}

	return key || undefined;
}

export const sshCommand = (yargs: CommonYargsArgvJSON) => {
	return yargs
		.command(
			"list",
			"list the ssh keys added to your account",
			(args) => args,
			(args) =>
				handleFailure(async (sshArgs: CommonYargsArgvSanitizedJSON, config) => {
					// check we are in CI or if the user wants to just use JSON
					if (!interactWithUser(sshArgs)) {
						const sshKeys = await SshPublicKeysService.listSshPublicKeys();
						console.log(JSON.stringify(sshKeys, null, 4));
						return;
					}

					await handleListSSHKeysCommand(sshArgs, config);
				})(args)
		)
		.command(
			"create",
			"create an ssh key",
			(args) => createSSHPublicKeyOptionalYargs(args),
			(args) =>
				handleFailure(
					async (
						sshArgs: StrictYargsOptionsToInterfaceJSON<
							typeof createSSHPublicKeyOptionalYargs
						>,
						_config
					) => {
						// check we are in CI or if the user wants to just use JSON
						if (!interactWithUser(sshArgs)) {
							const body = checkEverythingIsSet(sshArgs, ["publicKey", "name"]);
							const sshKey = await retrieveSSHKey(body.publicKey, {
								json: true,
							});
							const addedSSHKey = await SshPublicKeysService.createSshPublicKey(
								{
									...body,
									public_key: sshKey.trim(),
								}
							);
							console.log(JSON.stringify(addedSSHKey, null, 4));
							return;
						}

						await handleCreateSSHPublicKeyCommand(sshArgs);
					}
				)(args)
		);
};

async function tryToRetrieveAllDefaultSSHKeyPaths(): Promise<string[]> {
	const HOME = homedir();
	const path = `${HOME}/.ssh`;
	const paths = [];
	try {
		const dirList = await readdir(path);
		for (const file of dirList) {
			if (file.endsWith(".pub")) {
				const s = await stat(`${path}/${file}`);
				if (s.isFile()) {
					paths.push(`${path}/${file}`);
				}
			}
		}
	} catch (err) {
		// well, we tried with good defaults.
		return [];
	}

	return paths;
}

/**
 * Will try to retrieve a default path to showcase to the user on where is their public ssh key
 */
async function tryToRetrieveADefaultPath(): Promise<string> {
	const paths = await tryToRetrieveAllDefaultSSHKeyPaths();
	const path = paths.pop();
	return path ?? "";
}

/**
 * Formats nicely the second part of the ssh key to showcase to the user
 */
function clipPublicSSHKey(value: string): string {
	return value
		.split(" ")
		.slice(1)
		.map((val, i) =>
			dim(val.length >= 10 && i === 0 ? val.slice(0, 10) + "..." : val)
		)
		.join(" ");
}

/**
 * Does a really simple check to see if the SSH key exist prompt in wrangler cloudchamber create should appear
 */
async function shouldPromptForNewSSHKeyAppear(
	keys: ListSSHPublicKeys | undefined = undefined
): Promise<[SSHPublicKeyID | undefined, boolean]> {
	try {
		const { start, stop } = spinner();
		start("Loading");
		const [sshKeys, err] =
			keys !== undefined
				? [keys, null]
				: await wrap(pollSSHKeysUntilCondition(() => true));
		stop();
		if (err !== null) {
			log(
				"\n" +
					status.warning +
					" We couldn't load the ssh public keys of the account, so Wrangler doesn't know if you have your SSH keys configured right. Try again?\n"
			);
			// we couldn't get ssh keys, don't prompt for adding a ssh key
			return [undefined, false];
		}

		const defaultSSHKeyPaths = await tryToRetrieveAllDefaultSSHKeyPaths();
		if (defaultSSHKeyPaths.length === 0) {
			return [undefined, false];
		}

		let foundValidSSHKeyThatDontExist = false;
		for (const defaultSSHKeyPath of defaultSSHKeyPaths) {
			const file = (await readFile(defaultSSHKeyPath)).toString().trim();
			try {
				validateSSHKey(file);
			} catch {
				// invalid ssh key, fail silently
				continue;
			}

			const key = sshKeys.find((k) => k.public_key?.includes(file));
			// we found one!
			if (key) {
				return [key.id, false];
			}

			foundValidSSHKeyThatDontExist = true;
		}

		// we found a valid ssh key that doesn't exist in the API,
		// and the user doesn't have any of their ssh keys added
		return [undefined, foundValidSSHKeyThatDontExist];
	} catch (err) {
		// ignore error and return false
		return [undefined, false];
	}
}

async function handleListSSHKeysCommand(_args: unknown, _config: Config) {
	startSection("SSH Keys", "", false);
	const { start, stop } = spinner();
	start("Loading your ssh keys");
	const [sshKeys, err] = await wrap(pollSSHKeysUntilCondition(() => true));
	stop();
	if (err) {
		throw err;
	}

	if (sshKeys.length === 0) {
		endSection(
			"No ssh keys added to your account!",
			"You can add one with\n" + brandColor("wrangler cloudchamber ssh create")
		);
		return;
	}

	for (const sshKey of sshKeys) {
		newline();
		updateStatus(
			`${sshKey.name}\nID: ${dim(sshKey.id)}\nKey: ${dim(
				(sshKey.public_key ?? "").trim()
			)}`,
			false
		);
	}

	endSection("");
}

/**
 * CLI process of adding a new SSH Key.
 *
 * Will try to assume defaults to showcase to the user so they can add it faster.
 *
 */
async function handleCreateSSHPublicKeyCommand(
	args: StrictYargsOptionsToInterfaceJSON<
		typeof createSSHPublicKeyOptionalYargs
	>
) {
	startSection(
		"Choose an ssh key to add",
		"It will allow you to ssh into new containers"
	);

	await promptForSSHKey(args);

	// Success and bail
	success("You are now able to ssh into your containers");
	logRaw(
		dim(
			"\nRemember that you will have to wait for a container restart until you're able to ssh into it"
		)
	);
}

async function promptForSSHKey(
	args: StrictYargsOptionsToInterfaceJSON<
		typeof createSSHPublicKeyOptionalYargs
	>
): Promise<SSHPublicKeyItem> {
	const { username } = userInfo();
	const name = await inputPrompt({
		question: "Name your ssh key in a recognisable format for later",
		label: "name",
		validate: (value) => {
			if (typeof value !== "string") {
				return "unknown error";
			}
			if (value.length === 0) {
				return "you should fill this input";
			}
		},
		defaultValue: args.name ?? "",
		initialValue: args.name ?? "",
		helpText: `for example: 'ssh-key-${username || "me"}'`,
		type: "text",
	});

	// Try to retrieve a default ssh path by looking in their /home/.../.ssh
	const defaultSSHKeyPath = await tryToRetrieveADefaultPath();

	const sshKeyPath = await inputPrompt({
		question: "Insert the path to your public ssh key",
		label: "ssh_key",
		validate: (value) => {
			if (typeof value !== "string") {
				return "unknown error";
			}
			if (value.length === 0) {
				return "you should fill this input";
			}
		},
		defaultValue: args.publicKey ?? defaultSSHKeyPath,
		initialValue: args.publicKey ?? defaultSSHKeyPath,
		helpText: "Or insert the key directly",
		type: "text",
	});

	// Retrieve their ssh key and validate it
	const sshKey = await retrieveSSHKey(sshKeyPath);

	log(
		`${brandColor("Verified")} public key successfully!\n` +
			brandColor(sshKey.split(" ").slice(0, 1).join(" ")) +
			" " +
			clipPublicSSHKey(sshKey)
	);

	// Add it to the system
	const { start, stop } = spinner();
	start("Adding your ssh key");
	const [res, err] = await wrap(
		SshPublicKeysService.createSshPublicKey({
			public_key: sshKey.trim(),
			name,
		})
	);
	stop();
	if (err != null) {
		crash("Error adding your public ssh key: " + err.message);
		exit(1);
	}

	return res;
}
