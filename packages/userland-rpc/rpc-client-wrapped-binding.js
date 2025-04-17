// lib/devalue.ts
import assert2 from "node-internal:internal_assert";
import { Buffer as Buffer2 } from "node-internal:internal_buffer";

// lib/miniflare.ts
import assert from "node-internal:internal_assert";
import { Buffer } from "node-internal:internal_buffer";

// ../../node_modules/.pnpm/devalue@5.1.1/node_modules/devalue/src/utils.js
var DevalueError = class extends Error {
  /**
   * @param {string} message
   * @param {string[]} keys
   */
  constructor(message, keys) {
    super(message);
    this.name = "DevalueError";
    this.path = keys.join("");
  }
};
function is_primitive(thing) {
  return Object(thing) !== thing;
}
var object_proto_names = /* @__PURE__ */ Object.getOwnPropertyNames(
  Object.prototype
).sort().join("\0");
function is_plain_object(thing) {
  const proto = Object.getPrototypeOf(thing);
  return proto === Object.prototype || proto === null || Object.getOwnPropertyNames(proto).sort().join("\0") === object_proto_names;
}
function get_type(thing) {
  return Object.prototype.toString.call(thing).slice(8, -1);
}
function get_escaped_char(char) {
  switch (char) {
    case '"':
      return '\\"';
    case "<":
      return "\\u003C";
    case "\\":
      return "\\\\";
    case "\n":
      return "\\n";
    case "\r":
      return "\\r";
    case "	":
      return "\\t";
    case "\b":
      return "\\b";
    case "\f":
      return "\\f";
    case "\u2028":
      return "\\u2028";
    case "\u2029":
      return "\\u2029";
    default:
      return char < " " ? `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}` : "";
  }
}
function stringify_string(str) {
  let result = "";
  let last_pos = 0;
  const len = str.length;
  for (let i = 0; i < len; i += 1) {
    const char = str[i];
    const replacement = get_escaped_char(char);
    if (replacement) {
      result += str.slice(last_pos, i) + replacement;
      last_pos = i + 1;
    }
  }
  return `"${last_pos === 0 ? str : result + str.slice(last_pos)}"`;
}
function enumerable_symbols(object) {
  return Object.getOwnPropertySymbols(object).filter(
    (symbol) => Object.getOwnPropertyDescriptor(object, symbol).enumerable
  );
}
var is_identifier = /^[a-zA-Z_$][a-zA-Z_$0-9]*$/;
function stringify_key(key) {
  return is_identifier.test(key) ? "." + key : "[" + JSON.stringify(key) + "]";
}

