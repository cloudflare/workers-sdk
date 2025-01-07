import type { CreateCommandResult } from "./create-command";
import type { AliasDefinition, CommandDefinition, NamedArgDefinitions, NamespaceDefinition } from "./types";
/**
 * A helper to demand one of a set of options
 * via https://github.com/yargs/yargs/issues/1093#issuecomment-491299261
 */
export declare function demandOneOfOption(...options: string[]): (argv: {
    [key: string]: unknown;
}) => boolean;
/**
 * A helper to ensure that an argument only receives a single value.
 *
 * This is a workaround for a limitation in yargs where non-array arguments can still receive multiple values
 * even though the inferred type is not an array.
 *
 * @see https://github.com/yargs/yargs/issues/1318
 */
export declare function demandSingleValue<Argv extends {
    [key: string]: unknown;
}>(key: string, allow?: (argv: Argv) => boolean): (argv: Argv) => boolean;
/**
 * Checks if a definition is an alias definition.
 */
export declare function isAliasDefinition(def: AliasDefinition | CreateCommandResult<NamedArgDefinitions> | NamespaceDefinition): def is AliasDefinition;
/**
 * Checks if a definition is a command definition.
 */
export declare function isCommandDefinition(def: AliasDefinition | CreateCommandResult<NamedArgDefinitions> | NamespaceDefinition): def is CommandDefinition;
/**
 * Checks if a definition is a namespace definition.
 */
export declare function isNamespaceDefinition(def: AliasDefinition | CreateCommandResult<NamedArgDefinitions> | NamespaceDefinition): def is NamespaceDefinition;
