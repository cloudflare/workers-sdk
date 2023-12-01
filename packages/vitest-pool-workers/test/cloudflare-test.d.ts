// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface CloudflareTestEnv {}

declare module "cloudflare:test" {
	export const env: CloudflareTestEnv;

	// TODO(soon): ensure all these functions validate their arguments
	export function runInDurableObject<O extends DurableObject, R>(
		stub: DurableObjectStub,
		callback: (instance: O, state: DurableObjectState) => R | Promise<R>
	): Promise<R>;
	export function runDurableObjectAlarm(
		stub: DurableObjectStub
	): Promise<boolean /* ran */>;
}
