const crypto = require("node:crypto");

module.exports.randomBytes = function (length) {
	return new Uint8Array(crypto.randomBytes(length));
};
