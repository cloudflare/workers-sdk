import path from "node:path";
import type { ParsedInputContainerConfig } from "@cloudflare/config";

export type InputContainerImage = Extract<
	ParsedInputContainerConfig,
	{ image: unknown }
>["image"];

export type ResolvedInputContainerImage =
	| { reference: string }
	| {
			dockerfile: string;
			buildContext: string;
			buildVars: Record<string, string> | undefined;
	  };

/** Resolve an input Container image's filesystem paths relative to the project root. */
export function resolveInputContainerImage(options: {
	image: InputContainerImage;
	root: string;
}): ResolvedInputContainerImage {
	if ("reference" in options.image) {
		return { reference: options.image.reference };
	}

	const dockerfile = path.resolve(options.root, options.image.dockerfile);
	return {
		dockerfile,
		buildContext:
			options.image.buildContext === undefined
				? path.dirname(dockerfile)
				: path.resolve(options.root, options.image.buildContext),
		buildVars: options.image.buildVars,
	};
}
