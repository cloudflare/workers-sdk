// DO NOT IMPORT THIS DIRECTLY

// This script intercepts all fetch and scheduled event listeners
// such that they can be triggered from middleware, allowing for modification of behaviour
globalThis.__inner_sw_fetch_listeners__ = [];
globalThis.__inner_sw_scheduled_listeners__ = [];

export let swAddEventListener = (event, listener) => {
	if (event === "fetch") {
		globalThis.__inner_sw_fetch_listeners__.push(listener);
	} else if (event === "scheduled") {
		globalThis.__inner_sw_scheduled_listeners__.push(listener);
	} else {
		globalThis.addEventListener(event, listener);
	}
};
