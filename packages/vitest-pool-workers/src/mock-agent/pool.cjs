const assert = require("node:assert");

module.exports = class Pool {
	constructor() {
		// We always construct the `MockAgent` with `{ connections: 1 }` which
		// constructs `MockClient`s directly, rather than using `MockPool`s
		assert.fail("Pool is not implemented in worker");
	}
};
