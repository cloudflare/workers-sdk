---
"wrangler": patch
---

update `maybeStartOrUpdateRemoteProxySession` config argument (to allow callers to specify an environment)

Before this change `maybeStartOrUpdateRemoteProxySession` could be called with either the path to a wrangler config file or the configuration of a worker. The former override however did not allow the caller to specify an environment, so the `maybeStartOrUpdateRemoteProxySession` API has been updated so that in the wrangler config case an object (with the path and a potential environment) needs to be passed instead.

For example, before callers could invoke the function in the following way

```ts
await maybeStartOrUpdateRemoteProxySession(configPath);
```

note that there is no way to tell the function what environment to use when parsing the wrangle configuration.

Now callers will instead call the function in the following way:

```ts
await maybeStartOrUpdateRemoteProxySession({
	path: configPath,
	environment: targetEnvironment,
});
```

note that now a target environment can be specified.
