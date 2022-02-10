import wasm from "./export_wasm.js";

const heap = new Array(32).fill(undefined);

heap.push(undefined, null, true, false);

function getObject(idx) {
  return heap[idx];
}

let heap_next = heap.length;

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

let cachegetUint8Memory0 = null;
function getUint8Memory0() {
  if (
    cachegetUint8Memory0 === null ||
    cachegetUint8Memory0.buffer !== wasm.memory.buffer
  ) {
    cachegetUint8Memory0 = new Uint8Array(wasm.memory.buffer);
  }
  return cachegetUint8Memory0;
}

const lTextEncoder =
  typeof TextEncoder === "undefined"
    ? (0, module.require)("util").TextEncoder
    : TextEncoder;

let cachedTextEncoder = new lTextEncoder("utf-8");

const encodeString =
  typeof cachedTextEncoder.encodeInto === "function"
    ? function (arg, view) {
        return cachedTextEncoder.encodeInto(arg, view);
      }
    : function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
          read: arg.length,
          written: buf.length,
        };
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
    if (code > 0x7f) break;
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

function isLikeNone(x) {
  return x === undefined || x === null;
}

let cachegetInt32Memory0 = null;
function getInt32Memory0() {
  if (
    cachegetInt32Memory0 === null ||
    cachegetInt32Memory0.buffer !== wasm.memory.buffer
  ) {
    cachegetInt32Memory0 = new Int32Array(wasm.memory.buffer);
  }
  return cachegetInt32Memory0;
}

const lTextDecoder =
  typeof TextDecoder === "undefined"
    ? (0, module.require)("util").TextDecoder
    : TextDecoder;

let cachedTextDecoder = new lTextDecoder("utf-8", {
  ignoreBOM: true,
  fatal: true,
});

cachedTextDecoder.decode();

function getStringFromWasm0(ptr, len) {
  return cachedTextDecoder.decode(getUint8Memory0().subarray(ptr, ptr + len));
}

function addHeapObject(obj) {
  if (heap_next === heap.length) heap.push(heap.length + 1);
  const idx = heap_next;
  heap_next = heap[idx];

  heap[idx] = obj;
  return idx;
}

function debugString(val) {
  // primitive types
  const type = typeof val;
  if (type == "number" || type == "boolean" || val == null) {
    return `${val}`;
  }
  if (type == "string") {
    return `"${val}"`;
  }
  if (type == "symbol") {
    const description = val.description;
    if (description == null) {
      return "Symbol";
    } else {
      return `Symbol(${description})`;
    }
  }
  if (type == "function") {
    const name = val.name;
    if (typeof name == "string" && name.length > 0) {
      return `Function(${name})`;
    } else {
      return "Function";
    }
  }
  // objects
  if (Array.isArray(val)) {
    const length = val.length;
    let debug = "[";
    if (length > 0) {
      debug += debugString(val[0]);
    }
    for (let i = 1; i < length; i++) {
      debug += ", " + debugString(val[i]);
    }
    debug += "]";
    return debug;
  }
  // Test for built-in
  const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
  let className;
  if (builtInMatches.length > 1) {
    className = builtInMatches[1];
  } else {
    // Failed to match the standard '[object ClassName]'
    return toString.call(val);
  }
  if (className == "Object") {
    // we're a user defined class or Object
    // JSON.stringify avoids problems with cycles, and is generally much
    // easier than looping through ownProperties of `val`.
    try {
      return "Object(" + JSON.stringify(val) + ")";
    } catch (_) {
      return "Object";
    }
  }
  // errors
  if (val instanceof Error) {
    return `${val.name}: ${val.message}\n${val.stack}`;
  }
  // TODO we could test for more things here, like `Set`s and `Map`s.
  return className;
}

function makeMutClosure(arg0, arg1, dtor, f) {
  const state = { a: arg0, b: arg1, cnt: 1, dtor };
  const real = (...args) => {
    // First up with a closure we increment the internal reference
    // count. This ensures that the Rust closure environment won't
    // be deallocated while we're invoking it.
    state.cnt++;
    const a = state.a;
    state.a = 0;
    try {
      return f(a, state.b, ...args);
    } finally {
      if (--state.cnt === 0) {
        wasm.__wbindgen_export_2.get(state.dtor)(a, state.b);
      } else {
        state.a = a;
      }
    }
  };
  real.original = state;

  return real;
}
function __wbg_adapter_22(arg0, arg1, arg2) {
  wasm._dyn_core__ops__function__FnMut__A____Output___R_as_wasm_bindgen__closure__WasmClosure___describe__invoke__h29cf9a4fd4f08c73(
    arg0,
    arg1,
    addHeapObject(arg2)
  );
}

