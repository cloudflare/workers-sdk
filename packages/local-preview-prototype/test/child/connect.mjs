// Runs in a separate Node.js process. It only receives the JSON connection.
import { connectBindings } from "../../src/bindings.ts";

const { env, entrypoint, dispose } = connectBindings(
	JSON.parse(process.argv[2])
);

await env.NOTES.put("note:child", "written by another process");
const result = {
	greeting: env.GREETING,
	sum: await entrypoint.add(20, 22),
	count: await env.COUNTER.getByName("child").increment(),
};
await dispose();
process.stdout.write(JSON.stringify(result));
