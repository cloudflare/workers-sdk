import type { Binding } from "./types";

export function isUnsafeBindingType(type: string): type is `unsafe_${string}` {
	return type.startsWith("unsafe_");
}

/**
 * What configuration key does this binding use for referring to its binding name?
 */
const nameBindings = [
	"durable_object_namespace",
	"logfwdr",
	"ratelimit",
	"unsafe_ratelimit",
	"send_email",
] as const;

function getBindingKey(type: Binding["type"]) {
	if ((nameBindings as readonly string[]).includes(type)) {
		return "name";
	}
	return "binding";
}

export type FlatBinding<Type> = Extract<Binding, { type: Type }> &
	(Type extends (typeof nameBindings)[number]
		? {
				name: string;
			}
		: {
				binding: string;
			});

export function extractBindingsOfType<Type extends Binding["type"]>(
	type: Type,
	bindings: Record<string, Binding> | undefined
): FlatBinding<Type>[] {
	return Object.entries(bindings ?? {})
		.filter(
			(binding): binding is [string, Extract<Binding, { type: Type }>] =>
				binding[1].type === type
		)
		.map((binding) => ({
			...binding[1],
			[getBindingKey(type)]: binding[0],
		})) as FlatBinding<Type>[];
}
