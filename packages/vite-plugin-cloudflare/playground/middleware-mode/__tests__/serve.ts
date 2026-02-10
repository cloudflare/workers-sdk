import * as path from "node:path";
import { rootDir } from "../../__test-utils__";

const port = 3000;

export const viteTestUrl = `http://localhost:${port}`;

export async function serve() {
	const { createServer } = await import(path.resolve(rootDir, "server.js"));
	const { app, vite } = await createServer(rootDir);

	return new Promise((resolve, reject) => {
		try {
			const server = app.listen(port, () => {
				resolve({
					async close() {
						await new Promise((res) => server.close(res));
						await vite.close();
					},
				});
			});
		} catch (error) {
			reject(error);
		}
	});
}
