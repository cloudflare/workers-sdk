declare module "cloudflare-internal:wrapped-binding" {
	class WrappedBinding {
		constructor(inner: object);
	}
	const wrappedBinding: { WrappedBinding: typeof WrappedBinding };
	export default wrappedBinding;
}
