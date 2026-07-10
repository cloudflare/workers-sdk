declare module "workerd:unsafe" {
	export interface DurableObjectEvictionOptions {
		webSockets?: "close" | "hibernate";
	}

	function evict(
		stub: DurableObjectStub,
		options?: DurableObjectEvictionOptions
	): Promise<void>;

	export default {
		evict,
	};
}
