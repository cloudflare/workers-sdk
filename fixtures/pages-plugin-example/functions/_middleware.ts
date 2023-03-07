import type { PluginArgs } from "..";

type ExamplePagesPluginFunction<
	Env = unknown,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	Params extends string = any,
	Data extends Record<string, unknown> = Record<string, unknown>
> = PagesPluginFunction<Env, Params, Data, PluginArgs>;

class BodyHandler {
	footerText: string;

	constructor({ footerText }) {
		this.footerText = footerText;
	}

	element(element) {
		// Don't actually set HTML like this!
		element.append(`<footer>${this.footerText}</footer>`, { html: true });
	}
}

export const onRequest: ExamplePagesPluginFunction = async ({
	next,
	pluginArgs,
}) => {
	const response = await next();

	return new HTMLRewriter()
		.on("body", new BodyHandler({ footerText: pluginArgs.footerText }))
		.transform(response);
};