// ../../node_modules/.pnpm/devalue@5.1.1/node_modules/devalue/src/base64.js
function encode64(arraybuffer) {
  const dv = new DataView(arraybuffer);
  let binaryString = "";
  for (let i = 0; i < arraybuffer.byteLength; i++) {
    binaryString += String.fromCharCode(dv.getUint8(i));
  }
  return binaryToAscii(binaryString);
}
function decode64(string) {
  const binaryString = asciiToBinary(string);
  const arraybuffer = new ArrayBuffer(binaryString.length);
  const dv = new DataView(arraybuffer);
  for (let i = 0; i < arraybuffer.byteLength; i++) {
    dv.setUint8(i, binaryString.charCodeAt(i));
  }
  return arraybuffer;
}
var KEY_STRING = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function asciiToBinary(data) {
  if (data.length % 4 === 0) {
    data = data.replace(/==?$/, "");
  }
  let output = "";
  let buffer = 0;
  let accumulatedBits = 0;
  for (let i = 0; i < data.length; i++) {
    buffer <<= 6;
    buffer |= KEY_STRING.indexOf(data[i]);
    accumulatedBits += 6;
    if (accumulatedBits === 24) {
      output += String.fromCharCode((buffer & 16711680) >> 16);
      output += String.fromCharCode((buffer & 65280) >> 8);
      output += String.fromCharCode(buffer & 255);
      buffer = accumulatedBits = 0;
    }
  }
  if (accumulatedBits === 12) {
    buffer >>= 4;
    output += String.fromCharCode(buffer);
  } else if (accumulatedBits === 18) {
    buffer >>= 2;
    output += String.fromCharCode((buffer & 65280) >> 8);
    output += String.fromCharCode(buffer & 255);
  }
  return output;
}
function binaryToAscii(str) {
  let out = "";
  for (let i = 0; i < str.length; i += 3) {
    const groupsOfSix = [void 0, void 0, void 0, void 0];
    groupsOfSix[0] = str.charCodeAt(i) >> 2;
    groupsOfSix[1] = (str.charCodeAt(i) & 3) << 4;
    if (str.length > i + 1) {
      groupsOfSix[1] |= str.charCodeAt(i + 1) >> 4;
      groupsOfSix[2] = (str.charCodeAt(i + 1) & 15) << 2;
    }
    if (str.length > i + 2) {
      groupsOfSix[2] |= str.charCodeAt(i + 2) >> 6;
      groupsOfSix[3] = str.charCodeAt(i + 2) & 63;
    }
    for (let j = 0; j < groupsOfSix.length; j++) {
      if (typeof groupsOfSix[j] === "undefined") {
        out += "=";
      } else {
        out += KEY_STRING[groupsOfSix[j]];
      }
    }
  }
  return out;
}

// ../../node_modules/.pnpm/devalue@5.1.1/node_modules/devalue/src/constants.js
var UNDEFINED = -1;
var HOLE = -2;
var NAN = -3;
var POSITIVE_INFINITY = -4;
var NEGATIVE_INFINITY = -5;
var NEGATIVE_ZERO = -6;

// ../../node_modules/.pnpm/devalue@5.1.1/node_modules/devalue/src/parse.js
function parse(serialized, revivers) {
  return unflatten(JSON.parse(serialized), revivers);
}
function unflatten(parsed, revivers) {
  if (typeof parsed === "number") return hydrate(parsed, true);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("Invalid input");
  }
  const values = (
    /** @type {any[]} */
    parsed
  );
  const hydrated = Array(values.length);
  function hydrate(index, standalone = false) {
    if (index === UNDEFINED) return void 0;
    if (index === NAN) return NaN;
    if (index === POSITIVE_INFINITY) return Infinity;
    if (index === NEGATIVE_INFINITY) return -Infinity;
    if (index === NEGATIVE_ZERO) return -0;
    if (standalone) throw new Error(`Invalid input`);
    if (index in hydrated) return hydrated[index];
    const value = values[index];
    if (!value || typeof value !== "object") {
      hydrated[index] = value;
    } else if (Array.isArray(value)) {
      if (typeof value[0] === "string") {
        const type = value[0];
        const reviver = revivers?.[type];
        if (reviver) {
          return hydrated[index] = reviver(hydrate(value[1]));
        }
        switch (type) {
          case "Date":
            hydrated[index] = new Date(value[1]);
            break;
          case "Set":
            const set = /* @__PURE__ */ new Set();
            hydrated[index] = set;
            for (let i = 1; i < value.length; i += 1) {
              set.add(hydrate(value[i]));
            }
            break;
          case "Map":
            const map = /* @__PURE__ */ new Map();
            hydrated[index] = map;
            for (let i = 1; i < value.length; i += 2) {
              map.set(hydrate(value[i]), hydrate(value[i + 1]));
            }
            break;
          case "RegExp":
            hydrated[index] = new RegExp(value[1], value[2]);
            break;
          case "Object":
            hydrated[index] = Object(value[1]);
            break;
          case "BigInt":
            hydrated[index] = BigInt(value[1]);
            break;
          case "null":
            const obj = /* @__PURE__ */ Object.create(null);
            hydrated[index] = obj;
            for (let i = 1; i < value.length; i += 2) {
              obj[value[i]] = hydrate(value[i + 1]);
            }
            break;
          case "Int8Array":
          case "Uint8Array":
          case "Uint8ClampedArray":
          case "Int16Array":
          case "Uint16Array":
          case "Int32Array":
          case "Uint32Array":
          case "Float32Array":
          case "Float64Array":
          case "BigInt64Array":
          case "BigUint64Array": {
            const TypedArrayConstructor = globalThis[type];
            const base64 = value[1];
            const arraybuffer = decode64(base64);
            const typedArray = new TypedArrayConstructor(arraybuffer);
            hydrated[index] = typedArray;
            break;
          }
          case "ArrayBuffer": {
            const base64 = value[1];
            const arraybuffer = decode64(base64);
            hydrated[index] = arraybuffer;
            break;
          }
          default:
            throw new Error(`Unknown type ${type}`);
        }
      } else {
        const array = new Array(value.length);
        hydrated[index] = array;
        for (let i = 0; i < value.length; i += 1) {
          const n = value[i];
          if (n === HOLE) continue;
          array[i] = hydrate(n);
        }
      }
    } else {
      const object = {};
      hydrated[index] = object;
      for (const key in value) {
        const n = value[key];
        object[key] = hydrate(n);
      }
    }
    return hydrated[index];
  }
  return hydrate(0);
}

