export class RpcSession {
	heap: Map<string, unknown>;
	constructor(private transport: WebSocket) {
		this.heap = new Map();
	}
}
