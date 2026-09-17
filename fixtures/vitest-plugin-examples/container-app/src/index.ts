import { DurableObject } from "cloudflare:workers";

const CONTAINER_PORT = 8787;
const CONTAINER_MESSAGE = "I was passed to the container";
const PORT_TIMEOUT_MS = 20_000;
const PORT_RETRY_INTERVAL_MS = 100;

function requireContainer(container: Container | undefined): Container {
	if (container === undefined) {
		throw new Error("Container is not attached");
	}
	return container;
}

/**
 * Waits until the server in a newly started container accepts requests.
 * Requests to the container's port fail until its server listens.
 *
 * @param container - The container that has just started.
 */
async function waitForPort(container: Container): Promise<void> {
	const port = container.getTcpPort(CONTAINER_PORT);
	const deadline = Date.now() + PORT_TIMEOUT_MS;
	for (;;) {
		try {
			const response = await port.fetch("http://container/");
			await response.body?.cancel();
			return;
		} catch (error) {
			if (!container.running || Date.now() >= deadline) {
				throw error;
			}
			await scheduler.wait(PORT_RETRY_INTERVAL_MS);
		}
	}
}

async function fetchFromContainer(
	request: Request,
	container: Container,
	image?: string
): Promise<Response> {
	if (!container.running) {
		const options = {
			enableInternet: false,
			env: { MESSAGE: CONTAINER_MESSAGE },
		};
		container.start(image === undefined ? options : { ...options, image });
		await waitForPort(container);
	}
	return container.getTcpPort(CONTAINER_PORT).fetch(request);
}

export class NamedImageContainer extends DurableObject<Env> {
	async fetch(request: Request): Promise<Response> {
		const container = requireContainer(this.ctx.container);
		const image = container.images.app;
		if (image === undefined) {
			throw new Error("Named image is not configured");
		}
		return fetchFromContainer(request, container, image);
	}
}

export class DefaultImageContainer extends DurableObject<Env> {
	async fetch(request: Request): Promise<Response> {
		return fetchFromContainer(request, requireContainer(this.ctx.container));
	}
}

export default {
	fetch(): Response {
		return new Response("Worker is ready");
	},
} satisfies ExportedHandler<Env>;
