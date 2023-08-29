The contents of this directory were generated with the following script using
`miniflare@3.20230821.0`:

```js
import path from "node:path";
import url from "node:url";
import { Miniflare } from "miniflare";

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const mf = new Miniflare({
	script: "",
	modules: true,

	kvPersist: path.join(__dirname, "kv"),
	kvNamespaces: ["NAMESPACE"],

	r2Persist: path.join(__dirname, "r2"),
	r2Buckets: ["BUCKET"],

	d1Persist: path.join(__dirname, "d1"),
	d1Databases: ["DATABASE"],
});

const kvNamespace = await mf.getKVNamespace("NAMESPACE");
await kvNamespace.put("key", "value");

const r2Bucket = await mf.getR2Bucket("BUCKET");
await r2Bucket.put("key", "value");

const d1Database = await mf.getD1Database("DATABASE");
await d1Database.exec(
	"CREATE TABLE entries (key TEXT PRIMARY KEY, value TEXT);"
);
await d1Database
	.prepare("INSERT INTO entries (key, value) VALUES (?1, ?2)")
	.bind("a", "1")
	.run();

await mf.dispose();
```
