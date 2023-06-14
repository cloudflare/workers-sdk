import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";

// eslint-disable-next-line no-shadow
export enum SecretBindingType {
	text = "text", // traditional wrangler secret, can be any text
	key = "key", // CryptoKey object bound to environment
}

export type SecretTextBody = {
	name?: string;
	type: "secret_text";
	text: string;
};

export type SecretKeyBody = {
	name?: string;
	type: "secret_key";
	format: "raw"; // TODO support more formats
	usages: string[];
	algorithm: {
		name: string;
		length: number;
	};
	key_base64?: string;
};

export type CreateSecretBody = SecretTextBody | SecretKeyBody;

export const secretBulkOptions = (yargs: CommonYargsArgv) => {
	return yargs
		.positional("json", {
			describe: `The JSON file of key-value pairs to upload, in form {"key": value, ...}`,
			type: "string",
			demandOption: "true",
		})
		.option("name", {
			describe: "Name of the Worker",
			type: "string",
			requiresArg: true,
		});
};

export type SecretBulkArgs = StrictYargsOptionsToInterface<
	typeof secretBulkOptions
>;
