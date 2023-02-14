function copy(src, dst, off = 0) {
	off = Math.max(0, Math.min(off, dst.byteLength));
	const dstBytesAvailable = dst.byteLength - off;
	if (src.byteLength > dstBytesAvailable) {
		src = src.subarray(0, dstBytesAvailable);
	}
	dst.set(src, off);
	return src.byteLength;
}
class DenoStdInternalError extends Error {
	constructor(message) {
		super(message);
		this.name = 'DenoStdInternalError';
	}
}
function assert(expr, msg = '') {
	if (!expr) {
		throw new DenoStdInternalError(msg);
	}
}
const { Deno } = globalThis;
const noColor = typeof Deno?.noColor === 'boolean' ? Deno.noColor : true;
let enabled = !noColor;
function code(open, close) {
	return {
		open: `\x1b[${open.join(';')}m`,
		close: `\x1b[${close}m`,
		regexp: new RegExp(`\\x1b\\[${close}m`, 'g'),
	};
}
function run(str, code) {
	return enabled ? `${code.open}${str.replace(code.regexp, code.open)}${code.close}` : str;
}
function bold(str) {
	return run(str, code([1], 22));
}
function yellow(str) {
	return run(str, code([33], 39));
}
new RegExp(
	[
		'[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)',
		'(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))',
	].join('|'),
	'g'
);
var DiffType;
(function (DiffType) {
	DiffType['removed'] = 'removed';
	DiffType['common'] = 'common';
	DiffType['added'] = 'added';
})(DiffType || (DiffType = {}));
async function writeAll(w, arr) {
	let nwritten = 0;
	while (nwritten < arr.length) {
		nwritten += await w.write(arr.subarray(nwritten));
	}
}
function writeAllSync(w, arr) {
	let nwritten = 0;
	while (nwritten < arr.length) {
		nwritten += w.writeSync(arr.subarray(nwritten));
	}
}
const DEFAULT_BUF_SIZE = 4096;
const MIN_BUF_SIZE = 16;
const CR = '\r'.charCodeAt(0);
const LF = '\n'.charCodeAt(0);
class BufferFullError extends Error {
	partial;
	name = 'BufferFullError';
	constructor(partial) {
		super('Buffer full');
		this.partial = partial;
	}
}
class PartialReadError extends Error {
	name = 'PartialReadError';
	partial;
	constructor() {
		super('Encountered UnexpectedEof, data only partially read');
	}
}
class BufReader {
	buf;
	rd;
	r = 0;
	w = 0;
	eof = false;
	static create(r, size = 4096) {
		return r instanceof BufReader ? r : new BufReader(r, size);
	}
	constructor(rd, size = 4096) {
		if (size < 16) {
			size = MIN_BUF_SIZE;
		}
		this._reset(new Uint8Array(size), rd);
	}
	size() {
		return this.buf.byteLength;
	}
	buffered() {
		return this.w - this.r;
	}
	async _fill() {
		if (this.r > 0) {
			this.buf.copyWithin(0, this.r, this.w);
			this.w -= this.r;
			this.r = 0;
		}
		if (this.w >= this.buf.byteLength) {
			throw Error('bufio: tried to fill full buffer');
		}
		for (let i = 100; i > 0; i--) {
			const rr = await this.rd.read(this.buf.subarray(this.w));
			if (rr === null) {
				this.eof = true;
				return;
			}
			assert(rr >= 0, 'negative read');
			this.w += rr;
			if (rr > 0) {
				return;
			}
		}
		throw new Error(`No progress after ${100} read() calls`);
	}
	reset(r) {
		this._reset(this.buf, r);
	}
	_reset(buf, rd) {
		this.buf = buf;
		this.rd = rd;
		this.eof = false;
	}
	async read(p) {
		let rr = p.byteLength;
		if (p.byteLength === 0) return rr;
		if (this.r === this.w) {
			if (p.byteLength >= this.buf.byteLength) {
				const rr = await this.rd.read(p);
				const nread = rr ?? 0;
				assert(nread >= 0, 'negative read');
				return rr;
			}
			this.r = 0;
			this.w = 0;
			rr = await this.rd.read(this.buf);
			if (rr === 0 || rr === null) return rr;
			assert(rr >= 0, 'negative read');
			this.w += rr;
		}
		const copied = copy(this.buf.subarray(this.r, this.w), p, 0);
		this.r += copied;
		return copied;
	}
	async readFull(p) {
		let bytesRead = 0;
		while (bytesRead < p.length) {
			try {
				const rr = await this.read(p.subarray(bytesRead));
				if (rr === null) {
					if (bytesRead === 0) {
						return null;
					} else {
						throw new PartialReadError();
					}
				}
				bytesRead += rr;
			} catch (err) {
				if (err instanceof PartialReadError) {
					err.partial = p.subarray(0, bytesRead);
				} else if (err instanceof Error) {
					const e = new PartialReadError();
					e.partial = p.subarray(0, bytesRead);
					e.stack = err.stack;
					e.message = err.message;
					e.cause = err.cause;
					throw err;
				}
				throw err;
			}
		}
		return p;
	}
	async readByte() {
		while (this.r === this.w) {
			if (this.eof) return null;
			await this._fill();
		}
		const c = this.buf[this.r];
		this.r++;
		return c;
	}
	async readString(delim) {
		if (delim.length !== 1) {
			throw new Error('Delimiter should be a single character');
		}
		const buffer = await this.readSlice(delim.charCodeAt(0));
		if (buffer === null) return null;
		return new TextDecoder().decode(buffer);
	}
	async readLine() {
		let line = null;
		try {
			line = await this.readSlice(LF);
		} catch (err) {
			if (err instanceof Deno.errors.BadResource) {
				throw err;
			}
			let partial;
			if (err instanceof PartialReadError) {
				partial = err.partial;
				assert(
					partial instanceof Uint8Array,
					'bufio: caught error from `readSlice()` without `partial` property'
				);
			}
			if (!(err instanceof BufferFullError)) {
				throw err;
			}
			if (
				!this.eof &&
				partial &&
				partial.byteLength > 0 &&
				partial[partial.byteLength - 1] === CR
			) {
				assert(this.r > 0, 'bufio: tried to rewind past start of buffer');
				this.r--;
				partial = partial.subarray(0, partial.byteLength - 1);
			}
			if (partial) {
				return {
					line: partial,
					more: !this.eof,
				};
			}
		}
		if (line === null) {
			return null;
		}
		if (line.byteLength === 0) {
			return {
				line,
				more: false,
			};
		}
		if (line[line.byteLength - 1] == LF) {
			let drop = 1;
			if (line.byteLength > 1 && line[line.byteLength - 2] === CR) {
				drop = 2;
			}
			line = line.subarray(0, line.byteLength - drop);
		}
		return {
			line,
			more: false,
		};
	}
	async readSlice(delim) {
		let s = 0;
		let slice;
		while (true) {
			let i = this.buf.subarray(this.r + s, this.w).indexOf(delim);
			if (i >= 0) {
				i += s;
				slice = this.buf.subarray(this.r, this.r + i + 1);
				this.r += i + 1;
				break;
			}
			if (this.eof) {
				if (this.r === this.w) {
					return null;
				}
				slice = this.buf.subarray(this.r, this.w);
				this.r = this.w;
				break;
			}
			if (this.buffered() >= this.buf.byteLength) {
				this.r = this.w;
				const oldbuf = this.buf;
				const newbuf = this.buf.slice(0);
				this.buf = newbuf;
				throw new BufferFullError(oldbuf);
			}
			s = this.w - this.r;
			try {
				await this._fill();
			} catch (err) {
				if (err instanceof PartialReadError) {
					err.partial = slice;
				} else if (err instanceof Error) {
					const e = new PartialReadError();
					e.partial = slice;
					e.stack = err.stack;
					e.message = err.message;
					e.cause = err.cause;
					throw err;
				}
				throw err;
			}
		}
		return slice;
	}
	async peek(n) {
		if (n < 0) {
			throw Error('negative count');
		}
		let avail = this.w - this.r;
		while (avail < n && avail < this.buf.byteLength && !this.eof) {
			try {
				await this._fill();
			} catch (err) {
				if (err instanceof PartialReadError) {
					err.partial = this.buf.subarray(this.r, this.w);
				} else if (err instanceof Error) {
					const e = new PartialReadError();
					e.partial = this.buf.subarray(this.r, this.w);
					e.stack = err.stack;
					e.message = err.message;
					e.cause = err.cause;
					throw err;
				}
				throw err;
			}
			avail = this.w - this.r;
		}
		if (avail === 0 && this.eof) {
			return null;
		} else if (avail < n && this.eof) {
			return this.buf.subarray(this.r, this.r + avail);
		} else if (avail < n) {
			throw new BufferFullError(this.buf.subarray(this.r, this.w));
		}
		return this.buf.subarray(this.r, this.r + n);
	}
}
class AbstractBufBase {
	buf;
	usedBufferBytes = 0;
	err = null;
	size() {
		return this.buf.byteLength;
	}
	available() {
		return this.buf.byteLength - this.usedBufferBytes;
	}
	buffered() {
		return this.usedBufferBytes;
	}
}
class BufWriter extends AbstractBufBase {
	writer;
	static create(writer, size = 4096) {
		return writer instanceof BufWriter ? writer : new BufWriter(writer, size);
	}
	constructor(writer, size = 4096) {
		super();
		this.writer = writer;
		if (size <= 0) {
			size = DEFAULT_BUF_SIZE;
		}
		this.buf = new Uint8Array(size);
	}
	reset(w) {
		this.err = null;
		this.usedBufferBytes = 0;
		this.writer = w;
	}
	async flush() {
		if (this.err !== null) throw this.err;
		if (this.usedBufferBytes === 0) return;
		try {
			await writeAll(this.writer, this.buf.subarray(0, this.usedBufferBytes));
		} catch (e) {
			if (e instanceof Error) {
				this.err = e;
			}
			throw e;
		}
		this.buf = new Uint8Array(this.buf.length);
		this.usedBufferBytes = 0;
	}
	async write(data) {
		if (this.err !== null) throw this.err;
		if (data.length === 0) return 0;
		let totalBytesWritten = 0;
		let numBytesWritten = 0;
		while (data.byteLength > this.available()) {
			if (this.buffered() === 0) {
				try {
					numBytesWritten = await this.writer.write(data);
				} catch (e) {
					if (e instanceof Error) {
						this.err = e;
					}
					throw e;
				}
			} else {
				numBytesWritten = copy(data, this.buf, this.usedBufferBytes);
				this.usedBufferBytes += numBytesWritten;
				await this.flush();
			}
			totalBytesWritten += numBytesWritten;
			data = data.subarray(numBytesWritten);
		}
		numBytesWritten = copy(data, this.buf, this.usedBufferBytes);
		this.usedBufferBytes += numBytesWritten;
		totalBytesWritten += numBytesWritten;
		return totalBytesWritten;
	}
}
class BufWriterSync extends AbstractBufBase {
	writer;
	static create(writer, size = 4096) {
		return writer instanceof BufWriterSync ? writer : new BufWriterSync(writer, size);
	}
	constructor(writer, size = 4096) {
		super();
		this.writer = writer;
		if (size <= 0) {
			size = DEFAULT_BUF_SIZE;
		}
		this.buf = new Uint8Array(size);
	}
	reset(w) {
		this.err = null;
		this.usedBufferBytes = 0;
		this.writer = w;
	}
	flush() {
		if (this.err !== null) throw this.err;
		if (this.usedBufferBytes === 0) return;
		try {
			writeAllSync(this.writer, this.buf.subarray(0, this.usedBufferBytes));
		} catch (e) {
			if (e instanceof Error) {
				this.err = e;
			}
			throw e;
		}
		this.buf = new Uint8Array(this.buf.length);
		this.usedBufferBytes = 0;
	}
	writeSync(data) {
		if (this.err !== null) throw this.err;
		if (data.length === 0) return 0;
		let totalBytesWritten = 0;
		let numBytesWritten = 0;
		while (data.byteLength > this.available()) {
			if (this.buffered() === 0) {
				try {
					numBytesWritten = this.writer.writeSync(data);
				} catch (e) {
					if (e instanceof Error) {
						this.err = e;
					}
					throw e;
				}
			} else {
				numBytesWritten = copy(data, this.buf, this.usedBufferBytes);
				this.usedBufferBytes += numBytesWritten;
				this.flush();
			}
			totalBytesWritten += numBytesWritten;
			data = data.subarray(numBytesWritten);
		}
		numBytesWritten = copy(data, this.buf, this.usedBufferBytes);
		this.usedBufferBytes += numBytesWritten;
		totalBytesWritten += numBytesWritten;
		return totalBytesWritten;
	}
}
const base64abc = [
	'A',
	'B',
	'C',
	'D',
	'E',
	'F',
	'G',
	'H',
	'I',
	'J',
	'K',
	'L',
	'M',
	'N',
	'O',
	'P',
	'Q',
	'R',
	'S',
	'T',
	'U',
	'V',
	'W',
	'X',
	'Y',
	'Z',
	'a',
	'b',
	'c',
	'd',
	'e',
	'f',
	'g',
	'h',
	'i',
	'j',
	'k',
	'l',
	'm',
	'n',
	'o',
	'p',
	'q',
	'r',
	's',
	't',
	'u',
	'v',
	'w',
	'x',
	'y',
	'z',
	'0',
	'1',
	'2',
	'3',
	'4',
	'5',
	'6',
	'7',
	'8',
	'9',
	'+',
	'/',
];
function encode(data) {
	const uint8 =
		typeof data === 'string'
			? new TextEncoder().encode(data)
			: data instanceof Uint8Array
			? data
			: new Uint8Array(data);
	let result = '',
		i;
	const l = uint8.length;
	for (i = 2; i < l; i += 3) {
		result += base64abc[uint8[i - 2] >> 2];
		result += base64abc[((uint8[i - 2] & 3) << 4) | (uint8[i - 1] >> 4)];
		result += base64abc[((uint8[i - 1] & 15) << 2) | (uint8[i] >> 6)];
		result += base64abc[uint8[i] & 63];
	}
	if (i === l + 1) {
		result += base64abc[uint8[i - 2] >> 2];
		result += base64abc[(uint8[i - 2] & 3) << 4];
		result += '==';
	}
	if (i === l) {
		result += base64abc[uint8[i - 2] >> 2];
		result += base64abc[((uint8[i - 2] & 3) << 4) | (uint8[i - 1] >> 4)];
		result += base64abc[(uint8[i - 1] & 15) << 2];
		result += '=';
	}
	return result;
}
function decode(b64) {
	const binString = atob(b64);
	const size = binString.length;
	const bytes = new Uint8Array(size);
	for (let i = 0; i < size; i++) {
		bytes[i] = binString.charCodeAt(i);
	}
	return bytes;
}
const mod = {
	encode: encode,
	decode: decode,
};
let cachedTextDecoder = new TextDecoder('utf-8', {
	ignoreBOM: true,
	fatal: true,
});
cachedTextDecoder.decode();
let cachegetUint8Memory0 = null;
function getUint8Memory0() {
	if (cachegetUint8Memory0 === null || cachegetUint8Memory0.buffer !== wasm.memory.buffer) {
		cachegetUint8Memory0 = new Uint8Array(wasm.memory.buffer);
	}
	return cachegetUint8Memory0;
}
function getStringFromWasm0(ptr, len) {
	return cachedTextDecoder.decode(getUint8Memory0().subarray(ptr, ptr + len));
}
const heap = new Array(32).fill(undefined);
heap.push(undefined, null, true, false);
let heap_next = heap.length;
function addHeapObject(obj) {
	if (heap_next === heap.length) heap.push(heap.length + 1);
	const idx = heap_next;
	heap_next = heap[idx];
	heap[idx] = obj;
	return idx;
}
function getObject(idx) {
	return heap[idx];
}
function dropObject(idx) {
	if (idx < 36) return;
	heap[idx] = heap_next;
	heap_next = idx;
}
function takeObject(idx) {
	const ret = getObject(idx);
	dropObject(idx);
	return ret;
}
let WASM_VECTOR_LEN = 0;
let cachedTextEncoder = new TextEncoder('utf-8');
const encodeString = function (arg, view) {
	return cachedTextEncoder.encodeInto(arg, view);
};
function passStringToWasm0(arg, malloc, realloc) {
	if (realloc === undefined) {
		const buf = cachedTextEncoder.encode(arg);
		const ptr = malloc(buf.length);
		getUint8Memory0()
			.subarray(ptr, ptr + buf.length)
			.set(buf);
		WASM_VECTOR_LEN = buf.length;
		return ptr;
	}
	let len = arg.length;
	let ptr = malloc(len);
	const mem = getUint8Memory0();
	let offset = 0;
	for (; offset < len; offset++) {
		const code = arg.charCodeAt(offset);
		if (code > 127) break;
		mem[ptr + offset] = code;
	}
	if (offset !== len) {
		if (offset !== 0) {
			arg = arg.slice(offset);
		}
		ptr = realloc(ptr, len, (len = offset + arg.length * 3));
		const view = getUint8Memory0().subarray(ptr + offset, ptr + len);
		const ret = encodeString(arg, view);
		offset += ret.written;
	}
	WASM_VECTOR_LEN = offset;
	return ptr;
}
function create_hash(algorithm) {
	var ptr0 = passStringToWasm0(algorithm, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
	var len0 = WASM_VECTOR_LEN;
	var ret = wasm.create_hash(ptr0, len0);
	return DenoHash.__wrap(ret);
}
function _assertClass(instance, klass) {
	if (!(instance instanceof klass)) {
		throw new Error(`expected instance of ${klass.name}`);
	}
	return instance.ptr;
}
function passArray8ToWasm0(arg, malloc) {
	const ptr = malloc(arg.length * 1);
	getUint8Memory0().set(arg, ptr / 1);
	WASM_VECTOR_LEN = arg.length;
	return ptr;
}
function update_hash(hash, data) {
	_assertClass(hash, DenoHash);
	var ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
	var len0 = WASM_VECTOR_LEN;
	wasm.update_hash(hash.ptr, ptr0, len0);
}
let cachegetInt32Memory0 = null;
function getInt32Memory0() {
	if (cachegetInt32Memory0 === null || cachegetInt32Memory0.buffer !== wasm.memory.buffer) {
		cachegetInt32Memory0 = new Int32Array(wasm.memory.buffer);
	}
	return cachegetInt32Memory0;
}
function getArrayU8FromWasm0(ptr, len) {
	return getUint8Memory0().subarray(ptr / 1, ptr / 1 + len);
}
function digest_hash(hash) {
	try {
		const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
		_assertClass(hash, DenoHash);
		wasm.digest_hash(retptr, hash.ptr);
		var r0 = getInt32Memory0()[retptr / 4 + 0];
		var r1 = getInt32Memory0()[retptr / 4 + 1];
		var v0 = getArrayU8FromWasm0(r0, r1).slice();
		wasm.__wbindgen_free(r0, r1 * 1);
		return v0;
	} finally {
		wasm.__wbindgen_add_to_stack_pointer(16);
	}
}
const DenoHashFinalization = new FinalizationRegistry(ptr => wasm.__wbg_denohash_free(ptr));
class DenoHash {
	static __wrap(ptr) {
		const obj = Object.create(DenoHash.prototype);
		obj.ptr = ptr;
		DenoHashFinalization.register(obj, obj.ptr, obj);
		return obj;
	}
	__destroy_into_raw() {
		const ptr = this.ptr;
		this.ptr = 0;
		DenoHashFinalization.unregister(this);
		return ptr;
	}
	free() {
		const ptr = this.__destroy_into_raw();
		wasm.__wbg_denohash_free(ptr);
	}
}
const imports = {
	__wbindgen_placeholder__: {
		__wbindgen_string_new: function (arg0, arg1) {
			var ret = getStringFromWasm0(arg0, arg1);
			return addHeapObject(ret);
		},
		__wbindgen_throw: function (arg0, arg1) {
			throw new Error(getStringFromWasm0(arg0, arg1));
		},
		__wbindgen_rethrow: function (arg0) {
			throw takeObject(arg0);
		},
	},
};
import wasmModule from './62edfb469c0dbacd90273cf9a0d7a478.wasm';
const wasmInstance = new WebAssembly.Instance(wasmModule, imports);
const wasm = wasmInstance.exports;
const hexTable = new TextEncoder().encode('0123456789abcdef');
function encode1(src) {
	const dst = new Uint8Array(src.length * 2);
	for (let i = 0; i < dst.length; i++) {
		const v = src[i];
		dst[i * 2] = hexTable[v >> 4];
		dst[i * 2 + 1] = hexTable[v & 15];
	}
	return dst;
}
class Hash {
	#hash;
	#digested;
	constructor(algorithm) {
		this.#hash = create_hash(algorithm);
		this.#digested = false;
	}
	update(message) {
		let view;
		if (message instanceof Uint8Array) {
			view = message;
		} else if (typeof message === 'string') {
			view = new TextEncoder().encode(message);
		} else if (ArrayBuffer.isView(message)) {
			view = new Uint8Array(message.buffer, message.byteOffset, message.byteLength);
		} else if (message instanceof ArrayBuffer) {
			view = new Uint8Array(message);
		} else {
			throw new Error('hash: `data` is invalid type');
		}
		const chunkSize = 65536;
		for (let offset = 0; offset < view.byteLength; offset += chunkSize) {
			update_hash(
				this.#hash,
				new Uint8Array(
					view.buffer,
					view.byteOffset + offset,
					Math.min(65536, view.byteLength - offset)
				)
			);
		}
		return this;
	}
	digest() {
		if (this.#digested) throw new Error('hash: already digested');
		this.#digested = true;
		return digest_hash(this.#hash);
	}
	toString(format = 'hex') {
		const finalized = new Uint8Array(this.digest());
		switch (format) {
			case 'hex':
				return new TextDecoder().decode(encode1(finalized));
			case 'base64':
				return encode(finalized);
			default:
				throw new Error('hash: invalid format');
		}
	}
}
function createHash(algorithm) {
	return new Hash(algorithm);
}
const HEX_CHARS = '0123456789abcdef'.split('');
const EXTRA = [-2147483648, 8388608, 32768, 128];
const SHIFT = [24, 16, 8, 0];
const K = [
	1116352408, 1899447441, 3049323471, 3921009573, 961987163, 1508970993, 2453635748, 2870763221,
	3624381080, 310598401, 607225278, 1426881987, 1925078388, 2162078206, 2614888103, 3248222580,
	3835390401, 4022224774, 264347078, 604807628, 770255983, 1249150122, 1555081692, 1996064986,
	2554220882, 2821834349, 2952996808, 3210313671, 3336571891, 3584528711, 113926993, 338241895,
	666307205, 773529912, 1294757372, 1396182291, 1695183700, 1986661051, 2177026350, 2456956037,
	2730485921, 2820302411, 3259730800, 3345764771, 3516065817, 3600352804, 4094571909, 275423344,
	430227734, 506948616, 659060556, 883997877, 958139571, 1322822218, 1537002063, 1747873779,
	1955562222, 2024104815, 2227730452, 2361852424, 2428436474, 2756734187, 3204031479, 3329325298,
];
const blocks = [];
class Sha256 {
	#block;
	#blocks;
	#bytes;
	#finalized;
	#first;
	#h0;
	#h1;
	#h2;
	#h3;
	#h4;
	#h5;
	#h6;
	#h7;
	#hashed;
	#hBytes;
	#is224;
	#lastByteIndex = 0;
	#start;
	constructor(is224 = false, sharedMemory = false) {
		this.init(is224, sharedMemory);
	}
	init(is224, sharedMemory) {
		if (sharedMemory) {
			blocks[0] =
				blocks[16] =
				blocks[1] =
				blocks[2] =
				blocks[3] =
				blocks[4] =
				blocks[5] =
				blocks[6] =
				blocks[7] =
				blocks[8] =
				blocks[9] =
				blocks[10] =
				blocks[11] =
				blocks[12] =
				blocks[13] =
				blocks[14] =
				blocks[15] =
					0;
			this.#blocks = blocks;
		} else {
			this.#blocks = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
		}
		if (is224) {
			this.#h0 = 3238371032;
			this.#h1 = 914150663;
			this.#h2 = 812702999;
			this.#h3 = 4144912697;
			this.#h4 = 4290775857;
			this.#h5 = 1750603025;
			this.#h6 = 1694076839;
			this.#h7 = 3204075428;
		} else {
			this.#h0 = 1779033703;
			this.#h1 = 3144134277;
			this.#h2 = 1013904242;
			this.#h3 = 2773480762;
			this.#h4 = 1359893119;
			this.#h5 = 2600822924;
			this.#h6 = 528734635;
			this.#h7 = 1541459225;
		}
		this.#block = this.#start = this.#bytes = this.#hBytes = 0;
		this.#finalized = this.#hashed = false;
		this.#first = true;
		this.#is224 = is224;
	}
	update(message) {
		if (this.#finalized) {
			return this;
		}
		let msg;
		if (message instanceof ArrayBuffer) {
			msg = new Uint8Array(message);
		} else {
			msg = message;
		}
		let index = 0;
		const length = msg.length;
		const blocks = this.#blocks;
		while (index < length) {
			let i;
			if (this.#hashed) {
				this.#hashed = false;
				blocks[0] = this.#block;
				blocks[16] =
					blocks[1] =
					blocks[2] =
					blocks[3] =
					blocks[4] =
					blocks[5] =
					blocks[6] =
					blocks[7] =
					blocks[8] =
					blocks[9] =
					blocks[10] =
					blocks[11] =
					blocks[12] =
					blocks[13] =
					blocks[14] =
					blocks[15] =
						0;
			}
			if (typeof msg !== 'string') {
				for (i = this.#start; index < length && i < 64; ++index) {
					blocks[i >> 2] |= msg[index] << SHIFT[i++ & 3];
				}
			} else {
				for (i = this.#start; index < length && i < 64; ++index) {
					let code = msg.charCodeAt(index);
					if (code < 128) {
						blocks[i >> 2] |= code << SHIFT[i++ & 3];
					} else if (code < 2048) {
						blocks[i >> 2] |= (192 | (code >> 6)) << SHIFT[i++ & 3];
						blocks[i >> 2] |= (128 | (code & 63)) << SHIFT[i++ & 3];
					} else if (code < 55296 || code >= 57344) {
						blocks[i >> 2] |= (224 | (code >> 12)) << SHIFT[i++ & 3];
						blocks[i >> 2] |= (128 | ((code >> 6) & 63)) << SHIFT[i++ & 3];
						blocks[i >> 2] |= (128 | (code & 63)) << SHIFT[i++ & 3];
					} else {
						code = 65536 + (((code & 1023) << 10) | (msg.charCodeAt(++index) & 1023));
						blocks[i >> 2] |= (240 | (code >> 18)) << SHIFT[i++ & 3];
						blocks[i >> 2] |= (128 | ((code >> 12) & 63)) << SHIFT[i++ & 3];
						blocks[i >> 2] |= (128 | ((code >> 6) & 63)) << SHIFT[i++ & 3];
						blocks[i >> 2] |= (128 | (code & 63)) << SHIFT[i++ & 3];
					}
				}
			}
			this.#lastByteIndex = i;
			this.#bytes += i - this.#start;
			if (i >= 64) {
				this.#block = blocks[16];
				this.#start = i - 64;
				this.hash();
				this.#hashed = true;
			} else {
				this.#start = i;
			}
		}
		if (this.#bytes > 4294967295) {
			this.#hBytes += (this.#bytes / 4294967296) << 0;
			this.#bytes = this.#bytes % 4294967296;
		}
		return this;
	}
	finalize() {
		if (this.#finalized) {
			return;
		}
		this.#finalized = true;
		const blocks = this.#blocks;
		const i = this.#lastByteIndex;
		blocks[16] = this.#block;
		blocks[i >> 2] |= EXTRA[i & 3];
		this.#block = blocks[16];
		if (i >= 56) {
			if (!this.#hashed) {
				this.hash();
			}
			blocks[0] = this.#block;
			blocks[16] =
				blocks[1] =
				blocks[2] =
				blocks[3] =
				blocks[4] =
				blocks[5] =
				blocks[6] =
				blocks[7] =
				blocks[8] =
				blocks[9] =
				blocks[10] =
				blocks[11] =
				blocks[12] =
				blocks[13] =
				blocks[14] =
				blocks[15] =
					0;
		}
		blocks[14] = (this.#hBytes << 3) | (this.#bytes >>> 29);
		blocks[15] = this.#bytes << 3;
		this.hash();
	}
	hash() {
		let a = this.#h0;
		let b = this.#h1;
		let c = this.#h2;
		let d = this.#h3;
		let e = this.#h4;
		let f = this.#h5;
		let g = this.#h6;
		let h = this.#h7;
		const blocks = this.#blocks;
		let s0;
		let s1;
		let maj;
		let t1;
		let t2;
		let ch;
		let ab;
		let da;
		let cd;
		let bc;
		for (let j = 16; j < 64; ++j) {
			t1 = blocks[j - 15];
			s0 = ((t1 >>> 7) | (t1 << 25)) ^ ((t1 >>> 18) | (t1 << 14)) ^ (t1 >>> 3);
			t1 = blocks[j - 2];
			s1 = ((t1 >>> 17) | (t1 << 15)) ^ ((t1 >>> 19) | (t1 << 13)) ^ (t1 >>> 10);
			blocks[j] = (blocks[j - 16] + s0 + blocks[j - 7] + s1) << 0;
		}
		bc = b & c;
		for (let j1 = 0; j1 < 64; j1 += 4) {
			if (this.#first) {
				if (this.#is224) {
					ab = 300032;
					t1 = blocks[0] - 1413257819;
					h = (t1 - 150054599) << 0;
					d = (t1 + 24177077) << 0;
				} else {
					ab = 704751109;
					t1 = blocks[0] - 210244248;
					h = (t1 - 1521486534) << 0;
					d = (t1 + 143694565) << 0;
				}
				this.#first = false;
			} else {
				s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
				s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
				ab = a & b;
				maj = ab ^ (a & c) ^ bc;
				ch = (e & f) ^ (~e & g);
				t1 = h + s1 + ch + K[j1] + blocks[j1];
				t2 = s0 + maj;
				h = (d + t1) << 0;
				d = (t1 + t2) << 0;
			}
			s0 = ((d >>> 2) | (d << 30)) ^ ((d >>> 13) | (d << 19)) ^ ((d >>> 22) | (d << 10));
			s1 = ((h >>> 6) | (h << 26)) ^ ((h >>> 11) | (h << 21)) ^ ((h >>> 25) | (h << 7));
			da = d & a;
			maj = da ^ (d & b) ^ ab;
			ch = (h & e) ^ (~h & f);
			t1 = g + s1 + ch + K[j1 + 1] + blocks[j1 + 1];
			t2 = s0 + maj;
			g = (c + t1) << 0;
			c = (t1 + t2) << 0;
			s0 = ((c >>> 2) | (c << 30)) ^ ((c >>> 13) | (c << 19)) ^ ((c >>> 22) | (c << 10));
			s1 = ((g >>> 6) | (g << 26)) ^ ((g >>> 11) | (g << 21)) ^ ((g >>> 25) | (g << 7));
			cd = c & d;
			maj = cd ^ (c & a) ^ da;
			ch = (g & h) ^ (~g & e);
			t1 = f + s1 + ch + K[j1 + 2] + blocks[j1 + 2];
			t2 = s0 + maj;
			f = (b + t1) << 0;
			b = (t1 + t2) << 0;
			s0 = ((b >>> 2) | (b << 30)) ^ ((b >>> 13) | (b << 19)) ^ ((b >>> 22) | (b << 10));
			s1 = ((f >>> 6) | (f << 26)) ^ ((f >>> 11) | (f << 21)) ^ ((f >>> 25) | (f << 7));
			bc = b & c;
			maj = bc ^ (b & d) ^ cd;
			ch = (f & g) ^ (~f & h);
			t1 = e + s1 + ch + K[j1 + 3] + blocks[j1 + 3];
			t2 = s0 + maj;
			e = (a + t1) << 0;
			a = (t1 + t2) << 0;
		}
		this.#h0 = (this.#h0 + a) << 0;
		this.#h1 = (this.#h1 + b) << 0;
		this.#h2 = (this.#h2 + c) << 0;
		this.#h3 = (this.#h3 + d) << 0;
		this.#h4 = (this.#h4 + e) << 0;
		this.#h5 = (this.#h5 + f) << 0;
		this.#h6 = (this.#h6 + g) << 0;
		this.#h7 = (this.#h7 + h) << 0;
	}
	hex() {
		this.finalize();
		const h0 = this.#h0;
		const h1 = this.#h1;
		const h2 = this.#h2;
		const h3 = this.#h3;
		const h4 = this.#h4;
		const h5 = this.#h5;
		const h6 = this.#h6;
		const h7 = this.#h7;
		let hex =
			HEX_CHARS[(h0 >> 28) & 15] +
			HEX_CHARS[(h0 >> 24) & 15] +
			HEX_CHARS[(h0 >> 20) & 15] +
			HEX_CHARS[(h0 >> 16) & 15] +
			HEX_CHARS[(h0 >> 12) & 15] +
			HEX_CHARS[(h0 >> 8) & 15] +
			HEX_CHARS[(h0 >> 4) & 15] +
			HEX_CHARS[h0 & 15] +
			HEX_CHARS[(h1 >> 28) & 15] +
			HEX_CHARS[(h1 >> 24) & 15] +
			HEX_CHARS[(h1 >> 20) & 15] +
			HEX_CHARS[(h1 >> 16) & 15] +
			HEX_CHARS[(h1 >> 12) & 15] +
			HEX_CHARS[(h1 >> 8) & 15] +
			HEX_CHARS[(h1 >> 4) & 15] +
			HEX_CHARS[h1 & 15] +
			HEX_CHARS[(h2 >> 28) & 15] +
			HEX_CHARS[(h2 >> 24) & 15] +
			HEX_CHARS[(h2 >> 20) & 15] +
			HEX_CHARS[(h2 >> 16) & 15] +
			HEX_CHARS[(h2 >> 12) & 15] +
			HEX_CHARS[(h2 >> 8) & 15] +
			HEX_CHARS[(h2 >> 4) & 15] +
			HEX_CHARS[h2 & 15] +
			HEX_CHARS[(h3 >> 28) & 15] +
			HEX_CHARS[(h3 >> 24) & 15] +
			HEX_CHARS[(h3 >> 20) & 15] +
			HEX_CHARS[(h3 >> 16) & 15] +
			HEX_CHARS[(h3 >> 12) & 15] +
			HEX_CHARS[(h3 >> 8) & 15] +
			HEX_CHARS[(h3 >> 4) & 15] +
			HEX_CHARS[h3 & 15] +
			HEX_CHARS[(h4 >> 28) & 15] +
			HEX_CHARS[(h4 >> 24) & 15] +
			HEX_CHARS[(h4 >> 20) & 15] +
			HEX_CHARS[(h4 >> 16) & 15] +
			HEX_CHARS[(h4 >> 12) & 15] +
			HEX_CHARS[(h4 >> 8) & 15] +
			HEX_CHARS[(h4 >> 4) & 15] +
			HEX_CHARS[h4 & 15] +
			HEX_CHARS[(h5 >> 28) & 15] +
			HEX_CHARS[(h5 >> 24) & 15] +
			HEX_CHARS[(h5 >> 20) & 15] +
			HEX_CHARS[(h5 >> 16) & 15] +
			HEX_CHARS[(h5 >> 12) & 15] +
			HEX_CHARS[(h5 >> 8) & 15] +
			HEX_CHARS[(h5 >> 4) & 15] +
			HEX_CHARS[h5 & 15] +
			HEX_CHARS[(h6 >> 28) & 15] +
			HEX_CHARS[(h6 >> 24) & 15] +
			HEX_CHARS[(h6 >> 20) & 15] +
			HEX_CHARS[(h6 >> 16) & 15] +
			HEX_CHARS[(h6 >> 12) & 15] +
			HEX_CHARS[(h6 >> 8) & 15] +
			HEX_CHARS[(h6 >> 4) & 15] +
			HEX_CHARS[h6 & 15];
		if (!this.#is224) {
			hex +=
				HEX_CHARS[(h7 >> 28) & 15] +
				HEX_CHARS[(h7 >> 24) & 15] +
				HEX_CHARS[(h7 >> 20) & 15] +
				HEX_CHARS[(h7 >> 16) & 15] +
				HEX_CHARS[(h7 >> 12) & 15] +
				HEX_CHARS[(h7 >> 8) & 15] +
				HEX_CHARS[(h7 >> 4) & 15] +
				HEX_CHARS[h7 & 15];
		}
		return hex;
	}
	toString() {
		return this.hex();
	}
	digest() {
		this.finalize();
		const h0 = this.#h0;
		const h1 = this.#h1;
		const h2 = this.#h2;
		const h3 = this.#h3;
		const h4 = this.#h4;
		const h5 = this.#h5;
		const h6 = this.#h6;
		const h7 = this.#h7;
		const arr = [
			(h0 >> 24) & 255,
			(h0 >> 16) & 255,
			(h0 >> 8) & 255,
			h0 & 255,
			(h1 >> 24) & 255,
			(h1 >> 16) & 255,
			(h1 >> 8) & 255,
			h1 & 255,
			(h2 >> 24) & 255,
			(h2 >> 16) & 255,
			(h2 >> 8) & 255,
			h2 & 255,
			(h3 >> 24) & 255,
			(h3 >> 16) & 255,
			(h3 >> 8) & 255,
			h3 & 255,
			(h4 >> 24) & 255,
			(h4 >> 16) & 255,
			(h4 >> 8) & 255,
			h4 & 255,
			(h5 >> 24) & 255,
			(h5 >> 16) & 255,
			(h5 >> 8) & 255,
			h5 & 255,
			(h6 >> 24) & 255,
			(h6 >> 16) & 255,
			(h6 >> 8) & 255,
			h6 & 255,
		];
		if (!this.#is224) {
			arr.push((h7 >> 24) & 255, (h7 >> 16) & 255, (h7 >> 8) & 255, h7 & 255);
		}
		return arr;
	}
	array() {
		return this.digest();
	}
	arrayBuffer() {
		this.finalize();
		const buffer = new ArrayBuffer(this.#is224 ? 28 : 32);
		const dataView = new DataView(buffer);
		dataView.setUint32(0, this.#h0);
		dataView.setUint32(4, this.#h1);
		dataView.setUint32(8, this.#h2);
		dataView.setUint32(12, this.#h3);
		dataView.setUint32(16, this.#h4);
		dataView.setUint32(20, this.#h5);
		dataView.setUint32(24, this.#h6);
		if (!this.#is224) {
			dataView.setUint32(28, this.#h7);
		}
		return buffer;
	}
}
class HmacSha256 extends Sha256 {
	#inner;
	#is224;
	#oKeyPad;
	#sharedMemory;
	constructor(secretKey, is224 = false, sharedMemory = false) {
		super(is224, sharedMemory);
		let key;
		if (typeof secretKey === 'string') {
			const bytes = [];
			const length = secretKey.length;
			let index = 0;
			for (let i = 0; i < length; ++i) {
				let code = secretKey.charCodeAt(i);
				if (code < 128) {
					bytes[index++] = code;
				} else if (code < 2048) {
					bytes[index++] = 192 | (code >> 6);
					bytes[index++] = 128 | (code & 63);
				} else if (code < 55296 || code >= 57344) {
					bytes[index++] = 224 | (code >> 12);
					bytes[index++] = 128 | ((code >> 6) & 63);
					bytes[index++] = 128 | (code & 63);
				} else {
					code = 65536 + (((code & 1023) << 10) | (secretKey.charCodeAt(++i) & 1023));
					bytes[index++] = 240 | (code >> 18);
					bytes[index++] = 128 | ((code >> 12) & 63);
					bytes[index++] = 128 | ((code >> 6) & 63);
					bytes[index++] = 128 | (code & 63);
				}
			}
			key = bytes;
		} else {
			if (secretKey instanceof ArrayBuffer) {
				key = new Uint8Array(secretKey);
			} else {
				key = secretKey;
			}
		}
		if (key.length > 64) {
			key = new Sha256(is224, true).update(key).array();
		}
		const oKeyPad = [];
		const iKeyPad = [];
		for (let i = 0; i < 64; ++i) {
			const b = key[i] || 0;
			oKeyPad[i] = 92 ^ b;
			iKeyPad[i] = 54 ^ b;
		}
		this.update(iKeyPad);
		this.#oKeyPad = oKeyPad;
		this.#inner = true;
		this.#is224 = is224;
		this.#sharedMemory = sharedMemory;
	}
	finalize() {
		super.finalize();
		if (this.#inner) {
			this.#inner = false;
			const innerHash = this.array();
			super.init(this.#is224, this.#sharedMemory);
			this.update(this.#oKeyPad);
			this.update(innerHash);
			super.finalize();
		}
	}
}
function deferred() {
	let methods;
	let state = 'pending';
	const promise = new Promise((resolve, reject) => {
		methods = {
			async resolve(value) {
				await value;
				state = 'fulfilled';
				resolve(value);
			},
			reject(reason) {
				state = 'rejected';
				reject(reason);
			},
		};
	});
	Object.defineProperty(promise, 'state', {
		get: () => state,
	});
	return Object.assign(promise, methods);
}
class DeferredStack {
	#array;
	#creator;
	#max_size;
	#queue;
	#size;
	constructor(max, ls, creator) {
		this.#array = ls ? [...ls] : [];
		this.#creator = creator;
		this.#max_size = max || 10;
		this.#queue = [];
		this.#size = this.#array.length;
	}
	get available() {
		return this.#array.length;
	}
	async pop() {
		if (this.#array.length > 0) {
			return this.#array.pop();
		} else if (this.#size < this.#max_size && this.#creator) {
			this.#size++;
			return await this.#creator();
		}
		const d = deferred();
		this.#queue.push(d);
		await d;
		return this.#array.pop();
	}
	push(value) {
		this.#array.push(value);
		if (this.#queue.length > 0) {
			const d = this.#queue.shift();
			d.resolve();
		}
	}
	get size() {
		return this.#size;
	}
}
class DeferredAccessStack {
	#elements;
	#initializeElement;
	#checkElementInitialization;
	#queue;
	#size;
	get available() {
		return this.#elements.length;
	}
	get size() {
		return this.#size;
	}
	constructor(elements, initCallback, checkInitCallback) {
		this.#checkElementInitialization = checkInitCallback;
		this.#elements = elements;
		this.#initializeElement = initCallback;
		this.#queue = [];
		this.#size = elements.length;
	}
	async initialized() {
		const initialized = await Promise.all(
			this.#elements.map(e => this.#checkElementInitialization(e))
		);
		return initialized.filter(initialized => initialized === true).length;
	}
	async pop() {
		let element;
		if (this.available > 0) {
			element = this.#elements.pop();
		} else {
			const d = deferred();
			this.#queue.push(d);
			await d;
			element = this.#elements.pop();
		}
		if (!(await this.#checkElementInitialization(element))) {
			await this.#initializeElement(element);
		}
		return element;
	}
	push(value) {
		this.#elements.push(value);
		if (this.#queue.length > 0) {
			const d = this.#queue.shift();
			d.resolve();
		}
	}
}
function readInt16BE(buffer, offset) {
	offset = offset >>> 0;
	const val = buffer[offset + 1] | (buffer[offset] << 8);
	return val & 32768 ? val | 4294901760 : val;
}
function readInt32BE(buffer, offset) {
	offset = offset >>> 0;
	return (
		(buffer[offset] << 24) |
		(buffer[offset + 1] << 16) |
		(buffer[offset + 2] << 8) |
		buffer[offset + 3]
	);
}
function readUInt32BE(buffer, offset) {
	offset = offset >>> 0;
	return (
		buffer[offset] * 16777216 +
		((buffer[offset + 1] << 16) | (buffer[offset + 2] << 8) | buffer[offset + 3])
	);
}
function parseDsn(dsn) {
	const [protocol, strippedUrl] = dsn.match(/(?:(?!:\/\/).)+/g) ?? ['', ''];
	const url = new URL(`http:${strippedUrl}`);
	let password = url.password;
	try {
		password = decodeURIComponent(password);
	} catch (_e) {
		console.error(bold(yellow('Failed to decode URL password') + '\nDefaulting to raw password'));
	}
	return {
		password,
		driver: protocol,
		user: url.username,
		hostname: url.hostname,
		port: url.port,
		database: url.pathname.slice(1),
		params: Object.fromEntries(url.searchParams.entries()),
	};
}
function isTemplateString(template) {
	if (!Array.isArray(template)) {
		return false;
	}
	return true;
}
class PacketReader {
	#buffer;
	#decoder = new TextDecoder();
	#offset = 0;
	constructor(buffer) {
		this.#buffer = buffer;
	}
	readInt16() {
		const value = readInt16BE(this.#buffer, this.#offset);
		this.#offset += 2;
		return value;
	}
	readInt32() {
		const value = readInt32BE(this.#buffer, this.#offset);
		this.#offset += 4;
		return value;
	}
	readByte() {
		return this.readBytes(1)[0];
	}
	readBytes(length) {
		const start = this.#offset;
		const end = start + length;
		const slice = this.#buffer.slice(start, end);
		this.#offset = end;
		return slice;
	}
	readAllBytes() {
		const slice = this.#buffer.slice(this.#offset);
		this.#offset = this.#buffer.length;
		return slice;
	}
	readString(length) {
		const bytes = this.readBytes(length);
		return this.#decoder.decode(bytes);
	}
	readCString() {
		const start = this.#offset;
		const end = this.#buffer.indexOf(0, start);
		const slice = this.#buffer.slice(start, end);
		this.#offset = end + 1;
		return this.#decoder.decode(slice);
	}
}
class PacketWriter {
	#buffer;
	#encoder = new TextEncoder();
	#headerPosition;
	#offset;
	#size;
	constructor(size) {
		this.#size = size || 1024;
		this.#buffer = new Uint8Array(this.#size + 5);
		this.#offset = 5;
		this.#headerPosition = 0;
	}
	#ensure(size) {
		const remaining = this.#buffer.length - this.#offset;
		if (remaining < size) {
			const oldBuffer = this.#buffer;
			const newSize = oldBuffer.length + (oldBuffer.length >> 1) + size;
			this.#buffer = new Uint8Array(newSize);
			copy(oldBuffer, this.#buffer);
		}
	}
	addInt32(num) {
		this.#ensure(4);
		this.#buffer[this.#offset++] = (num >>> 24) & 255;
		this.#buffer[this.#offset++] = (num >>> 16) & 255;
		this.#buffer[this.#offset++] = (num >>> 8) & 255;
		this.#buffer[this.#offset++] = (num >>> 0) & 255;
		return this;
	}
	addInt16(num) {
		this.#ensure(2);
		this.#buffer[this.#offset++] = (num >>> 8) & 255;
		this.#buffer[this.#offset++] = (num >>> 0) & 255;
		return this;
	}
	addCString(string) {
		if (!string) {
			this.#ensure(1);
		} else {
			const encodedStr = this.#encoder.encode(string);
			this.#ensure(encodedStr.byteLength + 1);
			copy(encodedStr, this.#buffer, this.#offset);
			this.#offset += encodedStr.byteLength;
		}
		this.#buffer[this.#offset++] = 0;
		return this;
	}
	addChar(c) {
		if (c.length != 1) {
			throw new Error('addChar requires single character strings');
		}
		this.#ensure(1);
		copy(this.#encoder.encode(c), this.#buffer, this.#offset);
		this.#offset++;
		return this;
	}
	addString(string) {
		string = string || '';
		const encodedStr = this.#encoder.encode(string);
		this.#ensure(encodedStr.byteLength);
		copy(encodedStr, this.#buffer, this.#offset);
		this.#offset += encodedStr.byteLength;
		return this;
	}
	add(otherBuffer) {
		this.#ensure(otherBuffer.length);
		copy(otherBuffer, this.#buffer, this.#offset);
		this.#offset += otherBuffer.length;
		return this;
	}
	clear() {
		this.#offset = 5;
		this.#headerPosition = 0;
	}
	addHeader(code, last) {
		const origOffset = this.#offset;
		this.#offset = this.#headerPosition;
		this.#buffer[this.#offset++] = code;
		this.addInt32(origOffset - (this.#headerPosition + 1));
		this.#headerPosition = origOffset;
		this.#offset = origOffset;
		if (!last) {
			this.#ensure(5);
			this.#offset += 5;
		}
		return this;
	}
	join(code) {
		if (code) {
			this.addHeader(code, true);
		}
		return this.#buffer.slice(code ? 0 : 5, this.#offset);
	}
	flush(code) {
		const result = this.join(code);
		this.clear();
		return result;
	}
}
const Oid = {
	bool: 16,
	bytea: 17,
	char: 18,
	name: 19,
	int8: 20,
	int2: 21,
	_int2vector_0: 22,
	int4: 23,
	regproc: 24,
	text: 25,
	oid: 26,
	tid: 27,
	xid: 28,
	_cid_0: 29,
	_oidvector_0: 30,
	_pg_ddl_command: 32,
	_pg_type: 71,
	_pg_attribute: 75,
	_pg_proc: 81,
	_pg_class: 83,
	json: 114,
	_xml_0: 142,
	_xml_1: 143,
	_pg_node_tree: 194,
	json_array: 199,
	_smgr: 210,
	_index_am_handler: 325,
	point: 600,
	lseg: 601,
	path: 602,
	box: 603,
	polygon: 604,
	line: 628,
	line_array: 629,
	cidr: 650,
	cidr_array: 651,
	float4: 700,
	float8: 701,
	_abstime_0: 702,
	_reltime_0: 703,
	_tinterval_0: 704,
	_unknown: 705,
	circle: 718,
	circle_array: 719,
	_money_0: 790,
	_money_1: 791,
	macaddr: 829,
	inet: 869,
	bool_array: 1000,
	byte_array: 1001,
	char_array: 1002,
	name_array: 1003,
	int2_array: 1005,
	_int2vector_1: 1006,
	int4_array: 1007,
	regproc_array: 1008,
	text_array: 1009,
	tid_array: 1010,
	xid_array: 1011,
	_cid_1: 1012,
	_oidvector_1: 1013,
	bpchar_array: 1014,
	varchar_array: 1015,
	int8_array: 1016,
	point_array: 1017,
	lseg_array: 1018,
	path_array: 1019,
	box_array: 1020,
	float4_array: 1021,
	float8_array: 1022,
	_abstime_1: 1023,
	_reltime_1: 1024,
	_tinterval_1: 1025,
	polygon_array: 1027,
	oid_array: 1028,
	_aclitem_0: 1033,
	_aclitem_1: 1034,
	macaddr_array: 1040,
	inet_array: 1041,
	bpchar: 1042,
	varchar: 1043,
	date: 1082,
	time: 1083,
	timestamp: 1114,
	timestamp_array: 1115,
	date_array: 1182,
	time_array: 1183,
	timestamptz: 1184,
	timestamptz_array: 1185,
	_interval_0: 1186,
	_interval_1: 1187,
	numeric_array: 1231,
	_pg_database: 1248,
	_cstring_0: 1263,
	timetz: 1266,
	timetz_array: 1270,
	_bit_0: 1560,
	_bit_1: 1561,
	_varbit_0: 1562,
	_varbit_1: 1563,
	numeric: 1700,
	_refcursor_0: 1790,
	_refcursor_1: 2201,
	regprocedure: 2202,
	regoper: 2203,
	regoperator: 2204,
	regclass: 2205,
	regtype: 2206,
	regprocedure_array: 2207,
	regoper_array: 2208,
	regoperator_array: 2209,
	regclass_array: 2210,
	regtype_array: 2211,
	_record_0: 2249,
	_cstring_1: 2275,
	_any: 2276,
	_anyarray: 2277,
	void: 2278,
	_trigger: 2279,
	_language_handler: 2280,
	_internal: 2281,
	_opaque: 2282,
	_anyelement: 2283,
	_record_1: 2287,
	_anynonarray: 2776,
	_pg_authid: 2842,
	_pg_auth_members: 2843,
	_txid_snapshot_0: 2949,
	uuid: 2950,
	uuid_varchar: 2951,
	_txid_snapshot_1: 2970,
	_fdw_handler: 3115,
	_pg_lsn_0: 3220,
	_pg_lsn_1: 3221,
	_tsm_handler: 3310,
	_anyenum: 3500,
	_tsvector_0: 3614,
	_tsquery_0: 3615,
	_gtsvector_0: 3642,
	_tsvector_1: 3643,
	_gtsvector_1: 3644,
	_tsquery_1: 3645,
	regconfig: 3734,
	regconfig_array: 3735,
	regdictionary: 3769,
	regdictionary_array: 3770,
	jsonb: 3802,
	jsonb_array: 3807,
	_anyrange: 3831,
	_event_trigger: 3838,
	_int4range_0: 3904,
	_int4range_1: 3905,
	_numrange_0: 3906,
	_numrange_1: 3907,
	_tsrange_0: 3908,
	_tsrange_1: 3909,
	_tstzrange_0: 3910,
	_tstzrange_1: 3911,
	_daterange_0: 3912,
	_daterange_1: 3913,
	_int8range_0: 3926,
	_int8range_1: 3927,
	_pg_shseclabel: 4066,
	regnamespace: 4089,
	regnamespace_array: 4090,
	regrole: 4096,
	regrole_array: 4097,
};
function parseArray(source, transform, separator = ',') {
	return new ArrayParser(source, transform, separator).parse();
}
class ArrayParser {
	source;
	transform;
	separator;
	position = 0;
	entries = [];
	recorded = [];
	dimension = 0;
	constructor(source, transform, separator) {
		this.source = source;
		this.transform = transform;
		this.separator = separator;
	}
	isEof() {
		return this.position >= this.source.length;
	}
	nextCharacter() {
		const character = this.source[this.position++];
		if (character === '\\') {
			return {
				value: this.source[this.position++],
				escaped: true,
			};
		}
		return {
			value: character,
			escaped: false,
		};
	}
	record(character) {
		this.recorded.push(character);
	}
	newEntry(includeEmpty = false) {
		let entry;
		if (this.recorded.length > 0 || includeEmpty) {
			entry = this.recorded.join('');
			if (entry === 'NULL' && !includeEmpty) {
				entry = null;
			}
			if (entry !== null) entry = this.transform(entry);
			this.entries.push(entry);
			this.recorded = [];
		}
	}
	consumeDimensions() {
		if (this.source[0] === '[') {
			while (!this.isEof()) {
				const __char = this.nextCharacter();
				if (__char.value === '=') break;
			}
		}
	}
	parse(nested = false) {
		let character, parser, quote;
		this.consumeDimensions();
		while (!this.isEof()) {
			character = this.nextCharacter();
			if (character.value === '{' && !quote) {
				this.dimension++;
				if (this.dimension > 1) {
					parser = new ArrayParser(
						this.source.substr(this.position - 1),
						this.transform,
						this.separator
					);
					this.entries.push(parser.parse(true));
					this.position += parser.position - 2;
				}
			} else if (character.value === '}' && !quote) {
				this.dimension--;
				if (!this.dimension) {
					this.newEntry();
					if (nested) return this.entries;
				}
			} else if (character.value === '"' && !character.escaped) {
				if (quote) this.newEntry(true);
				quote = !quote;
			} else if (character.value === this.separator && !quote) {
				this.newEntry();
			} else {
				this.record(character.value);
			}
		}
		if (this.dimension !== 0) {
			throw new Error('array dimension not balanced');
		}
		return this.entries;
	}
}
const BC_RE = /BC$/;
const DATE_RE = /^(\d{1,})-(\d{2})-(\d{2})$/;
const DATETIME_RE = /^(\d{1,})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(\.\d{1,})?/;
const HEX = 16;
const HEX_PREFIX_REGEX = /^\\x/;
const TIMEZONE_RE = /([Z+-])(\d{2})?:?(\d{2})?:?(\d{2})?/;
function decodeBigint(value) {
	return BigInt(value);
}
function decodeBigintArray(value) {
	return parseArray(value, x => BigInt(x));
}
function decodeBoolean(value) {
	return value[0] === 't';
}
function decodeBooleanArray(value) {
	return parseArray(value, x => x[0] === 't');
}
function decodeBox(value) {
	const [a, b] = value.match(/\(.*?\)/g) || [];
	return {
		a: decodePoint(a),
		b: decodePoint(b),
	};
}
function decodeBoxArray(value) {
	return parseArray(value, decodeBox, ';');
}
function decodeBytea(byteaStr) {
	if (HEX_PREFIX_REGEX.test(byteaStr)) {
		return decodeByteaHex(byteaStr);
	} else {
		return decodeByteaEscape(byteaStr);
	}
}
function decodeByteaArray(value) {
	return parseArray(value, decodeBytea);
}
function decodeByteaEscape(byteaStr) {
	const bytes = [];
	let i = 0;
	let k = 0;
	while (i < byteaStr.length) {
		if (byteaStr[i] !== '\\') {
			bytes.push(byteaStr.charCodeAt(i));
			++i;
		} else {
			if (/[0-7]{3}/.test(byteaStr.substr(i + 1, 3))) {
				bytes.push(parseInt(byteaStr.substr(i + 1, 3), 8));
				i += 4;
			} else {
				let backslashes = 1;
				while (i + backslashes < byteaStr.length && byteaStr[i + backslashes] === '\\') {
					backslashes++;
				}
				for (k = 0; k < Math.floor(backslashes / 2); ++k) {
					bytes.push(92);
				}
				i += Math.floor(backslashes / 2) * 2;
			}
		}
	}
	return new Uint8Array(bytes);
}
function decodeByteaHex(byteaStr) {
	const bytesStr = byteaStr.slice(2);
	const bytes = new Uint8Array(bytesStr.length / 2);
	for (let i = 0, j = 0; i < bytesStr.length; i += 2, j++) {
		bytes[j] = parseInt(bytesStr[i] + bytesStr[i + 1], HEX);
	}
	return bytes;
}
function decodeCircle(value) {
	const [point, radius] = value.substring(1, value.length - 1).split(/,(?![^(]*\))/);
	return {
		point: decodePoint(point),
		radius: radius,
	};
}
function decodeCircleArray(value) {
	return parseArray(value, decodeCircle);
}
function decodeDate(dateStr) {
	if (dateStr === 'infinity') {
		return Number(Infinity);
	} else if (dateStr === '-infinity') {
		return Number(-Infinity);
	}
	const matches = DATE_RE.exec(dateStr);
	if (!matches) {
		throw new Error(`"${dateStr}" could not be parsed to date`);
	}
	const year = parseInt(matches[1], 10);
	const month = parseInt(matches[2], 10) - 1;
	const day = parseInt(matches[3], 10);
	const date = new Date(year, month, day);
	date.setUTCFullYear(year);
	return date;
}
function decodeDateArray(value) {
	return parseArray(value, decodeDate);
}
function decodeDatetime(dateStr) {
	const matches = DATETIME_RE.exec(dateStr);
	if (!matches) {
		return decodeDate(dateStr);
	}
	const isBC = BC_RE.test(dateStr);
	const year = parseInt(matches[1], 10) * (isBC ? -1 : 1);
	const month = parseInt(matches[2], 10) - 1;
	const day = parseInt(matches[3], 10);
	const hour = parseInt(matches[4], 10);
	const minute = parseInt(matches[5], 10);
	const second = parseInt(matches[6], 10);
	const msMatch = matches[7];
	const ms = msMatch ? 1000 * parseFloat(msMatch) : 0;
	let date;
	const offset = decodeTimezoneOffset(dateStr);
	if (offset === null) {
		date = new Date(year, month, day, hour, minute, second, ms);
	} else {
		const utc = Date.UTC(year, month, day, hour, minute, second, ms);
		date = new Date(utc + offset);
	}
	date.setUTCFullYear(year);
	return date;
}
function decodeDatetimeArray(value) {
	return parseArray(value, decodeDatetime);
}
function decodeInt(value) {
	return parseInt(value, 10);
}
function decodeIntArray(value) {
	if (!value) return null;
	return parseArray(value, decodeInt);
}
function decodeJson(value) {
	return JSON.parse(value);
}
function decodeJsonArray(value) {
	return parseArray(value, JSON.parse);
}
function decodeLine(value) {
	const [a, b, c] = value.substring(1, value.length - 1).split(',');
	return {
		a: a,
		b: b,
		c: c,
	};
}
function decodeLineArray(value) {
	return parseArray(value, decodeLine);
}
function decodeLineSegment(value) {
	const [a, b] = value.substring(1, value.length - 1).match(/\(.*?\)/g) || [];
	return {
		a: decodePoint(a),
		b: decodePoint(b),
	};
}
function decodeLineSegmentArray(value) {
	return parseArray(value, decodeLineSegment);
}
function decodePath(value) {
	const points = value.substring(1, value.length - 1).split(/,(?![^(]*\))/);
	return points.map(decodePoint);
}
function decodePathArray(value) {
	return parseArray(value, decodePath);
}
function decodePoint(value) {
	const [x, y] = value.substring(1, value.length - 1).split(',');
	if (Number.isNaN(parseFloat(x)) || Number.isNaN(parseFloat(y))) {
		throw new Error(`Invalid point value: "${Number.isNaN(parseFloat(x)) ? x : y}"`);
	}
	return {
		x: x,
		y: y,
	};
}
function decodePointArray(value) {
	return parseArray(value, decodePoint);
}
function decodePolygon(value) {
	return decodePath(value);
}
function decodePolygonArray(value) {
	return parseArray(value, decodePolygon);
}
function decodeStringArray(value) {
	if (!value) return null;
	return parseArray(value, value => value);
}
function decodeTimezoneOffset(dateStr) {
	const timeStr = dateStr.split(' ')[1];
	const matches = TIMEZONE_RE.exec(timeStr);
	if (!matches) {
		return null;
	}
	const type = matches[1];
	if (type === 'Z') {
		return 0;
	}
	const sign = type === '-' ? 1 : -1;
	const hours = parseInt(matches[2], 10);
	const minutes = parseInt(matches[3] || '0', 10);
	const seconds = parseInt(matches[4] || '0', 10);
	const offset = hours * 3600 + minutes * 60 + seconds;
	return sign * offset * 1000;
}
function decodeTid(value) {
	const [x, y] = value.substring(1, value.length - 1).split(',');
	return [BigInt(x), BigInt(y)];
}
function decodeTidArray(value) {
	return parseArray(value, decodeTid);
}
class Column {
	name;
	tableOid;
	index;
	typeOid;
	columnLength;
	typeModifier;
	format;
	constructor(name, tableOid, index, typeOid, columnLength, typeModifier, format) {
		this.name = name;
		this.tableOid = tableOid;
		this.index = index;
		this.typeOid = typeOid;
		this.columnLength = columnLength;
		this.typeModifier = typeModifier;
		this.format = format;
	}
}
var Format;
(function (Format) {
	Format[(Format['TEXT'] = 0)] = 'TEXT';
	Format[(Format['BINARY'] = 1)] = 'BINARY';
})(Format || (Format = {}));
const decoder = new TextDecoder();
function decodeBinary() {
	throw new Error('Not implemented!');
}
function decodeText(value, typeOid) {
	const strValue = decoder.decode(value);
	switch (typeOid) {
		case Oid.bpchar:
		case Oid.char:
		case Oid.cidr:
		case Oid.float4:
		case Oid.float8:
		case Oid.inet:
		case Oid.macaddr:
		case Oid.name:
		case Oid.numeric:
		case Oid.oid:
		case Oid.regclass:
		case Oid.regconfig:
		case Oid.regdictionary:
		case Oid.regnamespace:
		case Oid.regoper:
		case Oid.regoperator:
		case Oid.regproc:
		case Oid.regprocedure:
		case Oid.regrole:
		case Oid.regtype:
		case Oid.text:
		case Oid.time:
		case Oid.timetz:
		case Oid.uuid:
		case Oid.varchar:
		case Oid.void:
			return strValue;
		case Oid.bpchar_array:
		case Oid.char_array:
		case Oid.cidr_array:
		case Oid.float4_array:
		case Oid.float8_array:
		case Oid.inet_array:
		case Oid.macaddr_array:
		case Oid.name_array:
		case Oid.numeric_array:
		case Oid.oid_array:
		case Oid.regclass_array:
		case Oid.regconfig_array:
		case Oid.regdictionary_array:
		case Oid.regnamespace_array:
		case Oid.regoper_array:
		case Oid.regoperator_array:
		case Oid.regproc_array:
		case Oid.regprocedure_array:
		case Oid.regrole_array:
		case Oid.regtype_array:
		case Oid.text_array:
		case Oid.time_array:
		case Oid.timetz_array:
		case Oid.uuid_varchar:
		case Oid.varchar_array:
			return decodeStringArray(strValue);
		case Oid.int2:
		case Oid.int4:
		case Oid.xid:
			return decodeInt(strValue);
		case Oid.int2_array:
		case Oid.int4_array:
		case Oid.xid_array:
			return decodeIntArray(strValue);
		case Oid.bool:
			return decodeBoolean(strValue);
		case Oid.bool_array:
			return decodeBooleanArray(strValue);
		case Oid.box:
			return decodeBox(strValue);
		case Oid.box_array:
			return decodeBoxArray(strValue);
		case Oid.circle:
			return decodeCircle(strValue);
		case Oid.circle_array:
			return decodeCircleArray(strValue);
		case Oid.bytea:
			return decodeBytea(strValue);
		case Oid.byte_array:
			return decodeByteaArray(strValue);
		case Oid.date:
			return decodeDate(strValue);
		case Oid.date_array:
			return decodeDateArray(strValue);
		case Oid.int8:
			return decodeBigint(strValue);
		case Oid.int8_array:
			return decodeBigintArray(strValue);
		case Oid.json:
		case Oid.jsonb:
			return decodeJson(strValue);
		case Oid.json_array:
		case Oid.jsonb_array:
			return decodeJsonArray(strValue);
		case Oid.line:
			return decodeLine(strValue);
		case Oid.line_array:
			return decodeLineArray(strValue);
		case Oid.lseg:
			return decodeLineSegment(strValue);
		case Oid.lseg_array:
			return decodeLineSegmentArray(strValue);
		case Oid.path:
			return decodePath(strValue);
		case Oid.path_array:
			return decodePathArray(strValue);
		case Oid.point:
			return decodePoint(strValue);
		case Oid.point_array:
			return decodePointArray(strValue);
		case Oid.polygon:
			return decodePolygon(strValue);
		case Oid.polygon_array:
			return decodePolygonArray(strValue);
		case Oid.tid:
			return decodeTid(strValue);
		case Oid.tid_array:
			return decodeTidArray(strValue);
		case Oid.timestamp:
		case Oid.timestamptz:
			return decodeDatetime(strValue);
		case Oid.timestamp_array:
		case Oid.timestamptz_array:
			return decodeDatetimeArray(strValue);
		default:
			return strValue;
	}
}
function decode1(value, column) {
	if (column.format === Format.BINARY) {
		return decodeBinary();
	} else if (column.format === Format.TEXT) {
		return decodeText(value, column.typeOid);
	} else {
		throw new Error(`Unknown column format: ${column.format}`);
	}
}
function pad(number, digits) {
	let padded = '' + number;
	while (padded.length < digits) {
		padded = '0' + padded;
	}
	return padded;
}
function encodeDate(date) {
	const year = pad(date.getFullYear(), 4);
	const month = pad(date.getMonth() + 1, 2);
	const day = pad(date.getDate(), 2);
	const hour = pad(date.getHours(), 2);
	const min = pad(date.getMinutes(), 2);
	const sec = pad(date.getSeconds(), 2);
	const ms = pad(date.getMilliseconds(), 3);
	const encodedDate = `${year}-${month}-${day}T${hour}:${min}:${sec}.${ms}`;
	const offset = date.getTimezoneOffset();
	const tzSign = offset > 0 ? '-' : '+';
	const absOffset = Math.abs(offset);
	const tzHours = pad(Math.floor(absOffset / 60), 2);
	const tzMinutes = pad(Math.floor(absOffset % 60), 2);
	const encodedTz = `${tzSign}${tzHours}:${tzMinutes}`;
	return encodedDate + encodedTz;
}
function escapeArrayElement(value) {
	const strValue = value.toString();
	const escapedValue = strValue.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
	return `"${escapedValue}"`;
}
function encodeArray(array) {
	let encodedArray = '{';
	array.forEach((element, index) => {
		if (index > 0) {
			encodedArray += ',';
		}
		if (element === null || typeof element === 'undefined') {
			encodedArray += 'NULL';
		} else if (Array.isArray(element)) {
			encodedArray += encodeArray(element);
		} else if (element instanceof Uint8Array) {
			throw new Error("Can't encode array of buffers.");
		} else {
			const encodedElement = encode2(element);
			encodedArray += escapeArrayElement(encodedElement);
		}
	});
	encodedArray += '}';
	return encodedArray;
}
function encodeBytes(value) {
	const hex = Array.from(value)
		.map(val => (val < 16 ? `0${val.toString(16)}` : val.toString(16)))
		.join('');
	return `\\x${hex}`;
}
function encode2(value) {
	if (value === null || typeof value === 'undefined') {
		return null;
	} else if (value instanceof Uint8Array) {
		return encodeBytes(value);
	} else if (value instanceof Date) {
		return encodeDate(value);
	} else if (value instanceof Array) {
		return encodeArray(value);
	} else if (value instanceof Object) {
		return JSON.stringify(value);
	} else {
		return String(value);
	}
}
const commandTagRegexp = /^([A-Za-z]+)(?: (\d+))?(?: (\d+))?/;
var ResultType;
(function (ResultType) {
	ResultType[(ResultType['ARRAY'] = 0)] = 'ARRAY';
	ResultType[(ResultType['OBJECT'] = 1)] = 'OBJECT';
})(ResultType || (ResultType = {}));
class RowDescription {
	columnCount;
	columns;
	constructor(columnCount, columns) {
		this.columnCount = columnCount;
		this.columns = columns;
	}
}
function templateStringToQuery(template, args, result_type) {
	const text = template.reduce((curr, next, index) => {
		return `${curr}$${index}${next}`;
	});
	return new Query(text, result_type, ...args);
}
class QueryResult {
	query;
	command;
	rowCount;
	rowDescription;
	warnings = [];
	constructor(query) {
		this.query = query;
	}
	loadColumnDescriptions(description) {
		this.rowDescription = description;
	}
	handleCommandComplete(commandTag) {
		const match = commandTagRegexp.exec(commandTag);
		if (match) {
			this.command = match[1];
			if (match[3]) {
				this.rowCount = parseInt(match[3], 10);
			} else {
				this.rowCount = parseInt(match[2], 10);
			}
		}
	}
	insertRow(_row) {
		throw new Error('No implementation for insertRow is defined');
	}
}
class QueryArrayResult extends QueryResult {
	rows = [];
	insertRow(row_data) {
		if (!this.rowDescription) {
			throw new Error("The row descriptions required to parse the result data weren't initialized");
		}
		const row = row_data.map((raw_value, index) => {
			const column = this.rowDescription.columns[index];
			if (raw_value === null) {
				return null;
			}
			return decode1(raw_value, column);
		});
		this.rows.push(row);
	}
}
class QueryObjectResult extends QueryResult {
	rows = [];
	insertRow(row_data) {
		if (!this.rowDescription) {
			throw new Error("The row description required to parse the result data wasn't initialized");
		}
		if (this.query.fields && this.rowDescription.columns.length !== this.query.fields.length) {
			throw new RangeError(
				"The fields provided for the query don't match the ones returned as a result " +
					`(${this.rowDescription.columns.length} expected, ${this.query.fields.length} received)`
			);
		}
		const row = row_data.reduce((row, raw_value, index) => {
			const column = this.rowDescription.columns[index];
			const name = this.query.fields?.[index] ?? column.name;
			if (raw_value === null) {
				row[name] = null;
			} else {
				row[name] = decode1(raw_value, column);
			}
			return row;
		}, {});
		this.rows.push(row);
	}
}
class Query {
	args;
	fields;
	result_type;
	text;
	constructor(config_or_text, result_type, ...args) {
		this.result_type = result_type;
		let config;
		if (typeof config_or_text === 'string') {
			config = {
				text: config_or_text,
				args,
			};
		} else {
			const { fields, ...query_config } = config_or_text;
			if (fields) {
				const clean_fields = fields.filter(field => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field));
				if (fields.length !== clean_fields.length) {
					throw new TypeError(
						'The fields provided for the query must contain only letters and underscores'
					);
				}
				if (new Set(clean_fields).size !== clean_fields.length) {
					throw new TypeError('The fields provided for the query must be unique');
				}
				this.fields = clean_fields;
			}
			config = query_config;
		}
		this.text = config.text;
		this.args = this.#prepareArgs(config);
	}
	#prepareArgs(config) {
		const encodingFn = config.encoder ? config.encoder : encode2;
		return (config.args || []).map(encodingFn);
	}
}
class Message {
	type;
	byteCount;
	body;
	reader;
	constructor(type, byteCount, body) {
		this.type = type;
		this.byteCount = byteCount;
		this.body = body;
		this.reader = new PacketReader(body);
	}
}
function parseBackendKeyMessage(message) {
	return {
		pid: message.reader.readInt32(),
		secret_key: message.reader.readInt32(),
	};
}
function parseCommandCompleteMessage(message) {
	return message.reader.readString(message.byteCount);
}
function parseNoticeMessage(message) {
	const error_fields = {};
	let __byte;
	let field_code;
	let field_value;
	while ((__byte = message.reader.readByte())) {
		field_code = String.fromCharCode(__byte);
		field_value = message.reader.readCString();
		switch (field_code) {
			case 'S':
				error_fields.severity = field_value;
				break;
			case 'C':
				error_fields.code = field_value;
				break;
			case 'M':
				error_fields.message = field_value;
				break;
			case 'D':
				error_fields.detail = field_value;
				break;
			case 'H':
				error_fields.hint = field_value;
				break;
			case 'P':
				error_fields.position = field_value;
				break;
			case 'p':
				error_fields.internalPosition = field_value;
				break;
			case 'q':
				error_fields.internalQuery = field_value;
				break;
			case 'W':
				error_fields.where = field_value;
				break;
			case 's':
				error_fields.schema = field_value;
				break;
			case 't':
				error_fields.table = field_value;
				break;
			case 'c':
				error_fields.column = field_value;
				break;
			case 'd':
				error_fields.dataTypeName = field_value;
				break;
			case 'n':
				error_fields.constraint = field_value;
				break;
			case 'F':
				error_fields.file = field_value;
				break;
			case 'L':
				error_fields.line = field_value;
				break;
			case 'R':
				error_fields.routine = field_value;
				break;
			default:
				break;
		}
	}
	return error_fields;
}
function parseRowDataMessage(message) {
	const field_count = message.reader.readInt16();
	const row = [];
	for (let i = 0; i < field_count; i++) {
		const col_length = message.reader.readInt32();
		if (col_length == -1) {
			row.push(null);
			continue;
		}
		row.push(message.reader.readBytes(col_length));
	}
	return row;
}
function parseRowDescriptionMessage(message) {
	const column_count = message.reader.readInt16();
	const columns = [];
	for (let i = 0; i < column_count; i++) {
		const column = new Column(
			message.reader.readCString(),
			message.reader.readInt32(),
			message.reader.readInt16(),
			message.reader.readInt32(),
			message.reader.readInt16(),
			message.reader.readInt32(),
			message.reader.readInt16()
		);
		columns.push(column);
	}
	return new RowDescription(column_count, columns);
}
function assert1(cond) {
	if (!cond) {
		throw new Error('assertion failed');
	}
}
var Reason;
(function (Reason) {
	Reason['BadMessage'] = 'server sent an ill-formed message';
	Reason['BadServerNonce'] = 'server sent an invalid nonce';
	Reason['BadSalt'] = 'server specified an invalid salt';
	Reason['BadIterationCount'] = 'server specified an invalid iteration count';
	Reason['BadVerifier'] = 'server sent a bad verifier';
	Reason['Rejected'] = 'rejected by server';
})(Reason || (Reason = {}));
var State;
(function (State) {
	State[(State['Init'] = 0)] = 'Init';
	State[(State['ClientChallenge'] = 1)] = 'ClientChallenge';
	State[(State['ServerChallenge'] = 2)] = 'ServerChallenge';
	State[(State['ClientResponse'] = 3)] = 'ClientResponse';
	State[(State['ServerResponse'] = 4)] = 'ServerResponse';
	State[(State['Failed'] = 5)] = 'Failed';
})(State || (State = {}));
const defaultNonceSize = 16;
class Client2 {
	#authMessage;
	#clientNonce;
	#keys;
	#password;
	#serverNonce;
	#state;
	#username;
	constructor(username, password, nonce) {
		this.#username = username;
		this.#password = password;
		this.#clientNonce = nonce ?? generateNonce(defaultNonceSize);
		this.#authMessage = '';
		this.#state = State.Init;
	}
	composeChallenge() {
		assert1(this.#state === State.Init);
		try {
			const header = 'n,,';
			const username = escape(normalize(this.#username));
			const challenge = `n=${username},r=${this.#clientNonce}`;
			const message = header + challenge;
			this.#authMessage += challenge;
			this.#state = State.ClientChallenge;
			return message;
		} catch (e) {
			this.#state = State.Failed;
			throw e;
		}
	}
	async receiveChallenge(challenge) {
		assert1(this.#state === State.ClientChallenge);
		try {
			const attrs = parseAttributes(challenge);
			const nonce = attrs.r;
			if (!attrs.r || !attrs.r.startsWith(this.#clientNonce)) {
				throw new Error(Reason.BadServerNonce);
			}
			this.#serverNonce = nonce;
			let salt;
			if (!attrs.s) {
				throw new Error(Reason.BadSalt);
			}
			try {
				salt = mod.decode(attrs.s);
			} catch {
				throw new Error(Reason.BadSalt);
			}
			const iterCount = parseInt(attrs.i) | 0;
			if (iterCount <= 0) {
				throw new Error(Reason.BadIterationCount);
			}
			this.#keys = await deriveKeys(this.#password, salt, iterCount);
			this.#authMessage += ',' + challenge;
			this.#state = State.ServerChallenge;
		} catch (e) {
			this.#state = State.Failed;
			throw e;
		}
	}
	async composeResponse() {
		assert1(this.#state === State.ServerChallenge);
		assert1(this.#keys);
		assert1(this.#serverNonce);
		try {
			const responseWithoutProof = `c=biws,r=${this.#serverNonce}`;
			this.#authMessage += ',' + responseWithoutProof;
			const proof = mod.encode(
				computeProof(
					await computeSignature(this.#authMessage, this.#keys.stored),
					this.#keys.client
				)
			);
			const message = `${responseWithoutProof},p=${proof}`;
			this.#state = State.ClientResponse;
			return message;
		} catch (e) {
			this.#state = State.Failed;
			throw e;
		}
	}
	async receiveResponse(response) {
		assert1(this.#state === State.ClientResponse);
		assert1(this.#keys);
		try {
			const attrs = parseAttributes(response);
			if (attrs.e) {
				throw new Error(attrs.e ?? Reason.Rejected);
			}
			const verifier = mod.encode(await computeSignature(this.#authMessage, this.#keys.server));
			if (attrs.v !== verifier) {
				throw new Error(Reason.BadVerifier);
			}
			this.#state = State.ServerResponse;
		} catch (e) {
			this.#state = State.Failed;
			throw e;
		}
	}
}
function generateNonce(size) {
	return mod.encode(crypto.getRandomValues(new Uint8Array(size)));
}
function parseAttributes(str) {
	const attrs = {};
	for (const entry of str.split(',')) {
		const pos = entry.indexOf('=');
		if (pos < 1) {
			throw new Error(Reason.BadMessage);
		}
		const key = entry.substr(0, pos);
		const value = entry.substr(pos + 1);
		attrs[key] = value;
	}
	return attrs;
}
async function deriveKeys(password, salt, iterCount) {
	const ikm = bytes(normalize(password));
	const key = await pbkdf2(msg => sign(msg, ikm), salt, iterCount, 1);
	const server = await sign(bytes('Server Key'), key);
	const client = await sign(bytes('Client Key'), key);
	const stored = new Uint8Array(await crypto.subtle.digest('SHA-256', client));
	return {
		server,
		client,
		stored,
	};
}
function computeSignature(message, key) {
	return sign(bytes(message), key);
}
function computeProof(signature, key) {
	const proof = new Uint8Array(signature.length);
	for (let i = 0; i < proof.length; i++) {
		proof[i] = signature[i] ^ key[i];
	}
	return proof;
}
function bytes(str) {
	return new TextEncoder().encode(str);
}
function normalize(str) {
	const unsafe = /[^\x21-\x7e]/;
	if (unsafe.test(str)) {
		throw new Error('scram username/password is currently limited to safe ascii characters');
	}
	return str;
}
function escape(str) {
	return str.replace(/=/g, '=3D').replace(/,/g, '=2C');
}
async function sign(msg, key) {
	const hmac = new HmacSha256(key);
	hmac.update(msg);
	return new Uint8Array(hmac.arrayBuffer());
}
async function pbkdf2(prf, salt, iterCount, index) {
	let block = new Uint8Array(salt.length + 4);
	block.set(salt);
	block[salt.length + 0] = (index >> 24) & 255;
	block[salt.length + 1] = (index >> 16) & 255;
	block[salt.length + 2] = (index >> 8) & 255;
	block[salt.length + 3] = index & 255;
	block = await prf(block);
	const key = block;
	for (let r = 1; r < iterCount; r++) {
		block = await prf(block);
		for (let i = 0; i < key.length; i++) {
			key[i] ^= block[i];
		}
	}
	return key;
}
class ConnectionError1 extends Error {
	constructor(message) {
		super(message);
		this.name = 'ConnectionError';
	}
}
class ConnectionParamsError extends Error {
	constructor(message) {
		super(message);
		this.name = 'ConnectionParamsError';
	}
}
class PostgresError1 extends Error {
	fields;
	constructor(fields) {
		super(fields.message);
		this.fields = fields;
		this.name = 'PostgresError';
	}
}
class TransactionError1 extends Error {
	cause;
	constructor(transaction_name, cause) {
		super(
			`The transaction "${transaction_name}" has been aborted due to \`${cause}\`. Check the "cause" property to get more details`
		);
		this.cause = cause;
		this.name = 'TransactionError';
	}
}
const ERROR_MESSAGE = 'E';
const AUTHENTICATION_TYPE = {
	CLEAR_TEXT: 3,
	GSS_CONTINUE: 8,
	GSS_STARTUP: 7,
	MD5: 5,
	NO_AUTHENTICATION: 0,
	SASL_CONTINUE: 11,
	SASL_FINAL: 12,
	SASL_STARTUP: 10,
	SCM: 6,
	SSPI: 9,
};
const INCOMING_AUTHENTICATION_MESSAGES = {
	AUTHENTICATION: 'R',
	BACKEND_KEY: 'K',
	PARAMETER_STATUS: 'S',
	READY: 'Z',
};
const INCOMING_TLS_MESSAGES = {
	ACCEPTS_TLS: 'S',
	NO_ACCEPTS_TLS: 'N',
};
const INCOMING_QUERY_MESSAGES = {
	BIND_COMPLETE: '2',
	PARSE_COMPLETE: '1',
	COMMAND_COMPLETE: 'C',
	DATA_ROW: 'D',
	EMPTY_QUERY: 'I',
	NO_DATA: 'n',
	NOTICE_WARNING: 'N',
	PARAMETER_STATUS: 'S',
	READY: 'Z',
	ROW_DESCRIPTION: 'T',
};
const encoder = new TextEncoder();
function md5(bytes) {
	return createHash('md5').update(bytes).toString('hex');
}
function hashMd5Password(password, username, salt) {
	const innerHash = md5(encoder.encode(password + username));
	const innerBytes = encoder.encode(innerHash);
	const outerBuffer = new Uint8Array(innerBytes.length + salt.length);
	outerBuffer.set(innerBytes);
	outerBuffer.set(salt, innerBytes.length);
	const outerHash = md5(outerBuffer);
	return 'md5' + outerHash;
}
function assertSuccessfulStartup(msg) {
	switch (msg.type) {
		case ERROR_MESSAGE:
			throw new PostgresError1(parseNoticeMessage(msg));
	}
}
function assertSuccessfulAuthentication(auth_message) {
	if (auth_message.type === ERROR_MESSAGE) {
		throw new PostgresError1(parseNoticeMessage(auth_message));
	}
	if (auth_message.type !== INCOMING_AUTHENTICATION_MESSAGES.AUTHENTICATION) {
		throw new Error(`Unexpected auth response: ${auth_message.type}.`);
	}
	const responseCode = auth_message.reader.readInt32();
	if (responseCode !== 0) {
		throw new Error(`Unexpected auth response code: ${responseCode}.`);
	}
}
function logNotice(notice) {
	console.error(`${bold(yellow(notice.severity))}: ${notice.message}`);
}
const decoder1 = new TextDecoder();
const encoder1 = new TextEncoder();
class Connection {
	#bufReader;
	#bufWriter;
	#conn;
	connected = false;
	#connection_params;
	#message_header = new Uint8Array(5);
	#onDisconnection;
	#packetWriter = new PacketWriter();
	#pid;
	#queryLock = new DeferredStack(1, [undefined]);
	#secretKey;
	#tls;
	get pid() {
		return this.#pid;
	}
	get tls() {
		return this.#tls;
	}
	constructor(connection_params, disconnection_callback) {
		this.#connection_params = connection_params;
		this.#onDisconnection = disconnection_callback;
	}
	async #readMessage() {
		this.#message_header.fill(0);
		await this.#bufReader.readFull(this.#message_header);
		const type = decoder1.decode(this.#message_header.slice(0, 1));
		if (type === '\x00') {
			throw new ConnectionError1('The session was terminated by the database');
		}
		const length = readUInt32BE(this.#message_header, 1) - 4;
		const body = new Uint8Array(length);
		await this.#bufReader.readFull(body);
		return new Message(type, length, body);
	}
	async #serverAcceptsTLS() {
		const writer = this.#packetWriter;
		writer.clear();
		writer.addInt32(8).addInt32(80877103).join();
		await this.#bufWriter.write(writer.flush());
		await this.#bufWriter.flush();
		const response = new Uint8Array(1);
		await this.#conn.read(response);
		switch (String.fromCharCode(response[0])) {
			case INCOMING_TLS_MESSAGES.ACCEPTS_TLS:
				return true;
			case INCOMING_TLS_MESSAGES.NO_ACCEPTS_TLS:
				return false;
			default:
				throw new Error(
					`Could not check if server accepts SSL connections, server responded with: ${response}`
				);
		}
	}
	async #sendStartupMessage() {
		const writer = this.#packetWriter;
		writer.clear();
		writer.addInt16(3).addInt16(0);
		const connParams = this.#connection_params;
		writer.addCString('user').addCString(connParams.user);
		writer.addCString('database').addCString(connParams.database);
		writer.addCString('application_name').addCString(connParams.applicationName);
		writer.addCString('client_encoding').addCString("'utf-8'");
		writer.addCString('');
		const bodyBuffer = writer.flush();
		const bodyLength = bodyBuffer.length + 4;
		writer.clear();
		const finalBuffer = writer.addInt32(bodyLength).add(bodyBuffer).join();
		await this.#bufWriter.write(finalBuffer);
		await this.#bufWriter.flush();
		return await this.#readMessage();
	}
	async #createNonTlsConnection(options) {
		this.#conn = await Deno.connect(options);
		this.#bufWriter = new BufWriter(this.#conn);
		this.#bufReader = new BufReader(this.#conn);
	}
	async #createTlsConnection(connection, options) {
		if ('startTls' in Deno) {
			this.#conn = await Deno.startTls(connection, options);
			this.#bufWriter = new BufWriter(this.#conn);
			this.#bufReader = new BufReader(this.#conn);
		} else {
			throw new Error(
				'You need to execute Deno with the `--unstable` argument in order to stablish a TLS connection'
			);
		}
	}
	#resetConnectionMetadata() {
		this.connected = false;
		this.#packetWriter = new PacketWriter();
		this.#pid = undefined;
		this.#queryLock = new DeferredStack(1, [undefined]);
		this.#secretKey = undefined;
		this.#tls = undefined;
	}
	#closeConnection() {
		try {
			this.#conn.close();
		} catch (_e) {
		} finally {
			this.#resetConnectionMetadata();
		}
	}
	async #startup() {
		this.#closeConnection();
		const {
			hostname,
			port,
			tls: { enabled: tls_enabled, enforce: tls_enforced, caFile },
		} = this.#connection_params;
		await this.#createNonTlsConnection({
			hostname,
			port,
		});
		this.#tls = false;
		if (tls_enabled) {
			const accepts_tls = await this.#serverAcceptsTLS().catch(e => {
				this.#closeConnection();
				throw e;
			});
			if (accepts_tls) {
				try {
					await this.#createTlsConnection(this.#conn, {
						hostname,
						certFile: caFile,
					});
					this.#tls = true;
				} catch (e) {
					if (!tls_enforced) {
						console.error(
							bold(yellow('TLS connection failed with message: ')) +
								e.message +
								'\n' +
								bold('Defaulting to non-encrypted connection')
						);
						await this.#createNonTlsConnection({
							hostname,
							port,
						});
						this.#tls = false;
					} else {
						throw e;
					}
				}
			} else if (tls_enforced) {
				this.#closeConnection();
				throw new Error(
					"The server isn't accepting TLS connections. Change the client configuration so TLS configuration isn't required to connect"
				);
			}
		}
		try {
			let startup_response;
			try {
				startup_response = await this.#sendStartupMessage();
			} catch (e) {
				this.#closeConnection();
				if (e instanceof Deno.errors.InvalidData && tls_enabled) {
					if (tls_enforced) {
						throw new Error('The certificate used to secure the TLS connection is invalid.');
					} else {
						console.error(
							bold(yellow('TLS connection failed with message: ')) +
								e.message +
								'\n' +
								bold('Defaulting to non-encrypted connection')
						);
						await this.#createNonTlsConnection({
							hostname,
							port,
						});
						this.#tls = false;
						startup_response = await this.#sendStartupMessage();
					}
				} else {
					throw e;
				}
			}
			assertSuccessfulStartup(startup_response);
			await this.#authenticate(startup_response);
			let message = await this.#readMessage();
			while (message.type !== INCOMING_AUTHENTICATION_MESSAGES.READY) {
				switch (message.type) {
					case ERROR_MESSAGE:
						await this.#processErrorUnsafe(message, false);
						break;
					case INCOMING_AUTHENTICATION_MESSAGES.BACKEND_KEY: {
						const { pid, secret_key } = parseBackendKeyMessage(message);
						this.#pid = pid;
						this.#secretKey = secret_key;
						break;
					}
					case INCOMING_AUTHENTICATION_MESSAGES.PARAMETER_STATUS:
						break;
					default:
						throw new Error(`Unknown response for startup: ${message.type}`);
				}
				message = await this.#readMessage();
			}
			this.connected = true;
		} catch (e1) {
			this.#closeConnection();
			throw e1;
		}
	}
	async startup(is_reconnection) {
		if (is_reconnection && this.#connection_params.connection.attempts === 0) {
			throw new Error(
				'The client has been disconnected from the database. Enable reconnection in the client to attempt reconnection after failure'
			);
		}
		let reconnection_attempts = 0;
		const max_reconnections = this.#connection_params.connection.attempts;
		let error;
		if (!is_reconnection && this.#connection_params.connection.attempts === 0) {
			try {
				await this.#startup();
			} catch (e) {
				error = e;
			}
		} else {
			while (reconnection_attempts < max_reconnections) {
				try {
					await this.#startup();
					break;
				} catch (e) {
					reconnection_attempts++;
					if (reconnection_attempts === max_reconnections) {
						error = e;
					}
				}
			}
		}
		if (error) {
			await this.end();
			throw error;
		}
	}
	async #authenticate(authentication_request) {
		const authentication_type = authentication_request.reader.readInt32();
		let authentication_result;
		switch (authentication_type) {
			case AUTHENTICATION_TYPE.NO_AUTHENTICATION:
				authentication_result = authentication_request;
				break;
			case AUTHENTICATION_TYPE.CLEAR_TEXT:
				authentication_result = await this.#authenticateWithClearPassword();
				break;
			case AUTHENTICATION_TYPE.MD5: {
				const salt = authentication_request.reader.readBytes(4);
				authentication_result = await this.#authenticateWithMd5(salt);
				break;
			}
			case AUTHENTICATION_TYPE.SCM:
				throw new Error(
					'Database server expected SCM authentication, which is not supported at the moment'
				);
			case AUTHENTICATION_TYPE.GSS_STARTUP:
				throw new Error(
					'Database server expected GSS authentication, which is not supported at the moment'
				);
			case AUTHENTICATION_TYPE.GSS_CONTINUE:
				throw new Error(
					'Database server expected GSS authentication, which is not supported at the moment'
				);
			case AUTHENTICATION_TYPE.SSPI:
				throw new Error(
					'Database server expected SSPI authentication, which is not supported at the moment'
				);
			case AUTHENTICATION_TYPE.SASL_STARTUP:
				authentication_result = await this.#authenticateWithSasl();
				break;
			default:
				throw new Error(`Unknown auth message code ${authentication_type}`);
		}
		await assertSuccessfulAuthentication(authentication_result);
	}
	async #authenticateWithClearPassword() {
		this.#packetWriter.clear();
		const password = this.#connection_params.password || '';
		const buffer = this.#packetWriter.addCString(password).flush(112);
		await this.#bufWriter.write(buffer);
		await this.#bufWriter.flush();
		return this.#readMessage();
	}
	async #authenticateWithMd5(salt) {
		this.#packetWriter.clear();
		if (!this.#connection_params.password) {
			throw new ConnectionParamsError('Attempting MD5 authentication with unset password');
		}
		const password = hashMd5Password(
			this.#connection_params.password,
			this.#connection_params.user,
			salt
		);
		const buffer = this.#packetWriter.addCString(password).flush(112);
		await this.#bufWriter.write(buffer);
		await this.#bufWriter.flush();
		return this.#readMessage();
	}
	async #authenticateWithSasl() {
		if (!this.#connection_params.password) {
			throw new ConnectionParamsError('Attempting SASL auth with unset password');
		}
		const client = new Client2(this.#connection_params.user, this.#connection_params.password);
		const utf8 = new TextDecoder('utf-8');
		const clientFirstMessage = client.composeChallenge();
		this.#packetWriter.clear();
		this.#packetWriter.addCString('SCRAM-SHA-256');
		this.#packetWriter.addInt32(clientFirstMessage.length);
		this.#packetWriter.addString(clientFirstMessage);
		this.#bufWriter.write(this.#packetWriter.flush(112));
		this.#bufWriter.flush();
		const maybe_sasl_continue = await this.#readMessage();
		switch (maybe_sasl_continue.type) {
			case INCOMING_AUTHENTICATION_MESSAGES.AUTHENTICATION: {
				const authentication_type = maybe_sasl_continue.reader.readInt32();
				if (authentication_type !== AUTHENTICATION_TYPE.SASL_CONTINUE) {
					throw new Error(
						`Unexpected authentication type in SASL negotiation: ${authentication_type}`
					);
				}
				break;
			}
			case ERROR_MESSAGE:
				throw new PostgresError1(parseNoticeMessage(maybe_sasl_continue));
			default:
				throw new Error(`Unexpected message in SASL negotiation: ${maybe_sasl_continue.type}`);
		}
		const sasl_continue = utf8.decode(maybe_sasl_continue.reader.readAllBytes());
		await client.receiveChallenge(sasl_continue);
		this.#packetWriter.clear();
		this.#packetWriter.addString(await client.composeResponse());
		this.#bufWriter.write(this.#packetWriter.flush(112));
		this.#bufWriter.flush();
		const maybe_sasl_final = await this.#readMessage();
		switch (maybe_sasl_final.type) {
			case INCOMING_AUTHENTICATION_MESSAGES.AUTHENTICATION: {
				const authentication_type = maybe_sasl_final.reader.readInt32();
				if (authentication_type !== AUTHENTICATION_TYPE.SASL_FINAL) {
					throw new Error(
						`Unexpected authentication type in SASL finalization: ${authentication_type}`
					);
				}
				break;
			}
			case ERROR_MESSAGE:
				throw new PostgresError1(parseNoticeMessage(maybe_sasl_final));
			default:
				throw new Error(`Unexpected message in SASL finalization: ${maybe_sasl_continue.type}`);
		}
		const sasl_final = utf8.decode(maybe_sasl_final.reader.readAllBytes());
		await client.receiveResponse(sasl_final);
		return this.#readMessage();
	}
	async #simpleQuery(query) {
		this.#packetWriter.clear();
		const buffer = this.#packetWriter.addCString(query.text).flush(81);
		await this.#bufWriter.write(buffer);
		await this.#bufWriter.flush();
		let result;
		if (query.result_type === ResultType.ARRAY) {
			result = new QueryArrayResult(query);
		} else {
			result = new QueryObjectResult(query);
		}
		let error;
		let current_message = await this.#readMessage();
		while (current_message.type !== INCOMING_QUERY_MESSAGES.READY) {
			switch (current_message.type) {
				case ERROR_MESSAGE:
					error = new PostgresError1(parseNoticeMessage(current_message));
					break;
				case INCOMING_QUERY_MESSAGES.COMMAND_COMPLETE: {
					result.handleCommandComplete(parseCommandCompleteMessage(current_message));
					break;
				}
				case INCOMING_QUERY_MESSAGES.DATA_ROW: {
					result.insertRow(parseRowDataMessage(current_message));
					break;
				}
				case INCOMING_QUERY_MESSAGES.EMPTY_QUERY:
					break;
				case INCOMING_QUERY_MESSAGES.NOTICE_WARNING: {
					const notice = parseNoticeMessage(current_message);
					logNotice(notice);
					result.warnings.push(notice);
					break;
				}
				case INCOMING_QUERY_MESSAGES.PARAMETER_STATUS:
					break;
				case INCOMING_QUERY_MESSAGES.READY:
					break;
				case INCOMING_QUERY_MESSAGES.ROW_DESCRIPTION: {
					result.loadColumnDescriptions(parseRowDescriptionMessage(current_message));
					break;
				}
				default:
					throw new Error(`Unexpected simple query message: ${current_message.type}`);
			}
			current_message = await this.#readMessage();
		}
		if (error) throw error;
		return result;
	}
	async #appendQueryToMessage(query) {
		this.#packetWriter.clear();
		const buffer = this.#packetWriter.addCString('').addCString(query.text).addInt16(0).flush(80);
		await this.#bufWriter.write(buffer);
	}
	async #appendArgumentsToMessage(query) {
		this.#packetWriter.clear();
		const hasBinaryArgs = query.args.some(arg => arg instanceof Uint8Array);
		this.#packetWriter.clear();
		this.#packetWriter.addCString('').addCString('');
		if (hasBinaryArgs) {
			this.#packetWriter.addInt16(query.args.length);
			query.args.forEach(arg => {
				this.#packetWriter.addInt16(arg instanceof Uint8Array ? 1 : 0);
			});
		} else {
			this.#packetWriter.addInt16(0);
		}
		this.#packetWriter.addInt16(query.args.length);
		query.args.forEach(arg => {
			if (arg === null || typeof arg === 'undefined') {
				this.#packetWriter.addInt32(-1);
			} else if (arg instanceof Uint8Array) {
				this.#packetWriter.addInt32(arg.length);
				this.#packetWriter.add(arg);
			} else {
				const byteLength = encoder1.encode(arg).length;
				this.#packetWriter.addInt32(byteLength);
				this.#packetWriter.addString(arg);
			}
		});
		this.#packetWriter.addInt16(0);
		const buffer = this.#packetWriter.flush(66);
		await this.#bufWriter.write(buffer);
	}
	async #appendDescribeToMessage() {
		this.#packetWriter.clear();
		const buffer = this.#packetWriter.addCString('P').flush(68);
		await this.#bufWriter.write(buffer);
	}
	async #appendExecuteToMessage() {
		this.#packetWriter.clear();
		const buffer = this.#packetWriter.addCString('').addInt32(0).flush(69);
		await this.#bufWriter.write(buffer);
	}
	async #appendSyncToMessage() {
		this.#packetWriter.clear();
		const buffer = this.#packetWriter.flush(83);
		await this.#bufWriter.write(buffer);
	}
	async #processErrorUnsafe(msg, recoverable = true) {
		const error = new PostgresError1(parseNoticeMessage(msg));
		if (recoverable) {
			let maybe_ready_message = await this.#readMessage();
			while (maybe_ready_message.type !== INCOMING_QUERY_MESSAGES.READY) {
				maybe_ready_message = await this.#readMessage();
			}
		}
		throw error;
	}
	async #preparedQuery(query) {
		await this.#appendQueryToMessage(query);
		await this.#appendArgumentsToMessage(query);
		await this.#appendDescribeToMessage();
		await this.#appendExecuteToMessage();
		await this.#appendSyncToMessage();
		await this.#bufWriter.flush();
		let result;
		if (query.result_type === ResultType.ARRAY) {
			result = new QueryArrayResult(query);
		} else {
			result = new QueryObjectResult(query);
		}
		let error;
		let current_message = await this.#readMessage();
		while (current_message.type !== INCOMING_QUERY_MESSAGES.READY) {
			switch (current_message.type) {
				case ERROR_MESSAGE: {
					error = new PostgresError1(parseNoticeMessage(current_message));
					break;
				}
				case INCOMING_QUERY_MESSAGES.BIND_COMPLETE:
					break;
				case INCOMING_QUERY_MESSAGES.COMMAND_COMPLETE: {
					result.handleCommandComplete(parseCommandCompleteMessage(current_message));
					break;
				}
				case INCOMING_QUERY_MESSAGES.DATA_ROW: {
					result.insertRow(parseRowDataMessage(current_message));
					break;
				}
				case INCOMING_QUERY_MESSAGES.NO_DATA:
					break;
				case INCOMING_QUERY_MESSAGES.NOTICE_WARNING: {
					const notice = parseNoticeMessage(current_message);
					logNotice(notice);
					result.warnings.push(notice);
					break;
				}
				case INCOMING_QUERY_MESSAGES.PARAMETER_STATUS:
					break;
				case INCOMING_QUERY_MESSAGES.PARSE_COMPLETE:
					break;
				case INCOMING_QUERY_MESSAGES.ROW_DESCRIPTION: {
					result.loadColumnDescriptions(parseRowDescriptionMessage(current_message));
					break;
				}
				default:
					throw new Error(`Unexpected prepared query message: ${current_message.type}`);
			}
			current_message = await this.#readMessage();
		}
		if (error) throw error;
		return result;
	}
	async query(query) {
		if (!this.connected) {
			await this.startup(true);
		}
		await this.#queryLock.pop();
		try {
			if (query.args.length === 0) {
				return await this.#simpleQuery(query);
			} else {
				return await this.#preparedQuery(query);
			}
		} catch (e) {
			if (e instanceof ConnectionError1) {
				await this.end();
			}
			throw e;
		} finally {
			this.#queryLock.push(undefined);
		}
	}
	async end() {
		if (this.connected) {
			const terminationMessage = new Uint8Array([88, 0, 0, 0, 4]);
			await this.#bufWriter.write(terminationMessage);
			try {
				await this.#bufWriter.flush();
				this.#closeConnection();
			} catch (_e) {
			} finally {
				this.#onDisconnection();
			}
		}
	}
}
function getPgEnv() {
	return {
		database: Deno.env.get('PGDATABASE'),
		hostname: Deno.env.get('PGHOST'),
		port: Deno.env.get('PGPORT'),
		user: Deno.env.get('PGUSER'),
		password: Deno.env.get('PGPASSWORD'),
		applicationName: Deno.env.get('PGAPPNAME'),
	};
}
function formatMissingParams(missingParams) {
	return `Missing connection parameters: ${missingParams.join(', ')}`;
}
function assertRequiredOptions(options, requiredKeys, has_env_access) {
	const missingParams = [];
	for (const key of requiredKeys) {
		if (options[key] === '' || options[key] === null || options[key] === undefined) {
			missingParams.push(key);
		}
	}
	if (missingParams.length) {
		let missing_params_message = formatMissingParams(missingParams);
		if (!has_env_access) {
			missing_params_message +=
				'\nConnection parameters can be read from environment variables only if Deno is run with env permission';
		}
		throw new ConnectionParamsError(missing_params_message);
	}
}
function parseOptionsFromDsn(connString) {
	const dsn = parseDsn(connString);
	if (dsn.driver !== 'postgres' && dsn.driver !== 'postgresql') {
		throw new ConnectionParamsError(`Supplied DSN has invalid driver: ${dsn.driver}.`);
	}
	let tls = {
		enabled: true,
		enforce: false,
	};
	if (dsn.params.sslmode) {
		const sslmode = dsn.params.sslmode;
		delete dsn.params.sslmode;
		if (!['disable', 'require', 'prefer'].includes(sslmode)) {
			throw new ConnectionParamsError(
				`Supplied DSN has invalid sslmode '${sslmode}'. Only 'disable', 'require', and 'prefer' are supported`
			);
		}
		if (sslmode === 'require') {
			tls = {
				enabled: true,
				enforce: true,
			};
		}
		if (sslmode === 'disable') {
			tls = {
				enabled: false,
				enforce: false,
			};
		}
	}
	return {
		...dsn,
		applicationName: dsn.params.application_name,
		tls,
	};
}
const DEFAULT_OPTIONS = {
	applicationName: 'deno_postgres',
	connection: {
		attempts: 1,
	},
	hostname: '127.0.0.1',
	port: 5432,
	tls: {
		enabled: true,
		enforce: false,
	},
};
function createParams(params = {}) {
	if (typeof params === 'string') {
		params = parseOptionsFromDsn(params);
	}
	let pgEnv = {};
	let has_env_access = true;
	try {
		pgEnv = getPgEnv();
	} catch (e) {
		if (e instanceof Deno.errors.PermissionDenied) {
			has_env_access = false;
		} else {
			throw e;
		}
	}
	let port;
	if (params.port) {
		port = Number(params.port);
	} else if (pgEnv.port) {
		port = Number(pgEnv.port);
	} else {
		port = DEFAULT_OPTIONS.port;
	}
	if (Number.isNaN(port) || port === 0) {
		throw new ConnectionParamsError(`"${params.port ?? pgEnv.port}" is not a valid port number`);
	}
	const tls_enabled = !!(params?.tls?.enabled ?? DEFAULT_OPTIONS.tls.enabled);
	const tls_enforced = !!(params?.tls?.enforce ?? DEFAULT_OPTIONS.tls.enforce);
	if (!tls_enabled && tls_enforced) {
		throw new ConnectionParamsError("Can't enforce TLS when client has TLS encryption is disabled");
	}
	const connection_options = {
		applicationName:
			params.applicationName ?? pgEnv.applicationName ?? DEFAULT_OPTIONS.applicationName,
		connection: {
			attempts: params?.connection?.attempts ?? DEFAULT_OPTIONS.connection.attempts,
		},
		database: params.database ?? pgEnv.database,
		hostname: params.hostname ?? pgEnv.hostname ?? DEFAULT_OPTIONS.hostname,
		password: params.password ?? pgEnv.password,
		port,
		tls: {
			enabled: tls_enabled,
			enforce: tls_enforced,
			caFile: params?.tls?.caFile,
		},
		user: params.user ?? pgEnv.user,
	};
	assertRequiredOptions(
		connection_options,
		['applicationName', 'database', 'hostname', 'port', 'user'],
		has_env_access
	);
	return connection_options;
}
class Savepoint1 {
	name;
	#instance_count = 0;
	#release_callback;
	#update_callback;
	constructor(name, update_callback, release_callback) {
		this.name = name;
		this.#release_callback = release_callback;
		this.#update_callback = update_callback;
	}
	get instances() {
		return this.#instance_count;
	}
	async release() {
		if (this.#instance_count === 0) {
			throw new Error('This savepoint has no instances to release');
		}
		await this.#release_callback(this.name);
		--this.#instance_count;
	}
	async update() {
		await this.#update_callback(this.name);
		++this.#instance_count;
	}
}
class Transaction1 {
	name;
	#client;
	#executeQuery;
	#isolation_level;
	#read_only;
	#savepoints = [];
	#snapshot;
	#updateClientLock;
	constructor(name, options, client, execute_query_callback, update_client_lock_callback) {
		this.name = name;
		this.#client = client;
		this.#executeQuery = execute_query_callback;
		this.#isolation_level = options?.isolation_level ?? 'read_committed';
		this.#read_only = options?.read_only ?? false;
		this.#snapshot = options?.snapshot;
		this.#updateClientLock = update_client_lock_callback;
	}
	get isolation_level() {
		return this.#isolation_level;
	}
	get savepoints() {
		return this.#savepoints;
	}
	#assertTransactionOpen() {
		if (this.#client.session.current_transaction !== this.name) {
			throw new Error(
				`This transaction has not been started yet, make sure to use the "begin" method to do so`
			);
		}
	}
	#resetTransaction() {
		this.#savepoints = [];
	}
	async begin() {
		if (this.#client.session.current_transaction !== null) {
			if (this.#client.session.current_transaction === this.name) {
				throw new Error('This transaction is already open');
			}
			throw new Error(
				`This client already has an ongoing transaction "${
					this.#client.session.current_transaction
				}"`
			);
		}
		let isolation_level;
		switch (this.#isolation_level) {
			case 'read_committed': {
				isolation_level = 'READ COMMITTED';
				break;
			}
			case 'repeatable_read': {
				isolation_level = 'REPEATABLE READ';
				break;
			}
			case 'serializable': {
				isolation_level = 'SERIALIZABLE';
				break;
			}
			default:
				throw new Error(`Unexpected isolation level "${this.#isolation_level}"`);
		}
		let permissions;
		if (this.#read_only) {
			permissions = 'READ ONLY';
		} else {
			permissions = 'READ WRITE';
		}
		let snapshot = '';
		if (this.#snapshot) {
			snapshot = `SET TRANSACTION SNAPSHOT '${this.#snapshot}'`;
		}
		try {
			await this.#client.queryArray(
				`BEGIN ${permissions} ISOLATION LEVEL ${isolation_level};${snapshot}`
			);
		} catch (e) {
			if (e instanceof PostgresError1) {
				throw new TransactionError1(this.name, e);
			} else {
				throw e;
			}
		}
		this.#updateClientLock(this.name);
	}
	async commit(options) {
		this.#assertTransactionOpen();
		const chain = options?.chain ?? false;
		try {
			await this.queryArray(`COMMIT ${chain ? 'AND CHAIN' : ''}`);
		} catch (e) {
			if (e instanceof PostgresError1) {
				throw new TransactionError1(this.name, e);
			} else {
				throw e;
			}
		}
		this.#resetTransaction();
		if (!chain) {
			this.#updateClientLock(null);
		}
	}
	getSavepoint(name) {
		return this.#savepoints.find(sv => sv.name === name.toLowerCase());
	}
	getSavepoints() {
		return this.#savepoints.filter(({ instances }) => instances > 0).map(({ name }) => name);
	}
	async getSnapshot() {
		this.#assertTransactionOpen();
		const { rows } = await this.queryObject`SELECT PG_EXPORT_SNAPSHOT() AS SNAPSHOT;`;
		return rows[0].snapshot;
	}
	async queryArray(query_template_or_config, ...args) {
		this.#assertTransactionOpen();
		let query;
		if (typeof query_template_or_config === 'string') {
			query = new Query(query_template_or_config, ResultType.ARRAY, ...args);
		} else if (isTemplateString(query_template_or_config)) {
			query = templateStringToQuery(query_template_or_config, args, ResultType.ARRAY);
		} else {
			query = new Query(query_template_or_config, ResultType.ARRAY);
		}
		try {
			return await this.#executeQuery(query);
		} catch (e) {
			if (e instanceof PostgresError1) {
				await this.commit();
				throw new TransactionError1(this.name, e);
			} else {
				throw e;
			}
		}
	}
	async queryObject(query_template_or_config, ...args) {
		this.#assertTransactionOpen();
		let query;
		if (typeof query_template_or_config === 'string') {
			query = new Query(query_template_or_config, ResultType.OBJECT, ...args);
		} else if (isTemplateString(query_template_or_config)) {
			query = templateStringToQuery(query_template_or_config, args, ResultType.OBJECT);
		} else {
			query = new Query(query_template_or_config, ResultType.OBJECT);
		}
		try {
			return await this.#executeQuery(query);
		} catch (e) {
			if (e instanceof PostgresError1) {
				await this.commit();
				throw new TransactionError1(this.name, e);
			} else {
				throw e;
			}
		}
	}
	async rollback(savepoint_or_options) {
		this.#assertTransactionOpen();
		let savepoint_option;
		if (typeof savepoint_or_options === 'string' || savepoint_or_options instanceof Savepoint1) {
			savepoint_option = savepoint_or_options;
		} else {
			savepoint_option = savepoint_or_options?.savepoint;
		}
		let savepoint_name;
		if (savepoint_option instanceof Savepoint1) {
			savepoint_name = savepoint_option.name;
		} else if (typeof savepoint_option === 'string') {
			savepoint_name = savepoint_option.toLowerCase();
		}
		let chain_option = false;
		if (typeof savepoint_or_options === 'object') {
			chain_option = savepoint_or_options?.chain ?? false;
		}
		if (chain_option && savepoint_name) {
			throw new Error(
				"The chain option can't be used alongside a savepoint on a rollback operation"
			);
		}
		if (typeof savepoint_option !== 'undefined') {
			const ts_savepoint = this.#savepoints.find(({ name }) => name === savepoint_name);
			if (!ts_savepoint) {
				throw new Error(`There is no "${savepoint_name}" savepoint registered in this transaction`);
			}
			if (!ts_savepoint.instances) {
				throw new Error(`There are no savepoints of "${savepoint_name}" left to rollback to`);
			}
			await this.queryArray(`ROLLBACK TO ${savepoint_name}`);
			return;
		}
		try {
			await this.queryArray(`ROLLBACK ${chain_option ? 'AND CHAIN' : ''}`);
		} catch (e) {
			if (e instanceof PostgresError1) {
				await this.commit();
				throw new TransactionError1(this.name, e);
			} else {
				throw e;
			}
		}
		this.#resetTransaction();
		if (!chain_option) {
			this.#updateClientLock(null);
		}
	}
	async savepoint(name) {
		this.#assertTransactionOpen();
		if (!/^[a-zA-Z_]{1}[\w]{0,62}$/.test(name)) {
			if (!Number.isNaN(Number(name[0]))) {
				throw new Error("The savepoint name can't begin with a number");
			}
			if (name.length > 63) {
				throw new Error("The savepoint name can't be longer than 63 characters");
			}
			throw new Error('The savepoint name can only contain alphanumeric characters');
		}
		name = name.toLowerCase();
		let savepoint = this.#savepoints.find(sv => sv.name === name);
		if (savepoint) {
			try {
				await savepoint.update();
			} catch (e) {
				if (e instanceof PostgresError1) {
					await this.commit();
					throw new TransactionError1(this.name, e);
				} else {
					throw e;
				}
			}
		} else {
			savepoint = new Savepoint1(
				name,
				async name => {
					await this.queryArray(`SAVEPOINT ${name}`);
				},
				async name => {
					await this.queryArray(`RELEASE SAVEPOINT ${name}`);
				}
			);
			try {
				await savepoint.update();
			} catch (e) {
				if (e instanceof PostgresError1) {
					await this.commit();
					throw new TransactionError1(this.name, e);
				} else {
					throw e;
				}
			}
			this.#savepoints.push(savepoint);
		}
		return savepoint;
	}
}
class QueryClient1 {
	#connection;
	#terminated = false;
	#transaction = null;
	constructor(connection) {
		this.#connection = connection;
	}
	get connected() {
		return this.#connection.connected;
	}
	get session() {
		return {
			current_transaction: this.#transaction,
			pid: this.#connection.pid,
			tls: this.#connection.tls,
		};
	}
	#assertOpenConnection() {
		if (this.#terminated) {
			throw new Error('Connection to the database has been terminated');
		}
	}
	async closeConnection() {
		if (this.connected) {
			await this.#connection.end();
		}
		this.resetSessionMetadata();
	}
	createTransaction(name, options) {
		this.#assertOpenConnection();
		return new Transaction1(name, options, this, this.#executeQuery.bind(this), name => {
			this.#transaction = name;
		});
	}
	async connect() {
		if (!this.connected) {
			await this.#connection.startup(false);
			this.#terminated = false;
		}
	}
	async end() {
		await this.closeConnection();
		this.#terminated = true;
	}
	#executeQuery(query) {
		return this.#connection.query(query);
	}
	queryArray(query_template_or_config, ...args) {
		this.#assertOpenConnection();
		if (this.#transaction !== null) {
			throw new Error(
				`This connection is currently locked by the "${this.#transaction}" transaction`
			);
		}
		let query;
		if (typeof query_template_or_config === 'string') {
			query = new Query(query_template_or_config, ResultType.ARRAY, ...args);
		} else if (isTemplateString(query_template_or_config)) {
			query = templateStringToQuery(query_template_or_config, args, ResultType.ARRAY);
		} else {
			query = new Query(query_template_or_config, ResultType.ARRAY);
		}
		return this.#executeQuery(query);
	}
	queryObject(query_template_or_config, ...args) {
		this.#assertOpenConnection();
		if (this.#transaction !== null) {
			throw new Error(
				`This connection is currently locked by the "${this.#transaction}" transaction`
			);
		}
		let query;
		if (typeof query_template_or_config === 'string') {
			query = new Query(query_template_or_config, ResultType.OBJECT, ...args);
		} else if (isTemplateString(query_template_or_config)) {
			query = templateStringToQuery(query_template_or_config, args, ResultType.OBJECT);
		} else {
			query = new Query(query_template_or_config, ResultType.OBJECT);
		}
		return this.#executeQuery(query);
	}
	resetSessionMetadata() {
		this.#transaction = null;
	}
}
class Client1 extends QueryClient1 {
	constructor(config) {
		super(
			new Connection(createParams(config), async () => {
				await this.closeConnection();
			})
		);
	}
}
class PoolClient1 extends QueryClient1 {
	#release;
	constructor(config, releaseCallback) {
		super(
			new Connection(config, async () => {
				await this.closeConnection();
			})
		);
		this.#release = releaseCallback;
	}
	release() {
		this.#release();
		this.resetSessionMetadata();
	}
}
class Pool1 {
	#available_connections;
	#connection_params;
	#ended = false;
	#lazy;
	#ready;
	#size;
	get available() {
		if (!this.#available_connections) {
			return 0;
		}
		return this.#available_connections.available;
	}
	get size() {
		if (!this.#available_connections) {
			return 0;
		}
		return this.#available_connections.size;
	}
	constructor(connection_params, size, lazy = false) {
		this.#connection_params = createParams(connection_params);
		this.#lazy = lazy;
		this.#size = size;
		this.#ready = this.#initialize();
	}
	async connect() {
		if (this.#ended) {
			this.#ready = this.#initialize();
		}
		await this.#ready;
		return this.#available_connections.pop();
	}
	async end() {
		if (this.#ended) {
			throw new Error('Pool connections have already been terminated');
		}
		await this.#ready;
		while (this.available > 0) {
			const client = await this.#available_connections.pop();
			await client.end();
		}
		this.#available_connections = undefined;
		this.#ended = true;
	}
	async #initialize() {
		const initialized = this.#lazy ? 0 : this.#size;
		const clients = Array.from(
			{
				length: this.#size,
			},
			async (_e, index) => {
				const client = new PoolClient1(this.#connection_params, () =>
					this.#available_connections.push(client)
				);
				if (index < initialized) {
					await client.connect();
				}
				return client;
			}
		);
		this.#available_connections = new DeferredAccessStack(
			await Promise.all(clients),
			client => client.connect(),
			client => client.connected
		);
		this.#ended = false;
	}
	async initialized() {
		if (!this.#available_connections) {
			return 0;
		}
		return await this.#available_connections.initialized();
	}
}
export { Client1 as Client };
export {
	ConnectionError1 as ConnectionError,
	PostgresError1 as PostgresError,
	TransactionError1 as TransactionError,
};
export { Pool1 as Pool };
export { PoolClient1 as PoolClient, QueryClient1 as QueryClient };
export { Savepoint1 as Savepoint, Transaction1 as Transaction };
