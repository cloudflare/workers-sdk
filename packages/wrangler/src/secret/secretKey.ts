import { confirm, prompt, select } from "../dialogs";
import { readFromStdin, trimTrailingWhitespace } from "./util";
import type { SecretKeyBody } from "./types";

/**
 * Walks the user through a wizard, configuring the secret key and building a payload
 * from among the many permutations of types, algorithms, usages, and formats.
 *
 * @param name
 * @param isInteractive
 * @returns
 */
export const secretKeyWizard = async (
	name: string,
	isInteractive: boolean
): Promise<SecretKeyBody> => {
	// TODO: Take in the type of secret, 'raw', 'pkcs8', 'spki', 'jwk' and walk through different wizard
	const algorithmName = await select<string>("Select an algorithm:", {
		choices: [
			{ title: "AES-CBC", value: "AES-CBC" },
			{ title: "AES-CTR", value: "AES-CTR" },
			{ title: "AES-GCM (default)", value: "AES-GCM" },
			{ title: "AES-KW", value: "AES-KW" },
		],
		defaultOption: 2,
	});
	const keyLength = await select<string>("Select the key length:", {
		choices: [
			{ title: "128", value: "128" },
			{ title: "192", value: "192" },
			{ title: "256 (default)", value: "256" },
		],
		defaultOption: 2,
	});
	const usages: string[] = [];
	const encrypt = await confirm("Can the key be used for encryption?");
	if (encrypt) {
		usages.push("encrypt");
	}
	const decrypt = await confirm("Can the key be used to decryption?");
	if (decrypt) {
		usages.push("decrypt");
	}
	const secretKey = trimTrailingWhitespace(
		isInteractive
			? await prompt("Enter a secret key:", { isSecret: true })
			: await readFromStdin()
	);
	return {
		name: name,
		type: "secret_key",
		format: "raw",
		usages: usages,
		algorithm: {
			name: algorithmName,
			length: parseInt(keyLength),
		},
		key_base64: secretKey,
	};
};
