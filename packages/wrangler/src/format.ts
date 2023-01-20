import { AsyncLocalStorage } from "async_hooks";

interface Format {
	json: boolean;
	output: Record<string, unknown>;
}
const format = new AsyncLocalStorage<Format>();

export function getJsonOutput() {
	const { output } = format.getStore() ?? { output: {} };
	return output;
}

export function addToOutput(
	transform: (o: Format["output"]) => Format["output"]
) {
	const store = format.getStore();
	if (store) store.output = transform(store?.output);
}

export function withJson(jsonMode: boolean, cb: () => void) {
	format.run(
		{
			json: jsonMode,
			output: {},
		},
		cb
	);
}