/**
 * @param {any} req
 * @param {any} env
 * @param {any} ctx
 * @returns {Promise<any>}
 */
export function fetch(req, env, ctx) {
  var ret = wasm.fetch(
    addHeapObject(req),
    addHeapObject(env),
    addHeapObject(ctx)
  );
  return takeObject(ret);
}

function handleError(f, args) {
  try {
    return f.apply(this, args);
  } catch (e) {
    wasm.__wbindgen_exn_store(addHeapObject(e));
  }
}
function __wbg_adapter_86(arg0, arg1, arg2, arg3) {
  wasm.wasm_bindgen__convert__closures__invoke2_mut__h70365e5614c937ba(
    arg0,
    arg1,
    addHeapObject(arg2),
    addHeapObject(arg3)
  );
}

/**
 * Configuration options for Cloudflare's image optimization feature:
 * <https://blog.cloudflare.com/introducing-polish-automatic-image-optimizati/>
 */
export const PolishConfig = Object.freeze({
  Off: 0,
  0: "Off",
  Lossy: 1,
  1: "Lossy",
  Lossless: 2,
  2: "Lossless",
});
/**
 */
export const RequestRedirect = Object.freeze({
  Error: 0,
  0: "Error",
  Follow: 1,
  1: "Follow",
  Manual: 2,
  2: "Manual",
});
/**
 * Configuration options for Cloudflare's minification features:
 * <https://www.cloudflare.com/website-optimization/>
 */
export class MinifyConfig {
  __destroy_into_raw() {
    const ptr = this.ptr;
    this.ptr = 0;

    return ptr;
  }

  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_minifyconfig_free(ptr);
  }
  /**
   */
  get js() {
    var ret = wasm.__wbg_get_minifyconfig_js(this.ptr);
    return ret !== 0;
  }
  /**
   * @param {boolean} arg0
   */
  set js(arg0) {
    wasm.__wbg_set_minifyconfig_js(this.ptr, arg0);
  }
  /**
   */
  get html() {
    var ret = wasm.__wbg_get_minifyconfig_html(this.ptr);
    return ret !== 0;
  }
  /**
   * @param {boolean} arg0
   */
  set html(arg0) {
    wasm.__wbg_set_minifyconfig_html(this.ptr, arg0);
  }
  /**
   */
  get css() {
    var ret = wasm.__wbg_get_minifyconfig_css(this.ptr);
    return ret !== 0;
  }
  /**
   * @param {boolean} arg0
   */
  set css(arg0) {
    wasm.__wbg_set_minifyconfig_css(this.ptr, arg0);
  }
}

export function __wbindgen_object_drop_ref(arg0) {
  takeObject(arg0);
}

export function __wbindgen_string_get(arg0, arg1) {
  const obj = getObject(arg1);
  var ret = typeof obj === "string" ? obj : undefined;
  var ptr0 = isLikeNone(ret)
    ? 0
    : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
  var len0 = WASM_VECTOR_LEN;
  getInt32Memory0()[arg0 / 4 + 1] = len0;
  getInt32Memory0()[arg0 / 4 + 0] = ptr0;
}

export function __wbg_new_59cb74e423758ede() {
  var ret = new Error();
  return addHeapObject(ret);
}

export function __wbg_stack_558ba5917b466edd(arg0, arg1) {
  var ret = getObject(arg1).stack;
  var ptr0 = passStringToWasm0(
    ret,
    wasm.__wbindgen_malloc,
    wasm.__wbindgen_realloc
  );
  var len0 = WASM_VECTOR_LEN;
  getInt32Memory0()[arg0 / 4 + 1] = len0;
  getInt32Memory0()[arg0 / 4 + 0] = ptr0;
}

export function __wbg_error_4bb6c2a97407129a(arg0, arg1) {
  try {
    console.error(getStringFromWasm0(arg0, arg1));
  } finally {
    wasm.__wbindgen_free(arg0, arg1);
  }
}

export function __wbindgen_string_new(arg0, arg1) {
  var ret = getStringFromWasm0(arg0, arg1);
  return addHeapObject(ret);
}

export function __wbindgen_is_undefined(arg0) {
  var ret = getObject(arg0) === undefined;
  return ret;
}

export function __wbindgen_number_new(arg0) {
  var ret = arg0;
  return addHeapObject(ret);
}

export function __wbindgen_object_clone_ref(arg0) {
  var ret = getObject(arg0);
  return addHeapObject(ret);
}

export function __wbindgen_cb_drop(arg0) {
  const obj = takeObject(arg0).original;
  if (obj.cnt-- == 1) {
    obj.a = 0;
    return true;
  }
  var ret = false;
  return ret;
}

