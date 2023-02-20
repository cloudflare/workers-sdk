class ConnnectionError extends Error {
	constructor(msg) {
		super(msg);
	}
}
class WriteError extends ConnnectionError {
	constructor(msg) {
		super(msg);
	}
}
class ReadError extends ConnnectionError {
	constructor(msg) {
		super(msg);
	}
}
class ResponseTimeoutError extends ConnnectionError {
	constructor(msg) {
		super(msg);
	}
}
class ProtocolError extends ConnnectionError {
	constructor(msg) {
		super(msg);
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
const noColor = globalThis.Deno?.noColor ?? true;
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
function green(str) {
	return run(str, code([32], 39));
}
new RegExp(
	[
		'[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)',
		'(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))',
	].join('|'),
	'g'
);
function format(data) {
	const bytes = new Uint8Array(data.buffer);
	let out = '         +-------------------------------------------------+\n';
	out += `         |${green('  0  1  2  3  4  5  6  7  8  9  a  b  c  d  e  f ')}|\n`;
	out += '+--------+-------------------------------------------------+----------------+\n';
	const lineCount = Math.ceil(bytes.length / 16);
	for (let line = 0; line < lineCount; line++) {
		const start = line * 16;
		const addr = start.toString(16).padStart(8, '0');
		const lineBytes = bytes.slice(start, start + 16);
		out += `|${green(addr)}| `;
		lineBytes.forEach(__byte => (out += __byte.toString(16).padStart(2, '0') + ' '));
		if (lineBytes.length < 16) {
			out += '   '.repeat(16 - lineBytes.length);
		}
		out += '|';
		lineBytes.forEach(function (__byte) {
			return (out += __byte > 31 && __byte < 127 ? green(String.fromCharCode(__byte)) : '.');
		});
		if (lineBytes.length < 16) {
			out += ' '.repeat(16 - lineBytes.length);
		}
		out += '|\n';
	}
	out += '+--------+-------------------------------------------------+----------------+';
	return out;
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
function replaceParams(sql, params) {
	if (!params) return sql;
	let paramIndex = 0;
	sql = sql.replace(/('[^'\\]*(?:\\.[^'\\]*)*')|("[^"\\]*(?:\\.[^"\\]*)*")|(\?\?)|(\?)/g, str => {
		if (paramIndex >= params.length) return str;
		if (/".*"/g.test(str) || /'.*'/g.test(str)) {
			return str;
		}
		if (str === '??') {
			const val = params[paramIndex++];
			if (val instanceof Array) {
				return `(${val.map(item => replaceParams('??', [item])).join(',')})`;
			} else if (val === '*') {
				return val;
			} else if (typeof val === 'string' && val.includes('.')) {
				const _arr = val.split('.');
				return replaceParams(_arr.map(() => '??').join('.'), _arr);
			} else if (typeof val === 'string' && (val.includes(' as ') || val.includes(' AS '))) {
				const newVal = val.replace(' as ', ' AS ');
				const _arr = newVal.split(' AS ');
				return replaceParams(_arr.map(() => '??').join(' AS '), _arr);
			} else {
				return ['`', val, '`'].join('');
			}
		}
		const val = params[paramIndex++];
		if (val === null) return 'NULL';
		switch (typeof val) {
			case 'object':
				if (val instanceof Date) return `"${formatDate(val)}"`;
				if (val instanceof Array) {
					return `(${val.map(item => replaceParams('?', [item])).join(',')})`;
				}
			case 'string':
				return `"${escapeString(val)}"`;
			case 'undefined':
				return 'NULL';
			case 'number':
			case 'boolean':
			default:
				return val;
		}
	});
	return sql;
}
function formatDate(date) {
	const year = date.getFullYear();
	const month = (date.getMonth() + 1).toString().padStart(2, '0');
	const days = date.getDate().toString().padStart(2, '0');
	const hours = date.getHours().toString().padStart(2, '0');
	const minutes = date.getMinutes().toString().padStart(2, '0');
	const seconds = date.getSeconds().toString().padStart(2, '0');
	const milliseconds = date.getMilliseconds().toString().padStart(3, '0');
	return `${year}-${month}-${days} ${hours}:${minutes}:${seconds}.${milliseconds}`;
}
function escapeString(str) {
	return str.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}
var LogLevels;
(function (LogLevels) {
	LogLevels[(LogLevels['NOTSET'] = 0)] = 'NOTSET';
	LogLevels[(LogLevels['DEBUG'] = 10)] = 'DEBUG';
	LogLevels[(LogLevels['INFO'] = 20)] = 'INFO';
	LogLevels[(LogLevels['WARNING'] = 30)] = 'WARNING';
	LogLevels[(LogLevels['ERROR'] = 40)] = 'ERROR';
	LogLevels[(LogLevels['CRITICAL'] = 50)] = 'CRITICAL';
})(LogLevels || (LogLevels = {}));
Object.keys(LogLevels).filter(key => isNaN(Number(key)));
const byLevel = {
	[String(LogLevels.NOTSET)]: 'NOTSET',
	[String(LogLevels.DEBUG)]: 'DEBUG',
	[String(LogLevels.INFO)]: 'INFO',
	[String(LogLevels.WARNING)]: 'WARNING',
	[String(LogLevels.ERROR)]: 'ERROR',
	[String(LogLevels.CRITICAL)]: 'CRITICAL',
};
function getLevelByName(name) {
	switch (name) {
		case 'NOTSET':
			return LogLevels.NOTSET;
		case 'DEBUG':
			return LogLevels.DEBUG;
		case 'INFO':
			return LogLevels.INFO;
		case 'WARNING':
			return LogLevels.WARNING;
		case 'ERROR':
			return LogLevels.ERROR;
		case 'CRITICAL':
			return LogLevels.CRITICAL;
		default:
			throw new Error(`no log level found for "${name}"`);
	}
}
function getLevelName(level) {
	const levelName = byLevel[level];
	if (levelName) {
		return levelName;
	}
	throw new Error(`no level name found for level: ${level}`);
}
class LogRecord {
	msg;
	#args;
	#datetime;
	level;
	levelName;
	loggerName;
	constructor(options) {
		this.msg = options.msg;
		this.#args = [...options.args];
		this.level = options.level;
		this.loggerName = options.loggerName;
		this.#datetime = new Date();
		this.levelName = getLevelName(options.level);
	}
	get args() {
		return [...this.#args];
	}
	get datetime() {
		return new Date(this.#datetime.getTime());
	}
}
class Logger {
	#level;
	#handlers;
	#loggerName;
	constructor(loggerName, levelName, options = {}) {
		this.#loggerName = loggerName;
		this.#level = getLevelByName(levelName);
		this.#handlers = options.handlers || [];
	}
	get level() {
		return this.#level;
	}
	set level(level) {
		this.#level = level;
	}
	get levelName() {
		return getLevelName(this.#level);
	}
	set levelName(levelName) {
		this.#level = getLevelByName(levelName);
	}
	get loggerName() {
		return this.#loggerName;
	}
	set handlers(hndls) {
		this.#handlers = hndls;
	}
	get handlers() {
		return this.#handlers;
	}
	_log(level, msg, ...args) {
		if (this.level > level) {
			return msg instanceof Function ? undefined : msg;
		}
		let fnResult;
		let logMessage;
		if (msg instanceof Function) {
			fnResult = msg();
			logMessage = this.asString(fnResult);
		} else {
			logMessage = this.asString(msg);
		}
		const record = new LogRecord({
			msg: logMessage,
			args: args,
			level: level,
			loggerName: this.loggerName,
		});
		this.#handlers.forEach(handler => {
			handler.handle(record);
		});
		return msg instanceof Function ? fnResult : msg;
	}
	asString(data) {
		if (typeof data === 'string') {
			return data;
		} else if (
			data === null ||
			typeof data === 'number' ||
			typeof data === 'bigint' ||
			typeof data === 'boolean' ||
			typeof data === 'undefined' ||
			typeof data === 'symbol'
		) {
			return String(data);
		} else if (data instanceof Error) {
			return data.stack;
		} else if (typeof data === 'object') {
			return JSON.stringify(data);
		}
		return 'undefined';
	}
	debug(msg, ...args) {
		return this._log(LogLevels.DEBUG, msg, ...args);
	}
	info(msg, ...args) {
		return this._log(LogLevels.INFO, msg, ...args);
	}
	warning(msg, ...args) {
		return this._log(LogLevels.WARNING, msg, ...args);
	}
	error(msg, ...args) {
		return this._log(LogLevels.ERROR, msg, ...args);
	}
	critical(msg, ...args) {
		return this._log(LogLevels.CRITICAL, msg, ...args);
	}
}
const { Deno } = globalThis;
const noColor1 = typeof Deno?.noColor === 'boolean' ? Deno.noColor : true;
let enabled1 = !noColor1;
function code1(open, close) {
	return {
		open: `\x1b[${open.join(';')}m`,
		close: `\x1b[${close}m`,
		regexp: new RegExp(`\\x1b\\[${close}m`, 'g'),
	};
}
function run1(str, code) {
	return enabled1 ? `${code.open}${str.replace(code.regexp, code.open)}${code.close}` : str;
}
function bold(str) {
	return run1(str, code1([1], 22));
}
function red(str) {
	return run1(str, code1([31], 39));
}
function yellow(str) {
	return run1(str, code1([33], 39));
}
function blue(str) {
	return run1(str, code1([34], 39));
}
new RegExp(
	[
		'[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)',
		'(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))',
	].join('|'),
	'g'
);
async function exists(filePath) {
	try {
		await Deno.lstat(filePath);
		return true;
	} catch (err) {
		if (err instanceof Deno.errors.NotFound) {
			return false;
		}
		throw err;
	}
}
function existsSync(filePath) {
	try {
		Deno.lstatSync(filePath);
		return true;
	} catch (err) {
		if (err instanceof Deno.errors.NotFound) {
			return false;
		}
		throw err;
	}
}
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
				err.partial = p.subarray(0, bytesRead);
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
		let line;
		try {
			line = await this.readSlice(LF);
		} catch (err) {
			if (err instanceof Deno.errors.BadResource) {
				throw err;
			}
			let { partial } = err;
			assert(
				partial instanceof Uint8Array,
				'bufio: caught error from `readSlice()` without `partial` property'
			);
			if (!(err instanceof BufferFullError)) {
				throw err;
			}
			if (!this.eof && partial.byteLength > 0 && partial[partial.byteLength - 1] === CR) {
				assert(this.r > 0, 'bufio: tried to rewind past start of buffer');
				this.r--;
				partial = partial.subarray(0, partial.byteLength - 1);
			}
			return {
				line: partial,
				more: !this.eof,
			};
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
				err.partial = slice;
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
				err.partial = this.buf.subarray(this.r, this.w);
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
			this.err = e;
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
					this.err = e;
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
			this.err = e;
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
					this.err = e;
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
const DEFAULT_FORMATTER = '{levelName} {msg}';
class BaseHandler {
	level;
	levelName;
	formatter;
	constructor(levelName, options = {}) {
		this.level = getLevelByName(levelName);
		this.levelName = levelName;
		this.formatter = options.formatter || DEFAULT_FORMATTER;
	}
	handle(logRecord) {
		if (this.level > logRecord.level) return;
		const msg = this.format(logRecord);
		return this.log(msg);
	}
	format(logRecord) {
		if (this.formatter instanceof Function) {
			return this.formatter(logRecord);
		}
		return this.formatter.replace(/{(\S+)}/g, (match, p1) => {
			const value = logRecord[p1];
			if (value == null) {
				return match;
			}
			return String(value);
		});
	}
	log(_msg) {}
	async setup() {}
	async destroy() {}
}
class ConsoleHandler extends BaseHandler {
	format(logRecord) {
		let msg = super.format(logRecord);
		switch (logRecord.level) {
			case LogLevels.INFO:
				msg = blue(msg);
				break;
			case LogLevels.WARNING:
				msg = yellow(msg);
				break;
			case LogLevels.ERROR:
				msg = red(msg);
				break;
			case LogLevels.CRITICAL:
				msg = bold(red(msg));
				break;
			default:
				break;
		}
		return msg;
	}
	log(msg) {
		console.log(msg);
	}
}
class WriterHandler extends BaseHandler {
	_writer;
	#encoder = new TextEncoder();
}
class FileHandler extends WriterHandler {
	_file;
	_buf;
	_filename;
	_mode;
	_openOptions;
	_encoder = new TextEncoder();
	#unloadCallback() {
		this.destroy();
	}
	constructor(levelName, options) {
		super(levelName, options);
		this._filename = options.filename;
		this._mode = options.mode ? options.mode : 'a';
		this._openOptions = {
			createNew: this._mode === 'x',
			create: this._mode !== 'x',
			append: this._mode === 'a',
			truncate: this._mode !== 'a',
			write: true,
		};
	}
	async setup() {
		this._file = await Deno.open(this._filename, this._openOptions);
		this._writer = this._file;
		this._buf = new BufWriterSync(this._file);
		addEventListener('unload', this.#unloadCallback.bind(this));
	}
	handle(logRecord) {
		super.handle(logRecord);
		if (logRecord.level > LogLevels.ERROR) {
			this.flush();
		}
	}
	log(msg) {
		this._buf.writeSync(this._encoder.encode(msg + '\n'));
	}
	flush() {
		if (this._buf?.buffered() > 0) {
			this._buf.flush();
		}
	}
	destroy() {
		this.flush();
		this._file?.close();
		this._file = undefined;
		removeEventListener('unload', this.#unloadCallback);
		return Promise.resolve();
	}
}
class RotatingFileHandler extends FileHandler {
	#maxBytes;
	#maxBackupCount;
	#currentFileSize = 0;
	constructor(levelName, options) {
		super(levelName, options);
		this.#maxBytes = options.maxBytes;
		this.#maxBackupCount = options.maxBackupCount;
	}
	async setup() {
		if (this.#maxBytes < 1) {
			this.destroy();
			throw new Error('maxBytes cannot be less than 1');
		}
		if (this.#maxBackupCount < 1) {
			this.destroy();
			throw new Error('maxBackupCount cannot be less than 1');
		}
		await super.setup();
		if (this._mode === 'w') {
			for (let i = 1; i <= this.#maxBackupCount; i++) {
				if (await exists(this._filename + '.' + i)) {
					await Deno.remove(this._filename + '.' + i);
				}
			}
		} else if (this._mode === 'x') {
			for (let i = 1; i <= this.#maxBackupCount; i++) {
				if (await exists(this._filename + '.' + i)) {
					this.destroy();
					throw new Deno.errors.AlreadyExists(
						'Backup log file ' + this._filename + '.' + i + ' already exists'
					);
				}
			}
		} else {
			this.#currentFileSize = (await Deno.stat(this._filename)).size;
		}
	}
	log(msg) {
		const msgByteLength = this._encoder.encode(msg).byteLength + 1;
		if (this.#currentFileSize + msgByteLength > this.#maxBytes) {
			this.rotateLogFiles();
			this.#currentFileSize = 0;
		}
		this._buf.writeSync(this._encoder.encode(msg + '\n'));
		this.#currentFileSize += msgByteLength;
	}
	rotateLogFiles() {
		this._buf.flush();
		Deno.close(this._file.rid);
		for (let i = this.#maxBackupCount - 1; i >= 0; i--) {
			const source = this._filename + (i === 0 ? '' : '.' + i);
			const dest = this._filename + '.' + (i + 1);
			if (existsSync(source)) {
				Deno.renameSync(source, dest);
			}
		}
		this._file = Deno.openSync(this._filename, this._openOptions);
		this._writer = this._file;
		this._buf = new BufWriterSync(this._file);
	}
}
class LoggerConfig {
	level;
	handlers;
}
const DEFAULT_LEVEL = 'INFO';
const DEFAULT_CONFIG = {
	handlers: {
		default: new ConsoleHandler(DEFAULT_LEVEL),
	},
	loggers: {
		default: {
			level: DEFAULT_LEVEL,
			handlers: ['default'],
		},
	},
};
const state1 = {
	handlers: new Map(),
	loggers: new Map(),
	config: DEFAULT_CONFIG,
};
const handlers1 = {
	BaseHandler,
	ConsoleHandler,
	WriterHandler,
	FileHandler,
	RotatingFileHandler,
};
function getLogger(name) {
	if (!name) {
		const d = state1.loggers.get('default');
		assert(d != null, `"default" logger must be set for getting logger without name`);
		return d;
	}
	const result = state1.loggers.get(name);
	if (!result) {
		const logger = new Logger(name, 'NOTSET', {
			handlers: [],
		});
		state1.loggers.set(name, logger);
		return logger;
	}
	return result;
}
function debug(msg, ...args) {
	if (msg instanceof Function) {
		return getLogger('default').debug(msg, ...args);
	}
	return getLogger('default').debug(msg, ...args);
}
function info(msg, ...args) {
	if (msg instanceof Function) {
		return getLogger('default').info(msg, ...args);
	}
	return getLogger('default').info(msg, ...args);
}
function warning(msg, ...args) {
	if (msg instanceof Function) {
		return getLogger('default').warning(msg, ...args);
	}
	return getLogger('default').warning(msg, ...args);
}
function error(msg, ...args) {
	if (msg instanceof Function) {
		return getLogger('default').error(msg, ...args);
	}
	return getLogger('default').error(msg, ...args);
}
function critical(msg, ...args) {
	if (msg instanceof Function) {
		return getLogger('default').critical(msg, ...args);
	}
	return getLogger('default').critical(msg, ...args);
}
async function setup(config) {
	state1.config = {
		handlers: {
			...DEFAULT_CONFIG.handlers,
			...config.handlers,
		},
		loggers: {
			...DEFAULT_CONFIG.loggers,
			...config.loggers,
		},
	};
	state1.handlers.forEach(handler => {
		handler.destroy();
	});
	state1.handlers.clear();
	const handlers = state1.config.handlers || {};
	for (const handlerName in handlers) {
		const handler = handlers[handlerName];
		await handler.setup();
		state1.handlers.set(handlerName, handler);
	}
	state1.loggers.clear();
	const loggers = state1.config.loggers || {};
	for (const loggerName in loggers) {
		const loggerConfig = loggers[loggerName];
		const handlerNames = loggerConfig.handlers || [];
		const handlers = [];
		handlerNames.forEach(handlerName => {
			const handler = state1.handlers.get(handlerName);
			if (handler) {
				handlers.push(handler);
			}
		});
		const levelName = loggerConfig.level || DEFAULT_LEVEL;
		const logger = new Logger(loggerName, levelName, {
			handlers: handlers,
		});
		state1.loggers.set(loggerName, logger);
	}
}
await setup(DEFAULT_CONFIG);
const mod = await (async function () {
	return {
		LogLevels: LogLevels,
		Logger: Logger,
		handlers: handlers1,
		LoggerConfig: LoggerConfig,
		getLogger: getLogger,
		debug: debug,
		info: info,
		warning: warning,
		error: error,
		critical: critical,
		setup: setup,
	};
})();
let logger = mod.getLogger();
let isDebug = false;
function debug1(func) {
	if (isDebug) {
		func();
	}
}
async function configLogger1(config) {
	let { enable = true, level = 'INFO' } = config;
	if (config.logger) level = config.logger.levelName;
	isDebug = level == 'DEBUG';
	if (!enable) {
		logger = new mod.Logger('fakeLogger', 'NOTSET', {});
		logger.level = 100;
	} else {
		if (!config.logger) {
			await mod.setup({
				handlers: {
					console: new mod.handlers.ConsoleHandler(level),
				},
				loggers: {
					default: {
						level: 'DEBUG',
						handlers: ['console'],
					},
				},
			});
			logger = mod.getLogger();
		} else {
			logger = config.logger;
		}
	}
}
function xor(a, b) {
	return a.map((__byte, index) => {
		return __byte ^ b[index];
	});
}
const encoder = new TextEncoder();
const decoder = new TextDecoder();
function encode2(input) {
	return encoder.encode(input);
}
function decode1(input) {
	return decoder.decode(input);
}
class BufferReader {
	buffer;
	pos = 0;
	constructor(buffer) {
		this.buffer = buffer;
	}
	get finished() {
		return this.pos >= this.buffer.length;
	}
	skip(len) {
		this.pos += len;
		return this;
	}
	readBuffer(len) {
		const buffer = this.buffer.slice(this.pos, this.pos + len);
		this.pos += len;
		return buffer;
	}
	readUints(len) {
		let num = 0;
		for (let n = 0; n < len; n++) {
			num += this.buffer[this.pos++] << (8 * n);
		}
		return num;
	}
	readUint8() {
		return this.buffer[this.pos++];
	}
	readUint16() {
		return this.readUints(2);
	}
	readUint32() {
		return this.readUints(4);
	}
	readUint64() {
		return this.readUints(8);
	}
	readNullTerminatedString() {
		let end = this.buffer.indexOf(0, this.pos);
		if (end === -1) end = this.buffer.length;
		const buf = this.buffer.slice(this.pos, end);
		this.pos += buf.length + 1;
		return decode1(buf);
	}
	readString(len) {
		const str = decode1(this.buffer.slice(this.pos, this.pos + len));
		this.pos += len;
		return str;
	}
	readEncodedLen() {
		const first = this.readUint8();
		if (first < 251) {
			return first;
		} else {
			if (first == 252) {
				return this.readUint16();
			} else if (first == 253) {
				return this.readUints(3);
			} else if (first == 254) {
				return this.readUints(8);
			}
		}
		return -1;
	}
	readLenCodeString() {
		const len = this.readEncodedLen();
		if (len == -1) return null;
		return this.readString(len);
	}
}
class BufferWriter {
	buffer;
	pos = 0;
	constructor(buffer) {
		this.buffer = buffer;
	}
	get wroteData() {
		return this.buffer.slice(0, this.pos);
	}
	get length() {
		return this.pos;
	}
	get capacity() {
		return this.buffer.length - this.pos;
	}
	skip(len) {
		this.pos += len;
		return this;
	}
	writeBuffer(buffer) {
		if (buffer.length > this.capacity) {
			buffer = buffer.slice(0, this.capacity);
		}
		this.buffer.set(buffer, this.pos);
		this.pos += buffer.length;
		return this;
	}
	write(__byte) {
		this.buffer[this.pos++] = __byte;
		return this;
	}
	writeInt16LE(num) {}
	writeIntLE(num, len) {
		const __int = new Int32Array(1);
		__int[0] = 40;
		console.log(__int);
	}
	writeUint16(num) {
		return this.writeUints(2, num);
	}
	writeUint32(num) {
		return this.writeUints(4, num);
	}
	writeUint64(num) {
		return this.writeUints(8, num);
	}
	writeUints(len, num) {
		for (let n = 0; n < len; n++) {
			this.buffer[this.pos++] = (num >> (n * 8)) & 255;
		}
		return this;
	}
	writeNullTerminatedString(str) {
		return this.writeString(str).write(0);
	}
	writeString(str) {
		const buf = encode2(str);
		this.buffer.set(buf, this.pos);
		this.pos += buf.length;
		return this;
	}
}
function hash(algorithm, data) {
	return new Uint8Array(createHash(algorithm).update(data).digest());
}
function mysqlNativePassword(password, seed) {
	const pwd1 = hash('sha1', encode2(password));
	const pwd2 = hash('sha1', pwd1);
	let seedAndPwd2 = new Uint8Array(seed.length + pwd2.length);
	seedAndPwd2.set(seed);
	seedAndPwd2.set(pwd2, seed.length);
	seedAndPwd2 = hash('sha1', seedAndPwd2);
	return xor(seedAndPwd2, pwd1);
}
function cachingSha2Password(password, seed) {
	const stage1 = hash('sha256', encode2(password));
	const stage2 = hash('sha256', stage1);
	const stage3 = hash('sha256', Uint8Array.from([...stage2, ...seed]));
	return xor(stage1, stage3);
}
function auth(authPluginName, password, seed) {
	switch (authPluginName) {
		case 'mysql_native_password':
			return mysqlNativePassword(password, seed);
		case 'caching_sha2_password':
			return cachingSha2Password(password, seed);
		default:
			throw new Error('Not supported');
	}
}
var ServerCapabilities;
(function (ServerCapabilities) {
	ServerCapabilities[(ServerCapabilities['CLIENT_PROTOCOL_41'] = 512)] = 'CLIENT_PROTOCOL_41';
	ServerCapabilities[(ServerCapabilities['CLIENT_CONNECT_WITH_DB'] = 8)] = 'CLIENT_CONNECT_WITH_DB';
	ServerCapabilities[(ServerCapabilities['CLIENT_LONG_FLAG'] = 4)] = 'CLIENT_LONG_FLAG';
	ServerCapabilities[(ServerCapabilities['CLIENT_DEPRECATE_EOF'] = 16777216)] =
		'CLIENT_DEPRECATE_EOF';
	ServerCapabilities[(ServerCapabilities['CLIENT_LONG_PASSWORD'] = 1)] = 'CLIENT_LONG_PASSWORD';
	ServerCapabilities[(ServerCapabilities['CLIENT_TRANSACTIONS'] = 8192)] = 'CLIENT_TRANSACTIONS';
	ServerCapabilities[(ServerCapabilities['CLIENT_MULTI_RESULTS'] = 131072)] =
		'CLIENT_MULTI_RESULTS';
	ServerCapabilities[(ServerCapabilities['CLIENT_PLUGIN_AUTH_LENENC_CLIENT_DATA'] = 2097152)] =
		'CLIENT_PLUGIN_AUTH_LENENC_CLIENT_DATA';
	ServerCapabilities[(ServerCapabilities['CLIENT_PLUGIN_AUTH'] = 524288)] = 'CLIENT_PLUGIN_AUTH';
	ServerCapabilities[(ServerCapabilities['CLIENT_SECURE_CONNECTION'] = 32768)] =
		'CLIENT_SECURE_CONNECTION';
	ServerCapabilities[(ServerCapabilities['CLIENT_FOUND_ROWS'] = 2)] = 'CLIENT_FOUND_ROWS';
	ServerCapabilities[(ServerCapabilities['CLIENT_CONNECT_ATTRS'] = 1048576)] =
		'CLIENT_CONNECT_ATTRS';
	ServerCapabilities[(ServerCapabilities['CLIENT_IGNORE_SPACE'] = 256)] = 'CLIENT_IGNORE_SPACE';
	ServerCapabilities[(ServerCapabilities['CLIENT_IGNORE_SIGPIPE'] = 4096)] =
		'CLIENT_IGNORE_SIGPIPE';
	ServerCapabilities[(ServerCapabilities['CLIENT_RESERVED'] = 16384)] = 'CLIENT_RESERVED';
	ServerCapabilities[(ServerCapabilities['CLIENT_PS_MULTI_RESULTS'] = 262144)] =
		'CLIENT_PS_MULTI_RESULTS';
})(ServerCapabilities || (ServerCapabilities = {}));
var Charset;
(function (Charset) {
	Charset[(Charset['BIG5_CHINESE_CI'] = 1)] = 'BIG5_CHINESE_CI';
	Charset[(Charset['LATIN2_CZECH_CS'] = 2)] = 'LATIN2_CZECH_CS';
	Charset[(Charset['DEC8_SWEDISH_CI'] = 3)] = 'DEC8_SWEDISH_CI';
	Charset[(Charset['CP850_GENERAL_CI'] = 4)] = 'CP850_GENERAL_CI';
	Charset[(Charset['LATIN1_GERMAN1_CI'] = 5)] = 'LATIN1_GERMAN1_CI';
	Charset[(Charset['HP8_ENGLISH_CI'] = 6)] = 'HP8_ENGLISH_CI';
	Charset[(Charset['KOI8R_GENERAL_CI'] = 7)] = 'KOI8R_GENERAL_CI';
	Charset[(Charset['LATIN1_SWEDISH_CI'] = 8)] = 'LATIN1_SWEDISH_CI';
	Charset[(Charset['LATIN2_GENERAL_CI'] = 9)] = 'LATIN2_GENERAL_CI';
	Charset[(Charset['SWE7_SWEDISH_CI'] = 10)] = 'SWE7_SWEDISH_CI';
	Charset[(Charset['ASCII_GENERAL_CI'] = 11)] = 'ASCII_GENERAL_CI';
	Charset[(Charset['UJIS_JAPANESE_CI'] = 12)] = 'UJIS_JAPANESE_CI';
	Charset[(Charset['SJIS_JAPANESE_CI'] = 13)] = 'SJIS_JAPANESE_CI';
	Charset[(Charset['CP1251_BULGARIAN_CI'] = 14)] = 'CP1251_BULGARIAN_CI';
	Charset[(Charset['LATIN1_DANISH_CI'] = 15)] = 'LATIN1_DANISH_CI';
	Charset[(Charset['HEBREW_GENERAL_CI'] = 16)] = 'HEBREW_GENERAL_CI';
	Charset[(Charset['TIS620_THAI_CI'] = 18)] = 'TIS620_THAI_CI';
	Charset[(Charset['EUCKR_KOREAN_CI'] = 19)] = 'EUCKR_KOREAN_CI';
	Charset[(Charset['LATIN7_ESTONIAN_CS'] = 20)] = 'LATIN7_ESTONIAN_CS';
	Charset[(Charset['LATIN2_HUNGARIAN_CI'] = 21)] = 'LATIN2_HUNGARIAN_CI';
	Charset[(Charset['KOI8U_GENERAL_CI'] = 22)] = 'KOI8U_GENERAL_CI';
	Charset[(Charset['CP1251_UKRAINIAN_CI'] = 23)] = 'CP1251_UKRAINIAN_CI';
	Charset[(Charset['GB2312_CHINESE_CI'] = 24)] = 'GB2312_CHINESE_CI';
	Charset[(Charset['GREEK_GENERAL_CI'] = 25)] = 'GREEK_GENERAL_CI';
	Charset[(Charset['CP1250_GENERAL_CI'] = 26)] = 'CP1250_GENERAL_CI';
	Charset[(Charset['LATIN2_CROATIAN_CI'] = 27)] = 'LATIN2_CROATIAN_CI';
	Charset[(Charset['GBK_CHINESE_CI'] = 28)] = 'GBK_CHINESE_CI';
	Charset[(Charset['CP1257_LITHUANIAN_CI'] = 29)] = 'CP1257_LITHUANIAN_CI';
	Charset[(Charset['LATIN5_TURKISH_CI'] = 30)] = 'LATIN5_TURKISH_CI';
	Charset[(Charset['LATIN1_GERMAN2_CI'] = 31)] = 'LATIN1_GERMAN2_CI';
	Charset[(Charset['ARMSCII8_GENERAL_CI'] = 32)] = 'ARMSCII8_GENERAL_CI';
	Charset[(Charset['UTF8_GENERAL_CI'] = 33)] = 'UTF8_GENERAL_CI';
	Charset[(Charset['CP1250_CZECH_CS'] = 34)] = 'CP1250_CZECH_CS';
	Charset[(Charset['UCS2_GENERAL_CI'] = 35)] = 'UCS2_GENERAL_CI';
	Charset[(Charset['CP866_GENERAL_CI'] = 36)] = 'CP866_GENERAL_CI';
	Charset[(Charset['KEYBCS2_GENERAL_CI'] = 37)] = 'KEYBCS2_GENERAL_CI';
	Charset[(Charset['MACCE_GENERAL_CI'] = 38)] = 'MACCE_GENERAL_CI';
	Charset[(Charset['MACROMAN_GENERAL_CI'] = 39)] = 'MACROMAN_GENERAL_CI';
	Charset[(Charset['CP852_GENERAL_CI'] = 40)] = 'CP852_GENERAL_CI';
	Charset[(Charset['LATIN7_GENERAL_CI'] = 41)] = 'LATIN7_GENERAL_CI';
	Charset[(Charset['LATIN7_GENERAL_CS'] = 42)] = 'LATIN7_GENERAL_CS';
	Charset[(Charset['MACCE_BIN'] = 43)] = 'MACCE_BIN';
	Charset[(Charset['CP1250_CROATIAN_CI'] = 44)] = 'CP1250_CROATIAN_CI';
	Charset[(Charset['UTF8MB4_GENERAL_CI'] = 45)] = 'UTF8MB4_GENERAL_CI';
	Charset[(Charset['UTF8MB4_BIN'] = 46)] = 'UTF8MB4_BIN';
	Charset[(Charset['LATIN1_BIN'] = 47)] = 'LATIN1_BIN';
	Charset[(Charset['LATIN1_GENERAL_CI'] = 48)] = 'LATIN1_GENERAL_CI';
	Charset[(Charset['LATIN1_GENERAL_CS'] = 49)] = 'LATIN1_GENERAL_CS';
	Charset[(Charset['CP1251_BIN'] = 50)] = 'CP1251_BIN';
	Charset[(Charset['CP1251_GENERAL_CI'] = 51)] = 'CP1251_GENERAL_CI';
	Charset[(Charset['CP1251_GENERAL_CS'] = 52)] = 'CP1251_GENERAL_CS';
	Charset[(Charset['MACROMAN_BIN'] = 53)] = 'MACROMAN_BIN';
	Charset[(Charset['UTF16_GENERAL_CI'] = 54)] = 'UTF16_GENERAL_CI';
	Charset[(Charset['UTF16_BIN'] = 55)] = 'UTF16_BIN';
	Charset[(Charset['UTF16LE_GENERAL_CI'] = 56)] = 'UTF16LE_GENERAL_CI';
	Charset[(Charset['CP1256_GENERAL_CI'] = 57)] = 'CP1256_GENERAL_CI';
	Charset[(Charset['CP1257_BIN'] = 58)] = 'CP1257_BIN';
	Charset[(Charset['CP1257_GENERAL_CI'] = 59)] = 'CP1257_GENERAL_CI';
	Charset[(Charset['UTF32_GENERAL_CI'] = 60)] = 'UTF32_GENERAL_CI';
	Charset[(Charset['UTF32_BIN'] = 61)] = 'UTF32_BIN';
	Charset[(Charset['UTF16LE_BIN'] = 62)] = 'UTF16LE_BIN';
	Charset[(Charset['BINARY'] = 63)] = 'BINARY';
	Charset[(Charset['ARMSCII8_BIN'] = 64)] = 'ARMSCII8_BIN';
	Charset[(Charset['ASCII_BIN'] = 65)] = 'ASCII_BIN';
	Charset[(Charset['CP1250_BIN'] = 66)] = 'CP1250_BIN';
	Charset[(Charset['CP1256_BIN'] = 67)] = 'CP1256_BIN';
	Charset[(Charset['CP866_BIN'] = 68)] = 'CP866_BIN';
	Charset[(Charset['DEC8_BIN'] = 69)] = 'DEC8_BIN';
	Charset[(Charset['GREEK_BIN'] = 70)] = 'GREEK_BIN';
	Charset[(Charset['HEBREW_BIN'] = 71)] = 'HEBREW_BIN';
	Charset[(Charset['HP8_BIN'] = 72)] = 'HP8_BIN';
	Charset[(Charset['KEYBCS2_BIN'] = 73)] = 'KEYBCS2_BIN';
	Charset[(Charset['KOI8R_BIN'] = 74)] = 'KOI8R_BIN';
	Charset[(Charset['KOI8U_BIN'] = 75)] = 'KOI8U_BIN';
	Charset[(Charset['LATIN2_BIN'] = 77)] = 'LATIN2_BIN';
	Charset[(Charset['LATIN5_BIN'] = 78)] = 'LATIN5_BIN';
	Charset[(Charset['LATIN7_BIN'] = 79)] = 'LATIN7_BIN';
	Charset[(Charset['CP850_BIN'] = 80)] = 'CP850_BIN';
	Charset[(Charset['CP852_BIN'] = 81)] = 'CP852_BIN';
	Charset[(Charset['SWE7_BIN'] = 82)] = 'SWE7_BIN';
	Charset[(Charset['UTF8_BIN'] = 83)] = 'UTF8_BIN';
	Charset[(Charset['BIG5_BIN'] = 84)] = 'BIG5_BIN';
	Charset[(Charset['EUCKR_BIN'] = 85)] = 'EUCKR_BIN';
	Charset[(Charset['GB2312_BIN'] = 86)] = 'GB2312_BIN';
	Charset[(Charset['GBK_BIN'] = 87)] = 'GBK_BIN';
	Charset[(Charset['SJIS_BIN'] = 88)] = 'SJIS_BIN';
	Charset[(Charset['TIS620_BIN'] = 89)] = 'TIS620_BIN';
	Charset[(Charset['UCS2_BIN'] = 90)] = 'UCS2_BIN';
	Charset[(Charset['UJIS_BIN'] = 91)] = 'UJIS_BIN';
	Charset[(Charset['GEOSTD8_GENERAL_CI'] = 92)] = 'GEOSTD8_GENERAL_CI';
	Charset[(Charset['GEOSTD8_BIN'] = 93)] = 'GEOSTD8_BIN';
	Charset[(Charset['LATIN1_SPANISH_CI'] = 94)] = 'LATIN1_SPANISH_CI';
	Charset[(Charset['CP932_JAPANESE_CI'] = 95)] = 'CP932_JAPANESE_CI';
	Charset[(Charset['CP932_BIN'] = 96)] = 'CP932_BIN';
	Charset[(Charset['EUCJPMS_JAPANESE_CI'] = 97)] = 'EUCJPMS_JAPANESE_CI';
	Charset[(Charset['EUCJPMS_BIN'] = 98)] = 'EUCJPMS_BIN';
	Charset[(Charset['CP1250_POLISH_CI'] = 99)] = 'CP1250_POLISH_CI';
	Charset[(Charset['UTF16_UNICODE_CI'] = 101)] = 'UTF16_UNICODE_CI';
	Charset[(Charset['UTF16_ICELANDIC_CI'] = 102)] = 'UTF16_ICELANDIC_CI';
	Charset[(Charset['UTF16_LATVIAN_CI'] = 103)] = 'UTF16_LATVIAN_CI';
	Charset[(Charset['UTF16_ROMANIAN_CI'] = 104)] = 'UTF16_ROMANIAN_CI';
	Charset[(Charset['UTF16_SLOVENIAN_CI'] = 105)] = 'UTF16_SLOVENIAN_CI';
	Charset[(Charset['UTF16_POLISH_CI'] = 106)] = 'UTF16_POLISH_CI';
	Charset[(Charset['UTF16_ESTONIAN_CI'] = 107)] = 'UTF16_ESTONIAN_CI';
	Charset[(Charset['UTF16_SPANISH_CI'] = 108)] = 'UTF16_SPANISH_CI';
	Charset[(Charset['UTF16_SWEDISH_CI'] = 109)] = 'UTF16_SWEDISH_CI';
	Charset[(Charset['UTF16_TURKISH_CI'] = 110)] = 'UTF16_TURKISH_CI';
	Charset[(Charset['UTF16_CZECH_CI'] = 111)] = 'UTF16_CZECH_CI';
	Charset[(Charset['UTF16_DANISH_CI'] = 112)] = 'UTF16_DANISH_CI';
	Charset[(Charset['UTF16_LITHUANIAN_CI'] = 113)] = 'UTF16_LITHUANIAN_CI';
	Charset[(Charset['UTF16_SLOVAK_CI'] = 114)] = 'UTF16_SLOVAK_CI';
	Charset[(Charset['UTF16_SPANISH2_CI'] = 115)] = 'UTF16_SPANISH2_CI';
	Charset[(Charset['UTF16_ROMAN_CI'] = 116)] = 'UTF16_ROMAN_CI';
	Charset[(Charset['UTF16_PERSIAN_CI'] = 117)] = 'UTF16_PERSIAN_CI';
	Charset[(Charset['UTF16_ESPERANTO_CI'] = 118)] = 'UTF16_ESPERANTO_CI';
	Charset[(Charset['UTF16_HUNGARIAN_CI'] = 119)] = 'UTF16_HUNGARIAN_CI';
	Charset[(Charset['UTF16_SINHALA_CI'] = 120)] = 'UTF16_SINHALA_CI';
	Charset[(Charset['UTF16_GERMAN2_CI'] = 121)] = 'UTF16_GERMAN2_CI';
	Charset[(Charset['UTF16_CROATIAN_MYSQL561_CI'] = 122)] = 'UTF16_CROATIAN_MYSQL561_CI';
	Charset[(Charset['UTF16_UNICODE_520_CI'] = 123)] = 'UTF16_UNICODE_520_CI';
	Charset[(Charset['UTF16_VIETNAMESE_CI'] = 124)] = 'UTF16_VIETNAMESE_CI';
	Charset[(Charset['UCS2_UNICODE_CI'] = 128)] = 'UCS2_UNICODE_CI';
	Charset[(Charset['UCS2_ICELANDIC_CI'] = 129)] = 'UCS2_ICELANDIC_CI';
	Charset[(Charset['UCS2_LATVIAN_CI'] = 130)] = 'UCS2_LATVIAN_CI';
	Charset[(Charset['UCS2_ROMANIAN_CI'] = 131)] = 'UCS2_ROMANIAN_CI';
	Charset[(Charset['UCS2_SLOVENIAN_CI'] = 132)] = 'UCS2_SLOVENIAN_CI';
	Charset[(Charset['UCS2_POLISH_CI'] = 133)] = 'UCS2_POLISH_CI';
	Charset[(Charset['UCS2_ESTONIAN_CI'] = 134)] = 'UCS2_ESTONIAN_CI';
	Charset[(Charset['UCS2_SPANISH_CI'] = 135)] = 'UCS2_SPANISH_CI';
	Charset[(Charset['UCS2_SWEDISH_CI'] = 136)] = 'UCS2_SWEDISH_CI';
	Charset[(Charset['UCS2_TURKISH_CI'] = 137)] = 'UCS2_TURKISH_CI';
	Charset[(Charset['UCS2_CZECH_CI'] = 138)] = 'UCS2_CZECH_CI';
	Charset[(Charset['UCS2_DANISH_CI'] = 139)] = 'UCS2_DANISH_CI';
	Charset[(Charset['UCS2_LITHUANIAN_CI'] = 140)] = 'UCS2_LITHUANIAN_CI';
	Charset[(Charset['UCS2_SLOVAK_CI'] = 141)] = 'UCS2_SLOVAK_CI';
	Charset[(Charset['UCS2_SPANISH2_CI'] = 142)] = 'UCS2_SPANISH2_CI';
	Charset[(Charset['UCS2_ROMAN_CI'] = 143)] = 'UCS2_ROMAN_CI';
	Charset[(Charset['UCS2_PERSIAN_CI'] = 144)] = 'UCS2_PERSIAN_CI';
	Charset[(Charset['UCS2_ESPERANTO_CI'] = 145)] = 'UCS2_ESPERANTO_CI';
	Charset[(Charset['UCS2_HUNGARIAN_CI'] = 146)] = 'UCS2_HUNGARIAN_CI';
	Charset[(Charset['UCS2_SINHALA_CI'] = 147)] = 'UCS2_SINHALA_CI';
	Charset[(Charset['UCS2_GERMAN2_CI'] = 148)] = 'UCS2_GERMAN2_CI';
	Charset[(Charset['UCS2_CROATIAN_MYSQL561_CI'] = 149)] = 'UCS2_CROATIAN_MYSQL561_CI';
	Charset[(Charset['UCS2_UNICODE_520_CI'] = 150)] = 'UCS2_UNICODE_520_CI';
	Charset[(Charset['UCS2_VIETNAMESE_CI'] = 151)] = 'UCS2_VIETNAMESE_CI';
	Charset[(Charset['UCS2_GENERAL_MYSQL500_CI'] = 159)] = 'UCS2_GENERAL_MYSQL500_CI';
	Charset[(Charset['UTF32_UNICODE_CI'] = 160)] = 'UTF32_UNICODE_CI';
	Charset[(Charset['UTF32_ICELANDIC_CI'] = 161)] = 'UTF32_ICELANDIC_CI';
	Charset[(Charset['UTF32_LATVIAN_CI'] = 162)] = 'UTF32_LATVIAN_CI';
	Charset[(Charset['UTF32_ROMANIAN_CI'] = 163)] = 'UTF32_ROMANIAN_CI';
	Charset[(Charset['UTF32_SLOVENIAN_CI'] = 164)] = 'UTF32_SLOVENIAN_CI';
	Charset[(Charset['UTF32_POLISH_CI'] = 165)] = 'UTF32_POLISH_CI';
	Charset[(Charset['UTF32_ESTONIAN_CI'] = 166)] = 'UTF32_ESTONIAN_CI';
	Charset[(Charset['UTF32_SPANISH_CI'] = 167)] = 'UTF32_SPANISH_CI';
	Charset[(Charset['UTF32_SWEDISH_CI'] = 168)] = 'UTF32_SWEDISH_CI';
	Charset[(Charset['UTF32_TURKISH_CI'] = 169)] = 'UTF32_TURKISH_CI';
	Charset[(Charset['UTF32_CZECH_CI'] = 170)] = 'UTF32_CZECH_CI';
	Charset[(Charset['UTF32_DANISH_CI'] = 171)] = 'UTF32_DANISH_CI';
	Charset[(Charset['UTF32_LITHUANIAN_CI'] = 172)] = 'UTF32_LITHUANIAN_CI';
	Charset[(Charset['UTF32_SLOVAK_CI'] = 173)] = 'UTF32_SLOVAK_CI';
	Charset[(Charset['UTF32_SPANISH2_CI'] = 174)] = 'UTF32_SPANISH2_CI';
	Charset[(Charset['UTF32_ROMAN_CI'] = 175)] = 'UTF32_ROMAN_CI';
	Charset[(Charset['UTF32_PERSIAN_CI'] = 176)] = 'UTF32_PERSIAN_CI';
	Charset[(Charset['UTF32_ESPERANTO_CI'] = 177)] = 'UTF32_ESPERANTO_CI';
	Charset[(Charset['UTF32_HUNGARIAN_CI'] = 178)] = 'UTF32_HUNGARIAN_CI';
	Charset[(Charset['UTF32_SINHALA_CI'] = 179)] = 'UTF32_SINHALA_CI';
	Charset[(Charset['UTF32_GERMAN2_CI'] = 180)] = 'UTF32_GERMAN2_CI';
	Charset[(Charset['UTF32_CROATIAN_MYSQL561_CI'] = 181)] = 'UTF32_CROATIAN_MYSQL561_CI';
	Charset[(Charset['UTF32_UNICODE_520_CI'] = 182)] = 'UTF32_UNICODE_520_CI';
	Charset[(Charset['UTF32_VIETNAMESE_CI'] = 183)] = 'UTF32_VIETNAMESE_CI';
	Charset[(Charset['UTF8_UNICODE_CI'] = 192)] = 'UTF8_UNICODE_CI';
	Charset[(Charset['UTF8_ICELANDIC_CI'] = 193)] = 'UTF8_ICELANDIC_CI';
	Charset[(Charset['UTF8_LATVIAN_CI'] = 194)] = 'UTF8_LATVIAN_CI';
	Charset[(Charset['UTF8_ROMANIAN_CI'] = 195)] = 'UTF8_ROMANIAN_CI';
	Charset[(Charset['UTF8_SLOVENIAN_CI'] = 196)] = 'UTF8_SLOVENIAN_CI';
	Charset[(Charset['UTF8_POLISH_CI'] = 197)] = 'UTF8_POLISH_CI';
	Charset[(Charset['UTF8_ESTONIAN_CI'] = 198)] = 'UTF8_ESTONIAN_CI';
	Charset[(Charset['UTF8_SPANISH_CI'] = 199)] = 'UTF8_SPANISH_CI';
	Charset[(Charset['UTF8_SWEDISH_CI'] = 200)] = 'UTF8_SWEDISH_CI';
	Charset[(Charset['UTF8_TURKISH_CI'] = 201)] = 'UTF8_TURKISH_CI';
	Charset[(Charset['UTF8_CZECH_CI'] = 202)] = 'UTF8_CZECH_CI';
	Charset[(Charset['UTF8_DANISH_CI'] = 203)] = 'UTF8_DANISH_CI';
	Charset[(Charset['UTF8_LITHUANIAN_CI'] = 204)] = 'UTF8_LITHUANIAN_CI';
	Charset[(Charset['UTF8_SLOVAK_CI'] = 205)] = 'UTF8_SLOVAK_CI';
	Charset[(Charset['UTF8_SPANISH2_CI'] = 206)] = 'UTF8_SPANISH2_CI';
	Charset[(Charset['UTF8_ROMAN_CI'] = 207)] = 'UTF8_ROMAN_CI';
	Charset[(Charset['UTF8_PERSIAN_CI'] = 208)] = 'UTF8_PERSIAN_CI';
	Charset[(Charset['UTF8_ESPERANTO_CI'] = 209)] = 'UTF8_ESPERANTO_CI';
	Charset[(Charset['UTF8_HUNGARIAN_CI'] = 210)] = 'UTF8_HUNGARIAN_CI';
	Charset[(Charset['UTF8_SINHALA_CI'] = 211)] = 'UTF8_SINHALA_CI';
	Charset[(Charset['UTF8_GERMAN2_CI'] = 212)] = 'UTF8_GERMAN2_CI';
	Charset[(Charset['UTF8_CROATIAN_MYSQL561_CI'] = 213)] = 'UTF8_CROATIAN_MYSQL561_CI';
	Charset[(Charset['UTF8_UNICODE_520_CI'] = 214)] = 'UTF8_UNICODE_520_CI';
	Charset[(Charset['UTF8_VIETNAMESE_CI'] = 215)] = 'UTF8_VIETNAMESE_CI';
	Charset[(Charset['UTF8_GENERAL_MYSQL500_CI'] = 223)] = 'UTF8_GENERAL_MYSQL500_CI';
	Charset[(Charset['UTF8MB4_UNICODE_CI'] = 224)] = 'UTF8MB4_UNICODE_CI';
	Charset[(Charset['UTF8MB4_ICELANDIC_CI'] = 225)] = 'UTF8MB4_ICELANDIC_CI';
	Charset[(Charset['UTF8MB4_LATVIAN_CI'] = 226)] = 'UTF8MB4_LATVIAN_CI';
	Charset[(Charset['UTF8MB4_ROMANIAN_CI'] = 227)] = 'UTF8MB4_ROMANIAN_CI';
	Charset[(Charset['UTF8MB4_SLOVENIAN_CI'] = 228)] = 'UTF8MB4_SLOVENIAN_CI';
	Charset[(Charset['UTF8MB4_POLISH_CI'] = 229)] = 'UTF8MB4_POLISH_CI';
	Charset[(Charset['UTF8MB4_ESTONIAN_CI'] = 230)] = 'UTF8MB4_ESTONIAN_CI';
	Charset[(Charset['UTF8MB4_SPANISH_CI'] = 231)] = 'UTF8MB4_SPANISH_CI';
	Charset[(Charset['UTF8MB4_SWEDISH_CI'] = 232)] = 'UTF8MB4_SWEDISH_CI';
	Charset[(Charset['UTF8MB4_TURKISH_CI'] = 233)] = 'UTF8MB4_TURKISH_CI';
	Charset[(Charset['UTF8MB4_CZECH_CI'] = 234)] = 'UTF8MB4_CZECH_CI';
	Charset[(Charset['UTF8MB4_DANISH_CI'] = 235)] = 'UTF8MB4_DANISH_CI';
	Charset[(Charset['UTF8MB4_LITHUANIAN_CI'] = 236)] = 'UTF8MB4_LITHUANIAN_CI';
	Charset[(Charset['UTF8MB4_SLOVAK_CI'] = 237)] = 'UTF8MB4_SLOVAK_CI';
	Charset[(Charset['UTF8MB4_SPANISH2_CI'] = 238)] = 'UTF8MB4_SPANISH2_CI';
	Charset[(Charset['UTF8MB4_ROMAN_CI'] = 239)] = 'UTF8MB4_ROMAN_CI';
	Charset[(Charset['UTF8MB4_PERSIAN_CI'] = 240)] = 'UTF8MB4_PERSIAN_CI';
	Charset[(Charset['UTF8MB4_ESPERANTO_CI'] = 241)] = 'UTF8MB4_ESPERANTO_CI';
	Charset[(Charset['UTF8MB4_HUNGARIAN_CI'] = 242)] = 'UTF8MB4_HUNGARIAN_CI';
	Charset[(Charset['UTF8MB4_SINHALA_CI'] = 243)] = 'UTF8MB4_SINHALA_CI';
	Charset[(Charset['UTF8MB4_GERMAN2_CI'] = 244)] = 'UTF8MB4_GERMAN2_CI';
	Charset[(Charset['UTF8MB4_CROATIAN_MYSQL561_CI'] = 245)] = 'UTF8MB4_CROATIAN_MYSQL561_CI';
	Charset[(Charset['UTF8MB4_UNICODE_520_CI'] = 246)] = 'UTF8MB4_UNICODE_520_CI';
	Charset[(Charset['UTF8MB4_VIETNAMESE_CI'] = 247)] = 'UTF8MB4_VIETNAMESE_CI';
	Charset[(Charset['UTF8_GENERAL50_CI'] = 253)] = 'UTF8_GENERAL50_CI';
	Charset[(Charset['ARMSCII8'] = 32)] = 'ARMSCII8';
	Charset[(Charset['ASCII'] = 11)] = 'ASCII';
	Charset[(Charset['BIG5'] = 1)] = 'BIG5';
	Charset[(Charset['CP1250'] = 26)] = 'CP1250';
	Charset[(Charset['CP1251'] = 51)] = 'CP1251';
	Charset[(Charset['CP1256'] = 57)] = 'CP1256';
	Charset[(Charset['CP1257'] = 59)] = 'CP1257';
	Charset[(Charset['CP866'] = 36)] = 'CP866';
	Charset[(Charset['CP850'] = 4)] = 'CP850';
	Charset[(Charset['CP852'] = 40)] = 'CP852';
	Charset[(Charset['CP932'] = 95)] = 'CP932';
	Charset[(Charset['DEC8'] = 3)] = 'DEC8';
	Charset[(Charset['EUCJPMS'] = 97)] = 'EUCJPMS';
	Charset[(Charset['EUCKR'] = 19)] = 'EUCKR';
	Charset[(Charset['GB2312'] = 24)] = 'GB2312';
	Charset[(Charset['GBK'] = 28)] = 'GBK';
	Charset[(Charset['GEOSTD8'] = 92)] = 'GEOSTD8';
	Charset[(Charset['GREEK'] = 25)] = 'GREEK';
	Charset[(Charset['HEBREW'] = 16)] = 'HEBREW';
	Charset[(Charset['HP8'] = 6)] = 'HP8';
	Charset[(Charset['KEYBCS2'] = 37)] = 'KEYBCS2';
	Charset[(Charset['KOI8R'] = 7)] = 'KOI8R';
	Charset[(Charset['KOI8U'] = 22)] = 'KOI8U';
	Charset[(Charset['LATIN1'] = 8)] = 'LATIN1';
	Charset[(Charset['LATIN2'] = 9)] = 'LATIN2';
	Charset[(Charset['LATIN5'] = 30)] = 'LATIN5';
	Charset[(Charset['LATIN7'] = 41)] = 'LATIN7';
	Charset[(Charset['MACCE'] = 38)] = 'MACCE';
	Charset[(Charset['MACROMAN'] = 39)] = 'MACROMAN';
	Charset[(Charset['SJIS'] = 13)] = 'SJIS';
	Charset[(Charset['SWE7'] = 10)] = 'SWE7';
	Charset[(Charset['TIS620'] = 18)] = 'TIS620';
	Charset[(Charset['UCS2'] = 35)] = 'UCS2';
	Charset[(Charset['UJIS'] = 12)] = 'UJIS';
	Charset[(Charset['UTF16'] = 54)] = 'UTF16';
	Charset[(Charset['UTF16LE'] = 56)] = 'UTF16LE';
	Charset[(Charset['UTF8'] = 33)] = 'UTF8';
	Charset[(Charset['UTF8MB4'] = 45)] = 'UTF8MB4';
	Charset[(Charset['UTF32'] = 60)] = 'UTF32';
})(Charset || (Charset = {}));
function buildAuth(packet, params) {
	const clientParam =
		(params.db ? ServerCapabilities.CLIENT_CONNECT_WITH_DB : 0) |
		ServerCapabilities.CLIENT_PLUGIN_AUTH |
		ServerCapabilities.CLIENT_LONG_PASSWORD |
		ServerCapabilities.CLIENT_PROTOCOL_41 |
		ServerCapabilities.CLIENT_TRANSACTIONS |
		ServerCapabilities.CLIENT_MULTI_RESULTS |
		ServerCapabilities.CLIENT_SECURE_CONNECTION |
		(ServerCapabilities.CLIENT_LONG_FLAG & packet.serverCapabilities) |
		(ServerCapabilities.CLIENT_PLUGIN_AUTH_LENENC_CLIENT_DATA & packet.serverCapabilities) |
		(ServerCapabilities.CLIENT_DEPRECATE_EOF & packet.serverCapabilities);
	if (packet.serverCapabilities & ServerCapabilities.CLIENT_PLUGIN_AUTH) {
		const writer = new BufferWriter(new Uint8Array(1000));
		writer
			.writeUint32(clientParam)
			.writeUint32(2 ** 24 - 1)
			.write(Charset.UTF8_GENERAL_CI)
			.skip(23)
			.writeNullTerminatedString(params.username);
		if (params.password) {
			const authData = auth(packet.authPluginName, params.password, packet.seed);
			if (
				clientParam & ServerCapabilities.CLIENT_PLUGIN_AUTH_LENENC_CLIENT_DATA ||
				clientParam & ServerCapabilities.CLIENT_SECURE_CONNECTION
			) {
				writer.write(authData.length);
				writer.writeBuffer(authData);
			} else {
				writer.writeBuffer(authData);
				writer.write(0);
			}
		} else {
			writer.write(0);
		}
		if (clientParam & ServerCapabilities.CLIENT_CONNECT_WITH_DB && params.db) {
			writer.writeNullTerminatedString(params.db);
		}
		if (clientParam & ServerCapabilities.CLIENT_PLUGIN_AUTH) {
			writer.writeNullTerminatedString(packet.authPluginName);
		}
		return writer.wroteData;
	}
	return Uint8Array.from([]);
}
function buildQuery(sql, params = []) {
	const data = encode2(replaceParams(sql, params));
	const writer = new BufferWriter(new Uint8Array(data.length + 1));
	writer.write(3);
	writer.writeBuffer(data);
	return writer.buffer;
}
var PacketType;
(function (PacketType) {
	PacketType[(PacketType['OK_Packet'] = 0)] = 'OK_Packet';
	PacketType[(PacketType['EOF_Packet'] = 254)] = 'EOF_Packet';
	PacketType[(PacketType['ERR_Packet'] = 255)] = 'ERR_Packet';
	PacketType[(PacketType['Result'] = 256)] = 'Result';
})(PacketType || (PacketType = {}));
class SendPacket {
	body;
	header;
	constructor(body, no) {
		this.body = body;
		this.header = {
			size: body.length,
			no,
		};
	}
	async send(conn) {
		const body = this.body;
		const data = new BufferWriter(new Uint8Array(4 + body.length));
		data.writeUints(3, this.header.size);
		data.write(this.header.no);
		data.writeBuffer(body);
		logger.debug(`send: ${data.length}B \n${format(data.buffer)}\n`);
		try {
			let wrote = 0;
			do {
				wrote += await conn.write(data.buffer.subarray(wrote));
			} while (wrote < data.length);
		} catch (error) {
			throw new WriteError(error.message);
		}
	}
}
class ReceivePacket {
	header;
	body;
	type;
	async parse(reader) {
		const header = new BufferReader(new Uint8Array(4));
		let readCount = 0;
		let nread = await this.read(reader, header.buffer);
		if (nread === null) return null;
		readCount = nread;
		const bodySize = header.readUints(3);
		this.header = {
			size: bodySize,
			no: header.readUint8(),
		};
		this.body = new BufferReader(new Uint8Array(bodySize));
		nread = await this.read(reader, this.body.buffer);
		if (nread === null) return null;
		readCount += nread;
		const { OK_Packet, ERR_Packet, EOF_Packet, Result } = PacketType;
		switch (this.body.buffer[0]) {
			case OK_Packet:
				this.type = OK_Packet;
				break;
			case 255:
				this.type = ERR_Packet;
				break;
			case 254:
				this.type = EOF_Packet;
				break;
			default:
				this.type = Result;
				break;
		}
		debug1(() => {
			const data = new Uint8Array(readCount);
			data.set(header.buffer);
			data.set(this.body.buffer, 4);
			logger.debug(
				`receive: ${readCount}B, size = ${this.header.size}, no = ${this.header.no} \n${format(
					data
				)}\n`
			);
		});
		return this;
	}
	async read(reader, buffer) {
		const size = buffer.length;
		let haveRead = 0;
		while (haveRead < size) {
			const nread = await reader.read(buffer.subarray(haveRead));
			if (nread === null) return null;
			haveRead += nread;
		}
		return haveRead;
	}
}
function parseError(reader, conn) {
	const code = reader.readUint16();
	const packet = {
		code,
		message: '',
	};
	if (conn.capabilities & ServerCapabilities.CLIENT_PROTOCOL_41) {
		packet.sqlStateMarker = reader.readUint8();
		packet.sqlState = reader.readUints(5);
	}
	packet.message = reader.readNullTerminatedString();
	return packet;
}
function parseHandshake(reader) {
	const protocolVersion = reader.readUint8();
	const serverVersion = reader.readNullTerminatedString();
	const threadId = reader.readUint32();
	const seedWriter = new BufferWriter(new Uint8Array(20));
	seedWriter.writeBuffer(reader.readBuffer(8));
	reader.skip(1);
	let serverCapabilities = reader.readUint16();
	let characterSet = 0,
		statusFlags = 0,
		authPluginDataLength = 0,
		authPluginName = '';
	if (!reader.finished) {
		characterSet = reader.readUint8();
		statusFlags = reader.readUint16();
		serverCapabilities |= reader.readUint16() << 16;
		if ((serverCapabilities & ServerCapabilities.CLIENT_PLUGIN_AUTH) != 0) {
			authPluginDataLength = reader.readUint8();
		} else {
			reader.skip(1);
		}
		reader.skip(10);
		if ((serverCapabilities & ServerCapabilities.CLIENT_SECURE_CONNECTION) != 0) {
			seedWriter.writeBuffer(reader.readBuffer(Math.max(13, authPluginDataLength - 8)));
		}
		if ((serverCapabilities & ServerCapabilities.CLIENT_PLUGIN_AUTH) != 0) {
			authPluginName = reader.readNullTerminatedString();
		}
	}
	return {
		protocolVersion,
		serverVersion,
		threadId,
		seed: seedWriter.buffer,
		serverCapabilities,
		characterSet,
		statusFlags,
		authPluginName,
	};
}
var AuthResult;
(function (AuthResult) {
	AuthResult[(AuthResult['AuthPassed'] = 0)] = 'AuthPassed';
	AuthResult[(AuthResult['MethodMismatch'] = 1)] = 'MethodMismatch';
	AuthResult[(AuthResult['AuthMoreRequired'] = 2)] = 'AuthMoreRequired';
})(AuthResult || (AuthResult = {}));
function parseAuth(packet) {
	switch (packet.type) {
		case PacketType.EOF_Packet:
			return AuthResult.MethodMismatch;
		case PacketType.Result:
			return AuthResult.AuthMoreRequired;
		case PacketType.OK_Packet:
			return AuthResult.AuthPassed;
		default:
			return AuthResult.AuthPassed;
	}
}
function parseField(reader) {
	const catalog = reader.readLenCodeString();
	const schema = reader.readLenCodeString();
	const table = reader.readLenCodeString();
	const originTable = reader.readLenCodeString();
	const name = reader.readLenCodeString();
	const originName = reader.readLenCodeString();
	reader.skip(1);
	const encoding = reader.readUint16();
	const fieldLen = reader.readUint32();
	const fieldType = reader.readUint8();
	const fieldFlag = reader.readUint16();
	const decimals = reader.readUint8();
	reader.skip(1);
	const defaultVal = reader.readLenCodeString();
	return {
		catalog,
		schema,
		table,
		originName,
		fieldFlag,
		originTable,
		fieldLen,
		name,
		fieldType,
		encoding,
		decimals,
		defaultVal,
	};
}
function parseRow(reader, fields) {
	const row = {};
	for (const field of fields) {
		const name = field.name;
		const val = reader.readLenCodeString();
		row[name] = val === null ? null : convertType(field, val);
	}
	return row;
}
function convertType(field, val) {
	const { fieldType, fieldLen } = field;
	switch (fieldType) {
		case 0:
		case 5:
		case 4:
		case 18:
			return parseFloat(val);
		case 246:
			return val;
		case 1:
		case 2:
		case 3:
		case 9:
			return parseInt(val);
		case 8:
			if (Number(val) < Number.MIN_SAFE_INTEGER || Number(val) > Number.MAX_SAFE_INTEGER) {
				return BigInt(val);
			} else {
				return parseInt(val);
			}
		case 15:
		case 253:
		case 254:
		case 11:
		case 19:
			return val;
		case 10:
		case 7:
		case 12:
		case 14:
		case 17:
		case 18:
			return new Date(val);
		default:
			return val;
	}
}
function power_mod(n, p, m) {
	if (p === 1n) return n;
	if (p % 2n === 0n) {
		const t = power_mod(n, p >> 1n, m);
		return (t * t) % m;
	} else {
		const t = power_mod(n, p >> 1n, m);
		return (t * t * n) % m;
	}
}
const base64abc1 = [
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
function encode3(data) {
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
		result += base64abc1[uint8[i - 2] >> 2];
		result += base64abc1[((uint8[i - 2] & 3) << 4) | (uint8[i - 1] >> 4)];
		result += base64abc1[((uint8[i - 1] & 15) << 2) | (uint8[i] >> 6)];
		result += base64abc1[uint8[i] & 63];
	}
	if (i === l + 1) {
		result += base64abc1[uint8[i - 2] >> 2];
		result += base64abc1[(uint8[i - 2] & 3) << 4];
		result += '==';
	}
	if (i === l) {
		result += base64abc1[uint8[i - 2] >> 2];
		result += base64abc1[((uint8[i - 2] & 3) << 4) | (uint8[i - 1] >> 4)];
		result += base64abc1[(uint8[i - 1] & 15) << 2];
		result += '=';
	}
	return result;
}
function decode2(b64) {
	const binString = atob(b64);
	const size = binString.length;
	const bytes = new Uint8Array(size);
	for (let i = 0; i < size; i++) {
		bytes[i] = binString.charCodeAt(i);
	}
	return bytes;
}
let cachedTextDecoder1 = new TextDecoder('utf-8', {
	ignoreBOM: true,
	fatal: true,
});
cachedTextDecoder1.decode();
let cachegetUint8Memory01 = null;
function getUint8Memory01() {
	if (cachegetUint8Memory01 === null || cachegetUint8Memory01.buffer !== wasm1.memory.buffer) {
		cachegetUint8Memory01 = new Uint8Array(wasm1.memory.buffer);
	}
	return cachegetUint8Memory01;
}
function getStringFromWasm01(ptr, len) {
	return cachedTextDecoder1.decode(getUint8Memory01().subarray(ptr, ptr + len));
}
const heap1 = new Array(32).fill(undefined);
heap1.push(undefined, null, true, false);
let heap_next1 = heap1.length;
function addHeapObject1(obj) {
	if (heap_next1 === heap1.length) heap1.push(heap1.length + 1);
	const idx = heap_next1;
	heap_next1 = heap1[idx];
	heap1[idx] = obj;
	return idx;
}
function getObject1(idx) {
	return heap1[idx];
}
function dropObject1(idx) {
	if (idx < 36) return;
	heap1[idx] = heap_next1;
	heap_next1 = idx;
}
function takeObject1(idx) {
	const ret = getObject1(idx);
	dropObject1(idx);
	return ret;
}
let WASM_VECTOR_LEN1 = 0;
let cachedTextEncoder1 = new TextEncoder('utf-8');
const encodeString1 = function (arg, view) {
	return cachedTextEncoder1.encodeInto(arg, view);
};
function passStringToWasm01(arg, malloc, realloc) {
	if (realloc === undefined) {
		const buf = cachedTextEncoder1.encode(arg);
		const ptr = malloc(buf.length);
		getUint8Memory01()
			.subarray(ptr, ptr + buf.length)
			.set(buf);
		WASM_VECTOR_LEN1 = buf.length;
		return ptr;
	}
	let len = arg.length;
	let ptr = malloc(len);
	const mem = getUint8Memory01();
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
		const view = getUint8Memory01().subarray(ptr + offset, ptr + len);
		const ret = encodeString1(arg, view);
		offset += ret.written;
	}
	WASM_VECTOR_LEN1 = offset;
	return ptr;
}
function create_hash1(algorithm) {
	var ptr0 = passStringToWasm01(algorithm, wasm1.__wbindgen_malloc, wasm1.__wbindgen_realloc);
	var len0 = WASM_VECTOR_LEN1;
	var ret = wasm1.create_hash(ptr0, len0);
	return DenoHash1.__wrap(ret);
}
function _assertClass1(instance, klass) {
	if (!(instance instanceof klass)) {
		throw new Error(`expected instance of ${klass.name}`);
	}
	return instance.ptr;
}
function passArray8ToWasm01(arg, malloc) {
	const ptr = malloc(arg.length * 1);
	getUint8Memory01().set(arg, ptr / 1);
	WASM_VECTOR_LEN1 = arg.length;
	return ptr;
}
function update_hash1(hash, data) {
	_assertClass1(hash, DenoHash1);
	var ptr0 = passArray8ToWasm01(data, wasm1.__wbindgen_malloc);
	var len0 = WASM_VECTOR_LEN1;
	wasm1.update_hash(hash.ptr, ptr0, len0);
}
let cachegetInt32Memory01 = null;
function getInt32Memory01() {
	if (cachegetInt32Memory01 === null || cachegetInt32Memory01.buffer !== wasm1.memory.buffer) {
		cachegetInt32Memory01 = new Int32Array(wasm1.memory.buffer);
	}
	return cachegetInt32Memory01;
}
function getArrayU8FromWasm01(ptr, len) {
	return getUint8Memory01().subarray(ptr / 1, ptr / 1 + len);
}
function digest_hash1(hash) {
	try {
		const retptr = wasm1.__wbindgen_add_to_stack_pointer(-16);
		_assertClass1(hash, DenoHash1);
		wasm1.digest_hash(retptr, hash.ptr);
		var r0 = getInt32Memory01()[retptr / 4 + 0];
		var r1 = getInt32Memory01()[retptr / 4 + 1];
		var v0 = getArrayU8FromWasm01(r0, r1).slice();
		wasm1.__wbindgen_free(r0, r1 * 1);
		return v0;
	} finally {
		wasm1.__wbindgen_add_to_stack_pointer(16);
	}
}
const DenoHashFinalization1 = new FinalizationRegistry(ptr => wasm1.__wbg_denohash_free(ptr));
class DenoHash1 {
	static __wrap(ptr) {
		const obj = Object.create(DenoHash1.prototype);
		obj.ptr = ptr;
		DenoHashFinalization1.register(obj, obj.ptr, obj);
		return obj;
	}
	__destroy_into_raw() {
		const ptr = this.ptr;
		this.ptr = 0;
		DenoHashFinalization1.unregister(this);
		return ptr;
	}
	free() {
		const ptr = this.__destroy_into_raw();
		wasm1.__wbg_denohash_free(ptr);
	}
}
const imports1 = {
	__wbindgen_placeholder__: {
		__wbindgen_string_new: function (arg0, arg1) {
			var ret = getStringFromWasm01(arg0, arg1);
			return addHeapObject1(ret);
		},
		__wbindgen_throw: function (arg0, arg1) {
			throw new Error(getStringFromWasm01(arg0, arg1));
		},
		__wbindgen_rethrow: function (arg0) {
			throw takeObject1(arg0);
		},
	},
};
import wasmModule1 from './62edfb469c0dbacd90273cf9a0d7a478.wasm';
const wasmInstance1 = new WebAssembly.Instance(wasmModule1, imports1);
const wasm1 = wasmInstance1.exports;
const hexTable1 = new TextEncoder().encode('0123456789abcdef');
function encode4(src) {
	const dst = new Uint8Array(src.length * 2);
	for (let i = 0; i < dst.length; i++) {
		const v = src[i];
		dst[i * 2] = hexTable1[v >> 4];
		dst[i * 2 + 1] = hexTable1[v & 15];
	}
	return dst;
}
class Hash1 {
	#hash;
	#digested;
	constructor(algorithm) {
		this.#hash = create_hash1(algorithm);
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
			update_hash1(
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
		return digest_hash1(this.#hash);
	}
	toString(format = 'hex') {
		const finalized = new Uint8Array(this.digest());
		switch (format) {
			case 'hex':
				return new TextDecoder().decode(encode4(finalized));
			case 'base64':
				return encode3(finalized);
			default:
				throw new Error('hash: invalid format');
		}
	}
}
function createHash1(algorithm) {
	return new Hash1(algorithm);
}
function i2osp(x, length) {
	const t = new Uint8Array(length);
	for (let i = length - 1; i >= 0; i--) {
		if (x === 0n) break;
		t[i] = Number(x & 255n);
		x = x >> 8n;
	}
	return t;
}
function os2ip(m) {
	let n = 0n;
	for (const c of m) n = (n << 8n) + BigInt(c);
	return n;
}
function mgf1(seed, length, hash) {
	let counter = 0n;
	let output = [];
	while (output.length < length) {
		let h;
		const c = i2osp(counter, 4);
		if (typeof hash === 'function') {
			h = hash(new Uint8Array([...seed, ...c]));
		} else {
			h = new Uint8Array(
				createHash1(hash)
					.update(new Uint8Array([...seed, ...c]))
					.digest()
			);
		}
		output = [...output, ...h];
		counter++;
	}
	return new Uint8Array(output.slice(0, length));
}
function str2bytes(str) {
	const encoder = new TextEncoder();
	return encoder.encode(str);
}
function xor1(a, b) {
	const c = new Uint8Array(a.length);
	for (let i = 0; i < c.length; i++) {
		c[i] = a[i] ^ b[i % b.length];
	}
	return c;
}
function concat(...arg) {
	const length = arg.reduce((a, b) => a + b.length, 0);
	const c = new Uint8Array(length);
	let ptr = 0;
	for (let i = 0; i < arg.length; i++) {
		c.set(arg[i], ptr);
		ptr += arg[i].length;
	}
	return c;
}
function random_bytes(length) {
	const n = new Uint8Array(length);
	for (let i = 0; i < length; i++) n[i] = ((Math.random() * 254) | 0) + 1;
	return n;
}
function get_key_size(n) {
	const size_list = [64n, 128n, 256n, 512n, 1024n];
	for (const size of size_list) {
		if (n < 1n << (size * 8n)) return Number(size);
	}
	return 2048;
}
function base64_to_binary(b) {
	const base64_map = [
		-2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -1, -2, -2, -1, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2,
		-2, -2, -2, -2, -2, -2, -2, -2, -1, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, 62, -2, -2, -2, 63,
		52, 53, 54, 55, 56, 57, 58, 59, 60, 61, -2, -2, -2, -1, -2, -2, -2, 0, 1, 2, 3, 4, 5, 6, 7, 8,
		9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, -2, -2, -2, -2, -2, -2, 26,
		27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50,
		51, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2,
		-2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2,
		-2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2,
		-2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2,
		-2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2,
		-2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2,
	];
	let e = '';
	for (const c of b) {
		const v = base64_map[c.charCodeAt(0)];
		if (v === -2) throw 'Invalid';
		if (v >= 0) e += c;
	}
	const bytes = new Uint8Array(Math.floor((e.length * 6) / 8));
	let ptr = 0;
	for (let i = 0; i < e.length; i += 4) {
		const remain = e.length - i;
		if (remain >= 4) {
			const v =
				(base64_map[e.charCodeAt(i)] << 18) +
				(base64_map[e.charCodeAt(i + 1)] << 12) +
				(base64_map[e.charCodeAt(i + 2)] << 6) +
				base64_map[e.charCodeAt(i + 3)];
			bytes[ptr++] = v >> 16 % 256;
			bytes[ptr++] = v >> 8 % 256;
			bytes[ptr++] = v % 256;
		} else if (remain === 3) {
			const v =
				(base64_map[e.charCodeAt(i)] << 10) +
				(base64_map[e.charCodeAt(i + 1)] << 4) +
				(base64_map[e.charCodeAt(i + 2)] >> 2);
			bytes[ptr++] = v >> 8 % 256;
			bytes[ptr++] = v % 256;
		} else if (remain === 2) {
			bytes[ptr++] = (base64_map[e.charCodeAt(i)] << 2) + (base64_map[e.charCodeAt(i + 1)] >> 4);
		}
	}
	return bytes;
}
function eme_oaep_encode(label, m, k, algorithm) {
	const labelHash = new Uint8Array(createHash1(algorithm).update(label).digest());
	const ps = new Uint8Array(k - labelHash.length * 2 - 2 - m.length);
	const db = concat(labelHash, ps, [1], m);
	const seed = random_bytes(labelHash.length);
	const dbMask = mgf1(seed, k - labelHash.length - 1, algorithm);
	const maskedDb = xor1(db, dbMask);
	const seedMask = mgf1(maskedDb, labelHash.length, algorithm);
	const maskedSeed = xor1(seed, seedMask);
	return concat([0], maskedSeed, maskedDb);
}
function eme_oaep_decode(label, c, k, algorithm) {
	const labelHash = new Uint8Array(createHash1(algorithm).update(label).digest());
	const maskedSeed = c.slice(1, 1 + labelHash.length);
	const maskedDb = c.slice(1 + labelHash.length);
	const seedMask = mgf1(maskedDb, labelHash.length, algorithm);
	const seed = xor1(maskedSeed, seedMask);
	const dbMask = mgf1(seed, k - labelHash.length - 1, algorithm);
	const db = xor1(maskedDb, dbMask);
	let ptr = labelHash.length;
	while (ptr < db.length && db[ptr] === 0) ptr++;
	return db.slice(ptr + 1);
}
function rsaep(n, e, m) {
	return power_mod(m, e, n);
}
function rsadp(n, d, c) {
	return power_mod(c, d, n);
}
function rsa_oaep_encrypt(bytes, n, e, m, algorithm) {
	const em = eme_oaep_encode(new Uint8Array(0), m, bytes, algorithm);
	const msg = os2ip(em);
	const c = rsaep(n, e, msg);
	return i2osp(c, bytes);
}
function rsa_oaep_decrypt(bytes, n, d, c, algorithm) {
	const em = rsadp(n, d, os2ip(c));
	const m = eme_oaep_decode(new Uint8Array(0), i2osp(em, bytes), bytes, algorithm);
	return m;
}
function rsa_pkcs1_encrypt(bytes, n, e, m) {
	const p = concat([0, 2], random_bytes(bytes - m.length - 3), [0], m);
	const msg = os2ip(p);
	const c = rsaep(n, e, msg);
	return i2osp(c, bytes);
}
function rsa_pkcs1_decrypt(bytes, n, d, c) {
	const em = i2osp(rsadp(n, d, os2ip(c)), bytes);
	if (em[0] !== 0) throw 'Decryption error';
	if (em[1] !== 2) throw 'Decryption error';
	let psCursor = 2;
	for (; psCursor < em.length; psCursor++) {
		if (em[psCursor] === 0) break;
	}
	if (psCursor < 10) throw 'Decryption error';
	return em.slice(psCursor + 1);
}
function ber_decode(bytes, from, to) {
	return ber_next(bytes);
}
function ber_sequence(bytes, from, length) {
	const end = from + length;
	let res = [];
	let ptr = from;
	while (ptr < end) {
		const next = ber_next(bytes, ptr);
		res.push(next);
		ptr += next.totalLength;
	}
	return res;
}
function ber_integer(bytes, from, length) {
	let n = 0n;
	for (const b of bytes.slice(from, from + length)) {
		n = (n << 8n) + BigInt(b);
	}
	return n;
}
function ber_oid(bytes, from, length) {
	const id = [(bytes[from] / 40) | 0, bytes[from] % 40];
	let value = 0;
	for (const b of bytes.slice(from + 1, from + length)) {
		if (b > 128) value += value * 127 + (b - 128);
		else {
			value = value * 128 + b;
			id.push(value);
			value = 0;
		}
	}
	return id.join('.');
}
function ber_unknown(bytes, from, length) {
	return bytes.slice(from, from + length);
}
function ber_simple(n) {
	if (Array.isArray(n.value)) return n.value.map(x => ber_simple(x));
	return n.value;
}
function ber_next(bytes, from, to) {
	if (!from) from = 0;
	if (!to) to = bytes.length;
	let ptr = from;
	const type = bytes[ptr++];
	let size = bytes[ptr++];
	if ((size & 128) > 0) {
		let ext = size - 128;
		size = 0;
		while (--ext >= 0) {
			size = (size << 8) + bytes[ptr++];
		}
	}
	let value = null;
	if (type === 48) {
		value = ber_sequence(bytes, ptr, size);
	} else if (type === 2) {
		value = ber_integer(bytes, ptr, size);
	} else if (type === 3) {
		value = ber_sequence(bytes, ptr + 1, size - 1);
	} else if (type === 5) {
		value = null;
	} else if (type === 6) {
		value = ber_oid(bytes, ptr, size);
	} else {
		value = ber_unknown(bytes, ptr, size);
	}
	return {
		totalLength: ptr - from + size,
		type,
		length: size,
		value,
	};
}
class RSA {
	static encrypt(message, key, options) {
		if (!key.e) throw 'Invalid RSA key';
		const computedOptions = {
			hash: 'sha1',
			padding: 'oaep',
			...options,
		};
		const computedMessage = typeof message === 'string' ? str2bytes(message) : message;
		if (computedOptions.padding === 'oaep') {
			return rsa_oaep_encrypt(key.length, key.n, key.e, computedMessage, computedOptions.hash);
		} else if (computedOptions.padding === 'pkcs1') {
			return rsa_pkcs1_encrypt(key.length, key.n, key.e, computedMessage);
		}
		throw 'Invalid parameters';
	}
	static decrypt(ciper, key, options) {
		if (!key.d) throw 'Invalid RSA key';
		const computedOptions = {
			hash: 'sha1',
			padding: 'oaep',
			...options,
		};
		if (computedOptions.padding === 'oaep') {
			return rsa_oaep_decrypt(key.length, key.n, key.d, ciper, computedOptions.hash);
		} else if (computedOptions.padding === 'pkcs1') {
			return rsa_pkcs1_decrypt(key.length, key.n, key.d, ciper);
		}
		throw 'Invalid parameters';
	}
	static parseKey(key) {
		if (key.indexOf('-----BEGIN RSA PRIVATE KEY-----') === 0) {
			const trimmedKey = key.substr(31, key.length - 61);
			const parseKey = ber_simple(ber_decode(base64_to_binary(trimmedKey)));
			return {
				n: parseKey[1],
				d: parseKey[3],
				e: parseKey[2],
				length: get_key_size(parseKey[1]),
			};
		} else if (key.indexOf('-----BEGIN PUBLIC KEY-----') === 0) {
			const trimmedKey = key.substr(26, key.length - 51);
			const parseKey = ber_simple(ber_decode(base64_to_binary(trimmedKey)));
			return {
				length: get_key_size(parseKey[1][0][0]),
				n: parseKey[1][0][0],
				e: parseKey[1][0][1],
			};
		}
		throw 'Invalid key format';
	}
}
function encryptWithPublicKey(key, data) {
	const publicKey = RSA.parseKey(key);
	return RSA.encrypt(data, publicKey);
}
let scramble, password;
function start(scramble_, password_) {
	scramble = scramble_;
	password = password_;
	return {
		done: false,
		next: authMoreResponse,
	};
}
function authMoreResponse(packet) {
	var AuthStatusFlags;
	(function (AuthStatusFlags) {
		AuthStatusFlags[(AuthStatusFlags['FullAuth'] = 4)] = 'FullAuth';
		AuthStatusFlags[(AuthStatusFlags['FastPath'] = 3)] = 'FastPath';
	})(AuthStatusFlags || (AuthStatusFlags = {}));
	const REQUEST_PUBLIC_KEY = 2;
	const statusFlag = packet.body.skip(1).readUint8();
	let authMoreData,
		done = true,
		next,
		quickRead = false;
	if (statusFlag === AuthStatusFlags.FullAuth) {
		authMoreData = new Uint8Array([REQUEST_PUBLIC_KEY]);
		done = false;
		next = encryptWithKey;
	}
	if (statusFlag === AuthStatusFlags.FastPath) {
		done = false;
		quickRead = true;
		next = terminate;
	}
	return {
		done,
		next,
		quickRead,
		data: authMoreData,
	};
}
function encryptWithKey(packet) {
	const publicKey = parsePublicKey(packet);
	const len = password.length;
	let passwordBuffer = new Uint8Array(len + 1);
	for (let n = 0; n < len; n++) {
		passwordBuffer[n] = password.charCodeAt(n);
	}
	passwordBuffer[len] = 0;
	const encryptedPassword = encrypt(passwordBuffer, scramble, publicKey);
	return {
		done: false,
		next: terminate,
		data: encryptedPassword,
	};
}
function parsePublicKey(packet) {
	return packet.body.skip(1).readNullTerminatedString();
}
function encrypt(password, scramble, key) {
	const stage1 = xor(password, scramble);
	const encrypted = encryptWithPublicKey(key, stage1);
	return encrypted;
}
function terminate() {
	return {
		done: true,
	};
}
const mod1 = {
	start: start,
};
const __default = {
	caching_sha2_password: mod1,
};
var ConnectionState;
(function (ConnectionState) {
	ConnectionState[(ConnectionState['CONNECTING'] = 0)] = 'CONNECTING';
	ConnectionState[(ConnectionState['CONNECTED'] = 1)] = 'CONNECTED';
	ConnectionState[(ConnectionState['CLOSING'] = 2)] = 'CLOSING';
	ConnectionState[(ConnectionState['CLOSED'] = 3)] = 'CLOSED';
})(ConnectionState || (ConnectionState = {}));
class Connection1 {
	config;
	state = ConnectionState.CONNECTING;
	capabilities = 0;
	serverVersion = '';
	conn = undefined;
	_timedOut = false;
	get remoteAddr() {
		return this.config.socketPath
			? `unix:${this.config.socketPath}`
			: `${this.config.hostname}:${this.config.port}`;
	}
	constructor(config) {
		this.config = config;
	}
	async _connect() {
		const { hostname, port = 3306, socketPath, username = '', password } = this.config;
		logger.info(`connecting ${this.remoteAddr}`);
		this.conn = !socketPath
			? await Deno.connect({
					transport: 'tcp',
					hostname,
					port,
			  })
			: await Deno.connect({
					transport: 'unix',
					path: socketPath,
			  });
		try {
			let receive = await this.nextPacket();
			const handshakePacket = parseHandshake(receive.body);
			const data = buildAuth(handshakePacket, {
				username,
				password,
				db: this.config.db,
			});
			await new SendPacket(data, 1).send(this.conn);
			this.state = ConnectionState.CONNECTING;
			this.serverVersion = handshakePacket.serverVersion;
			this.capabilities = handshakePacket.serverCapabilities;
			receive = await this.nextPacket();
			const authResult = parseAuth(receive);
			let handler;
			switch (authResult) {
				case AuthResult.AuthMoreRequired:
					const adaptedPlugin = __default[handshakePacket.authPluginName];
					handler = adaptedPlugin;
					break;
				case AuthResult.MethodMismatch:
					throw new Error('Currently cannot support auth method mismatch!');
			}
			let result;
			if (handler) {
				result = handler.start(handshakePacket.seed, password);
				while (!result.done) {
					if (result.data) {
						const sequenceNumber = receive.header.no + 1;
						await new SendPacket(result.data, sequenceNumber).send(this.conn);
						receive = await this.nextPacket();
					}
					if (result.quickRead) {
						await this.nextPacket();
					}
					if (result.next) {
						result = result.next(receive);
					}
				}
			}
			const header = receive.body.readUint8();
			if (header === 255) {
				const error = parseError(receive.body, this);
				logger.error(`connect error(${error.code}): ${error.message}`);
				this.close();
				throw new Error(error.message);
			} else {
				logger.info(`connected to ${this.remoteAddr}`);
				this.state = ConnectionState.CONNECTED;
			}
			if (this.config.charset) {
				await this.execute(`SET NAMES ${this.config.charset}`);
			}
		} catch (error) {
			this.close();
			throw error;
		}
	}
	async connect() {
		await this._connect();
	}
	async nextPacket() {
		if (!this.conn) {
			throw new ConnnectionError('Not connected');
		}
		const timeoutTimer = this.config.timeout
			? setTimeout(this._timeoutCallback, this.config.timeout)
			: null;
		let packet;
		try {
			packet = await new ReceivePacket().parse(this.conn);
		} catch (error) {
			if (this._timedOut) {
				throw new ResponseTimeoutError('Connection read timed out');
			}
			timeoutTimer && clearTimeout(timeoutTimer);
			this.close();
			throw error;
		}
		timeoutTimer && clearTimeout(timeoutTimer);
		if (!packet) {
			this.close();
			throw new ReadError('Connection closed unexpectedly');
		}
		if (packet.type === PacketType.ERR_Packet) {
			packet.body.skip(1);
			const error = parseError(packet.body, this);
			throw new Error(error.message);
		}
		return packet;
	}
	_timeoutCallback = () => {
		logger.info('connection read timed out');
		this._timedOut = true;
		this.close();
	};
	lessThan5_7() {
		const version = this.serverVersion;
		if (!version.includes('MariaDB')) return version < '5.7.0';
		const segments = version.split('-');
		if (segments[1] === 'MariaDB') return segments[0] < '5.7.0';
		return false;
	}
	isMariaDBAndVersion10_0Or10_1() {
		const version = this.serverVersion;
		if (!version.includes('MariaDB')) return false;
		return version.includes('5.5.5-10.1') || version.includes('5.5.5-10.0');
	}
	close() {
		if (this.state != ConnectionState.CLOSED) {
			logger.info('close connection');
			this.conn?.close();
			this.state = ConnectionState.CLOSED;
		}
	}
	async query(sql, params) {
		const result = await this.execute(sql, params);
		if (result && result.rows) {
			return result.rows;
		} else {
			return result;
		}
	}
	async execute(sql, params, iterator = false) {
		if (this.state != ConnectionState.CONNECTED) {
			if (this.state == ConnectionState.CLOSED) {
				throw new ConnnectionError('Connection is closed');
			} else {
				throw new ConnnectionError('Must be connected first');
			}
		}
		const data = buildQuery(sql, params);
		try {
			await new SendPacket(data, 0).send(this.conn);
			let receive = await this.nextPacket();
			if (receive.type === PacketType.OK_Packet) {
				receive.body.skip(1);
				return {
					affectedRows: receive.body.readEncodedLen(),
					lastInsertId: receive.body.readEncodedLen(),
				};
			} else if (receive.type !== PacketType.Result) {
				throw new ProtocolError();
			}
			let fieldCount = receive.body.readEncodedLen();
			const fields = [];
			while (fieldCount--) {
				const packet = await this.nextPacket();
				if (packet) {
					const field = parseField(packet.body);
					fields.push(field);
				}
			}
			const rows = [];
			if (this.lessThan5_7() || this.isMariaDBAndVersion10_0Or10_1()) {
				receive = await this.nextPacket();
				if (receive.type !== PacketType.EOF_Packet) {
					throw new ProtocolError();
				}
			}
			if (!iterator) {
				while (true) {
					receive = await this.nextPacket();
					if (receive.type === PacketType.EOF_Packet) {
						break;
					} else {
						const row = parseRow(receive.body, fields);
						rows.push(row);
					}
				}
				return {
					rows,
					fields,
				};
			}
			return {
				fields,
				iterator: this.buildIterator(fields),
			};
		} catch (error) {
			this.close();
			throw error;
		}
	}
	buildIterator(fields) {
		const next = async () => {
			const receive = await this.nextPacket();
			if (receive.type === PacketType.EOF_Packet) {
				return {
					done: true,
				};
			}
			const value = parseRow(receive.body, fields);
			return {
				done: false,
				value,
			};
		};
		return {
			[Symbol.asyncIterator]: () => {
				return {
					next,
				};
			},
		};
	}
}
class DeferredStack {
	_maxSize;
	_array;
	creator;
	_queue = [];
	_size = 0;
	constructor(_maxSize, _array = [], creator) {
		this._maxSize = _maxSize;
		this._array = _array;
		this.creator = creator;
		this._size = _array.length;
	}
	get size() {
		return this._size;
	}
	get maxSize() {
		return this._maxSize;
	}
	get available() {
		return this._array.length;
	}
	async pop() {
		if (this._array.length) {
			return this._array.pop();
		} else if (this._size < this._maxSize) {
			this._size++;
			let item;
			try {
				item = await this.creator();
			} catch (err) {
				this._size--;
				throw err;
			}
			return item;
		}
		const defer = deferred();
		this._queue.push(defer);
		return await defer;
	}
	push(item) {
		if (this._queue.length) {
			this._queue.shift().resolve(item);
			return false;
		} else {
			this._array.push(item);
			return true;
		}
	}
	tryPopAvailable() {
		return this._array.pop();
	}
	remove(item) {
		const index = this._array.indexOf(item);
		if (index < 0) return false;
		this._array.splice(index, 1);
		this._size--;
		return true;
	}
	reduceSize() {
		this._size--;
	}
}
class PoolConnection extends Connection1 {
	_pool = undefined;
	_idleTimer = undefined;
	_idle = false;
	enterIdle() {
		this._idle = true;
		if (this.config.idleTimeout) {
			this._idleTimer = setTimeout(() => {
				logger.info('connection idle timeout');
				this._pool.remove(this);
				try {
					this.close();
				} catch (error) {
					logger.warning(`error closing idle connection`, error);
				}
			}, this.config.idleTimeout);
		}
	}
	exitIdle() {
		this._idle = false;
		if (this._idleTimer !== undefined) {
			clearTimeout(this._idleTimer);
		}
	}
	removeFromPool() {
		this._pool.reduceSize();
		this._pool = undefined;
	}
	returnToPool() {
		this._pool?.push(this);
	}
}
class ConnectionPool {
	_deferred;
	_connections = [];
	_closed = false;
	constructor(maxSize, creator) {
		this._deferred = new DeferredStack(maxSize, this._connections, async () => {
			const conn = await creator();
			conn._pool = this;
			return conn;
		});
	}
	get info() {
		return {
			size: this._deferred.size,
			maxSize: this._deferred.maxSize,
			available: this._deferred.available,
		};
	}
	push(conn) {
		if (this._closed) {
			conn.close();
			this.reduceSize();
		}
		if (this._deferred.push(conn)) {
			conn.enterIdle();
		}
	}
	async pop() {
		if (this._closed) {
			throw new Error('Connection pool is closed');
		}
		let conn = this._deferred.tryPopAvailable();
		if (conn) {
			conn.exitIdle();
		} else {
			conn = await this._deferred.pop();
		}
		return conn;
	}
	remove(conn) {
		return this._deferred.remove(conn);
	}
	close() {
		this._closed = true;
		let conn;
		while ((conn = this._deferred.tryPopAvailable())) {
			conn.exitIdle();
			conn.close();
			this.reduceSize();
		}
	}
	reduceSize() {
		this._deferred.reduceSize();
	}
}
class Client1 {
	config = {};
	_pool;
	async createConnection() {
		let connection = new PoolConnection(this.config);
		await connection.connect();
		return connection;
	}
	get pool() {
		return this._pool?.info;
	}
	async connect(config) {
		this.config = {
			hostname: '127.0.0.1',
			username: 'root',
			port: 3306,
			poolSize: 1,
			timeout: 30 * 1000,
			idleTimeout: 4 * 3600 * 1000,
			...config,
		};
		Object.freeze(this.config);
		this._pool = new ConnectionPool(this.config.poolSize || 10, this.createConnection.bind(this));
		return this;
	}
	async query(sql, params) {
		return await this.useConnection(async connection => {
			return await connection.query(sql, params);
		});
	}
	async execute(sql, params) {
		return await this.useConnection(async connection => {
			return await connection.execute(sql, params);
		});
	}
	async useConnection(fn) {
		if (!this._pool) {
			throw new Error('Unconnected');
		}
		const connection = await this._pool.pop();
		try {
			return await fn(connection);
		} finally {
			if (connection.state == ConnectionState.CLOSED) {
				connection.removeFromPool();
			} else {
				connection.returnToPool();
			}
		}
	}
	async transaction(processor) {
		return await this.useConnection(async connection => {
			try {
				await connection.execute('BEGIN');
				const result = await processor(connection);
				await connection.execute('COMMIT');
				return result;
			} catch (error) {
				if (connection.state == ConnectionState.CONNECTED) {
					logger.info(`ROLLBACK: ${error.message}`);
					await connection.execute('ROLLBACK');
				}
				throw error;
			}
		});
	}
	async close() {
		if (this._pool) {
			this._pool.close();
			this._pool = undefined;
		}
	}
}
export { Client1 as Client };
export { Connection1 as Connection };
export { configLogger1 as configLogger };
export { mod as log };
