// @ts-expect-error -- untyped JavaScript package
import { Shouter } from "@playground/decorators-package";
import { DurableObject } from "cloudflare:workers";
// @ts-expect-error -- untyped JavaScript module
import { Formatter, logged } from "./logged.js";

interface Env {
	GREETER: DurableObjectNamespace<Greeter>;
}

const tags = new WeakSet<object>();

// Marks a method without replacing it.
function tagged<T extends object>(
	value: T,
	_context: ClassMethodDecoratorContext
) {
	tags.add(value);
	return value;
}

const registered: string[] = [];

function register<T extends abstract new (...args: never[]) => unknown>(
	value: T,
	context: ClassDecoratorContext<T>
) {
	registered.push(String(context.name));
	return value;
}

@register
export class Greeter extends DurableObject<Env> {
	@tagged
	override async fetch() {
		return new Response(`fetch tagged: ${tags.has(Greeter.prototype.fetch)}`);
	}

	@logged
	async greet(name: string) {
		return `hello ${name}`;
	}
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		const stub = env.GREETER.getByName("greeter");

		switch (url.pathname) {
			case "/fetch":
				return stub.fetch(request);
			case "/rpc":
				return new Response(await stub.greet("world"));
			case "/js":
				return new Response(await new Formatter().format("hello"));
			case "/class":
				return new Response(registered.join(","));
			case "/dependency":
				return new Response(new Shouter().shout("hello"));
		}

		return new Response(null, { status: 404 });
	},
} satisfies ExportedHandler<Env>;
