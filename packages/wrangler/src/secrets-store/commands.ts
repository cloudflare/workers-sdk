import { createCommand } from "../core/create-command";
import { confirm, prompt } from "../dialogs";
import { FatalError, UserError } from "../errors";
import { logger } from "../logger";
import { getAccountId } from "../user";
import { readFromStdin, trimTrailingWhitespace } from "../utils/std";
import {
	createSecret,
	createStore,
	deleteSecret,
	deleteStore,
	duplicateSecret,
	getSecret,
	listSecrets,
	listStores,
	updateSecret,
} from "./client";
import type { Secret, Store } from "./client";

// Store Commands

export const secretsStoreStoreCreateCommand = createCommand({
	metadata: {
		description: "Create a store within an account",
		status: "alpha",
		owner: "Product: SSL",
	},
	positionalArgs: ["name"],
	args: {
		name: {
			type: "string",
			description: "Name of the store",
			demandOption: true,
			requiresArg: true,
		},
		remote: {
			type: "boolean",
			description: "Execute command against remote Secrets Store",
			default: false,
		},
	},
	async handler(args, { config }) {
		let store: Store;
		logger.log(`🔐 Creating store... (Name: ${args.name})`);
		if (args.remote) {
			const accountId = config.account_id || (await getAccountId());
			store = await createStore(accountId, { name: args.name });
		} else {
			logger.log(`Local mode enabled, this command is a no-op.`);
			return;
		}
		logger.log(`✅ Created store! (Name: ${args.name}, ID: ${store.id})`);
	},
});

export const secretsStoreStoreDeleteCommand = createCommand({
	metadata: {
		description: "Delete a store within an account",
		status: "alpha",
		owner: "Product: SSL",
	},
	positionalArgs: ["store-id"],
	args: {
		"store-id": {
			type: "string",
			description: "ID of the store",
			demandOption: true,
			requiresArg: true,
		},
		remote: {
			type: "boolean",
			description: "Execute command against remote Secrets Store",
			default: false,
		},
	},
	async handler(args, { config }) {
		logger.log(`🔐 Deleting store... (Name: ${args.storeId})`);
		if (args.remote) {
			const accountId = config.account_id || (await getAccountId());
			await deleteStore(accountId, args.storeId);
		} else {
			logger.log(`Local mode enabled, this command is a no-op.`);
			return;
		}
		logger.log(`✅ Deleted store! (ID: ${args.storeId})`);
	},
});

export const secretsStoreStoreListCommand = createCommand({
	metadata: {
		description: "List stores within an account",
		status: "alpha",
		owner: "Product: SSL",
	},
	args: {
		page: {
			describe:
				'Page number of stores listing results, can configure page size using "per-page"',
			type: "number",
			default: 1,
		},
		"per-page": {
			describe: "Number of stores to show per page",
			type: "number",
			default: 10,
		},
		remote: {
			type: "boolean",
			description: "Execute command against remote Secrets Store",
			default: false,
		},
	},
	async handler(args, { config }) {
		const urlParams = new URLSearchParams();

		urlParams.set("per_page", args.perPage.toString());
		urlParams.set("page", args.page.toString());

		logger.log(`🔐 Listing stores...`);

		let stores: Store[];
		if (args.remote) {
			const accountId = config.account_id || (await getAccountId());
			stores = await listStores(accountId, urlParams);
		} else {
			throw new UserError(
				"No local dev version of this command available, need to include --remote in command",
				{ telemetryMessage: true }
			);
		}

		if (stores.length === 0) {
			throw new UserError("List request returned no stores.", {
				telemetryMessage: true,
			});
		} else {
			const prettierStores = stores
				.sort((a, b) => a.name.localeCompare(b.name))
				.map((store) => ({
					Name: store.name,
					ID: store.id,
					AccountID: store.account_id,
					Created: new Date(store.created).toLocaleString(),
					Modified: new Date(store.modified).toLocaleString(),
				}));
			logger.table(prettierStores);
		}
	},
});

// Secret Commands

