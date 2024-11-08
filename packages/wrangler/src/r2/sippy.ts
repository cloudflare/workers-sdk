import { readConfig } from "../config";
import { defineNamespace } from "../core";
import { prompt } from "../dialogs";
import { UserError } from "../errors";
import { logger } from "../logger";
import { APIError, readFileSync } from "../parse";
import { requireAuth } from "../user";
import { deleteR2Sippy, getR2Sippy, putR2Sippy } from "./helpers";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
import type { SippyPutParams } from "./helpers";

const NO_SUCH_OBJECT_KEY = 10007;
const SIPPY_PROVIDER_CHOICES = ["AWS", "GCS"];

defineNamespace({
	command: "wrangler r2 bucket sippy",
	metadata: {
		description: "Manage Sippy incremental migration on an R2 bucket",
		status: "stable",
		owner: "Product: R2",
	},
});

export function EnableOptions(yargs: CommonYargsArgv) {
	return yargs
		.positional("name", {
			describe: "The name of the bucket",
			type: "string",
			demandOption: true,
		})
		.option("jurisdiction", {
			describe: "The jurisdiction where the bucket exists",
			alias: "J",
			requiresArg: true,
			type: "string",
		})
		.option("provider", {
			choices: SIPPY_PROVIDER_CHOICES,
		})
		.option("bucket", {
			description: "The name of the upstream bucket",
			string: true,
		})
		.option("region", {
			description: "(AWS provider only) The region of the upstream bucket",
			string: true,
		})
		.option("access-key-id", {
			description:
				"(AWS provider only) The secret access key id for the upstream bucket",
			string: true,
		})
		.option("secret-access-key", {
			description:
				"(AWS provider only) The secret access key for the upstream bucket",
			string: true,
		})
		.option("service-account-key-file", {
			description:
				"(GCS provider only) The path to your Google Cloud service account key JSON file",
			string: true,
		})
		.option("client-email", {
			description:
				"(GCS provider only) The client email for your Google Cloud service account key",
			string: true,
		})
		.option("private-key", {
			description:
				"(GCS provider only) The private key for your Google Cloud service account key",
			string: true,
		})
		.option("r2-access-key-id", {
			description: "The secret access key id for this R2 bucket",
			string: true,
		})
		.option("r2-secret-access-key", {
			description: "The secret access key for this R2 bucket",
			string: true,
		});
}

