globalThis.global = globalThis;

const MockAgent = require("undici/lib/mock/mock-agent");
const { kClients } = require("undici/lib/core/symbols");
const { kIsMockActive, kDispatches } = require("undici/lib/mock/mock-symbols");
const { setDispatcher } = require("./dispatcher.cjs");

function isMockActive(agent) {
	return agent[kIsMockActive];
}

function resetMockAgent(agent) {
	agent.deactivate();
	agent.enableNetConnect();

	// Remove all pending interceptors
	for (const mockClient of agent[kClients].values()) {
		mockClient.deref()?.[kDispatches].splice(0);
	}
	agent.assertNoPendingInterceptors();
}

module.exports = {
	MockAgent,
	setDispatcher,
	isMockActive,
	resetMockAgent,
};