export const secretsStoreSecretListCommand = createCommand({
	metadata: {
		description: "List secrets within a store",
		status: "alpha",
		owner: "Product: SSL",
	},
	positionalArgs: ["store-id"],
	args: {
		"store-id": {
			describe: "ID of the store in which to list secrets",
			type: "string",
			demandOption: true,
			requiresArg: true,
		},
		page: {
			describe:
				'Page number of secrets listing results, can configure page size using "per-page"',
			type: "number",
			default: 1,
		},
		"per-page": {
			describe: "Number of secrets to show per page",
			type: "number",
			default: 10,
		},
		remote: {
			type: "boolean",
			description: "Execute command against remote Secrets Store",
			default: false,
		},
	},
	async handler(args, { config }) {
		const urlParams = new URLSearchParams();

		urlParams.set("per_page", args.perPage.toString());
		urlParams.set("page", args.page.toString());

		logger.log(
			`🔐 Listing secrets... (store-id: ${args.storeId}, page: ${args.page}, per-page: ${args.perPage})`
		);

		let secrets: Secret[];
		if (args.remote) {
			const accountId = config.account_id || (await getAccountId());
			secrets = await listSecrets(accountId, args.storeId, urlParams);
		} else {
			throw new UserError(
				"No local dev version of this command available, need to include --remote in command",
				{ telemetryMessage: true }
			);
		}

		if (secrets.length === 0) {
			throw new FatalError("List request returned no secrets.", 1, {
				telemetryMessage: true,
			});
		} else {
			const prettierSecrets = secrets.map((secret) => ({
				Name: secret.name,
				ID: secret.id,
				Comment: secret.comment,
				Scopes: secret.scopes.join(", "),
				Status: secret.status === "active" ? "active " : "pending",
				Created: new Date(secret.created).toLocaleString(),
				Modified: new Date(secret.modified).toLocaleString(),
			}));
			logger.table(prettierSecrets);
		}
	},
});

export const secretsStoreSecretGetCommand = createCommand({
	metadata: {
		description: "Get a secret within a store",
		status: "alpha",
		owner: "Product: SSL",
	},
	positionalArgs: ["store-id"],
	args: {
		"store-id": {
			describe: "ID of the store in which the secret resides",
			type: "string",
			demandOption: true,
			requiresArg: true,
		},
		"secret-id": {
			describe: "ID of the secret to retrieve",
			type: "string",
			demandOption: true,
			requiresArg: true,
		},
		remote: {
			type: "boolean",
			description: "Execute command against remote Secrets Store",
			default: false,
		},
	},
	async handler(args, { config }) {
		logger.log(`🔐 Getting secret... (ID: ${args.secretId})`);

		let secret: Secret;
		if (args.remote) {
			const accountId = config.account_id || (await getAccountId());
			secret = await getSecret(accountId, args.storeId, args.secretId);
		} else {
			throw new UserError(
				"No local dev version of this command available, need to include --remote in command",
				{ telemetryMessage: true }
			);
		}

		const prettierSecret = [
			{
				Name: secret.name,
				ID: secret.id,
				StoreID: secret.store_id,
				Comment: secret.comment,
				Scopes: secret.scopes.join(", "),
				Status: secret.status === "active" ? "active " : "pending",
				Created: new Date(secret.created).toLocaleString(),
				Modified: new Date(secret.modified).toLocaleString(),
			},
		];
		logger.table(prettierSecret);
	},
});

