import { buildCommand } from "./build";
import { CommandRegistry } from "./core/CommandRegistry";
import { d1Namespace } from "./d1";
import { d1CreateCommand } from "./d1/create";
import { d1DeleteCommand } from "./d1/delete";
import { d1ExecuteCommand } from "./d1/execute";
import { d1ExportCommand } from "./d1/export";
import { d1InfoCommand } from "./d1/info";
import { d1InsightsCommand } from "./d1/insights";
import { d1ListCommand } from "./d1/list";
import { d1MigrationsNamespace } from "./d1/migrations";
import { d1MigrationsApplyCommand } from "./d1/migrations/apply";
import { d1MigrationsCreateCommand } from "./d1/migrations/create";
import { d1MigrationsListCommand } from "./d1/migrations/list";
import { d1TimeTravelNamespace } from "./d1/timeTravel";
import { d1TimeTravelInfoCommand } from "./d1/timeTravel/info";
import { d1TimeTravelRestoreCommand } from "./d1/timeTravel/restore";
import { deleteCommand } from "./delete";
import { deployCommand } from "./deploy";
import { dev } from "./dev";
import { docs } from "./docs";
import { init } from "./init";
import {
	kvBulkDeleteCommand,
	kvBulkPutCommand,
	kvKeyDeleteCommand,
	kvKeyGetCommand,
	kvKeyListCommand,
	kvKeyNamespace,
	kvKeyPutCommand,
	kvNamespace,
	kvNamespaceCreateCommand,
	kvNamespaceDeleteCommand,
	kvNamespaceListCommand,
	kvNamespaceNamespace,
} from "./kv";
import {
	secretDeleteCommand,
	secretListCommand,
	secretNamespace,
	secretPutCommand,
} from "./secret";
import { tailCommand } from "./tail";
import { versionsNamespace } from "./versions";
import { deploymentsNamespace } from "./versions/deployments";
import { deploymentsListCommand } from "./versions/deployments/list";
import { deploymentsStatusCommand } from "./versions/deployments/status";
import { deploymentsViewCommand } from "./versions/deployments/view";
import type { DefinitionTreeNode } from "./core/types";

/**
 * EXPERIMENTAL: Get all registered Wrangler commands for documentation generation.
 * This API is experimental and may change without notice.
 *
 * @returns The complete command tree structure with all metadata
 */
export function experimental_getWranglerCommands(): DefinitionTreeNode {
	const mockRegisterCommand = () => {};
	const registry = new CommandRegistry(mockRegisterCommand);

	registry.define([
		{
			command: "wrangler docs",
			definition: docs,
		},
	]);

	registry.define([
		{
			command: "wrangler init",
			definition: init,
		},
	]);

	registry.define([
		{
			command: "wrangler dev",
			definition: dev,
		},
	]);

	registry.define([
		{
			command: "wrangler deploy",
			definition: deployCommand,
		},
	]);

	registry.define([
		{ command: "wrangler deployments", definition: deploymentsNamespace },
		{
			command: "wrangler deployments list",
			definition: deploymentsListCommand,
		},
		{
			command: "wrangler deployments status",
			definition: deploymentsStatusCommand,
		},
		{
			command: "wrangler deployments view",
			definition: deploymentsViewCommand,
		},
	]);

	registry.define([
		{
			command: "wrangler versions",
			definition: versionsNamespace,
		},
	]);

	registry.define([{ command: "wrangler delete", definition: deleteCommand }]);

	registry.define([{ command: "wrangler tail", definition: tailCommand }]);

	registry.define([
		{ command: "wrangler secret", definition: secretNamespace },
		{ command: "wrangler secret put", definition: secretPutCommand },
		{ command: "wrangler secret delete", definition: secretDeleteCommand },
		{ command: "wrangler secret list", definition: secretListCommand },
	]);

	registry.define([
		{ command: "wrangler kv", definition: kvNamespace },
		{ command: "wrangler kv namespace", definition: kvNamespaceNamespace },
		{ command: "wrangler kv key", definition: kvKeyNamespace },
		{
			command: "wrangler kv namespace create",
			definition: kvNamespaceCreateCommand,
		},
		{
			command: "wrangler kv namespace list",
			definition: kvNamespaceListCommand,
		},
		{
			command: "wrangler kv namespace delete",
			definition: kvNamespaceDeleteCommand,
		},
		{ command: "wrangler kv key put", definition: kvKeyPutCommand },
		{ command: "wrangler kv key list", definition: kvKeyListCommand },
		{ command: "wrangler kv key get", definition: kvKeyGetCommand },
		{ command: "wrangler kv key delete", definition: kvKeyDeleteCommand },
		{ command: "wrangler kv bulk put", definition: kvBulkPutCommand },
		{ command: "wrangler kv bulk delete", definition: kvBulkDeleteCommand },
	]);

	registry.define([
		{ command: "wrangler d1", definition: d1Namespace },
		{ command: "wrangler d1 list", definition: d1ListCommand },
		{ command: "wrangler d1 info", definition: d1InfoCommand },
		{ command: "wrangler d1 create", definition: d1CreateCommand },
		{ command: "wrangler d1 delete", definition: d1DeleteCommand },
		{ command: "wrangler d1 execute", definition: d1ExecuteCommand },
		{ command: "wrangler d1 export", definition: d1ExportCommand },
		{ command: "wrangler d1 insights", definition: d1InsightsCommand },
		{ command: "wrangler d1 migrations", definition: d1MigrationsNamespace },
		{
			command: "wrangler d1 migrations list",
			definition: d1MigrationsListCommand,
		},
		{
			command: "wrangler d1 migrations create",
			definition: d1MigrationsCreateCommand,
		},
		{
			command: "wrangler d1 migrations apply",
			definition: d1MigrationsApplyCommand,
		},
		{ command: "wrangler d1 time-travel", definition: d1TimeTravelNamespace },
		{
			command: "wrangler d1 time-travel info",
			definition: d1TimeTravelInfoCommand,
		},
		{
			command: "wrangler d1 time-travel restore",
			definition: d1TimeTravelRestoreCommand,
		},
	]);

	registry.define([{ command: "wrangler build", definition: buildCommand }]);

	return registry.experimental_getCommandsForDocs();
}
