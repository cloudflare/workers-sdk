// Test `require()` of Node built-in module without prefix
const assert = require("assert");
// Test `require()` of Node built-in module with prefix
const assert2 = require("node:assert");

// `Buffer` should be global in `CommonJS`s with node_compat_v2 turned on
assert.strictEqual(typeof Buffer, "function");
assert2(true);

exports.base64Encode = function (data) {
	return Buffer.from(data).toString("base64");
};
exports.base64Decode = function (data) {
	return Buffer.from(data, "base64").toString();
};