// ../../node_modules/.pnpm/devalue@5.1.1/node_modules/devalue/src/stringify.js
function stringify(value, reducers) {
  const stringified = [];
  const indexes = /* @__PURE__ */ new Map();
  const custom = [];
  if (reducers) {
    for (const key of Object.getOwnPropertyNames(reducers)) {
      custom.push({ key, fn: reducers[key] });
    }
  }
  const keys = [];
  let p = 0;
  function flatten(thing) {
    if (typeof thing === "function") {
      throw new DevalueError(`Cannot stringify a function`, keys);
    }
    if (indexes.has(thing)) return indexes.get(thing);
    if (thing === void 0) return UNDEFINED;
    if (Number.isNaN(thing)) return NAN;
    if (thing === Infinity) return POSITIVE_INFINITY;
    if (thing === -Infinity) return NEGATIVE_INFINITY;
    if (thing === 0 && 1 / thing < 0) return NEGATIVE_ZERO;
    const index2 = p++;
    indexes.set(thing, index2);
    for (const { key, fn } of custom) {
      const value2 = fn(thing);
      if (value2) {
        stringified[index2] = `["${key}",${flatten(value2)}]`;
        return index2;
      }
    }
    let str = "";
    if (is_primitive(thing)) {
      str = stringify_primitive(thing);
    } else {
      const type = get_type(thing);
      switch (type) {
        case "Number":
        case "String":
        case "Boolean":
          str = `["Object",${stringify_primitive(thing)}]`;
          break;
        case "BigInt":
          str = `["BigInt",${thing}]`;
          break;
        case "Date":
          const valid = !isNaN(thing.getDate());
          str = `["Date","${valid ? thing.toISOString() : ""}"]`;
          break;
        case "RegExp":
          const { source, flags } = thing;
          str = flags ? `["RegExp",${stringify_string(source)},"${flags}"]` : `["RegExp",${stringify_string(source)}]`;
          break;
        case "Array":
          str = "[";
          for (let i = 0; i < thing.length; i += 1) {
            if (i > 0) str += ",";
            if (i in thing) {
              keys.push(`[${i}]`);
              str += flatten(thing[i]);
              keys.pop();
            } else {
              str += HOLE;
            }
          }
          str += "]";
          break;
        case "Set":
          str = '["Set"';
          for (const value2 of thing) {
            str += `,${flatten(value2)}`;
          }
          str += "]";
          break;
        case "Map":
          str = '["Map"';
          for (const [key, value2] of thing) {
            keys.push(
              `.get(${is_primitive(key) ? stringify_primitive(key) : "..."})`
            );
            str += `,${flatten(key)},${flatten(value2)}`;
            keys.pop();
          }
          str += "]";
          break;
        case "Int8Array":
        case "Uint8Array":
        case "Uint8ClampedArray":
        case "Int16Array":
        case "Uint16Array":
        case "Int32Array":
        case "Uint32Array":
        case "Float32Array":
        case "Float64Array":
        case "BigInt64Array":
        case "BigUint64Array": {
          const typedArray = thing;
          const base64 = encode64(typedArray.buffer);
          str = '["' + type + '","' + base64 + '"]';
          break;
        }
        case "ArrayBuffer": {
          const arraybuffer = thing;
          const base64 = encode64(arraybuffer);
          str = `["ArrayBuffer","${base64}"]`;
          break;
        }
        default:
          if (!is_plain_object(thing)) {
            throw new DevalueError(
              `Cannot stringify arbitrary non-POJOs`,
              keys
            );
          }
          if (enumerable_symbols(thing).length > 0) {
            throw new DevalueError(
              `Cannot stringify POJOs with symbolic keys`,
              keys
            );
          }
          if (Object.getPrototypeOf(thing) === null) {
            str = '["null"';
            for (const key in thing) {
              keys.push(stringify_key(key));
              str += `,${stringify_string(key)},${flatten(thing[key])}`;
              keys.pop();
            }
            str += "]";
          } else {
            str = "{";
            let started = false;
            for (const key in thing) {
              if (started) str += ",";
              started = true;
              keys.push(stringify_key(key));
              str += `${stringify_string(key)}:${flatten(thing[key])}`;
              keys.pop();
            }
            str += "}";
          }
      }
    }
    stringified[index2] = str;
    return index2;
  }
  const index = flatten(value);
  if (index < 0) return `${index}`;
  return `[${stringified.join(",")}]`;
}
function stringify_primitive(thing) {
  const type = typeof thing;
  if (type === "string") return stringify_string(thing);
  if (thing instanceof String) return stringify_string(thing.toString());
  if (thing === void 0) return UNDEFINED.toString();
  if (thing === 0 && 1 / thing < 0) return NEGATIVE_ZERO.toString();
  if (type === "bigint") return `["BigInt","${thing}"]`;
  return String(thing);
}

