import { createRequestHandler } from "react-router";

const requestHandler = createRequestHandler(
	() => import("virtual:react-router/server-build"),
	// eslint-disable-next-line turbo/no-undeclared-env-vars -- Vite's build mode, not a Turbo task variable
	import.meta.env.MODE
);

export default {
	async fetch(request) {
		return requestHandler(request);
	},
} satisfies ExportedHandler<Env>;
