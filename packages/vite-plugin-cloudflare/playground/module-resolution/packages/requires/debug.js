const debug = require("debug");

debug("enabled")("This should be logged");
debug("enabled").extend("disabled")("This should not be logged");
debug("disabled")("This should not be logged");

module.exports = {
	value: "OK",
};