export const secretsStoreSecretCreateCommand = createCommand({
	metadata: {
		description: "Create a secret within a store",
		status: "alpha",
		owner: "Product: SSL",
	},
	positionalArgs: ["store-id"],
	args: {
		"store-id": {
			describe: "ID of the store in which the secret resides",
			type: "string",
			requiresArg: true,
			demandOption: true,
		},
		name: {
			describe: "Name of the secret",
			type: "string",
			requiresArg: true,
			demandOption: true,
		},
		value: {
			describe:
				"Value of the secret (Note: Only for testing. Not secure as this will leave secret value in plain-text in terminal history, exclude this flag and use automatic prompt instead)",
			type: "string",
		},
		scopes: {
			describe:
				'Scopes for the secret (comma-separated list of scopes eg:"workers")',
			type: "string",
			requiresArg: true,
			demandOption: true,
		},
		comment: {
			describe: "Comment for the secret",
			type: "string",
		},
		remote: {
			type: "boolean",
			description: "Execute command against remote Secrets Store",
			default: false,
		},
	},
	async handler(args, { config }) {
		let secretValue = "";

		if (!args.value) {
			const isInteractive = process.stdin.isTTY;
			secretValue = trimTrailingWhitespace(
				isInteractive
					? await prompt("Enter a secret value:", { isSecret: true })
					: await readFromStdin()
			);
		} else {
			secretValue = args.value;
		}

		if (!secretValue) {
			throw new UserError("Need to pass in a value when creating a secret.");
		}

		logger.log(
			`\n🔐 Creating secret... (Name: ${args.name}, Value: REDACTED, Scopes: ${args.scopes}, Comment: ${args.comment})`
		);

		let secrets: Secret[];
		if (args.remote) {
			const accountId = config.account_id || (await getAccountId());
			secrets = await createSecret(accountId, args.storeId, {
				name: args.name,
				value: secretValue,
				scopes: args.scopes.split(","),
				comment: args.comment,
			});
		} else {
			throw new UserError(
				"No local dev version of this command available, need to include --remote in command",
				{ telemetryMessage: true }
			);
		}

		if (secrets.length === 0) {
			throw new FatalError("Failed to create a secret.", 1, {
				telemetryMessage: true,
			});
		}
		const secret = secrets[0];
		logger.log(`✅ Created secret! (ID: ${secret.id})`);

		const prettierSecret = [
			{
				Name: secret.name,
				ID: secret.id,
				StoreID: secret.store_id,
				Comment: secret.comment,
				Scopes: secret.scopes.join(", "),
				Status: secret.status,
				Created: new Date(secret.created).toLocaleString(),
				Modified: new Date(secret.modified).toLocaleString(),
			},
		];
		logger.table(prettierSecret);
	},
});

export const secretsStoreSecretUpdateCommand = createCommand({
	metadata: {
		description: "Update a secret within a store",
		status: "alpha",
		owner: "Product: SSL",
	},
	positionalArgs: ["store-id"],
	args: {
		"store-id": {
			describe: "ID of the store in which the secret resides",
			type: "string",
			requiresArg: true,
			demandOption: true,
		},
		"secret-id": {
			describe: "ID of the secret to update",
			type: "string",
			requiresArg: true,
			demandOption: true,
		},
		value: {
			describe:
				"Updated value of the secret (Note: Only for testing. Not secure as this will leave secret value in plain-text in terminal history, exclude this flag and use automatic prompt instead)",
			type: "string",
		},
		scopes: {
			describe:
				'Updated scopes for the secret (comma-separated list of scopes eg:"workers")',
			type: "string",
		},
		comment: {
			describe: "Updated comment for the secret",
			type: "string",
		},
		remote: {
			type: "boolean",
			description: "Execute command against remote Secrets Store",
			default: false,
		},
	},
	async handler(args, { config }) {
		let secretValue = "";

		if (!args.value) {
			const confirmValueUpdate = await confirm(
				"Do you want to update the secret value?",
				{ defaultValue: false }
			);

			if (confirmValueUpdate) {
				const isInteractive = process.stdin.isTTY;
				secretValue = trimTrailingWhitespace(
					isInteractive
						? await prompt("Enter a secret value:", { isSecret: true })
						: await readFromStdin()
				);
			}
		} else {
			secretValue = args.value;
		}

		if (!secretValue && !args.scopes && !args.comment) {
			throw new UserError(
				"Need to pass in a new field using `--value`, `--scopes`, or `--comment` to update a secret."
			);
		}

		logger.log(`🔐 Updating secret... (ID: ${args.secretId})`);

		let secret: Secret;
		if (args.remote) {
			const accountId = config.account_id || (await getAccountId());
			secret = await updateSecret(accountId, args.storeId, args.secretId, {
				...(secretValue && { value: secretValue }),
				...(args.scopes && { scopes: args.scopes.split(",") }),
				...(args.comment && { comment: args.comment }),
			});
		} else {
			throw new UserError(
				"No local dev version of this command available, need to include --remote in command",
				{ telemetryMessage: true }
			);
		}

		logger.log(`✅ Updated secret! (ID: ${secret.id})`);

		const prettierSecret = [
			{
				Name: secret.name,
				ID: secret.id,
				StoreID: secret.store_id,
				Comment: secret.comment,
				Scopes: secret.scopes.join(", "),
				Status: secret.status,
				Created: new Date(secret.created).toLocaleString(),
				Modified: new Date(secret.modified).toLocaleString(),
			},
		];
		logger.table(prettierSecret);
	},
});

