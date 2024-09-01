---
"wrangler": patch
---

fix: Add hyperdrive binding support in `getPlatformProxy`

example:

```toml
# wrangler.toml
[[hyperdrive]]
binding = "MY_HYPERDRIVE"
id = "000000000000000000000000000000000"
localConnectionString = "postgres://user:pass@127.0.0.1:1234/db"
```

```js
// index.mjs

import postgres from "postgres";
import { getPlatformProxy } from "wrangler";

const { env, dispose } = await getPlatformProxy();

try {
	const sql = postgres(
		// Note: connectionString points to `postgres://user:pass@127.0.0.1:1234/db` not to the actual hyperdrive
		//       connection string, for more details see the explanation below
		env.MY_HYPERDRIVE.connectionString
	);
	const results = await sql`SELECT * FROM pg_tables`;
	await sql.end();
} catch (e) {
	console.error(e);
}

await dispose();
```

Note: the returned binding values are no-op/passthrough that can be used inside node.js, meaning
that besides direct connections via the `connect` methods, all the other values point to the
same db connection specified in the user configuration
