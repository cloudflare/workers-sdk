// 2 imports required to trigger https://github.com/cloudflare/workers-sdk/issues/7572
const fetch = require("cross-fetch");
const env = require("cross-env");

module.exports = () => {
    return "OK!";
};
module.exports.fetch = fetch;
module.exports.env = env;
