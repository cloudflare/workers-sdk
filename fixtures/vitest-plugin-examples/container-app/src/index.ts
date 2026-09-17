import { DurableObject } from "cloudflare:workers";

const CONTAINER_PORT = 8787;
const CONTAINER_MESSAGE = "I was passed to the container";

function requireContainer(container: Container | undefined): Container {
	if (container === undefined) {
		throw new Error("Container is not attached");
	}
	return container;
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
