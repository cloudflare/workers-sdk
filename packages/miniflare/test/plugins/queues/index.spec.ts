import {
	DeferredPromise,
	LogLevel,
	Miniflare,
	QueuesError,
	Response,
	_QUEUES_COMPATIBLE_V8_VERSION,
} from "@miniflare/tre";
import anyTest from "ava";
import { z } from "zod";
import { LogEntry, TestLog, TestTimers, getPort } from "../../test-shared";

// Only run Queues tests if we're using a supported V8 version
const test = _QUEUES_COMPATIBLE_V8_VERSION ? anyTest : anyTest.skip;

const StringArraySchema = z.string().array();
const MessageArraySchema = z
	.object({ queue: z.string(), id: z.string(), body: z.string() })
	.array();

test("flushes partial and full batches", async (t) => {
	let batches: string[][] = [];

	const port = await getPort();
	const timers = new TestTimers();
	const mf = new Miniflare({
		port,
		timers,
		verbose: true,

		workers: [
			// Check with producer and consumer as separate Workers
			{
				name: "producer",
				queueProducers: ["QUEUE"],
				modules: true,
				script: `export default {
          async fetch(request, env, ctx) {
            const url = new URL(request.url);
            const body = await request.json();
            if (url.pathname === "/send") {
              await env.QUEUE.send(body);
            } else if (url.pathname === "/batch") {
              await env.QUEUE.sendBatch(body);
            }
            return new Response();
          }
        }`,
			},
			{
				name: "consumer",
				queueConsumers: ["QUEUE"],
				serviceBindings: {
					async REPORTER(request) {
						batches.push(StringArraySchema.parse(await request.json()));
						return new Response();
					},
				},
				modules: true,
				script: `export default {
          async queue(batch, env, ctx) {
            await env.REPORTER.fetch("http://localhost", {
              method: "POST",
              body: JSON.stringify(batch.messages.map(({ id }) => id)),
            });
          }
        }`,
			},
		],
	});
	async function send(message: unknown) {
		await mf.dispatchFetch("http://localhost/send", {
			method: "POST",
			body: JSON.stringify(message),
		});
	}
	async function sendBatch(...messages: unknown[]) {
		await mf.dispatchFetch("http://localhost/batch", {
			method: "POST",
			body: JSON.stringify(messages.map((body) => ({ body }))),
		});
	}

	// Check with single msg
	await send("msg1");
	timers.timestamp += 500;
	await timers.waitForTasks();
	t.is(batches.length, 0);
	timers.timestamp += 500;
	await timers.waitForTasks();
	t.is(batches[0]?.length, 1);
	t.regex(batches[0][0], /^[0-9a-f]{32}$/);
	batches = [];

	// Check with single batch
	await sendBatch("msg1", "msg2");
	timers.timestamp += 250;
	await timers.waitForTasks();
	t.is(batches.length, 0);
	timers.timestamp += 1000;
	await timers.waitForTasks();
	t.is(batches[0]?.length, 2);
	t.regex(batches[0][0], /^[0-9a-f]{32}$/);
	t.regex(batches[0][1], /^[0-9a-f]{32}$/);
	batches = [];

	// Check with messages and batches
	await send("msg1");
	await sendBatch("msg2", "msg3");
	await send("msg4");
	timers.timestamp += 100;
	await timers.waitForTasks();
	t.is(batches.length, 0);
	timers.timestamp += 900;
	await timers.waitForTasks();
	t.is(batches[0]?.length, 4);
	batches = [];

	// Check with full batch
	await sendBatch("msg1", "msg2", "msg3", "msg4", "msg5");
	await timers.waitForTasks();
	t.is(batches.length, 1);
	t.is(batches[0]?.length, 5);
	batches = [];

	// Check with overflowing batch
	await sendBatch("msg1", "msg2", "msg3", "msg4", "msg5", "msg6", "msg7");
	await timers.waitForTasks();
	t.is(batches.length, 1);
	// (second batch isn't full, so need to wait for max batch timeout)
	timers.timestamp += 500;
	await timers.waitForTasks();
	t.is(batches.length, 1);
	timers.timestamp += 500;
	await timers.waitForTasks();
	t.is(batches.length, 2);
	t.is(batches[0]?.length, 5);
	t.is(batches[1]?.length, 2);
	batches = [];

	// Check with overflowing batch twice
	await sendBatch("msg1", "msg2", "msg3", "msg4", "msg5", "msg6");
	await timers.waitForTasks();
	t.is(batches.length, 1);
	// (second batch isn't full yet, but sending more messages will fill it)
	await sendBatch("msg7", "msg8", "msg9", "msg10", "msg11");
	await timers.waitForTasks();
	t.is(batches.length, 2);
	// (third batch isn't full, so need to wait for max batch timeout)
	timers.timestamp += 1000;
	await timers.waitForTasks();
	t.is(batches.length, 3);
	t.is(batches[0]?.length, 5);
	t.is(batches[1]?.length, 5);
	t.is(batches[2]?.length, 1);
	batches = [];
});