// lib/miniflare.ts
var ALLOWED_ARRAY_BUFFER_VIEW_CONSTRUCTORS = [
  DataView,
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
  BigInt64Array,
  BigUint64Array
];
var ALLOWED_ERROR_CONSTRUCTORS = [
  EvalError,
  RangeError,
  ReferenceError,
  SyntaxError,
  TypeError,
  URIError,
  Error
  // `Error` last so more specific error subclasses preferred
];
var structuredSerializableReducers = {
  ArrayBuffer(value) {
    if (value instanceof ArrayBuffer) {
      return [Buffer.from(value).toString("base64")];
    }
  },
  ArrayBufferView(value) {
    if (ArrayBuffer.isView(value)) {
      return [
        value.constructor.name,
        value.buffer,
        value.byteOffset,
        value.byteLength
      ];
    }
  },
  Error(value) {
    for (const ctor of ALLOWED_ERROR_CONSTRUCTORS) {
      if (value instanceof ctor && value.name === ctor.name) {
        return [value.name, value.message, value.stack, value.cause];
      }
    }
    if (value instanceof Error) {
      return ["Error", value.message, value.stack, value.cause];
    }
  }
};
var structuredSerializableRevivers = {
  ArrayBuffer(value) {
    assert(Array.isArray(value));
    const [encoded] = value;
    assert(typeof encoded === "string");
    const view = Buffer.from(encoded, "base64");
    return view.buffer.slice(
      view.byteOffset,
      view.byteOffset + view.byteLength
    );
  },
  ArrayBufferView(value) {
    assert(Array.isArray(value));
    const [name, buffer, byteOffset, byteLength] = value;
    assert(typeof name === "string");
    assert(buffer instanceof ArrayBuffer);
    assert(typeof byteOffset === "number");
    assert(typeof byteLength === "number");
    const ctor = globalThis[name];
    assert(ALLOWED_ARRAY_BUFFER_VIEW_CONSTRUCTORS.includes(ctor));
    let length = byteLength;
    if ("BYTES_PER_ELEMENT" in ctor) length /= ctor.BYTES_PER_ELEMENT;
    return new ctor(buffer, byteOffset, length);
  },
  Error(value) {
    assert(Array.isArray(value));
    const [name, message, stack, cause] = value;
    assert(typeof name === "string");
    assert(typeof message === "string");
    assert(stack === void 0 || typeof stack === "string");
    const ctor = globalThis[name];
    assert(ALLOWED_ERROR_CONSTRUCTORS.includes(ctor));
    const error = new ctor(message, { cause });
    error.stack = stack;
    return error;
  }
};
function createHTTPReducers(impl) {
  return {
    Headers(val) {
      if (val instanceof impl.Headers) return Object.fromEntries(val);
    },
    Request(val) {
      if (val instanceof impl.Request) {
        return [val.method, val.url, val.headers, val.cf, val.body];
      }
    },
    Response(val) {
      if (val instanceof impl.Response) {
        return [val.status, val.statusText, val.headers, val.cf, val.body];
      }
    }
  };
}
function createHTTPRevivers(impl) {
  return {
    Headers(value) {
      assert(typeof value === "object" && value !== null);
      return new impl.Headers(value);
    },
    Request(value) {
      assert(Array.isArray(value));
      const [method, url, headers, cf, body] = value;
      assert(typeof method === "string");
      assert(typeof url === "string");
      assert(headers instanceof impl.Headers);
      assert(body === null || impl.isReadableStream(body));
      return new impl.Request(url, {
        method,
        headers,
        cf,
        // @ts-expect-error `duplex` is not required by `workerd` yet
        duplex: body === null ? void 0 : "half",
        body
      });
    },
    Response(value) {
      assert(Array.isArray(value));
      const [status, statusText, headers, cf, body] = value;
      assert(typeof status === "number");
      assert(typeof statusText === "string");
      assert(headers instanceof impl.Headers);
      assert(body === null || impl.isReadableStream(body));
      return new impl.Response(body, {
        status,
        statusText,
        headers,
        cf
      });
    }
  };
}
function stringifyWithStreams(impl, value, reducers, allowUnbufferedStream) {
  let unbufferedStream;
  const bufferPromises = [];
  const streamReducers = {
    ReadableStream(value2) {
      if (impl.isReadableStream(value2)) {
        if (allowUnbufferedStream && unbufferedStream === void 0) {
          unbufferedStream = value2;
        } else {
          bufferPromises.push(impl.bufferReadableStream(value2));
        }
        return true;
      }
    },
    Blob(value2) {
      if (value2 instanceof impl.Blob) {
        bufferPromises.push(value2.arrayBuffer());
        return true;
      }
    },
    ...reducers
  };
  if (typeof value === "function") {
    value = new __MiniflareFunctionWrapper(
      value
    );
  }
  const stringifiedValue = stringify(value, streamReducers);
  if (bufferPromises.length === 0) {
    return { value: stringifiedValue, unbufferedStream };
  }
  return Promise.all(bufferPromises).then((streamBuffers) => {
    streamReducers.ReadableStream = function(value2) {
      if (impl.isReadableStream(value2)) {
        if (value2 === unbufferedStream) {
          return true;
        } else {
          return streamBuffers.shift();
        }
      }
    };
    streamReducers.Blob = function(value2) {
      if (value2 instanceof impl.Blob) {
        const array = [streamBuffers.shift(), value2.type];
        if (value2 instanceof impl.File) {
          array.push(value2.name, value2.lastModified);
        }
        return array;
      }
    };
    const stringifiedValue2 = stringify(value, streamReducers);
    return { value: stringifiedValue2, unbufferedStream };
  });
}
var __MiniflareFunctionWrapper = class {
  constructor(fnWithProps) {
    return new Proxy(this, {
      get: (_, key) => {
        if (key === "__miniflareWrappedFunction") return fnWithProps;
        return fnWithProps[key];
      }
    });
  }
};
function parseWithReadableStreams(impl, stringified, revivers) {
  const streamRevivers = {
    ReadableStream(value) {
      if (value === true) {
        assert(stringified.unbufferedStream !== void 0);
        return stringified.unbufferedStream;
      }
      assert(value instanceof ArrayBuffer);
      return impl.unbufferReadableStream(value);
    },
    Blob(value) {
      assert(Array.isArray(value));
      if (value.length === 2) {
        const [buffer, type] = value;
        assert(buffer instanceof ArrayBuffer);
        assert(typeof type === "string");
        const opts = {};
        if (type !== "") opts.type = type;
        return new impl.Blob([buffer], opts);
      } else {
        assert(value.length === 4);
        const [buffer, type, name, lastModified] = value;
        assert(buffer instanceof ArrayBuffer);
        assert(typeof type === "string");
        assert(typeof name === "string");
        assert(typeof lastModified === "number");
        const opts = { lastModified };
        if (type !== "") opts.type = type;
        return new impl.File([buffer], name, opts);
      }
    },
    ...revivers
  };
  return parse(stringified.value, streamRevivers);
}
function prefixStream(prefix, stream) {
  const identity = new TransformStream();
  const writer = identity.writable.getWriter();
  void writer.write(prefix).then(() => {
    writer.releaseLock();
    return stream.pipeTo(identity.writable);
  }).catch((error) => {
    return writer.abort(error);
  });
  return identity.readable;
}
async function readPrefix(stream, prefixLength) {
  const chunks = [];
  let chunksLength = 0;
  for await (const chunk of stream.values({ preventCancel: true })) {
    chunks.push(chunk);
    chunksLength += chunk.byteLength;
    if (chunksLength >= prefixLength) break;
  }
  if (chunksLength < prefixLength) {
    throw new RangeError(
      `Expected ${prefixLength} byte prefix, but received ${chunksLength} byte stream`
    );
  }
  const atLeastPrefix = Buffer.concat(chunks, chunksLength);
  const prefix = atLeastPrefix.subarray(0, prefixLength);
  let rest = stream;
  if (chunksLength > prefixLength) {
    rest = prefixStream(atLeastPrefix.subarray(prefixLength), stream);
  }
  return [prefix, rest];
}

