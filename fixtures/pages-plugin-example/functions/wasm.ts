import x from "./foo.wasm";

export const onRequest = () => {
	console.log(x);
	return new Response("I'm a fixed response");
};