test("sends all structured cloneable types", async (t) => {
	const port = await getPort();
	const timers = new TestTimers();

	const errorPromise = new DeferredPromise<string>();

	const mf = new Miniflare({
		port,
		timers,
		verbose: true,

		queueProducers: ["QUEUE"],
		queueConsumers: {
			QUEUE: { maxBatchSize: 100, maxBatchTimeout: 0, maxRetires: 0 },
		},
		serviceBindings: {
			async REPORTER(request) {
				errorPromise.resolve(await request.text());
				return new Response();
			},
		},

		compatibilityFlags: ["nodejs_compat"],
		modules: [
			{
				// Check with producer and consumer as same Worker
				// TODO(soon): can't use `script: "..."` here as Miniflare doesn't know
				//  to ignore `node:*` imports
				type: "ESModule",
				path: "<script>",
				contents: `
        import assert from "node:assert";
        
        const arrayBuffer = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]).buffer;
        const cyclic = { a: 1 };
        cyclic.b = cyclic;
        
        const VALUES = {
          Object: { w: 1, x: 42n, y: true, z: "string" },
          Cyclic: cyclic,
          Array: [0, 1, [2, 3]],
          Date: new Date(1000),
          Map: new Map([["a", 1], ["b", 2], ["c", 3]]),
          Set: new Set(["a", "b", "c"]),
          RegExp: /ab?c/g,
          ArrayBuffer: arrayBuffer,
          DataView: new DataView(arrayBuffer, 2, 3),
          Int8Array: new Int8Array(arrayBuffer),
          Uint8Array: new Uint8Array(arrayBuffer, 1, 4),
          Uint8ClampedArray: new Uint8ClampedArray(arrayBuffer),
          Int16Array: new Int16Array(arrayBuffer),
          Uint16Array: new Uint16Array(arrayBuffer),
          Int32Array: new Int32Array(arrayBuffer),
          Uint32Array: new Uint32Array(arrayBuffer),
          Float32Array: new Float32Array(arrayBuffer),
          Float64Array: new Float64Array(arrayBuffer),
          BigInt64Array: new BigInt64Array(arrayBuffer),
          BigUint64Array: new BigUint64Array(arrayBuffer),
          Error: new Error("message", { cause: new Error("cause") }),
          EvalError: new EvalError("message"),
          RangeError: new RangeError("message"),
          ReferenceError: new ReferenceError("message"),
          SyntaxError: new SyntaxError("message"),
          TypeError: new TypeError("message"),
          URIError: new URIError("message"),
        };
        const EXTRA_CHECKS = {
          Cyclic(value) {
            assert(value.b === value, "Cyclic: cycle");
          },
          Error(value) {
            assert.deepStrictEqual(value.cause, VALUES.Error.cause, "Error: cause");
          }
        };
        
        export default {
          async fetch(request, env, ctx) {
            await env.QUEUE.sendBatch(Object.entries(VALUES).map(
              ([key, value]) => ({ body: { name: key, value } })
            ));
            return new Response();
          },
          async queue(batch, env, ctx) {
            let error;
            try {
              for (const message of batch.messages) {
                const { name, value } = message.body;
                assert.deepStrictEqual(value, VALUES[name], name);
                EXTRA_CHECKS[name]?.(value);
              }
            } catch (e) {
              error = e?.stack ?? e;
            }
            await env.REPORTER.fetch("http://localhost", {
              method: "POST",
              body: String(error),
            });
          }
        }
        `,
			},
		],
	});

	await mf.dispatchFetch("http://localhost");
	timers.timestamp += 1000;
	await timers.waitForTasks();
	t.is(await errorPromise, "undefined");
});

