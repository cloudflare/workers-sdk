// `workerd` refuses to start Workers that schedule timers at global scope, so
// this Worker always fails to start.
setTimeout(() => undefined, 1);

export default {
	fetch: () => new Response("ok"),
};
