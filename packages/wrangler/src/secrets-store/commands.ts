import { readConfig } from "../config";
import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import * as metrics from "../metrics";
import {
	createSecret,
	createStore,
	deleteSecret,
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
	args: {
		name: {
			type: "string",
			description: "Name of the store",
			demandOption: true,
			requiresArg: true,
		},
		remote: {
			type: "boolean",
			description: "Execute commands against remote Secrets Store",
		},
	},
	async handler(args, _ctx) {
		const config = readConfig(args);

		let store: Store;
		logger.log(`🔐 Secrets Store: Creating store... (Name: ${args.name})`);
		if (args.remote) {
			store = await createStore(config, { name: args.name });
		} else {
			logger.error(
				`❌ Secrets Store: No local dev version of this command available, need to include --remote in command`
			);
			return;
		}
		logger.log(
			`✅ Secrets Store: Created store! (Name: ${args.name}, ID: ${store.id})`
		);
		metrics.sendMetricsEvent("create secrets-store store", {
			sendMetrics: config.send_metrics,
		});
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
			description: "Execute commands against remote Secrets Store",
		},
	},
	async handler(args, _ctx) {
		const config = readConfig(args);

		const urlParams = new URLSearchParams();

		urlParams.set("per_page", args.perPage.toString());
		urlParams.set("page", args.page.toString());

		logger.log(`🔐 Secrets Store: Listing stores...`);

		let stores: Store[];
		if (args.remote) {
			stores = await listStores(config, urlParams);
		} else {
			logger.error(
				`❌ Secrets Store: No local dev version of this command available, need to include --remote in command`
			);
			return;
		}

		if (stores.length === 0) {
			logger.log("❌ List request returned no stores.");
			return;
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
			metrics.sendMetricsEvent("list secrets-store stores", {
				sendMetrics: config.send_metrics,
			});
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
			description: "Execute commands against remote Secrets Store",
		},
	},
	async handler(args, _ctx) {
		const config = readConfig(args);
		const urlParams = new URLSearchParams();

		urlParams.set("per_page", args.perPage.toString());
		urlParams.set("page", args.page.toString());

		logger.log(
			`🔐 Secrets Store: Listing secrets... (store-id: ${args.storeId}, page: ${args.page}, per-page: ${args.perPage})`
		);

		let secrets: Secret[];
		if (args.remote) {
			secrets = await listSecrets(config, args.storeId, urlParams);
		} else {
			logger.error(
				`❌ Secrets Store: No local dev version of this command available, need to include --remote in command`
			);
			return;
		}

		if (secrets.length === 0) {
			logger.log("❌ List request returned no secrets.");
		} else {
			const prettierSecrets = secrets.map((secret) => ({
				Name: secret.name,
				ID: secret.id,
				Comment: secret.comment,
				Scopes: secret.scopes.join(", "),
				Status: secret.status,
				Created: new Date(secret.created).toLocaleString(),
				Modified: new Date(secret.modified).toLocaleString(),
			}));
			logger.table(prettierSecrets);
			metrics.sendMetricsEvent("list secrets-store secrets", {
				sendMetrics: config.send_metrics,
			});
		}
	},
});

export const secretsStoreSecretGetCommand = createCommand({
	metadata: {
		description: "Get a secret within a store",
		status: "alpha",
		owner: "Product: SSL",
	},
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
			description: "Execute commands against remote Secrets Store",
		},
	},
	async handler(args, _ctx) {
		const config = readConfig(args);

		if (!args.storeId) {
			logger.error("Must pass a '--store-id=' argument for this command.");
			return;
		} else if (!args.secretId) {
			logger.error("Must pass a '--secret-id=' argument for this command.");
			return;
		}

		logger.log(`🔐 Secrets Store: Getting secret... (ID: ${args.secretId})`);

		let secret: Secret;
		if (args.remote) {
			secret = await getSecret(config, args.storeId, args.secretId);
		} else {
			logger.error(
				`❌ Secrets Store: No local dev version of this command available, need to include --remote in command`
			);
			return;
		}

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
		metrics.sendMetricsEvent("get secrets-store secret", {
			sendMetrics: config.send_metrics,
		});
	},
});

