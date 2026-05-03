import assert from "node:assert";
import events from "node:events";
import net from "node:net";
import util from "node:util";

/**
 * The 8-byte Postgres SSLRequest packet.
 * Length=8, Code=80877103 (0x04D2162F).
 */
export const POSTGRES_SSL_REQUEST_PACKET = Buffer.from([
	0x00, 0x00, 0x00, 0x08, 0x04, 0xd2, 0x16, 0x2f,
]);

// ── Postgres wire protocol helper functions ──────────────────────────────────

/** Build a single Postgres backend message: type (1 byte) + int32 length + payload. */
function pgMsg(type: string, payload: Buffer): Buffer {
	const len = 4 + payload.length; // length field includes itself but not the type byte
	const buf = Buffer.alloc(1 + 4 + payload.length);
	buf.write(type, 0, 1, "ascii");
	buf.writeInt32BE(len, 1);
	payload.copy(buf, 5);
	return buf;
}

/** AuthenticationOk — type 'R', auth status 0. */
function authenticationOk(): Buffer {
	const payload = Buffer.alloc(4);
	payload.writeInt32BE(0, 0); // auth type 0 = OK
	return pgMsg("R", payload);
}

/** ParameterStatus — type 'S', name + value (both null-terminated). */
function parameterStatus(name: string, value: string): Buffer {
	const payload = Buffer.from(`${name}\0${value}\0`, "utf8");
	return pgMsg("S", payload);
}

/** BackendKeyData — type 'K', process ID + secret key. */
function backendKeyData(pid: number, key: number): Buffer {
	const payload = Buffer.alloc(8);
	payload.writeInt32BE(pid, 0);
	payload.writeInt32BE(key, 4);
	return pgMsg("K", payload);
}

/** ReadyForQuery — type 'Z', transaction status indicator. */
function readyForQuery(status: "I" | "T" | "E" = "I"): Buffer {
	return pgMsg("Z", Buffer.from(status, "ascii"));
}

/** RowDescription — type 'T', field definitions for one or more columns. */
function rowDescription(columns: string[]): Buffer {
	// int16 field count, then for each field:
	//   name (null-terminated), table OID (int32), column attr (int16),
	//   type OID (int32), type size (int16), type modifier (int32), format code (int16)
	const parts: Buffer[] = [];
	const fieldCount = Buffer.alloc(2);
	fieldCount.writeInt16BE(columns.length, 0);
	parts.push(fieldCount);

	for (const col of columns) {
		const name = Buffer.from(`${col}\0`, "utf8");
		const meta = Buffer.alloc(18);
		meta.writeInt32BE(0, 0); // table OID
		meta.writeInt16BE(0, 4); // column attribute number
		meta.writeInt32BE(25, 6); // type OID: 25 = text
		meta.writeInt16BE(-1, 10); // type size: -1 = variable length
		meta.writeInt32BE(-1, 12); // type modifier
		meta.writeInt16BE(0, 16); // format code: 0 = text
		parts.push(name, meta);
	}

	return pgMsg("T", Buffer.concat(parts));
}

/** DataRow — type 'D', column values as text. */
function dataRow(values: string[]): Buffer {
	const parts: Buffer[] = [];
	const colCount = Buffer.alloc(2);
	colCount.writeInt16BE(values.length, 0);
	parts.push(colCount);

	for (const val of values) {
		const valBuf = Buffer.from(val, "utf8");
		const lenBuf = Buffer.alloc(4);
		lenBuf.writeInt32BE(valBuf.length, 0);
		parts.push(lenBuf, valBuf);
	}

	return pgMsg("D", Buffer.concat(parts));
}

/** CommandComplete — type 'C', command tag (null-terminated). */
function commandComplete(tag: string): Buffer {
	return pgMsg("C", Buffer.from(`${tag}\0`, "utf8"));
}

// ── Mock server ──────────────────────────────────────────────────────────────

export interface MockPgServerOptions {
	/** Canned rows to return for any query. Defaults to [{ id: "1" }]. */
	rows?: Record<string, string>[];
}

/**
 * Creates a minimal mock Postgres server that speaks enough of the wire protocol
 * for the `pg` (node-postgres) library to successfully connect, authenticate,
 * and execute simple queries.
 *
 * Handles: SSLRequest, StartupMessage, SimpleQuery (Q), Terminate (X).
 * Returns canned result rows for any query.
 */
export async function createMockPostgresServer(
	options?: MockPgServerOptions
): Promise<{ server: net.Server; port: number; stop: () => Promise<void> }> {
	const rows = options?.rows ?? [{ id: "1" }];

	const server = net.createServer((socket) => {
		let startupHandled = false;

		socket.on("data", (chunk: Buffer) => {
			// 1. SSLRequest — respond with 'N' (no SSL)
			if (POSTGRES_SSL_REQUEST_PACKET.equals(chunk)) {
				socket.write("N");
				return;
			}

			// 2. StartupMessage — no type byte prefix; starts with int32 length + int32 version (196608 = 3.0)
			if (!startupHandled) {
				// Validate it looks like a StartupMessage (version 3.0)
				if (chunk.length >= 8) {
					const version = chunk.readInt32BE(4);
					if (version === 196608) {
						startupHandled = true;
						socket.write(
							Buffer.concat([
								authenticationOk(),
								parameterStatus("server_version", "15.0"),
								parameterStatus("client_encoding", "UTF8"),
								backendKeyData(1, 1),
								readyForQuery("I"),
							])
						);
						return;
					}
				}
			}

			// 3. Parse typed messages (first byte = type, next 4 bytes = length)
			let offset = 0;
			while (offset < chunk.length) {
				const typeByte = chunk[offset];
				if (typeByte === undefined || offset + 5 > chunk.length) {
					break;
				}
				const msgType = String.fromCharCode(typeByte);
				const msgLen = chunk.readInt32BE(offset + 1);
				// Total message size = 1 (type) + msgLen
				const msgEnd = offset + 1 + msgLen;

				switch (msgType) {
					case "Q": {
						// SimpleQuery — return canned rows
						const firstRow = rows[0];
						const columns = firstRow ? Object.keys(firstRow) : [];
						const parts: Buffer[] = [rowDescription(columns)];

						for (const row of rows) {
							parts.push(dataRow(columns.map((col) => row[col] ?? "")));
						}

						parts.push(commandComplete(`SELECT ${rows.length}`));
						parts.push(readyForQuery("I"));
						socket.write(Buffer.concat(parts));
						break;
					}
					case "X": {
						// Terminate
						socket.end();
						return;
					}
					default: {
						// Unknown message — ignore
						break;
					}
				}

				offset = msgEnd;
			}
		});

		// Prevent socket errors (e.g. ECONNRESET from abrupt client disconnects)
		// from becoming uncaught exceptions — Node.js EventEmitters throw if an
		// 'error' event fires with no listener attached.
		socket.on("error", () => {});
	});

	const listeningPromise = events.once(server, "listening");
	server.listen(0, "127.0.0.1");
	await listeningPromise;

	const address = server.address();
	assert(typeof address === "object" && address !== null);
	const port = address.port;

	const stop = async () => {
		await util.promisify(server.close.bind(server))();
	};

	return { server, port, stop };
}
