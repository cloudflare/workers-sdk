let dispatcher;
module.exports = {
	getDispatcher() {
		return dispatcher;
	},
	setDispatcher(newDispatcher) {
		dispatcher = newDispatcher;
	},
};