function stripTimings(entries: LogEntry[]) {
	return entries.filter((entry) => {
		// Replace all request/queue dispatch log timings with X
		entry[1] = entry[1].replace(/\(\d+ms\)/g, "(Xms)");
		// Remove all regular fetch requests logs, these are `ctx.waitUntil()`ed,
		// so are delivered non-deterministically
		const isRequestLog =
			entry[0] === LogLevel.INFO && !entry[1].startsWith("QUEUE");
		return !isRequestLog;
	});
}

test("retries messages", async (t) => {
	let batches: z.infer<typeof MessageArraySchema>[] = [];
	const bodies = () => batches.map((batch) => batch.map(({ body }) => body));

	let retryAll = false;
	let errorAll = false;
	let retryMessages: string[] = [];

	const port = await getPort();
	const log = new TestLog(t);
	const timers = new TestTimers();
	const mf = new Miniflare({
		port,
		log,
		timers,

		queueProducers: { QUEUE: "queue" },
		queueConsumers: {
			queue: { maxBatchSize: 5, maxBatchTimeout: 1, maxRetires: 2 },
		},
		serviceBindings: {
			async RETRY_FILTER(request) {
				batches.push(MessageArraySchema.parse(await request.json()));
				return Response.json({ retryAll, errorAll, retryMessages });
			},
		},

		modules: true,
		script: `export default {
      async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const body = await request.json();
        await env.QUEUE.sendBatch(body);
        return new Response();
      },
      async queue(batch, env, ctx) {
        const res = await env.RETRY_FILTER.fetch("http://localhost", {
          method: "POST",
          body: JSON.stringify(batch.messages.map(({ id, body }) => ({ queue: batch.queue, id, body }))),
        });
        const { retryAll, errorAll, retryMessages } = await res.json();
        if (retryAll) {
          batch.retryAll();
          return;
        }
        if (errorAll) {
          throw new Error("Whoops!");
        }
        for (const message of batch.messages) {
          if (retryMessages.includes(message.body)) message.retry();
        }
      }
    }`,
	});
	async function sendBatch(...messages: string[]) {
		await mf.dispatchFetch("http://localhost", {
			method: "POST",
			body: JSON.stringify(messages.map((body) => ({ body }))),
		});
	}

	// Check with explicit single retry
	retryMessages = ["msg2"];
	await sendBatch("msg1", "msg2", "msg3");
	log.logs = [];
	timers.timestamp += 1000;
	await timers.waitForTasks();
	t.is(batches.length, 1);
	t.deepEqual(stripTimings(log.logs), [
		[
			LogLevel.DEBUG,
			`Retrying message "${batches[0][1].id}" on queue "queue"...`,
		],
		[LogLevel.INFO, "QUEUE queue 2/3 (Xms)"],
	]);
	log.logs = [];
	retryMessages = [];
	timers.timestamp += 1000;
	await timers.waitForTasks();
	t.is(batches.length, 2);
	t.deepEqual(stripTimings(log.logs), [
		[LogLevel.INFO, "QUEUE queue 1/1 (Xms)"],
	]);
	log.logs = [];
	timers.timestamp += 1000;
	await timers.waitForTasks();
	t.is(batches.length, 2);
	t.deepEqual(bodies(), [["msg1", "msg2", "msg3"], ["msg2"]]);
	batches = [];

	// Check with explicit retry all
	retryAll = true;
	await sendBatch("msg1", "msg2", "msg3");
	log.logs = [];
	timers.timestamp += 1000;
	await timers.waitForTasks();
	t.is(batches.length, 1);
	t.deepEqual(stripTimings(log.logs), [
		[
			LogLevel.DEBUG,
			`Retrying message "${batches[0][0].id}" on queue "queue"...`,
		],
		[
			LogLevel.DEBUG,
			`Retrying message "${batches[0][1].id}" on queue "queue"...`,
		],
		[
			LogLevel.DEBUG,
			`Retrying message "${batches[0][2].id}" on queue "queue"...`,
		],
		[LogLevel.INFO, "QUEUE queue 0/3 (Xms)"],
	]);
	log.logs = [];
	retryAll = false;
	timers.timestamp += 1000;
	await timers.waitForTasks();
	t.is(batches.length, 2);
	t.deepEqual(stripTimings(log.logs), [
		[LogLevel.INFO, "QUEUE queue 3/3 (Xms)"],
	]);
	t.deepEqual(bodies(), [
		["msg1", "msg2", "msg3"],
		["msg1", "msg2", "msg3"],
	]);
	batches = [];

	// Check with implicit retry from exception
	errorAll = true;
	await sendBatch("msg1", "msg2", "msg3");
	log.logs = [];
	timers.timestamp += 1000;
	await timers.waitForTasks();
	t.is(batches.length, 1);
	t.deepEqual(stripTimings(log.logs), [
		[
			LogLevel.DEBUG,
			`Retrying message "${batches[0][0].id}" on queue "queue"...`,
		],
		[
			LogLevel.DEBUG,
			`Retrying message "${batches[0][1].id}" on queue "queue"...`,
		],
		[
			LogLevel.DEBUG,
			`Retrying message "${batches[0][2].id}" on queue "queue"...`,
		],
		[LogLevel.INFO, "QUEUE queue 0/3 (Xms)"],
	]);
	log.logs = [];
	errorAll = false;
	timers.timestamp += 1000;
	await timers.waitForTasks();
	t.is(batches.length, 2);
	t.deepEqual(stripTimings(log.logs), [
		[LogLevel.INFO, "QUEUE queue 3/3 (Xms)"],
	]);
	t.deepEqual(bodies(), [
		["msg1", "msg2", "msg3"],
		["msg1", "msg2", "msg3"],
	]);
	batches = [];

	// Check drops messages after max retries
	retryAll = true;
	await sendBatch("msg1", "msg2", "msg3");
	log.logs = [];
	timers.timestamp += 1000;
	await timers.waitForTasks();
	t.is(batches.length, 1);
	t.deepEqual(stripTimings(log.logs), [
		[
			LogLevel.DEBUG,
			`Retrying message "${batches[0][0].id}" on queue "queue"...`,
		],
		[
			LogLevel.DEBUG,
			`Retrying message "${batches[0][1].id}" on queue "queue"...`,
		],
		[
			LogLevel.DEBUG,
			`Retrying message "${batches[0][2].id}" on queue "queue"...`,
		],
		[LogLevel.INFO, "QUEUE queue 0/3 (Xms)"],
	]);
	log.logs = [];
	retryAll = false;
	retryMessages = ["msg3"];
	timers.timestamp += 1000;
	await timers.waitForTasks();
	t.is(batches.length, 2);
	t.deepEqual(stripTimings(log.logs), [
		[
			LogLevel.DEBUG,
			`Retrying message "${batches[0][2].id}" on queue "queue"...`,
		],
		[LogLevel.INFO, "QUEUE queue 2/3 (Xms)"],
	]);
	log.logs = [];
	timers.timestamp += 1000;
	await timers.waitForTasks();
	t.is(batches.length, 3);
	t.deepEqual(stripTimings(log.logs), [
		[
			LogLevel.WARN,
			`Dropped message "${batches[0][2].id}" on queue "queue" after 3 failed attempts!`,
		],
		[LogLevel.INFO, "QUEUE queue 0/1 (Xms)"],
	]);
	log.logs = [];
	timers.timestamp += 1000;
	await timers.waitForTasks();
	t.is(batches.length, 3);
	t.deepEqual(bodies(), [
		["msg1", "msg2", "msg3"],
		["msg1", "msg2", "msg3"],
		["msg3"],
	]);
	batches = [];
});

