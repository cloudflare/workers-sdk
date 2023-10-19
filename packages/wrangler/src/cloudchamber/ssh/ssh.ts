import { readdir, stat, readFile } from "fs/promises";
import { homedir, userInfo } from "os";
import { exit } from "process";
import {
	error,
	updateStatus,
	log,
	startSection,
	endSection,
	newline,
	logRaw,
	status,
	success,
} from "@cloudflare/cli";
import { dim, brandColor } from "@cloudflare/cli/colors";
import { inputPrompt, spinner } from "@cloudflare/cli/interactive";
import { pollSSHKeysUntilCondition } from "../cli";
import { SshPublicKeysService } from "../client";
import {
	handleFailure,
	checkEverythingIsSet,
	interactWithUser,
} from "../common";
import { wrap } from "../helpers/wrap";
import { isInvalidPublicSSHKey } from "./validate";
import type { CommonYargsOptions } from "../../yargs-types";
import type {
	ListSSHPublicKeys,
	SSHPublicKeyID,
	SSHPublicKeyItem,
} from "../client";
import type {
	CommonCloudchamberConfiguration,
	inferYargsFn,
	CloudchamberConfiguration,
} from "../common";
import type { Argv, CommandModule } from "yargs";

function createSSHPublicKeyOptionalYargs<T>(yargs: Argv<T>) {
	return yargs
		.option("name", {
			type: "string",
			describe:
				"The alias to your ssh key, you can put a recognisable name for you here",
		})
		.option("public_key", {
			type: "string",
			describe:
				"An SSH public key, you can specify either a path or the ssh key directly here",
		});
}

/**
 *  Tries to retrieve teh SSH key if sshKeyPath is a path to a ssh key.
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
		const reason = isInvalidPublicSSHKey(file);
		if (reason !== null) {
			if (!json) error(reason);
			else console.log(JSON.stringify({ error: reason }, null, 4));
			exit(1);
		}

		return file;
	} catch (err) {
		if (!json)
			updateStatus("couldn't read the file, assuming input is an ssh key");
		const reason = isInvalidPublicSSHKey(sshKeyPath);
		if (reason !== null) {
			if (!json) error(reason);
			else console.log(JSON.stringify({ error: reason }, null, 4));
			exit(1);
		}

		return sshKeyPath;
	}
}

export async function sshPrompts(
	config: CloudchamberConfiguration,
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
			const sshKey = await promptForSSHKey(
				{ name: undefined, public_key: undefined },
				config
			);
			updateStatus(
				"You will be able to ssh into containers where you add this ssh key from now on!"
			);
			return sshKey.id;
		}

		return key || undefined;
	}

	return key || undefined;
}

export const SSHCommand: CommandModule<
	CommonYargsOptions & CommonCloudchamberConfiguration,
	CommonYargsOptions & CommonCloudchamberConfiguration
> = {
	command: "ssh",
	describe: "Manage the ssh keys of your account",
	handler: () => {},
	builder: (yargs) => {
		return yargs
			.command(
				"list",
				"list the ssh keys added to your account",
				(args) => createSSHPublicKeyOptionalYargs(args),
				(args) =>
					handleFailure<typeof args>(async (sshArgs, config) => {
						// check we are in CI or if the user wants to just use JSON
						if (!interactWithUser(config)) {
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
					handleFailure<typeof args>(async (sshArgs, config) => {
						// check we are in CI or if the user wants to just use JSON
						if (!interactWithUser(config)) {
							const body = checkEverythingIsSet(sshArgs, [
								"public_key",
								"name",
							]);
							const sshKey = await retrieveSSHKey(body.public_key, {
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

						await handleCreateSSHPublicKeyCommand(sshArgs, config);
					})(args)
			)
			.demandCommand();
	},
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
	if (paths.length === 0) return "";
	return paths.pop()!;
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
export async function shouldPromptForNewSSHKeyAppear(
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
			const reason = isInvalidPublicSSHKey(file);
			if (reason !== null) {
				// probably a ssh key that we don't support
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

export async function handleListSSHKeysCommand(
	_args: unknown,
	_config: CloudchamberConfiguration
) {
	startSection("SSH Keys", "", false);
	const { start, stop } = spinner();
	start("Loading your ssh keys");
	const [sshKeys, err] = await wrap(pollSSHKeysUntilCondition(() => true));
	stop();
	if (err) throw err;

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
export async function handleCreateSSHPublicKeyCommand(
	args: inferYargsFn<typeof createSSHPublicKeyOptionalYargs>,
	config: CloudchamberConfiguration
) {
	startSection(
		"Choose an ssh key to add",
		"It will allow you to ssh into new containers"
	);

	await promptForSSHKey(args, config);

	// Success and bail
	success("You are now able to ssh into your containers");
	logRaw(
		dim(
			"\nRemember that you will have to wait for a container restart until you're able to ssh into it"
		)
	);
}

export async function promptForSSHKey(
	args: inferYargsFn<typeof createSSHPublicKeyOptionalYargs>,
	_config: CloudchamberConfiguration
): Promise<SSHPublicKeyItem> {
	const { username } = userInfo();
	const name = await inputPrompt({
		question: "Name your ssh key in a recognisable format for later",
		label: "name",
		validate: (value) => {
			if (typeof value !== "string") return "unknown error";
			if (value.length === 0) return "you should fill this input";
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
			if (typeof value !== "string") return "unknown error";
			if (value.length === 0) return "you should fill this input";
		},
		defaultValue: args.public_key ?? defaultSSHKeyPath,
		initialValue: args.public_key ?? defaultSSHKeyPath,
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
		error("Error adding your public ssh key: " + err.message);
		exit(1);
	}

	return res;
}