export async function EnableHandler(
	args: StrictYargsOptionsToInterface<typeof EnableOptions>
) {
	const isInteractive = process.stdin.isTTY;
	const config = readConfig(args.config, args);
	const accountId = await requireAuth(config);

	if (isInteractive) {
		args.provider ??= await prompt(
			"Enter the cloud storage provider of your bucket (AWS or GCS):"
		);
		if (!args.provider) {
			throw new UserError("Must specify a cloud storage provider.");
		}
		if (!SIPPY_PROVIDER_CHOICES.includes(args.provider)) {
			throw new UserError("Cloud storage provider must be: AWS or GCS");
		}
		args.bucket ??= await prompt(
			`Enter the name of your ${args.provider} bucket:`
		);
		if (!args.bucket) {
			throw new UserError(`Must specify ${args.provider} bucket name.`);
		}

		if (args.provider === "AWS") {
			args.region ??= await prompt(
				"Enter the AWS region where your S3 bucket is located (example: us-west-2):"
			);
			if (!args.region) {
				throw new UserError("Must specify an AWS Region.");
			}
			args.accessKeyId ??= await prompt(
				"Enter your AWS Access Key ID (requires read and list access):"
			);
			if (!args.accessKeyId) {
				throw new UserError("Must specify an AWS Access Key ID.");
			}
			args.secretAccessKey ??= await prompt(
				"Enter your AWS Secret Access Key:"
			);
			if (!args.secretAccessKey) {
				throw new UserError("Must specify an AWS Secret Access Key.");
			}
		} else if (args.provider === "GCS") {
			if (
				!(args.clientEmail && args.privateKey) &&
				!args.serviceAccountKeyFile
			) {
				args.serviceAccountKeyFile = await prompt(
					"Enter the path to your Google Cloud service account key JSON file:"
				);
				if (!args.serviceAccountKeyFile) {
					throw new UserError(
						"Must specify the path to a service account key JSON file."
					);
				}
			}
		}

		args.r2AccessKeyId ??= await prompt(
			"Enter your R2 Access Key ID (requires read and write access):"
		);
		if (!args.r2AccessKeyId) {
			throw new UserError("Must specify an R2 Access Key ID.");
		}
		args.r2SecretAccessKey ??= await prompt("Enter your R2 Secret Access Key:");
		if (!args.r2SecretAccessKey) {
			throw new UserError("Must specify an R2 Secret Access Key.");
		}
	}

	let sippyConfig: SippyPutParams;

	if (args.provider === "AWS") {
		if (!args.region) {
			throw new UserError("Error: must provide --region.");
		}
		if (!args.bucket) {
			throw new UserError("Error: must provide --bucket.");
		}
		if (!args.accessKeyId) {
			throw new UserError("Error: must provide --access-key-id.");
		}
		if (!args.secretAccessKey) {
			throw new UserError("Error: must provide --secret-access-key.");
		}
		if (!args.r2AccessKeyId) {
			throw new UserError("Error: must provide --r2-access-key-id.");
		}
		if (!args.r2SecretAccessKey) {
			throw new UserError("Error: must provide --r2-secret-access-key.");
		}

		sippyConfig = {
			source: {
				provider: "aws",
				region: args.region,
				bucket: args.bucket,
				accessKeyId: args.accessKeyId,
				secretAccessKey: args.secretAccessKey,
			},
			destination: {
				provider: "r2",
				accessKeyId: args.r2AccessKeyId,
				secretAccessKey: args.r2SecretAccessKey,
			},
		};
	} else if (args.provider === "GCS") {
		if (args.serviceAccountKeyFile) {
			const serviceAccount = JSON.parse(
				readFileSync(args.serviceAccountKeyFile)
			);
			if ("client_email" in serviceAccount && "private_key" in serviceAccount) {
				args.clientEmail = serviceAccount.client_email;
				args.privateKey = serviceAccount.private_key;
			}
		}

		if (!args.bucket) {
			throw new UserError("Error: must provide --bucket.");
		}
		if (!args.clientEmail) {
			throw new UserError(
				"Error: must provide --service-account-key-file or --client-email."
			);
		}
		if (!args.privateKey) {
			throw new UserError(
				"Error: must provide --service-account-key-file or --private-key."
			);
		}
		args.privateKey = args.privateKey.replace(/\\n/g, "\n");

		if (!args.r2AccessKeyId) {
			throw new UserError("Error: must provide --r2-access-key-id.");
		}
		if (!args.r2SecretAccessKey) {
			throw new UserError("Error: must provide --r2-secret-access-key.");
		}

		sippyConfig = {
			source: {
				provider: "gcs",
				bucket: args.bucket,
				clientEmail: args.clientEmail,
				privateKey: args.privateKey,
			},
			destination: {
				provider: "r2",
				accessKeyId: args.r2AccessKeyId,
				secretAccessKey: args.r2SecretAccessKey,
			},
		};
	} else {
		throw new UserError(
			"Error: unrecognized provider. Possible options are AWS & GCS."
		);
	}

	await putR2Sippy(accountId, args.name, sippyConfig, args.jurisdiction);

	logger.log(`✨ Successfully enabled Sippy on the '${args.name}' bucket.`);
}

export function GetOptions(yargs: CommonYargsArgv) {
	return yargs
		.positional("name", {
			describe: "The name of the bucket",
			type: "string",
			demandOption: true,
		})
		.option("jurisdiction", {
			describe: "The jurisdiction where the bucket exists",
			alias: "J",
			requiresArg: true,
			type: "string",
		});
}

export async function GetHandler(
	args: StrictYargsOptionsToInterface<typeof GetOptions>
) {
	const config = readConfig(args.config, args);
	const accountId = await requireAuth(config);

	try {
		const sippyConfig = await getR2Sippy(
			accountId,
			args.name,
			args.jurisdiction
		);
		logger.log("Sippy configuration:", sippyConfig);
	} catch (e) {
		if (e instanceof APIError && "code" in e && e.code === NO_SUCH_OBJECT_KEY) {
			logger.log(`No Sippy configuration found for the '${args.name}' bucket.`);
		} else {
			throw e;
		}
	}
}

export function DisableOptions(yargs: CommonYargsArgv) {
	return yargs
		.positional("name", {
			describe: "The name of the bucket",
			type: "string",
			demandOption: true,
		})
		.option("jurisdiction", {
			describe: "The jurisdiction where the bucket exists",
			alias: "J",
			requiresArg: true,
			type: "string",
		});
}

export async function DisableHandler(
	args: StrictYargsOptionsToInterface<typeof DisableOptions>
) {
	const config = readConfig(args.config, args);
	const accountId = await requireAuth(config);

	await deleteR2Sippy(accountId, args.name, args.jurisdiction);

	logger.log(`✨ Successfully disabled Sippy on the '${args.name}' bucket.`);
}