test("moves to dead letter queue", async (t) => {
	const batches: z.infer<typeof MessageArraySchema>[] = [];
	let retryMessages: string[] = [];

	const port = await getPort();
	const log = new TestLog(t);
	const timers = new TestTimers();
	const mf = new Miniflare({
		port,
		log,
		timers,
		verbose: true,

		queueProducers: { BAD_QUEUE: "bad" },
		queueConsumers: {
			// Check single Worker consuming multiple queues
			bad: {
				maxBatchSize: 5,
				maxBatchTimeout: 1,
				maxRetires: 0,
				deadLetterQueue: "dlq",
			},
			dlq: {
				maxBatchSize: 5,
				maxBatchTimeout: 1,
				maxRetires: 0,
				deadLetterQueue: "bad", // (cyclic)
			},
		},
		serviceBindings: {
			async RETRY_FILTER(request) {
				batches.push(MessageArraySchema.parse(await request.json()));
				return Response.json({ retryMessages });
			},
		},

		modules: true,
		script: `export default {
      async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const body = await request.json();
        await env.BAD_QUEUE.sendBatch(body);
        return new Response();
      },
      async queue(batch, env, ctx) {
        const res = await env.RETRY_FILTER.fetch("http://localhost", {
          method: "POST",
          body: JSON.stringify(batch.messages.map(({ id, body }) => ({ queue: batch.queue, id, body }))),
        });
        const { retryMessages } = await res.json();
        for (const message of batch.messages) {
          if (retryMessages.includes(message.body)) message.retry();
        }
      }
    }`,
	});
	async function sendBatch(...messages: string[]) {
		await mf.dispatchFetch("http://localhost", {
			method: "POST",
			body: JSON.stringify(messages.map((body) => ({ body }))),
		});
	}

	// Check moves messages to dead letter queue after max retries
	retryMessages = ["msg2", "msg3"];
	await sendBatch("msg1", "msg2", "msg3");
	log.logs = [];
	timers.timestamp += 1000;
	await timers.waitForTasks();
	t.is(batches.length, 1);
	t.deepEqual(stripTimings(log.logs), [
		[
			LogLevel.WARN,
			`Moving message "${batches[0][1].id}" on queue "bad" to dead letter queue "dlq" after 1 failed attempt...`,
		],
		[
			LogLevel.WARN,
			`Moving message "${batches[0][2].id}" on queue "bad" to dead letter queue "dlq" after 1 failed attempt...`,
		],
		[LogLevel.INFO, "QUEUE bad 1/3 (Xms)"],
	]);
	log.logs = [];
	// Check allows cyclic dead letter queue path with multiple queues
	retryMessages = ["msg2"];
	timers.timestamp += 1000;
	await timers.waitForTasks();
	t.is(batches.length, 2);
	t.deepEqual(stripTimings(log.logs), [
		[
			LogLevel.WARN,
			`Moving message "${batches[0][1].id}" on queue "dlq" to dead letter queue "bad" after 1 failed attempt...`,
		],
		[LogLevel.INFO, "QUEUE dlq 1/2 (Xms)"],
	]);
	log.logs = [];
	retryMessages = [];
	timers.timestamp += 1000;
	await timers.waitForTasks();
	t.is(batches.length, 3);
	t.deepEqual(stripTimings(log.logs), [[LogLevel.INFO, "QUEUE bad 1/1 (Xms)"]]);
	log.logs = [];
	t.deepEqual(batches, [
		[
			{ queue: "bad", id: batches[0][0].id, body: "msg1" },
			{ queue: "bad", id: batches[0][1].id, body: "msg2" },
			{ queue: "bad", id: batches[0][2].id, body: "msg3" },
		],
		[
			{ queue: "dlq", id: batches[0][1].id, body: "msg2" },
			{ queue: "dlq", id: batches[0][2].id, body: "msg3" },
		],
		[{ queue: "bad", id: batches[0][1].id, body: "msg2" }],
	]);

	// Check rejects queue as own dead letter queue
	const promise = mf.setOptions({
		port,
		log,
		timers,
		queueConsumers: { bad: { deadLetterQueue: "bad" } },
		script: "",
	});
	await t.throwsAsync(promise, {
		instanceOf: QueuesError,
		code: "ERR_DEAD_LETTER_QUEUE_CYCLE",
		message: 'Dead letter queue for queue "bad" cannot be itself',
	});
});

