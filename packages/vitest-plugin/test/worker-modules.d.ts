// Tests that import remote-bindings source pull in its `worker:` virtual imports.
declare module "worker:*" {
	const source: string;
	export default source;
}
