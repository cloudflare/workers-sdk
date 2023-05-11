import { Buffer } from './buffer';
import { Deferred, deferred } from './deferred';

namespace Deno {
	export interface Reader {
		read(p: Uint8Array): Promise<number | null>;
	}

	export interface ReaderSync {
		readSync(p: Uint8Array): number | null;
	}

	export interface Writer {
		write(p: Uint8Array): Promise<number>;
	}

	export interface WriterSync {
		writeSync(p: Uint8Array): number;
	}

	export interface Closer {
		close(): void;
	}

	export enum SeekMode {
		Start = 0,
		Current = 1,
		End = 2,
	}
	export interface Seeker {
		seek(offset: number, whence: SeekMode): Promise<number>;
	}
	export interface SeekerSync {
		seekSync(offset: number, whence: SeekMode): number;
	}

	export interface ConnectOptions {
		/** The port to connect to. */
		port: number;
		/** A literal IP address or host name that can be resolved to an IP address.
		 * If not specified, defaults to `127.0.0.1`. */
		hostname?: string;
		transport?: 'tcp';
	}

	export interface NetAddr {
		transport: 'tcp' | 'udp';
		hostname: string;
		port: number;
	}

	export interface UnixAddr {
		transport: 'unix' | 'unixpacket';
		path: string;
	}

	export type Addr = NetAddr | UnixAddr;

	export interface Conn extends Reader, Writer, Closer {
		/** The local address of the connection. */
		readonly localAddr: Addr;
		/** The remote address of the connection. */
		readonly remoteAddr: Addr;
		/** The resource ID of the connection. */
		readonly rid: number;
		/** Shuts down (`shutdown(2)`) the write side of the connection. Most
		 * callers should just use `close()`. */
		closeWrite(): Promise<void>;
	}

	export class TcpOverWebsocketConn implements Conn {
		localAddr: Addr = { transport: 'tcp', hostname: 'localhost', port: 5432 };
		remoteAddr: Addr = { transport: 'tcp', hostname: 'localhost', port: 5432 };
		rid: number = 1;

		ws: WebSocket;
		buffer: Buffer;
		empty_notifier: Deferred<void>;

		constructor(ws: WebSocket) {
			this.ws = ws;

			// @ts-ignore
			this.buffer = new Buffer();

			this.empty_notifier = deferred();

			// Incoming messages get written to a buffer
			this.ws.addEventListener('message', msg => {
				const data = new Uint8Array(msg.data);

				// @ts-ignore
				this.buffer.write(data).then(() => {
					this.empty_notifier.resolve();
				});
			});

			this.ws.addEventListener('error', err => {
				console.log('ws error');
			});
			this.ws.addEventListener('close', () => {
				this.empty_notifier.resolve();
				console.log('ws close');
			});
			this.ws.addEventListener('open', () => {
				console.log('ws open');
			});
		}

		closeWrite(): Promise<void> {
			throw new Error('Method not implemented.');
		}

		// Reads up to p.length bytes from our buffer
		read(p: Uint8Array): Promise<number | null> {
			//If the buffer is empty, we need to block until there is data
			if (this.buffer.length === 0) {
				return new Promise(async (resolve, reject) => {
					this.empty_notifier = deferred();
					await this.empty_notifier;

					if (this.buffer.length === 0) {
						reject(0); // TODO what is the correct way to handle errors
					} else {
						// @ts-ignore
						const bytes = await this.buffer.read(p);
						resolve(bytes);
					}
				});
			} else {
				// @ts-ignore
				return this.buffer.read(p);
			}
		}

		write(p: Uint8Array): Promise<number> {
			this.ws.send(p);

			// We have to assume the socket buffered our entire message
			return Promise.resolve(p.byteLength);
		}

		close(): void {
			this.ws.close();
		}
	}

	export function startTls(connection: Conn): Promise<Conn> {
		return Promise.resolve(connection);
	}

	export function connect(options: ConnectOptions): Promise<Conn> {
		return new Promise<Conn>((resolve, reject) => {
			// Allows user to connect to Tunnel unauthenticated, or with a Service Token from Access
			// by setting the CF_CLIENT_ID and CF_CLIENT_SECRET secrets in their Worker
			let cfAccess = {};

			// @ts-ignore
			if (globalThis.CF_CLIENT_ID && globalThis.CF_CLIENT_SECRET) {
				cfAccess = {
					// @ts-ignore
					'CF-Access-Client-ID': globalThis.CF_CLIENT_ID,
					// @ts-ignore
					'CF-Access-Client-Secret': globalThis.CF_CLIENT_SECRET,
				};
			}
			if (options.hostname === undefined) {
				throw new Error('Tunnel hostname undefined');
			}
			const resp = fetch(options.hostname, {
				headers: {
					...cfAccess,
					Upgrade: 'websocket',
				},
			})
				.then(resp => {
					// N.B. `webSocket` property exists on Workers `Response` type.
					// @ts-ignore
					if (resp.webSocket) {
						// @ts-ignore
						resp.webSocket.accept();
						// @ts-ignore
						let c = new TcpOverWebsocketConn(resp.webSocket);
						resolve(c);
					} else {
						throw new Error(
							`Failed to create WebSocket connection: ${resp.status} ${resp.statusText}`
						);
					}
				})
				.catch(e => {
					console.log((e as Error).message);
					reject(e); //TODO error handling
				});

			return resp;
		});
	}

	export namespace env {
		export function get(s: string) {
			// TODO env variables come from env context, which we do not have here
			return undefined;
		}
	}

	export namespace errors {
		export class NotFound extends Error {}
		export class PermissionDenied extends Error {}
		export class ConnectionRefused extends Error {}
		export class ConnectionReset extends Error {}
		export class ConnectionAborted extends Error {}
		export class NotConnected extends Error {}
		export class AddrInUse extends Error {}
		export class AddrNotAvailable extends Error {}
		export class BrokenPipe extends Error {}
		export class AlreadyExists extends Error {}
		export class InvalidData extends Error {}
		export class TimedOut extends Error {}
		export class Interrupted extends Error {}
		export class WriteZero extends Error {}
		export class UnexpectedEof extends Error {}
		export class BadResource extends Error {}
		export class Http extends Error {}
		export class Busy extends Error {}
	}
}

// @ts-expect-error ignore
globalThis.Deno = Deno;

export class FinalizationRegistry {
	constructor() {}

	register() {}
	unregister() {}
}

// @ts-ignore
globalThis.FinalizationRegistry = FinalizationRegistry;
