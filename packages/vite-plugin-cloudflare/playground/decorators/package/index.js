// A dependency with a standard decorator, which `vite dev` pre-bundles.
function exclaim(method) {
	return function (...args) {
		return `${method.apply(this, args)}!`;
	};
}

export class Shouter {
	@exclaim
	shout(value) {
		return value.toUpperCase();
	}
}