export function __wbg_body_b67afdc865ca6d95(arg0) {
  var ret = getObject(arg0).body;
  return isLikeNone(ret) ? 0 : addHeapObject(ret);
}

export function __wbg_newwithoptu8arrayandinit_2358601704784951() {
  return handleError(function (arg0, arg1) {
    var ret = new Response(takeObject(arg0), getObject(arg1));
    return addHeapObject(ret);
  }, arguments);
}

export function __wbg_newwithoptstrandinit_cd8a4402e68873df() {
  return handleError(function (arg0, arg1, arg2) {
    var ret = new Response(
      arg0 === 0 ? undefined : getStringFromWasm0(arg0, arg1),
      getObject(arg2)
    );
    return addHeapObject(ret);
  }, arguments);
}

export function __wbg_newwithoptstreamandinit_2cdcade777fddab8() {
  return handleError(function (arg0, arg1) {
    var ret = new Response(takeObject(arg0), getObject(arg1));
    return addHeapObject(ret);
  }, arguments);
}

export function __wbg_latitude_6d0dc7510853aaea(arg0, arg1) {
  var ret = getObject(arg1).latitude;
  var ptr0 = isLikeNone(ret)
    ? 0
    : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
  var len0 = WASM_VECTOR_LEN;
  getInt32Memory0()[arg0 / 4 + 1] = len0;
  getInt32Memory0()[arg0 / 4 + 0] = ptr0;
}

export function __wbg_longitude_b566ab6d05581b27(arg0, arg1) {
  var ret = getObject(arg1).longitude;
  var ptr0 = isLikeNone(ret)
    ? 0
    : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
  var len0 = WASM_VECTOR_LEN;
  getInt32Memory0()[arg0 / 4 + 1] = len0;
  getInt32Memory0()[arg0 / 4 + 0] = ptr0;
}

export function __wbg_region_5b42be38a5fb9fee(arg0, arg1) {
  var ret = getObject(arg1).region;
  var ptr0 = isLikeNone(ret)
    ? 0
    : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
  var len0 = WASM_VECTOR_LEN;
  getInt32Memory0()[arg0 / 4 + 1] = len0;
  getInt32Memory0()[arg0 / 4 + 0] = ptr0;
}

export function __wbg_method_8ec82ee079ce2702(arg0, arg1) {
  var ret = getObject(arg1).method;
  var ptr0 = passStringToWasm0(
    ret,
    wasm.__wbindgen_malloc,
    wasm.__wbindgen_realloc
  );
  var len0 = WASM_VECTOR_LEN;
  getInt32Memory0()[arg0 / 4 + 1] = len0;
  getInt32Memory0()[arg0 / 4 + 0] = ptr0;
}

export function __wbg_url_9b689d511a7995b5(arg0, arg1) {
  var ret = getObject(arg1).url;
  var ptr0 = passStringToWasm0(
    ret,
    wasm.__wbindgen_malloc,
    wasm.__wbindgen_realloc
  );
  var len0 = WASM_VECTOR_LEN;
  getInt32Memory0()[arg0 / 4 + 1] = len0;
  getInt32Memory0()[arg0 / 4 + 0] = ptr0;
}

export function __wbg_headers_62f682054d74e541(arg0) {
  var ret = getObject(arg0).headers;
  return addHeapObject(ret);
}

export function __wbg_formData_c5b7ee7b1f027402() {
  return handleError(function (arg0) {
    var ret = getObject(arg0).formData();
    return addHeapObject(ret);
  }, arguments);
}

export function __wbg_cf_619e9c1d3e10de88(arg0) {
  var ret = getObject(arg0).cf;
  return addHeapObject(ret);
}

export function __wbg_new_9e449026aa04d852() {
  return handleError(function () {
    var ret = new Headers();
    return addHeapObject(ret);
  }, arguments);
}

export function __wbg_set_ecc7ab7b550ca8b7() {
  return handleError(function (arg0, arg1, arg2, arg3, arg4) {
    getObject(arg0).set(
      getStringFromWasm0(arg1, arg2),
      getStringFromWasm0(arg3, arg4)
    );
  }, arguments);
}

export function __wbg_log_9c5d40d7de6fd4f7(arg0, arg1) {
  console.log(getStringFromWasm0(arg0, arg1));
}

export function __wbg_instanceof_File_05917b01e27498d9(arg0) {
  var ret = getObject(arg0) instanceof File;
  return ret;
}

export function __wbg_get_4139ec5751043532(arg0, arg1, arg2) {
  var ret = getObject(arg0).get(getStringFromWasm0(arg1, arg2));
  return addHeapObject(ret);
}

