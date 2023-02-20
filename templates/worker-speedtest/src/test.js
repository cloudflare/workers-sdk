const fetch = require('@dollarshaveclub/node-fetch');
const Request = fetch.Request;
const Response = fetch.Response;

const handleRequest = require('./index');

beforeAll(async () => {
	Object.assign(global, { Response });
});
