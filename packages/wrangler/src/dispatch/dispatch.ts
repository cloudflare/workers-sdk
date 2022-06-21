import { readConfig } from "../config";
import { requireAuth } from "../user";

import createNamespace from './create-namespace'
import deleteNamespace from './delete-namespace';

import type { CommandModule } from 'yargs';

type Namespace = {
    namespace_id: string,
    namespace_name: string,
    created_on: string,
    created_by: string,
    modified_on: string,
    modified_by: string
}

// the only way to make tsc happy?
interface CreateArguments {
    "namespace-name": string
}

interface DeleteArguments {
    "namespace-name": string
}

const createNamespaceCommand: CommandModule<unknown, CreateArguments> = {
    command: "create <namespace-name>",
    describe: "Creates a dispatch namespace",
    builder: (args) => {
        return args.positional(
            "namespace-name",
            {
                describe: "Name of the namespace to create",
                type: "string",
                demandOption: "true",
            }
        )
    },
    handler: async (args) => {
        const config = readConfig(args.config as string | undefined, args);
        const accountId = await requireAuth(config);
        return createNamespace({
            accountId,
            namespaceName: args.namespaceName,
        })
    },
};

const deleteNamespaceCommand: CommandModule<unknown, DeleteArguments> = {
    command: "delete <namespace-name>",
    describe: "Deletes a dispatch namespace",
    builder: (args) => {
        return args.positional(
            "namespace-name",
            {
                describe: "Name of the namespace to delete",
                type: "string",
                demandOption: "true",
            }
        )
    },
    handler: async (args) => {
        const config = readConfig(args.config as string | undefined, args);
        const accountId = await requireAuth(config);
        return deleteNamespace({
            accountId,
            namespaceName: args.namespaceName,
        })
    },
};

function namespacesPath(accountId: string): string {
    return `/accounts/${accountId}/workers/dispatch/namespaces`;
}

function namespacePath(accountId: string, namespaceName: string): string {
    return `${namespacesPath(accountId)}/${namespaceName}`
}

function namespaceScriptsPath(accountId: string, namespaceName: string): string {
    return `${namespacePath(accountId, namespaceName)}/scripts`
}

function namespaceScriptPath(accountId: string, namespaceName: string, scriptName: string): string {
    return `${namespaceScriptsPath(accountId, namespaceName)}/${scriptName}`
}

export {
    type Namespace,

    namespacesPath,
    namespacePath,
    namespaceScriptsPath,
    namespaceScriptPath,

    createNamespace,
    createNamespaceCommand,

    deleteNamespace,
    deleteNamespaceCommand,

    // still to be implemented in API:
    // fetchNamespace,
    // fetchNamespaceCommand,
    //
    // listNamespaces,
    // listNamespacesCommand,
}
