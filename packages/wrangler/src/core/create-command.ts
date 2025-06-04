import type {
	AliasDefinition,
	CommandDefinition,
	DeepFlatten,
	HandlerArgs,
	NamedArgDefinitions,
	NamespaceDefinition,
} from "./types";

export type CreateCommandResult<NamedArgDefs extends NamedArgDefinitions> =
	DeepFlatten<{
		args: HandlerArgs<NamedArgDefs>; // used for type inference only
	}>;
export function createCommand<NamedArgDefs extends NamedArgDefinitions>(
	definition: CommandDefinition<NamedArgDefs>
): CreateCommandResult<NamedArgDefs>;
export function createCommand(
	definition: CommandDefinition
): CreateCommandResult<NamedArgDefinitions> {
	// @ts-expect-error return type is used for type inference only
	return definition;
}

export function createNamespace(
	definition: NamespaceDefinition
): NamespaceDefinition {
	return definition;
}

export function createAlias(definition: AliasDefinition): AliasDefinition {
	return definition;
}