// lib/devalue.ts
function isObject(value) {
  return !!value && typeof value === "object";
}
function isInternal(value) {
  return isObject(value) && !!value[Symbol.for("cloudflare:internal-class")];
}
var SynchronousMethod = class {
  constructor(name, method) {
    this.name = name;
    this.method = method;
  }
};
var synchronousMethods = {
  "Checksums::toJSON": {
    reduce: (fn) => fn(),
    revive: (v) => () => v
  },
  "HeadResult::writeHttpMetadata": {
    reduce: (fn) => {
      const h = new Headers();
      fn(h);
      return h;
    },
    revive: (v) => (headers) => {
      for (const [name, value] of v.entries()) {
        headers.set(name, value);
      }
    }
  },
  "GetResult::writeHttpMetadata": {
    reduce: (fn) => {
      const h = new Headers();
      fn(h);
      return h;
    },
    revive: (v) => (headers) => {
      for (const [name, value] of v.entries()) {
        headers.set(name, value);
      }
    }
  }
};
var UnresolvedChain = class {
  constructor(chainProxy) {
    this.chainProxy = chainProxy;
  }
};
function createCloudflareReducers(heap) {
  return {
    RpcStub(val) {
      if (val !== null && typeof val === "object" && val.constructor.name === "RpcStub" && heap) {
        const id = crypto.randomUUID();
        if (!heap) {
          throw new Error("Attempted to use heap on client");
        }
        heap.set(id, val);
        return id;
      }
    },
    UnresolvedChain(val) {
      if (val instanceof UnresolvedChain) {
        return val.chainProxy;
      }
    },
    /**
     * Internal classes are things like R2Object, which have some properties, synchronous methods, and optionally a stream
     */
    InternalClass(val) {
      if (isInternal(val)) {
        let stream = void 0;
        if (val.body instanceof ReadableStream) {
          stream = val.body;
        }
        return [
          // These classes are not constructable in userland, but we need to make the constructor name
          // match in case user-code depends
          val.constructor.name,
          {
            ...val,
            ...Object.fromEntries(
              Object.keys(val).filter(
                (m) => !!synchronousMethods[`${val.constructor.name}::${m}`]
              ).map((m) => [
                m,
                new SynchronousMethod(
                  `${val.constructor.name}::${m}`,
                  val[m]
                )
              ])
            )
          },
          stream
        ];
      }
    },
    SynchronousMethod(val) {
      if (val instanceof SynchronousMethod) {
        return [val.name, synchronousMethods[val.name].reduce(val.method)];
      }
    }
  };
}
function createCloudflareRevivers(heap, stubProxy) {
  return {
    RpcStub(id) {
      if (typeof id !== "string") {
        throw new Error("RpcStub with wrong ID");
      }
      if (heap) {
        return heap.get(id);
      } else {
        if (stubProxy === void 0) {
          throw new Error("Can't inflate RpcStub");
        }
        return stubProxy(id);
      }
    },
    UnresolvedChain(val) {
      if (stubProxy) {
        return stubProxy(val.targetHeapId);
      }
      return new UnresolvedChain(val);
    },
    InternalClass(val) {
      const kls = {};
      Object.defineProperty(kls.constructor, "name", {
        // @ts-expect-error this is fine
        value: val[0],
        writable: false
      });
      Object.assign(kls, val[1]);
      if (val[2]) {
        const r = new Response(val[2]);
        Object.assign(kls, {
          body: r.body,
          bodyUsed: r.bodyUsed,
          json: r.json.bind(r),
          arrayBuffer: r.arrayBuffer.bind(r),
          text: r.text.bind(r),
          blob: r.blob.bind(r)
        });
      }
      return kls;
    },
    SynchronousMethod(val) {
      assert2(Array.isArray(val));
      return synchronousMethods[val[0]].revive(val[1]);
    }
  };
}
var WORKERS_PLATFORM_IMPL = {
  Blob,
  File,
  Headers,
  Request,
  Response,
  isReadableStream(value) {
    return value instanceof ReadableStream;
  },
  bufferReadableStream(stream) {
    return new Response(stream).arrayBuffer();
  },
  unbufferReadableStream(buffer) {
    const body = new Response(buffer).body;
    assert2(body !== null);
    return body;
  }
};
var decoder = new TextDecoder();
var SIZE_HEADER = "X-Buffer-Size";
async function parse2(serialised, revivers) {
  let unbufferedStream;
  const stringifiedSizeHeader = serialised.headers.get(SIZE_HEADER);
  if (stringifiedSizeHeader === null || stringifiedSizeHeader === serialised.headers.get("Content-Length")) {
    return parseWithReadableStreams(
      WORKERS_PLATFORM_IMPL,
      { value: await serialised.text() },
      revivers
    );
  } else {
    const argsSize = parseInt(stringifiedSizeHeader);
    assert2(!Number.isNaN(argsSize));
    assert2(serialised.body !== null);
    const [encodedArgs, rest] = await readPrefix(serialised.body, argsSize);
    unbufferedStream = rest;
    const stringifiedArgs = decoder.decode(encodedArgs);
    return parseWithReadableStreams(
      WORKERS_PLATFORM_IMPL,
      { value: stringifiedArgs, unbufferedStream: rest },
      revivers
    );
  }
}
async function writeWithUnbufferedStream(writable, encodedValue, unbufferedStream) {
  const writer = writable.getWriter();
  await writer.write(encodedValue);
  writer.releaseLock();
  await unbufferedStream.pipeTo(writable);
}
var encoder = new TextEncoder();
async function serialiseToRequest(data, reducers) {
  const stringified = await stringifyWithStreams(
    WORKERS_PLATFORM_IMPL,
    data,
    reducers,
    true
  );
  if (stringified.unbufferedStream === void 0) {
    const size = Buffer2.byteLength(stringified.value).toString();
    return new Request("http://example.com", {
      method: "POST",
      headers: {
        [SIZE_HEADER]: size,
        "Content-Length": size
      },
      body: stringified.value
    });
  } else {
    const body = new IdentityTransformStream();
    const encodedValue = encoder.encode(stringified.value);
    const encodedSize = encodedValue.byteLength.toString();
    void writeWithUnbufferedStream(
      body.writable,
      encodedValue,
      stringified.unbufferedStream
    );
    return new Request("http://example.com", {
      method: "POST",
      headers: {
        [SIZE_HEADER]: encodedSize
      },
      body: body.readable
    });
  }
}

