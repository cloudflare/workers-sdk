// Emitted as a separate file by the `.wasm` loader in `scripts/build.mjs`. The
// import is that file's path, relative to the bundle.
declare module "mdream/wasm/mdream_edge_bg.wasm" {
	const path: string;
	export default path;
}