export const secretsStoreSecretDeleteCommand = createCommand({
	metadata: {
		description: "Delete a secret within a store",
		status: "alpha",
		owner: "Product: SSL",
	},
	positionalArgs: ["store-id"],
	args: {
		"store-id": {
			describe: "ID of the store in which the secret resides",
			type: "string",
			requiresArg: true,
			demandOption: true,
		},
		"secret-id": {
			describe: "ID of the secret to delete",
			type: "string",
			requiresArg: true,
			demandOption: true,
		},
		remote: {
			type: "boolean",
			description: "Execute command against remote Secrets Store",
			default: false,
		},
	},
	async handler(args, { config }) {
		logger.log(`🔐 Deleting secret... (ID: ${args.secretId})`);

		if (args.remote) {
			const accountId = config.account_id || (await getAccountId());
			await deleteSecret(accountId, args.storeId, args.secretId);
		} else {
			throw new UserError(
				"No local dev version of this command available, need to include --remote in command",
				{ telemetryMessage: true }
			);
		}
		logger.log(`✅ Deleted secret! (ID: ${args.secretId})`);
	},
});

export const secretsStoreSecretDuplicateCommand = createCommand({
	metadata: {
		description: "Duplicate a secret within a store",
		status: "alpha",
		owner: "Product: SSL",
	},
	positionalArgs: ["store-id"],
	args: {
		"store-id": {
			describe: "ID of the store in which the secret resides",
			type: "string",
			requiresArg: true,
			demandOption: true,
		},
		"secret-id": {
			describe: "ID of the secret to duplicate the secret value of",
			type: "string",
			requiresArg: true,
			demandOption: true,
		},
		name: {
			describe: "Name of the new secret",
			type: "string",
			requiresArg: true,
			demandOption: true,
		},
		scopes: {
			describe: "Scopes for the new secret",
			type: "string",
			requiresArg: true,
			demandOption: true,
		},
		comment: {
			describe: "Comment for the new secret",
			type: "string",
		},
		remote: {
			type: "boolean",
			description: "Execute command against remote Secrets Store",
			default: false,
		},
	},
	async handler(args, { config }) {
		logger.log(`🔐 Duplicating secret... (ID: ${args.secretId})`);

		let duplicatedSecret: Secret;
		if (args.remote) {
			const accountId = config.account_id || (await getAccountId());
			duplicatedSecret = await duplicateSecret(
				accountId,
				args.storeId,
				args.secretId,
				{
					name: args.name,
					scopes: args.scopes.split(","),
					comment: args.comment || "",
				}
			);
		} else {
			throw new UserError(
				"No local dev version of this command available, need to include --remote in command",
				{ telemetryMessage: true }
			);
		}

		logger.log(`✅ Duplicated secret! (ID: ${duplicatedSecret.id})`);
		const prettierSecret = [
			{
				Name: duplicatedSecret.name,
				ID: duplicatedSecret.id,
				StoreID: duplicatedSecret.store_id,
				Comment: duplicatedSecret.comment,
				Scopes: duplicatedSecret.scopes.join(", "),
				Status: duplicatedSecret.status,
				Created: new Date(duplicatedSecret.created).toLocaleString(),
				Modified: new Date(duplicatedSecret.modified).toLocaleString(),
			},
		];
		logger.table(prettierSecret);
	},
});
