import { UserError } from "@cloudflare/workers-utils";
import { createCommand, createNamespace } from "../core/create-command";
import { confirm } from "../dialogs";
import { logger } from "../logger";
import formatLabelledValues from "../utils/render-labelled-values";
import {
	createRepo,
	deleteRepo,
	getRepo,
	issueRepoToken,
	listRepos,
} from "./client";
import type {
	ArtifactsCreateRepoResult,
	ArtifactsIssueTokenResult,
	ArtifactsRepo,
	ArtifactsTokenScope,
} from "./types";

const jsonArg = {
	type: "boolean",
	default: false,
	description: "Return output as JSON",
} as const;

const namespaceArg = {
	type: "string",
	demandOption: true,
	description: "The Artifacts namespace name",
} as const;

const repoNameArg = {
	type: "string",
	demandOption: true,
	description: "The Artifacts repository name",
} as const;

const forceArg = {
	type: "boolean",
	alias: "y",
	default: false,
	description: "Skip confirmation",
} as const;

export const artifactsReposNamespace = createNamespace({
	metadata: {
		description: "Manage Artifacts repositories",
		status: "private beta",
		owner: "Product: Artifacts",
	},
});

function formatRepoDetails(repo: ArtifactsRepo): Record<string, string> {
	return formatDefinedValues([
		["id", repo.id],
		["name", repo.name],
		["description", repo.description ?? ""],
		["default_branch", repo.default_branch],
		["remote", repo.remote],
		["read_only", repo.read_only],
		["status", repo.status],
		["created_at", repo.created_at],
		["updated_at", repo.updated_at],
		["last_push_at", repo.last_push_at ?? ""],
		["source", repo.source ?? ""],
	]);
}

function formatCreateRepoDetails(
	repo: ArtifactsCreateRepoResult,
	readOnly: boolean | undefined
): Record<string, string> {
	// The create response may omit read_only, so preserve the submitted flag for human output.
	const resolvedReadOnly = repo.read_only ?? readOnly;

	return formatDefinedValues([
		["id", repo.id],
		["name", repo.name],
		["description", repo.description ?? ""],
		["default_branch", repo.default_branch],
		["read_only", resolvedReadOnly],
		["remote", repo.remote],
		["token", repo.token],
	]);
}

function formatIssuedTokenDetails(
	token: ArtifactsIssueTokenResult
): Record<string, string> {
	return {
		id: token.id,
		scope: token.scope,
		expires_at: token.expires_at,
		plaintext: token.plaintext,
	};
}

function formatDefinedValues(
	values: [string, string | boolean | undefined][]
): Record<string, string> {
	return Object.fromEntries(
		values
			.filter(
				(entry): entry is [string, string | boolean] => entry[1] !== undefined
			)
			.map(([key, value]) => [key, String(value)])
	);
}

export const artifactsReposCreateCommand = createCommand({
	metadata: {
		description: "Create an Artifacts repository",
		status: "private beta",
		owner: "Product: Artifacts",
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},
	positionalArgs: ["name"],
	args: {
		name: repoNameArg,
		namespace: namespaceArg,
		description: {
			type: "string",
			description: "An optional description for the repository",
		},
		"default-branch": {
			type: "string",
			description: "The default branch for the repository",
		},
		"read-only": {
			type: "boolean",
			description: "Create the repository as read-only",
		},
		json: jsonArg,
	},
	async handler(args, { config }) {
		const repo = await createRepo(config, args.namespace, {
			name: args.name,
			description: args.description,
			default_branch: args.defaultBranch,
			read_only: args.readOnly,
		});

		if (args.json) {
			logger.json(repo);
			return;
		}

		logger.log(
			`Created Artifacts repo "${repo.name}" in namespace "${args.namespace}".`
		);
		// Token-bearing output bypasses logger.log so plaintext tokens are not persisted to debug logs.
		logger.console(
			"log",
			formatLabelledValues(formatCreateRepoDetails(repo, args.readOnly))
		);
	},
});

export const artifactsReposListCommand = createCommand({
	metadata: {
		description: "List Artifacts repositories in a namespace",
		status: "private beta",
		owner: "Product: Artifacts",
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},
	args: {
		namespace: namespaceArg,
		json: jsonArg,
	},
	async handler({ namespace, json }, { config }) {
		const repos = await listRepos(config, namespace);

		if (json) {
			logger.json(repos);
			return;
		}

		if (repos.length === 0) {
			logger.log(`No Artifacts repos found in namespace "${namespace}".`);
			return;
		}

		logger.table(
			repos.map((repo) => ({
				name: repo.name,
				default_branch: repo.default_branch,
				read_only: String(repo.read_only),
				status: repo.status ?? "",
				updated_at: repo.updated_at,
			}))
		);
	},
});

export const artifactsReposGetCommand = createCommand({
	metadata: {
		description: "Get an Artifacts repository",
		status: "private beta",
		owner: "Product: Artifacts",
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},
	positionalArgs: ["name"],
	args: {
		name: repoNameArg,
		namespace: namespaceArg,
		json: jsonArg,
	},
	async handler({ name, namespace, json }, { config }) {
		const repo = await getRepo(config, namespace, name);

		if (json) {
			logger.json(repo);
			return;
		}

		logger.log(formatLabelledValues(formatRepoDetails(repo)));
	},
});

export const artifactsReposDeleteCommand = createCommand({
	metadata: {
		description: "Delete an Artifacts repository",
		status: "private beta",
		owner: "Product: Artifacts",
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},
	positionalArgs: ["name"],
	args: {
		name: repoNameArg,
		namespace: namespaceArg,
		force: forceArg,
		json: jsonArg,
	},
	async handler({ name, namespace, force, json }, { config }) {
		if (!force) {
			const confirmedDeletion = await confirm(
				`Are you sure you want to delete Artifacts repo "${name}" from namespace "${namespace}"? This action cannot be undone.`,
				{ fallbackValue: false }
			);
			if (!confirmedDeletion) {
				logger.log("Deletion cancelled.");
				return;
			}
		}

		await deleteRepo(config, namespace, name);

		if (json) {
			logger.json({ deleted: true, name, namespace });
			return;
		}

		logger.log(
			`Deleted Artifacts repo "${name}" from namespace "${namespace}".`
		);
	},
});

export const artifactsReposIssueTokenCommand = createCommand({
	metadata: {
		description: "Issue a repo-scoped Artifacts token",
		status: "private beta",
		owner: "Product: Artifacts",
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},
	positionalArgs: ["repo"],
	args: {
		repo: repoNameArg,
		namespace: namespaceArg,
		scope: {
			type: "string",
			choices: ["read", "write"] as ArtifactsTokenScope[],
			description: "The token scope",
		},
		ttl: {
			type: "number",
			description: "The token TTL in seconds",
			coerce: (value: number | undefined) => {
				if (value !== undefined && value <= 0) {
					throw new UserError("--ttl must be greater than 0", {
						telemetryMessage: "artifacts repo token ttl invalid",
					});
				}
				return value;
			},
		},
		json: jsonArg,
	},
	async handler({ repo, namespace, scope, ttl, json }, { config }) {
		const issuedToken = await issueRepoToken(config, namespace, {
			repo,
			scope,
			ttl,
		});

		if (json) {
			logger.json(issuedToken);
			return;
		}

		logger.log(
			`Issued a ${issuedToken.scope} token for repo "${repo}" in namespace "${namespace}".`
		);
		// Token-bearing output bypasses logger.log so plaintext tokens are not persisted to debug logs.
		logger.console(
			"log",
			formatLabelledValues(formatIssuedTokenDetails(issuedToken))
		);
	},
});