test("operations permit strange queue names", async (t) => {
	const promise = new DeferredPromise<z.infer<typeof MessageArraySchema>>();
	const port = await getPort();
	const timers = new TestTimers();
	const id = "my/ Queue";
	const mf = new Miniflare({
		port,
		timers,
		verbose: true,
		queueProducers: { QUEUE: id },
		queueConsumers: [id],
		serviceBindings: {
			async REPORTER(request) {
				promise.resolve(MessageArraySchema.parse(await request.json()));
				return new Response();
			},
		},
		modules: true,
		script: `export default {
      async fetch(request, env, ctx) {
        await env.QUEUE.send("msg1");
        await env.QUEUE.sendBatch([{ body: "msg2" }]);
        return new Response();
      },
      async queue(batch, env, ctx) {
        await env.REPORTER.fetch("http://localhost", {
          method: "POST",
          body: JSON.stringify(batch.messages.map(({ id, body }) => ({ queue: batch.queue, id, body }))),
        });
      }
    }`,
	});
	await mf.dispatchFetch("http://localhost");
	timers.timestamp += 1000;
	await timers.waitForTasks();
	const batch = await promise;
	t.deepEqual(batch, [
		{ queue: id, id: batch[0].id, body: "msg1" },
		{ queue: id, id: batch[1].id, body: "msg2" },
	]);
});
