/* @ts-self-types="./visualizer_controller.d.ts" */

function init() {
	wasm.init();
}
exports.init = init;

/**
 * Parse a single workflow source file and return the DAG as a JSON string.
 *
 * # Arguments
 * * `source_code` - The JavaScript/TypeScript source code to parse
 *
 * # Returns
 * A JSON string containing the `ParserResult` envelope (`{"success": true, "v": 1, "workflows": [...]}`)
 * on success, or `{"success": false, "v": 1, "error": "...", "workflows": []}` on failure.
 * @param {string} source_code
 * @returns {string}
 */
function parseDag(source_code) {
	ensureWasm();
	let deferred2_0;
	let deferred2_1;
	try {
		const ptr0 = passStringToWasm0(
			source_code,
			wasm.__wbindgen_malloc,
			wasm.__wbindgen_realloc
		);
		const len0 = WASM_VECTOR_LEN;
		const ret = wasm.parseDag(ptr0, len0);
		deferred2_0 = ret[0];
		deferred2_1 = ret[1];
		return getStringFromWasm0(ret[0], ret[1]);
	} finally {
		wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
	}
}
exports.parseDag = parseDag;

function __wbg_get_imports() {
	const import0 = {
		__proto__: null,
		__wbg_error_7534b8e9a36f1ab4: function (arg0, arg1) {
			let deferred0_0;
			let deferred0_1;
			try {
				deferred0_0 = arg0;
				deferred0_1 = arg1;
				console.error(getStringFromWasm0(arg0, arg1));
			} finally {
				wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
			}
		},
		__wbg_new_8a6f238a6ece86ea: function () {
			const ret = new Error();
			return ret;
		},
		__wbg_stack_0ed75d68575b0f3c: function (arg0, arg1) {
			const ret = arg1.stack;
			const ptr1 = passStringToWasm0(
				ret,
				wasm.__wbindgen_malloc,
				wasm.__wbindgen_realloc
			);
			const len1 = WASM_VECTOR_LEN;
			getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
			getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
		},
		__wbindgen_init_externref_table: function () {
			const table = wasm.__wbindgen_externrefs;
			const offset = table.grow(4);
			table.set(0, undefined);
			table.set(offset + 0, undefined);
			table.set(offset + 1, null);
			table.set(offset + 2, true);
			table.set(offset + 3, false);
		},
	};
	return {
		__proto__: null,
		"./visualizer_controller_bg.js": import0,
	};
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
	if (
		cachedDataViewMemory0 === null ||
		cachedDataViewMemory0.buffer.detached === true ||
		(cachedDataViewMemory0.buffer.detached === undefined &&
			cachedDataViewMemory0.buffer !== wasm.memory.buffer)
	) {
		cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
	}
	return cachedDataViewMemory0;
}

function getStringFromWasm0(ptr, len) {
	ptr = ptr >>> 0;
	return decodeText(ptr, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
	if (
		cachedUint8ArrayMemory0 === null ||
		cachedUint8ArrayMemory0.byteLength === 0
	) {
		cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
	}
	return cachedUint8ArrayMemory0;
}

function passStringToWasm0(arg, malloc, realloc) {
	if (realloc === undefined) {
		const buf = cachedTextEncoder.encode(arg);
		const ptr = malloc(buf.length, 1) >>> 0;
		getUint8ArrayMemory0()
			.subarray(ptr, ptr + buf.length)
			.set(buf);
		WASM_VECTOR_LEN = buf.length;
		return ptr;
	}

	let len = arg.length;
	let ptr = malloc(len, 1) >>> 0;

	const mem = getUint8ArrayMemory0();

	let offset = 0;

	for (; offset < len; offset++) {
		const code = arg.charCodeAt(offset);
		if (code > 0x7f) break;
		mem[ptr + offset] = code;
	}
	if (offset !== len) {
		if (offset !== 0) {
			arg = arg.slice(offset);
		}
		ptr = realloc(ptr, len, (len = offset + arg.length * 3), 1) >>> 0;
		const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
		const ret = cachedTextEncoder.encodeInto(arg, view);

		offset += ret.written;
		ptr = realloc(ptr, len, offset, 1) >>> 0;
	}

	WASM_VECTOR_LEN = offset;
	return ptr;
}

let cachedTextDecoder = new TextDecoder("utf-8", {
	ignoreBOM: true,
	fatal: true,
});
cachedTextDecoder.decode();
function decodeText(ptr, len) {
	return cachedTextDecoder.decode(
		getUint8ArrayMemory0().subarray(ptr, ptr + len)
	);
}

const cachedTextEncoder = new TextEncoder();

if (!("encodeInto" in cachedTextEncoder)) {
	cachedTextEncoder.encodeInto = function (arg, view) {
		const buf = cachedTextEncoder.encode(arg);
		view.set(buf);
		return {
			read: arg.length,
			written: buf.length,
		};
	};
}

let WASM_VECTOR_LEN = 0;

let wasm = null;
function ensureWasm() {
	if (wasm) return;
	const wasmPath = `${__dirname}/visualizer_controller_bg.wasm`;
	const wasmBytes = require("fs").readFileSync(wasmPath);
	const wasmModule = new WebAssembly.Module(wasmBytes);
	wasm = new WebAssembly.Instance(wasmModule, __wbg_get_imports()).exports;
	wasm.__wbindgen_start();
}
