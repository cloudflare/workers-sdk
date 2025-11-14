import { APIError, readFileSync, UserError } from "@cloudflare/workers-utils";
import { createCommand, createNamespace } from "../core/create-command";
import { prompt } from "../dialogs";
import { logger } from "../logger";
import { requireAuth } from "../user";
import { deleteR2Sippy, getR2Sippy, putR2Sippy } from "./helpers/sippy";
import type { SippyPutParams } from "./helpers/sippy";

const NO_SUCH_OBJECT_KEY = 10007;
const SIPPY_PROVIDER_CHOICES = ["AWS", "GCS"];

export const r2BucketSippyNamespace = createNamespace({
	metadata: {
		description: "Manage Sippy incremental migration on an R2 bucket",
		status: "stable",
		owner: "Product: R2",
	},
});

export const r2BucketSippyEnableCommand = createCommand({
	metadata: {
		description: "Enable Sippy on an R2 bucket",
		status: "stable",
		owner: "Product: R2",
	},
	positionalArgs: ["name"],
	args: {
		name: {
			describe: "The name of the bucket",
			type: "string",
			demandOption: true,
		},
		jurisdiction: {
			describe: "The jurisdiction where the bucket exists",
			alias: "J",
			requiresArg: true,
			type: "string",
		},
		provider: {
			choices: SIPPY_PROVIDER_CHOICES,
		},
		bucket: {
			description: "The name of the upstream bucket",
			type: "string",
		},
		region: {
			description: "(AWS provider only) The region of the upstream bucket",
			type: "string",
		},
		"access-key-id": {
			description:
				"(AWS provider only) The secret access key id for the upstream bucket",
			type: "string",
		},
		"secret-access-key": {
			description:
				"(AWS provider only) The secret access key for the upstream bucket",
			type: "string",
		},
		"service-account-key-file": {
			description:
				"(GCS provider only) The path to your Google Cloud service account key JSON file",
			type: "string",
		},
		"client-email": {
			description:
				"(GCS provider only) The client email for your Google Cloud service account key",
			type: "string",
		},
		"private-key": {
			description:
				"(GCS provider only) The private key for your Google Cloud service account key",
			type: "string",
		},
		"r2-access-key-id": {
			description: "The secret access key id for this R2 bucket",
			type: "string",
		},
		"r2-secret-access-key": {
			description: "The secret access key for this R2 bucket",
			type: "string",
		},
	},
	async handler(args, { config }) {
		const isInteractive = process.stdin.isTTY;
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
			args.r2SecretAccessKey ??= await prompt(
				"Enter your R2 Secret Access Key:"
			);
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
				if (
					"client_email" in serviceAccount &&
					"private_key" in serviceAccount
				) {
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

		await putR2Sippy(
			config,
			accountId,
			args.name,
			sippyConfig,
			args.jurisdiction
		);

		logger.log(`✨ Successfully enabled Sippy on the '${args.name}' bucket.`);
	},
});

export const r2BucketSippyDisableCommand = createCommand({
	metadata: {
		description: "Disable Sippy on an R2 bucket",
		status: "stable",
		owner: "Product: R2",
	},
	positionalArgs: ["name"],
	args: {
		name: {
			describe: "The name of the bucket",
			type: "string",
			demandOption: true,
		},
		jurisdiction: {
			describe: "The jurisdiction where the bucket exists",
			alias: "J",
			requiresArg: true,
			type: "string",
		},
	},
	async handler(args, { config }) {
		const accountId = await requireAuth(config);

		await deleteR2Sippy(config, accountId, args.name, args.jurisdiction);

		logger.log(`✨ Successfully disabled Sippy on the '${args.name}' bucket.`);
	},
});

export const r2BucketSippyGetCommand = createCommand({
	metadata: {
		description: "Check the status of Sippy on an R2 bucket",
		status: "stable",
		owner: "Product: R2",
	},
	positionalArgs: ["name"],
	args: {
		name: {
			describe: "The name of the bucket",
			type: "string",
			demandOption: true,
		},
		jurisdiction: {
			describe: "The jurisdiction where the bucket exists",
			alias: "J",
			requiresArg: true,
			type: "string",
		},
	},
	async handler(args, { config }) {
		const accountId = await requireAuth(config);

		try {
			const sippyConfig = await getR2Sippy(
				config,
				accountId,
				args.name,
				args.jurisdiction
			);
			logger.log("Sippy configuration:", sippyConfig);
		} catch (e) {
			if (
				e instanceof APIError &&
				"code" in e &&
				e.code === NO_SUCH_OBJECT_KEY
			) {
				logger.log(
					`No Sippy configuration found for the '${args.name}' bucket.`
				);
			} else {
				throw e;
			}
		}
	},
});
