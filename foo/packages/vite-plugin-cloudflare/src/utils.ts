import { Request as MiniflareRequest } from 'miniflare';

export function toMiniflareRequest(request: Request): MiniflareRequest {
	return new MiniflareRequest(request.url, {
		method: request.method,
		headers: [['accept-encoding', 'identity'], ...request.headers],
		body: request.body,
		duplex: 'half',
	});
}
