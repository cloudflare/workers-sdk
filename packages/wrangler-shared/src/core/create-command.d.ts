import type { AliasDefinition, CommandDefinition, DeepFlatten, HandlerArgs, NamedArgDefinitions, NamespaceDefinition } from "./types";
export type CreateCommandResult<NamedArgDefs extends NamedArgDefinitions> = DeepFlatten<{
    args: HandlerArgs<NamedArgDefs>;
}>;
export declare function createCommand<NamedArgDefs extends NamedArgDefinitions>(definition: CommandDefinition<NamedArgDefs>): CreateCommandResult<NamedArgDefs>;
export declare function createNamespace(definition: NamespaceDefinition): NamespaceDefinition;
export declare function createAlias(definition: AliasDefinition): AliasDefinition;
