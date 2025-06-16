const assert = require("node:assert");
const DispatcherBase = require("undici/lib/dispatcher/dispatcher-base");
const { kDispatch, kClose, kDestroy } = require("undici/lib/core/symbols");
const { getDispatcher } = require("./dispatcher.cjs");

module.exports = class Client extends DispatcherBase {
	[kDispatch](opts, handler) {
		const dispatcher = getDispatcher();
		if (dispatcher === undefined) {
			assert.fail("setDispatcher() must be called before Client#[kDispatch]()");
		}
		dispatcher(opts, handler);
		return true;
	}

	async [kClose]() {}
	async [kDestroy](_err) {}
};
