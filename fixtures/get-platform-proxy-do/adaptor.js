#!/usr/bin/node
import { getPlatformProxy as originalGetPlatformProxy } from "wrangler";

// Here we wrap the actual original getPlatformProxy function and disable its persistance, this is to make sure
// that we don't implement any persistance during these tests (which would add unnecessary extra complexity)
export function getPlatformProxy(options = {}) {
	return originalGetPlatformProxy({
		...options,
		persist: false,
	});
}

const proxy = await getPlatformProxy({
	configPath: "./wrangler.toml",
	exportsPath: { useMain: true },
});
console.log(proxy.env);
const id = proxy.env.DO.idFromName("foo");
const stub = proxy.env.DO.get(id);
const response = await stub.sayHello();
console.log(response);
