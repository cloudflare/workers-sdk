import express from "express";

import { cloudflare } from "@cloudflare/vite-plugin";

const isTest = process.env.VITEST;

export async function createServer(root = process.cwd()) {
	const app = express();

	const vite = await (
		await import("vite")
	).createServer({
		root,
		server: {
			middlewareMode: true,
		},
		plugins: [cloudflare({ persistState: false })],
	});

	app.use(vite.middlewares);

	return { app, vite };
}

if (!isTest) {
	const { app } = await createServer();
	const port = 3000;
	app.listen(port, () => {
		console.log(`http://localhost:${port}`);
	});
}