export function __wbg_get_4d0f21c2f823742e() {
  return handleError(function (arg0, arg1) {
    var ret = Reflect.get(getObject(arg0), getObject(arg1));
    return addHeapObject(ret);
  }, arguments);
}

export function __wbg_new_0b83d3df67ecb33e() {
  var ret = new Object();
  return addHeapObject(ret);
}

export function __wbg_instanceof_Error_561efcb1265706d8(arg0) {
  var ret = getObject(arg0) instanceof Error;
  return ret;
}

export function __wbg_toString_0ef1ea57b966aed4(arg0) {
  var ret = getObject(arg0).toString();
  return addHeapObject(ret);
}

export function __wbg_call_346669c262382ad7() {
  return handleError(function (arg0, arg1, arg2) {
    var ret = getObject(arg0).call(getObject(arg1), getObject(arg2));
    return addHeapObject(ret);
  }, arguments);
}

export function __wbg_name_9a3ff1e21a0e3304(arg0) {
  var ret = getObject(arg0).name;
  return addHeapObject(ret);
}

export function __wbg_new0_fd3a3a290b25cdac() {
  var ret = new Date();
  return addHeapObject(ret);
}

export function __wbg_toString_646e437de608a0a1(arg0) {
  var ret = getObject(arg0).toString();
  return addHeapObject(ret);
}

export function __wbg_constructor_9fe544cc0957fdd0(arg0) {
  var ret = getObject(arg0).constructor;
  return addHeapObject(ret);
}

export function __wbg_new_b1d61b5687f5e73a(arg0, arg1) {
  try {
    var state0 = { a: arg0, b: arg1 };
    var cb0 = (arg0, arg1) => {
      const a = state0.a;
      state0.a = 0;
      try {
        return __wbg_adapter_86(a, state0.b, arg0, arg1);
      } finally {
        state0.a = a;
      }
    };
    var ret = new Promise(cb0);
    return addHeapObject(ret);
  } finally {
    state0.a = state0.b = 0;
  }
}

export function __wbg_resolve_d23068002f584f22(arg0) {
  var ret = Promise.resolve(getObject(arg0));
  return addHeapObject(ret);
}

export function __wbg_then_2fcac196782070cc(arg0, arg1) {
  var ret = getObject(arg0).then(getObject(arg1));
  return addHeapObject(ret);
}

export function __wbg_then_8c2d62e8ae5978f7(arg0, arg1, arg2) {
  var ret = getObject(arg0).then(getObject(arg1), getObject(arg2));
  return addHeapObject(ret);
}

export function __wbg_buffer_397eaa4d72ee94dd(arg0) {
  var ret = getObject(arg0).buffer;
  return addHeapObject(ret);
}

export function __wbg_newwithbyteoffsetandlength_4b9b8c4e3f5adbff(
  arg0,
  arg1,
  arg2
) {
  var ret = new Uint8Array(getObject(arg0), arg1 >>> 0, arg2 >>> 0);
  return addHeapObject(ret);
}

export function __wbg_set_969ad0a60e51d320(arg0, arg1, arg2) {
  getObject(arg0).set(getObject(arg1), arg2 >>> 0);
}

export function __wbg_length_1eb8fc608a0d4cdb(arg0) {
  var ret = getObject(arg0).length;
  return ret;
}

export function __wbg_newwithlength_929232475839a482(arg0) {
  var ret = new Uint8Array(arg0 >>> 0);
  return addHeapObject(ret);
}

export function __wbg_set_82a4e8a85e31ac42() {
  return handleError(function (arg0, arg1, arg2) {
    var ret = Reflect.set(getObject(arg0), getObject(arg1), getObject(arg2));
    return ret;
  }, arguments);
}

export function __wbindgen_debug_string(arg0, arg1) {
  var ret = debugString(getObject(arg1));
  var ptr0 = passStringToWasm0(
    ret,
    wasm.__wbindgen_malloc,
    wasm.__wbindgen_realloc
  );
  var len0 = WASM_VECTOR_LEN;
  getInt32Memory0()[arg0 / 4 + 1] = len0;
  getInt32Memory0()[arg0 / 4 + 0] = ptr0;
}

export function __wbindgen_throw(arg0, arg1) {
  throw new Error(getStringFromWasm0(arg0, arg1));
}

export function __wbindgen_memory() {
  var ret = wasm.memory;
  return addHeapObject(ret);
}

export function __wbindgen_closure_wrapper515(arg0, arg1, arg2) {
  var ret = makeMutClosure(arg0, arg1, 100, __wbg_adapter_22);
  return addHeapObject(ret);
}