export const secretsStoreSecretCreateCommand = createCommand({
	metadata: {
		description: "Create a secret within a store",
		status: "alpha",
		owner: "Product: SSL",
	},
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
			describe: "Value of the secret",
			type: "string",
			requiresArg: true,
			demandOption: true,
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
			description: "Execute commands against remote Secrets Store",
		},
	},
	async handler(args, _ctx) {
		const config = readConfig(args);

		logger.log(
			`🔐 Secrets Store: Creating secret... ` +
				`(Name: ${args.name}, Value: REDACTED, Scopes: ${args.scopes}, Comment: ${args.comment})`
		);

		let secrets: Secret[];
		if (args.remote) {
			secrets = await createSecret(config, args.storeId, {
				name: args.name,
				value: args.value,
				scopes: args.scopes.split(","),
				comment: args.comment,
			});
		} else {
			logger.error(
				`❌ Secrets Store: No local dev version of this command available, need to include --remote in command`
			);
			return;
		}

		if (secrets.length === 0) {
			logger.error("Failed to create a secret.");
			return;
		}
		const secret = secrets[0];
		logger.log(`✅ Secrets Store: Created secret! (ID: ${secret.id})`);

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
		metrics.sendMetricsEvent("create secrets-store secret", {
			sendMetrics: config.send_metrics,
		});
	},
});

export const secretsStoreSecretUpdateCommand = createCommand({
	metadata: {
		description: "Update a secret within a store",
		status: "alpha",
		owner: "Product: SSL",
	},
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
			describe: "Updated value of the secret",
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
			description: "Execute commands against remote Secrets Store",
		},
	},
	async handler(args, _ctx) {
		const config = readConfig(args);

		if (!args.storeId) {
			logger.error("Must pass a '--store-id=' argument for this command.");
			return;
		}
		if (!args.secretId) {
			logger.error("Must pass a '--secret-id=' argument for this command.");
			return;
		}

		if (!args.value && !args.scopes && !args.comment) {
			logger.log("❌ No new values passed to update on secret.");
			return;
		}

		logger.log(`🔐 Secrets Store: Updating secret... (ID: ${args.secretId})`);

		let secret: Secret;
		if (args.remote) {
			secret = await updateSecret(config, args.storeId, args.secretId, {
				value: args.value || null,
				scopes: args.scopes ? args.scopes.split(",") : null,
				comment: args.comment || null,
			});
		} else {
			logger.error(
				`❌ Secrets Store: No local dev version of this command available, need to include --remote in command`
			);
			return;
		}

		logger.log(`✅ Secrets Store: Updated secret! (ID: ${secret.id})`);

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
		metrics.sendMetricsEvent("update secrets-store secret", {
			sendMetrics: config.send_metrics,
		});
	},
});

export const secretsStoreSecretDeleteCommand = createCommand({
	metadata: {
		description: "Delete a secret within a store",
		status: "alpha",
		owner: "Product: SSL",
	},
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
			description: "Execute commands against remote Secrets Store",
		},
	},
	async handler(args, _ctx) {
		const config = readConfig(args);

		if (!args.storeId) {
			logger.error("Must pass a '--store-id=' argument for this command.");
			return;
		} else if (!args.secretId) {
			logger.error("Must pass a '--secret-id=' argument for this command.");
			return;
		}

		logger.log(`🔐 Secrets Store: Deleting secret... (ID: ${args.secretId})`);

		if (args.remote) {
			await deleteSecret(config, args.storeId, args.secretId);
		} else {
			logger.error(
				`❌ Secrets Store: No local dev version of this command available, need to include --remote in command`
			);
			return;
		}
		logger.log(`✅ Secrets Store: Deleted secret! (ID: ${args.secretId})`);

		metrics.sendMetricsEvent("delete secrets-store secret", {
			sendMetrics: config.send_metrics,
		});
	},
});

export const secretsStoreSecretDuplicateCommand = createCommand({
	metadata: {
		description: "Duplicate a secret within a store",
		status: "alpha",
		owner: "Product: SSL",
	},
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
			description: "Execute commands against remote Secrets Store",
		},
	},
	async handler(args, _ctx) {
		const config = readConfig(args);

		if (!args.storeId) {
			logger.error("Must pass a '--store-id=' argument for this command.");
			return;
		} else if (!args.secretId) {
			logger.error("Must pass a '--secret-id=' argument for this command.");
			return;
		}

		logger.log(
			`🔐 Secrets Store: Duplicating secret... (ID: ${args.secretId})`
		);

		let duplicatedSecret: Secret;
		if (args.remote) {
			duplicatedSecret = await duplicateSecret(
				config,
				args.storeId,
				args.secretId,
				{
					name: args.name,
					scopes: args.scopes.split(","),
					comment: args.comment || "",
				}
			);
		} else {
			logger.error(
				`❌ Secrets Store: No local dev version of this command available, need to include --remote in command`
			);
			return;
		}

		logger.log(
			`✅ Secrets Store: Duplicated secret! (ID: ${duplicatedSecret.id})`
		);
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
		metrics.sendMetricsEvent("duplicate secrets-store secret", {
			sendMetrics: config.send_metrics,
		});
	},
});