// index.ts
var ChainSymbol = Symbol.for("chain");
var RpcClient = class {
  constructor(request) {
    this.request = request;
  }
  createChainProxy(chain = [], targetHeapId = void 0, thenable = true) {
    const reducers = {
      ...structuredSerializableReducers,
      ...createHTTPReducers(WORKERS_PLATFORM_IMPL),
      ...createCloudflareReducers()
    };
    const revivers = {
      ...structuredSerializableRevivers,
      ...createHTTPRevivers(WORKERS_PLATFORM_IMPL),
      ...createCloudflareRevivers(
        void 0,
        (id) => this.createChainProxy([], id, false)
      )
    };
    return new Proxy(function() {
    }, {
      get: (_, p) => {
        if (p === ChainSymbol) {
          return { chain, targetHeapId };
        }
        if (p === "then" && !thenable) {
          return void 0;
        }
        return this.createChainProxy(
          [...chain, { type: "get", property: p }],
          targetHeapId
        );
      },
      apply: (_target, _thisArg, argumentsList) => {
        const prev = chain[chain.length - 1];
        if (prev?.type === "get" && prev?.property === "then") {
          (async () => {
            try {
              const req = await serialiseToRequest(
                {
                  chain: chain.slice(0, -1),
                  targetHeapId
                },
                reducers
              );
              const result = await this.request(req);
              const { data, error } = await parse2(
                result,
                revivers
              );
              if (error) {
                argumentsList[1](error);
              } else {
                argumentsList[0](data);
              }
            } catch (e) {
              argumentsList[1](e);
            }
          })();
        } else {
          return this.createChainProxy(
            [
              ...chain,
              {
                type: "apply",
                arguments: argumentsList.map(
                  (a) => !!a[ChainSymbol] ? new UnresolvedChain({
                    chain: a[ChainSymbol].chain,
                    targetHeapId: a[ChainSymbol].targetHeapId
                  }) : a
                )
              }
            ],
            targetHeapId
          );
        }
      }
    });
  }
};

// rpc-client-wrapped-binding.ts
function rpc_client_wrapped_binding_default(env) {
  const client = new RpcClient(async (request) => {
    console.log("client -> server");
    const response = await fetch("http://localhost:8787/" + env.key, request);
    console.log("client <- server");
    return response;
  });
  return client.createChainProxy();
}
export {
  rpc_client_wrapped_binding_default as default
};
