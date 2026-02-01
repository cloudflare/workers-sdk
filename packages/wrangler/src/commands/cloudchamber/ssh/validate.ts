// validates new SSH public keys
// http://man.openbsd.org/sshd.8#AUTHORIZED_KEYS_FILE_FORMAT
// Public keys consist of the following space-separated fields: options, keytype, base64-encoded key, comment.
// we do not allow the optional "options"
// So the syntax is space-separated: keytype, base64-encoded key, comment

import { exit } from "node:process";
import { UserError } from "@cloudflare/workers-utils";
import { logger } from "../../../logger";

export function validateSSHKey(line: string) {
	const supportedSyntaxInfo =
		"Syntax is space-separated: keytype, base64-encoded key, comment(optional). Example: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIC0chNcjRotdsxXTwPPNoqVCGn4EcEWdUkkBPNm/v4gm cool-public-key'";
	const supportedKeyTypes = ["ssh-ed25519"];
	const syntaxError = `Invalid Authorized Key format.`;
	const keyTypeError = `Invalid key type. Supported key types are: ${supportedKeyTypes.join(
		","
	)}. ${supportedSyntaxInfo}`;
	const invalidKey = `Invalid public key. ${supportedSyntaxInfo}`;

	// Split the line by spaces
	const parts = line.split(" ");

	// Check that there are only 2 or 3 parts
	// (keytype and base64-encoded key) or
	// (keytype, base64-encoded key, comment)
	if (![2, 3].includes(parts.length)) {
		throw new Error(syntaxError);
	}

	// The key type must be one of the supported key types
	const keyType = parts[0];
	if (!supportedKeyTypes.includes(keyType)) {
		throw new Error(keyTypeError);
	}

	// Check if the second part is a valid base64 encoded string
	const base64Key = parts[1];
	try {
		// Attempt to decode the base64 part
		atob(base64Key);
	} catch {
		// If decoding fails, it's not a valid base64 string
		throw new Error(invalidKey);
	}
}

export function validatePublicSSHKeyCLI(
	line: string,
	{ json }: { json: boolean }
) {
	const bail = (reason: string) => {
		if (!json) {
			throw new UserError(reason);
		} else {
			logger.json({ error: reason });
			exit(1);
		}
	};
	try {
		validateSSHKey(line);
	} catch (err) {
		if (err instanceof Error) {
			bail(err.message);
		}

		bail("unknown error validating ssh key");
	}
}
