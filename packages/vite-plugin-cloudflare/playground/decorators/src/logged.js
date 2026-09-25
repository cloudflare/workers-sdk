// A standard method decorator written in JavaScript, which Vite does not pass
// through esbuild during development.
export function logged(method, context) {
	return async function (...args) {
		const result = await method.apply(this, args);
		return `${String(context.name)}: ${result}`;
	};
}

export class Formatter {
	@logged
	async format(value) {
		return value.toUpperCase();
	}
}
