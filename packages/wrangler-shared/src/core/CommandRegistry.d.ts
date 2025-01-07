import type { CreateCommandResult } from "./create-command";
import type { AliasDefinition, Command, DefinitionTreeNode, InternalDefinition, NamedArgDefinitions, NamespaceDefinition } from "./types";
/**
 * Class responsible for registering and managing commands within a command registry.
 */
export declare class CommandRegistry {
    #private;
    /**
     * Initializes the command registry with the given command registration function.
     */
    constructor(registerCommand: RegisterCommand);
    /**
     * Defines multiple commands and their corresponding definitions.
     */
    define(defs: {
        command: Command;
        definition: AliasDefinition | CreateCommandResult<NamedArgDefinitions> | NamespaceDefinition;
    }[]): void;
    getDefinitionTreeRoot(): DefinitionTreeNode;
    /**
     * Registers all commands in the command registry, walking through the definition tree.
     */
    registerAll(): void;
    /**
     * Registers a specific namespace if not already registered.
     */
    registerNamespace(namespace: string): void;
}
/**
 * Custom error class for command registration issues.
 */
export declare class CommandRegistrationError extends Error {
}
/**
 * Type for the function used to register commands.
 */
type RegisterCommand = (segment: string, def: InternalDefinition, registerSubTreeCallback: () => void) => void;
export {};
