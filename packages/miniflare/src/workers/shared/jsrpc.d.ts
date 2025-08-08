declare module "@cloudflare/jsrpc" {
	export function rpcOverWebSocket(url: string): { getStub(): object };
}
