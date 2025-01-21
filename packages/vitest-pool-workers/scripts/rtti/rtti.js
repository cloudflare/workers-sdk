"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => {
  __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  return value;
};
var __accessCheck = (obj, member, msg) => {
  if (!member.has(obj))
    throw TypeError("Cannot " + msg);
};
var __privateGet = (obj, member, getter) => {
  __accessCheck(obj, member, "read from private field");
  return getter ? getter.call(obj) : member.get(obj);
};
var __privateAdd = (obj, member, value) => {
  if (member.has(obj))
    throw TypeError("Cannot add the same private member more than once");
  member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
};

// scripts/rtti/rtti.ts
var rtti_exports = {};
__export(rtti_exports, {
  ArrayType: () => ArrayType,
  BuiltinType: () => BuiltinType,
  BuiltinType_Type: () => BuiltinType_Type,
  Constant: () => Constant,
  Constructor: () => Constructor,
  DictType: () => DictType,
  FunctionType: () => FunctionType,
  IntrinsicType: () => IntrinsicType,
  JsBuiltinType: () => JsBuiltinType,
  JsgImplType: () => JsgImplType,
  JsgImplType_Type: () => JsgImplType_Type,
  MaybeType: () => MaybeType,
  Member: () => Member,
  Member_Nested: () => Member_Nested,
  Member_Which: () => Member_Which,
  Method: () => Method,
  Module: () => Module,
  Module_Which: () => Module_Which,
  NumberType: () => NumberType,
  OneOfType: () => OneOfType,
  PromiseType: () => PromiseType,
  Property: () => Property,
  StringType: () => StringType,
  Structure: () => Structure,
  StructureGroups: () => StructureGroups,
  StructureGroups_StructureGroup: () => StructureGroups_StructureGroup,
  StructureType: () => StructureType,
  Type: () => Type,
  Type_Which: () => Type_Which,
  _capnpFileId: () => _capnpFileId
});
module.exports = __toCommonJS(rtti_exports);

// ../../node_modules/.pnpm/capnp-es@0.0.7_typescript@5.7.3/node_modules/capnp-es/dist/shared/capnp-es.DAoyiaGr.mjs
var ListElementSize = /* @__PURE__ */ ((ListElementSize2) => {
  ListElementSize2[ListElementSize2["VOID"] = 0] = "VOID";
  ListElementSize2[ListElementSize2["BIT"] = 1] = "BIT";
  ListElementSize2[ListElementSize2["BYTE"] = 2] = "BYTE";
  ListElementSize2[ListElementSize2["BYTE_2"] = 3] = "BYTE_2";
  ListElementSize2[ListElementSize2["BYTE_4"] = 4] = "BYTE_4";
  ListElementSize2[ListElementSize2["BYTE_8"] = 5] = "BYTE_8";
  ListElementSize2[ListElementSize2["POINTER"] = 6] = "POINTER";
  ListElementSize2[ListElementSize2["COMPOSITE"] = 7] = "COMPOSITE";
  return ListElementSize2;
})(ListElementSize || {});
var tmpWord = new DataView(new ArrayBuffer(8));
new Uint16Array(tmpWord.buffer)[0] = 258;
var DEFAULT_TRAVERSE_LIMIT = 64 << 20;
var LIST_SIZE_MASK = 7;
var MAX_INT32 = 2147483647;
var MAX_UINT32 = 4294967295;
var NATIVE_LITTLE_ENDIAN = tmpWord.getUint8(0) === 2;
var POINTER_DOUBLE_FAR_MASK = 4;
var POINTER_TYPE_MASK = 3;
var MAX_DEPTH = MAX_INT32;
var MAX_SEGMENT_LENGTH = MAX_UINT32;
var INVARIANT_UNREACHABLE_CODE = "CAPNP-TS000 Unreachable code detected.";
var PTR_ADOPT_WRONG_MESSAGE = "CAPNP-TS008 Attempted to adopt %s into a pointer in a different message %s.";
var PTR_ALREADY_ADOPTED = "CAPNP-TS009 Attempted to adopt %s more than once.";
var PTR_COMPOSITE_SIZE_UNDEFINED = "CAPNP-TS010 Attempted to set a composite list without providing a composite element size.";
var PTR_DEPTH_LIMIT_EXCEEDED = "CAPNP-TS011 Nesting depth limit exceeded for %s.";
var PTR_INIT_COMPOSITE_STRUCT = "CAPNP-TS013 Attempted to initialize a struct member from a composite list (%s).";
var PTR_INVALID_FAR_TARGET = "CAPNP-TS015 Target of a far pointer (%s) is another far pointer.";
var PTR_INVALID_LIST_SIZE = "CAPNP-TS016 Invalid list element size: %x.";
var PTR_INVALID_POINTER_TYPE = "CAPNP-TS017 Invalid pointer type: %x.";
var PTR_INVALID_UNION_ACCESS = "CAPNP-TS018 Attempted to access getter on %s for union field %s that is not currently set (wanted: %d, found: %d).";
var PTR_OFFSET_OUT_OF_BOUNDS = "CAPNP-TS019 Pointer offset %a is out of bounds for underlying buffer.";
var PTR_STRUCT_DATA_OUT_OF_BOUNDS = "CAPNP-TS020 Attempted to access out-of-bounds struct data (struct: %s, %d bytes at %a, data words: %d).";
var PTR_STRUCT_POINTER_OUT_OF_BOUNDS = "CAPNP-TS021 Attempted to access out-of-bounds struct pointer (%s, index: %d, length: %d).";
var PTR_TRAVERSAL_LIMIT_EXCEEDED = "CAPNP-TS022 Traversal limit exceeded! Slow down! %s";
var PTR_WRONG_LIST_TYPE = "CAPNP-TS023 Cannot convert %s to a %s list.";
var PTR_WRONG_POINTER_TYPE = "CAPNP-TS024 Attempted to convert pointer %s to a %s type.";
var SEG_SIZE_OVERFLOW = `CAPNP-TS039 Requested size %x exceeds maximum value (${MAX_SEGMENT_LENGTH}).`;
var TYPE_COMPOSITE_SIZE_UNDEFINED = "CAPNP-TS040 Must provide a composite element size for composite list pointers.";
var LIST_NO_MUTABLE = "CAPNP-TS045: Cannot call mutative methods on an immutable list.";
var LIST_NO_SEARCH = "CAPNP-TS046: Search is not supported for list.";
var RPC_NULL_CLIENT = "CAPNP-TS100 Call on null client.";
function bufferToHex(buffer) {
  const a = new Uint8Array(buffer);
  const h = [];
  for (let i = 0; i < a.byteLength; i++) {
    h.push(pad(a[i].toString(16), 2));
  }
  return `[${h.join(" ")}]`;
}
function format(s, ...args) {
  const n = s.length;
  let arg;
  let argIndex = 0;
  let c;
  let escaped = false;
  let i = 0;
  let leadingZero = false;
  let precision;
  let result = "";
  function nextArg() {
    return args[argIndex++];
  }
  function slurpNumber() {
    let digits = "";
    while (/\d/.test(s[i])) {
      digits += s[i++];
      c = s[i];
    }
    return digits.length > 0 ? Number.parseInt(digits, 10) : null;
  }
  for (; i < n; ++i) {
    c = s[i];
    if (escaped) {
      escaped = false;
      if (c === ".") {
        leadingZero = false;
        c = s[++i];
      } else if (c === "0" && s[i + 1] === ".") {
        leadingZero = true;
        i += 2;
        c = s[i];
      } else {
        leadingZero = true;
      }
      precision = slurpNumber();
      switch (c) {
        case "a": {
          result += "0x" + pad(Number.parseInt(String(nextArg()), 10).toString(16), 8);
          break;
        }
        case "b": {
          result += Number.parseInt(String(nextArg()), 10).toString(2);
          break;
        }
        case "c": {
          arg = nextArg();
          result += typeof arg === "string" || arg instanceof String ? arg : String.fromCharCode(Number.parseInt(String(arg), 10));
          break;
        }
        case "d": {
          result += Number.parseInt(String(nextArg()), 10);
          break;
        }
        case "f": {
          const tmp = Number.parseFloat(String(nextArg())).toFixed(
            precision || 6
          );
          result += leadingZero ? tmp : tmp.replace(/^0/, "");
          break;
        }
        case "j": {
          result += JSON.stringify(nextArg());
          break;
        }
        case "o": {
          result += "0" + Number.parseInt(String(nextArg()), 10).toString(8);
          break;
        }
        case "s": {
          result += nextArg();
          break;
        }
        case "x": {
          result += "0x" + Number.parseInt(String(nextArg()), 10).toString(16);
          break;
        }
        case "X": {
          result += "0x" + Number.parseInt(String(nextArg()), 10).toString(16).toUpperCase();
          break;
        }
        default: {
          result += c;
          break;
        }
      }
    } else if (c === "%") {
      escaped = true;
    } else {
      result += c;
    }
  }
  return result;
}
function pad(v, width, pad2 = "0") {
  return v.length >= width ? v : Array.from({ length: width - v.length + 1 }).join(pad2) + v;
}
function padToWord$1(size) {
  return size + 7 & -8;
}
var ObjectSize = class {
  /** The number of bytes required for the data section. */
  dataByteLength;
  /** The number of pointers in the object. */
  pointerLength;
  constructor(dataByteLength, pointerCount) {
    this.dataByteLength = dataByteLength;
    this.pointerLength = pointerCount;
  }
  toString() {
    return format(
      "ObjectSize_dw:%d,pc:%d",
      getDataWordLength(this),
      this.pointerLength
    );
  }
};
function getByteLength(o) {
  return o.dataByteLength + o.pointerLength * 8;
}
function getDataWordLength(o) {
  return o.dataByteLength / 8;
}
function getWordLength(o) {
  return o.dataByteLength / 8 + o.pointerLength;
}
function padToWord(o) {
  return new ObjectSize(padToWord$1(o.dataByteLength), o.pointerLength);
}
var Orphan = class {
  /** If this member is not present then the orphan has already been adopted, or something went very wrong. */
  _capnp;
  byteOffset;
  segment;
  constructor(src) {
    const c = getContent(src);
    this.segment = c.segment;
    this.byteOffset = c.byteOffset;
    this._capnp = {};
    this._capnp.type = getTargetPointerType(src);
    switch (this._capnp.type) {
      case PointerType.STRUCT: {
        this._capnp.size = getTargetStructSize(src);
        break;
      }
      case PointerType.LIST: {
        this._capnp.length = getTargetListLength(src);
        this._capnp.elementSize = getTargetListElementSize(src);
        if (this._capnp.elementSize === ListElementSize.COMPOSITE) {
          this._capnp.size = getTargetCompositeListSize(src);
        }
        break;
      }
      case PointerType.OTHER: {
        this._capnp.capId = getCapabilityId(src);
        break;
      }
      default: {
        throw new Error(PTR_INVALID_POINTER_TYPE);
      }
    }
    erasePointer(src);
  }
  /**
   * Adopt (move) this orphan into the target pointer location. This will allocate far pointers in `dst` as needed.
   *
   * @param {T} dst The destination pointer.
   * @returns {void}
   */
  _moveTo(dst) {
    if (this._capnp === void 0) {
      throw new Error(format(PTR_ALREADY_ADOPTED, this));
    }
    if (this.segment.message !== dst.segment.message) {
      throw new Error(format(PTR_ADOPT_WRONG_MESSAGE, this, dst));
    }
    erase(dst);
    const res = initPointer(this.segment, this.byteOffset, dst);
    switch (this._capnp.type) {
      case PointerType.STRUCT: {
        setStructPointer(res.offsetWords, this._capnp.size, res.pointer);
        break;
      }
      case PointerType.LIST: {
        let offsetWords = res.offsetWords;
        if (this._capnp.elementSize === ListElementSize.COMPOSITE) {
          offsetWords--;
        }
        setListPointer(
          offsetWords,
          this._capnp.elementSize,
          this._capnp.length,
          res.pointer,
          this._capnp.size
        );
        break;
      }
      case PointerType.OTHER: {
        setInterfacePointer(this._capnp.capId, res.pointer);
        break;
      }
      default: {
        throw new Error(PTR_INVALID_POINTER_TYPE);
      }
    }
    this._capnp = void 0;
  }
  dispose() {
    if (this._capnp === void 0) {
      return;
    }
    switch (this._capnp.type) {
      case PointerType.STRUCT: {
        this.segment.fillZeroWords(
          this.byteOffset,
          getWordLength(this._capnp.size)
        );
        break;
      }
      case PointerType.LIST: {
        const byteLength = getListByteLength(
          this._capnp.elementSize,
          this._capnp.length,
          this._capnp.size
        );
        this.segment.fillZeroWords(this.byteOffset, byteLength);
        break;
      }
    }
    this._capnp = void 0;
  }
  [Symbol.for("nodejs.util.inspect.custom")]() {
    return format(
      "Orphan_%d@%a,type:%s",
      this.segment.id,
      this.byteOffset,
      this._capnp && this._capnp.type
    );
  }
};
function adopt(src, p) {
  src._moveTo(p);
}
function disown(p) {
  return new Orphan(p);
}
function dump(p) {
  return bufferToHex(p.segment.buffer.slice(p.byteOffset, p.byteOffset + 8));
}
function getListByteLength(elementSize, length, compositeSize) {
  switch (elementSize) {
    case ListElementSize.BIT: {
      return padToWord$1(length + 7 >>> 3);
    }
    case ListElementSize.BYTE:
    case ListElementSize.BYTE_2:
    case ListElementSize.BYTE_4:
    case ListElementSize.BYTE_8:
    case ListElementSize.POINTER:
    case ListElementSize.VOID: {
      return padToWord$1(getListElementByteLength(elementSize) * length);
    }
    case ListElementSize.COMPOSITE: {
      if (compositeSize === void 0) {
        throw new Error(format(PTR_INVALID_LIST_SIZE, Number.NaN));
      }
      return length * padToWord$1(getByteLength(compositeSize));
    }
    default: {
      throw new Error(PTR_INVALID_LIST_SIZE);
    }
  }
}
function getListElementByteLength(elementSize) {
  switch (elementSize) {
    case ListElementSize.BIT: {
      return Number.NaN;
    }
    case ListElementSize.BYTE: {
      return 1;
    }
    case ListElementSize.BYTE_2: {
      return 2;
    }
    case ListElementSize.BYTE_4: {
      return 4;
    }
    case ListElementSize.BYTE_8:
    case ListElementSize.POINTER: {
      return 8;
    }
    case ListElementSize.COMPOSITE: {
      return Number.NaN;
    }
    case ListElementSize.VOID: {
      return 0;
    }
    default: {
      throw new Error(format(PTR_INVALID_LIST_SIZE, elementSize));
    }
  }
}
function add(offset, p) {
  return new Pointer(p.segment, p.byteOffset + offset, p._capnp.depthLimit);
}
function copyFrom(src, p) {
  if (p.segment === src.segment && p.byteOffset === src.byteOffset) {
    return;
  }
  erase(p);
  if (isNull(src))
    return;
  switch (getTargetPointerType(src)) {
    case PointerType.STRUCT: {
      copyFromStruct(src, p);
      break;
    }
    case PointerType.LIST: {
      copyFromList(src, p);
      break;
    }
    case PointerType.OTHER: {
      copyFromInterface(src, p);
      break;
    }
    default: {
      throw new Error(
        format(PTR_INVALID_POINTER_TYPE, getTargetPointerType(p))
      );
    }
  }
}
function erase(p) {
  if (isNull(p))
    return;
  let c;
  switch (getTargetPointerType(p)) {
    case PointerType.STRUCT: {
      const size = getTargetStructSize(p);
      c = getContent(p);
      c.segment.fillZeroWords(c.byteOffset, size.dataByteLength / 8);
      for (let i = 0; i < size.pointerLength; i++) {
        erase(add(i * 8, c));
      }
      break;
    }
    case PointerType.LIST: {
      const elementSize = getTargetListElementSize(p);
      const length = getTargetListLength(p);
      let contentWords = padToWord$1(
        length * getListElementByteLength(elementSize)
      );
      c = getContent(p);
      if (elementSize === ListElementSize.POINTER) {
        for (let i = 0; i < length; i++) {
          erase(
            new Pointer(
              c.segment,
              c.byteOffset + i * 8,
              p._capnp.depthLimit - 1
            )
          );
        }
        break;
      } else if (elementSize === ListElementSize.COMPOSITE) {
        const tag = add(-8, c);
        const compositeSize = getStructSize(tag);
        const compositeByteLength = getByteLength(compositeSize);
        contentWords = getOffsetWords(tag);
        c.segment.setWordZero(c.byteOffset - 8);
        for (let i = 0; i < length; i++) {
          for (let j = 0; j < compositeSize.pointerLength; j++) {
            erase(
              new Pointer(
                c.segment,
                c.byteOffset + i * compositeByteLength + j * 8,
                p._capnp.depthLimit - 1
              )
            );
          }
        }
      }
      c.segment.fillZeroWords(c.byteOffset, contentWords);
      break;
    }
    case PointerType.OTHER: {
      break;
    }
    default: {
      throw new Error(
        format(PTR_INVALID_POINTER_TYPE, getTargetPointerType(p))
      );
    }
  }
  erasePointer(p);
}
function erasePointer(p) {
  if (getPointerType(p) === PointerType.FAR) {
    const landingPad = followFar(p);
    if (isDoubleFar(p)) {
      landingPad.segment.setWordZero(landingPad.byteOffset + 8);
    }
    landingPad.segment.setWordZero(landingPad.byteOffset);
  }
  p.segment.setWordZero(p.byteOffset);
}
function followFar(p) {
  const targetSegment = p.segment.message.getSegment(
    p.segment.getUint32(p.byteOffset + 4)
  );
  const targetWordOffset = p.segment.getUint32(p.byteOffset) >>> 3;
  return new Pointer(
    targetSegment,
    targetWordOffset * 8,
    p._capnp.depthLimit - 1
  );
}
function followFars(p) {
  if (getPointerType(p) === PointerType.FAR) {
    const landingPad = followFar(p);
    if (isDoubleFar(p))
      landingPad.byteOffset += 8;
    return landingPad;
  }
  return p;
}
function getCapabilityId(p) {
  return p.segment.getUint32(p.byteOffset + 4);
}
function isCompositeList(p) {
  return getTargetPointerType(p) === PointerType.LIST && getTargetListElementSize(p) === ListElementSize.COMPOSITE;
}
function getContent(p, ignoreCompositeIndex) {
  let c;
  if (isDoubleFar(p)) {
    const landingPad = followFar(p);
    c = new Pointer(
      p.segment.message.getSegment(getFarSegmentId(landingPad)),
      getOffsetWords(landingPad) * 8
    );
  } else {
    const target = followFars(p);
    c = new Pointer(
      target.segment,
      target.byteOffset + 8 + getOffsetWords(target) * 8
    );
  }
  if (isCompositeList(p))
    c.byteOffset += 8;
  if (!ignoreCompositeIndex && p._capnp.compositeIndex !== void 0) {
    c.byteOffset -= 8;
    c.byteOffset += 8 + p._capnp.compositeIndex * getByteLength(padToWord(getStructSize(c)));
  }
  return c;
}
function getFarSegmentId(p) {
  return p.segment.getUint32(p.byteOffset + 4);
}
function getListElementSize(p) {
  return p.segment.getUint32(p.byteOffset + 4) & LIST_SIZE_MASK;
}
function getListLength(p) {
  return p.segment.getUint32(p.byteOffset + 4) >>> 3;
}
function getOffsetWords(p) {
  const o = p.segment.getInt32(p.byteOffset);
  return o & 2 ? o >> 3 : o >> 2;
}
function getPointerType(p) {
  return p.segment.getUint32(p.byteOffset) & POINTER_TYPE_MASK;
}
function getStructDataWords(p) {
  return p.segment.getUint16(p.byteOffset + 4);
}
function getStructPointerLength(p) {
  return p.segment.getUint16(p.byteOffset + 6);
}
function getStructSize(p) {
  return new ObjectSize(getStructDataWords(p) * 8, getStructPointerLength(p));
}
function getTargetCompositeListTag(p) {
  const c = getContent(p);
  c.byteOffset -= 8;
  return c;
}
function getTargetCompositeListSize(p) {
  return getStructSize(getTargetCompositeListTag(p));
}
function getTargetListElementSize(p) {
  return getListElementSize(followFars(p));
}
function getTargetListLength(p) {
  const t = followFars(p);
  if (getListElementSize(t) === ListElementSize.COMPOSITE) {
    return getOffsetWords(getTargetCompositeListTag(p));
  }
  return getListLength(t);
}
function getTargetPointerType(p) {
  const t = getPointerType(followFars(p));
  if (t === PointerType.FAR)
    throw new Error(format(PTR_INVALID_FAR_TARGET, p));
  return t;
}
function getTargetStructSize(p) {
  return getStructSize(followFars(p));
}
function initPointer(contentSegment, contentOffset, p) {
  if (p.segment !== contentSegment) {
    if (!contentSegment.hasCapacity(8)) {
      const landingPad2 = p.segment.allocate(16);
      setFarPointer(true, landingPad2.byteOffset / 8, landingPad2.segment.id, p);
      setFarPointer(false, contentOffset / 8, contentSegment.id, landingPad2);
      landingPad2.byteOffset += 8;
      return new PointerAllocationResult(landingPad2, 0);
    }
    const landingPad = contentSegment.allocate(8);
    if (landingPad.segment.id !== contentSegment.id) {
      throw new Error(INVARIANT_UNREACHABLE_CODE);
    }
    setFarPointer(false, landingPad.byteOffset / 8, landingPad.segment.id, p);
    return new PointerAllocationResult(
      landingPad,
      (contentOffset - landingPad.byteOffset - 8) / 8
    );
  }
  return new PointerAllocationResult(p, (contentOffset - p.byteOffset - 8) / 8);
}
function isDoubleFar(p) {
  return getPointerType(p) === PointerType.FAR && (p.segment.getUint32(p.byteOffset) & POINTER_DOUBLE_FAR_MASK) !== 0;
}
function isNull(p) {
  return p.segment.isWordZero(p.byteOffset);
}
function relocateTo(dst, src) {
  const t = followFars(src);
  const lo = t.segment.getUint8(t.byteOffset) & 3;
  const hi = t.segment.getUint32(t.byteOffset + 4);
  erase(dst);
  const res = initPointer(
    t.segment,
    t.byteOffset + 8 + getOffsetWords(t) * 8,
    dst
  );
  res.pointer.segment.setUint32(
    res.pointer.byteOffset,
    lo | res.offsetWords << 2
  );
  res.pointer.segment.setUint32(res.pointer.byteOffset + 4, hi);
  erasePointer(src);
}
function setFarPointer(doubleFar, offsetWords, segmentId, p) {
  const A = PointerType.FAR;
  const B = doubleFar ? 1 : 0;
  const C = offsetWords;
  const D = segmentId;
  p.segment.setUint32(p.byteOffset, A | B << 2 | C << 3);
  p.segment.setUint32(p.byteOffset + 4, D);
}
function setInterfacePointer(capId, p) {
  p.segment.setUint32(p.byteOffset, PointerType.OTHER);
  p.segment.setUint32(p.byteOffset + 4, capId);
}
function getInterfacePointer(p) {
  return p.segment.getUint32(p.byteOffset + 4);
}
function setListPointer(offsetWords, size, length, p, compositeSize) {
  const A = PointerType.LIST;
  const B = offsetWords;
  const C = size;
  let D = length;
  if (size === ListElementSize.COMPOSITE) {
    if (compositeSize === void 0) {
      throw new TypeError(TYPE_COMPOSITE_SIZE_UNDEFINED);
    }
    D *= getWordLength(compositeSize);
  }
  p.segment.setUint32(p.byteOffset, A | B << 2);
  p.segment.setUint32(p.byteOffset + 4, C | D << 3);
}
function setStructPointer(offsetWords, size, p) {
  const A = PointerType.STRUCT;
  const B = offsetWords;
  const C = getDataWordLength(size);
  const D = size.pointerLength;
  p.segment.setUint32(p.byteOffset, A | B << 2);
  p.segment.setUint16(p.byteOffset + 4, C);
  p.segment.setUint16(p.byteOffset + 6, D);
}
function validate(pointerType, p, elementSize) {
  if (isNull(p))
    return;
  const t = followFars(p);
  const A = t.segment.getUint32(t.byteOffset) & POINTER_TYPE_MASK;
  if (A !== pointerType) {
    throw new Error(format(PTR_WRONG_POINTER_TYPE, p, pointerType));
  }
  if (elementSize !== void 0) {
    const C = t.segment.getUint32(t.byteOffset + 4) & LIST_SIZE_MASK;
    if (C !== elementSize) {
      throw new Error(
        format(PTR_WRONG_LIST_TYPE, p, ListElementSize[elementSize])
      );
    }
  }
}
function copyFromInterface(src, dst) {
  const srcCapId = getInterfacePointer(src);
  if (srcCapId < 0) {
    return;
  }
  const srcCapTable = src.segment.message._capnp.capTable;
  if (!srcCapTable) {
    return;
  }
  const client = srcCapTable[srcCapId];
  if (!client) {
    return;
  }
  const dstCapId = dst.segment.message.addCap(client);
  setInterfacePointer(dstCapId, dst);
}
function copyFromList(src, dst) {
  if (dst._capnp.depthLimit <= 0)
    throw new Error(PTR_DEPTH_LIMIT_EXCEEDED);
  const srcContent = getContent(src);
  const srcElementSize = getTargetListElementSize(src);
  const srcLength = getTargetListLength(src);
  let srcCompositeSize;
  let srcStructByteLength;
  let dstContent;
  if (srcElementSize === ListElementSize.POINTER) {
    dstContent = dst.segment.allocate(srcLength << 3);
    for (let i = 0; i < srcLength; i++) {
      const srcPtr = new Pointer(
        srcContent.segment,
        srcContent.byteOffset + (i << 3),
        src._capnp.depthLimit - 1
      );
      const dstPtr = new Pointer(
        dstContent.segment,
        dstContent.byteOffset + (i << 3),
        dst._capnp.depthLimit - 1
      );
      copyFrom(srcPtr, dstPtr);
    }
  } else if (srcElementSize === ListElementSize.COMPOSITE) {
    srcCompositeSize = padToWord(getTargetCompositeListSize(src));
    srcStructByteLength = getByteLength(srcCompositeSize);
    dstContent = dst.segment.allocate(
      getByteLength(srcCompositeSize) * srcLength + 8
    );
    dstContent.segment.copyWord(
      dstContent.byteOffset,
      srcContent.segment,
      srcContent.byteOffset - 8
    );
    if (srcCompositeSize.dataByteLength > 0) {
      const wordLength = getWordLength(srcCompositeSize) * srcLength;
      dstContent.segment.copyWords(
        dstContent.byteOffset + 8,
        srcContent.segment,
        srcContent.byteOffset,
        wordLength
      );
    }
    for (let i = 0; i < srcLength; i++) {
      for (let j = 0; j < srcCompositeSize.pointerLength; j++) {
        const offset = i * srcStructByteLength + srcCompositeSize.dataByteLength + (j << 3);
        const srcPtr = new Pointer(
          srcContent.segment,
          srcContent.byteOffset + offset,
          src._capnp.depthLimit - 1
        );
        const dstPtr = new Pointer(
          dstContent.segment,
          dstContent.byteOffset + offset + 8,
          dst._capnp.depthLimit - 1
        );
        copyFrom(srcPtr, dstPtr);
      }
    }
  } else {
    const byteLength = padToWord$1(
      srcElementSize === ListElementSize.BIT ? srcLength + 7 >>> 3 : getListElementByteLength(srcElementSize) * srcLength
    );
    const wordLength = byteLength >>> 3;
    dstContent = dst.segment.allocate(byteLength);
    dstContent.segment.copyWords(
      dstContent.byteOffset,
      srcContent.segment,
      srcContent.byteOffset,
      wordLength
    );
  }
  const res = initPointer(dstContent.segment, dstContent.byteOffset, dst);
  setListPointer(
    res.offsetWords,
    srcElementSize,
    srcLength,
    res.pointer,
    srcCompositeSize
  );
}
function copyFromStruct(src, dst) {
  if (dst._capnp.depthLimit <= 0)
    throw new Error(PTR_DEPTH_LIMIT_EXCEEDED);
  const srcContent = getContent(src);
  const srcSize = getTargetStructSize(src);
  const srcDataWordLength = getDataWordLength(srcSize);
  const dstContent = dst.segment.allocate(getByteLength(srcSize));
  dstContent.segment.copyWords(
    dstContent.byteOffset,
    srcContent.segment,
    srcContent.byteOffset,
    srcDataWordLength
  );
  for (let i = 0; i < srcSize.pointerLength; i++) {
    const offset = srcSize.dataByteLength + i * 8;
    const srcPtr = new Pointer(
      srcContent.segment,
      srcContent.byteOffset + offset,
      src._capnp.depthLimit - 1
    );
    const dstPtr = new Pointer(
      dstContent.segment,
      dstContent.byteOffset + offset,
      dst._capnp.depthLimit - 1
    );
    copyFrom(srcPtr, dstPtr);
  }
  if (dst._capnp.compositeList)
    return;
  const res = initPointer(dstContent.segment, dstContent.byteOffset, dst);
  setStructPointer(res.offsetWords, srcSize, res.pointer);
}
function trackPointerAllocation(message, p) {
  message._capnp.traversalLimit -= 8;
  if (message._capnp.traversalLimit <= 0) {
    throw new Error(format(PTR_TRAVERSAL_LIMIT_EXCEEDED, p));
  }
}
var PointerAllocationResult = class {
  offsetWords;
  pointer;
  constructor(pointer, offsetWords) {
    this.pointer = pointer;
    this.offsetWords = offsetWords;
  }
};
var PointerType = /* @__PURE__ */ ((PointerType2) => {
  PointerType2[PointerType2["STRUCT"] = 0] = "STRUCT";
  PointerType2[PointerType2["LIST"] = 1] = "LIST";
  PointerType2[PointerType2["FAR"] = 2] = "FAR";
  PointerType2[PointerType2["OTHER"] = 3] = "OTHER";
  return PointerType2;
})(PointerType || {});
var Pointer = class {
  _capnp;
  /** Offset, in bytes, from the start of the segment to the beginning of this pointer. */
  byteOffset;
  /**
   * The starting segment for this pointer's data. In the case of a far pointer, the actual content this pointer is
   * referencing will be in another segment within the same message.
   */
  segment;
  constructor(segment, byteOffset, depthLimit = MAX_DEPTH) {
    this._capnp = { compositeList: false, depthLimit };
    this.segment = segment;
    this.byteOffset = byteOffset;
    if (depthLimit < 1) {
      throw new Error(format(PTR_DEPTH_LIMIT_EXCEEDED, this));
    }
    trackPointerAllocation(segment.message, this);
    if (byteOffset < 0 || byteOffset > segment.byteLength) {
      throw new Error(format(PTR_OFFSET_OUT_OF_BOUNDS, byteOffset));
    }
  }
  [Symbol.toStringTag]() {
    return format("Pointer_%d", this.segment.id);
  }
  toString() {
    return format("->%d@%a%s", this.segment.id, this.byteOffset, dump(this));
  }
};
__publicField(Pointer, "_capnp", {
  displayName: "Pointer"
});
var _proxyHandler;
var _List = class extends Pointer {
  constructor(segment, byteOffset, depthLimit) {
    super(segment, byteOffset, depthLimit);
    return new Proxy(this, __privateGet(_List, _proxyHandler));
  }
  get length() {
    return getTargetListLength(this);
  }
  toArray() {
    const length = this.length;
    const res = Array.from({ length });
    for (let i = 0; i < length; i++) {
      res[i] = this.at(i);
    }
    return res;
  }
  get(_index) {
    throw new TypeError("Cannot get from a generic list.");
  }
  set(_index, _value) {
    throw new TypeError("Cannot set on a generic list.");
  }
  at(index) {
    if (index < 0) {
      const length = this.length;
      index += length;
    }
    return this.get(index);
  }
  concat(other) {
    const length = this.length;
    const otherLength = other.length;
    const res = Array.from({ length: length + otherLength });
    for (let i = 0; i < length; i++)
      res[i] = this.at(i);
    for (let i = 0; i < otherLength; i++)
      res[i + length] = other.at(i);
    return res;
  }
  some(cb, _this) {
    const length = this.length;
    for (let i = 0; i < length; i++) {
      if (cb.call(_this, this.at(i), i, this)) {
        return true;
      }
    }
    return false;
  }
  filter(cb, _this) {
    const length = this.length;
    const res = [];
    for (let i = 0; i < length; i++) {
      const value = this.at(i);
      if (cb.call(_this, value, i, this)) {
        res.push(value);
      }
    }
    return res;
  }
  find(cb, _this) {
    const length = this.length;
    for (let i = 0; i < length; i++) {
      const value = this.at(i);
      if (cb.call(_this, value, i, this)) {
        return value;
      }
    }
    return void 0;
  }
  findIndex(cb, _this) {
    const length = this.length;
    for (let i = 0; i < length; i++) {
      const value = this.at(i);
      if (cb.call(_this, value, i, this)) {
        return i;
      }
    }
    return -1;
  }
  forEach(cb, _this) {
    const length = this.length;
    for (let i = 0; i < length; i++) {
      cb.call(_this, this.at(i), i, this);
    }
  }
  map(cb, _this) {
    const length = this.length;
    const res = Array.from({ length });
    for (let i = 0; i < length; i++) {
      res[i] = cb.call(_this, this.at(i), i, this);
    }
    return res;
  }
  flatMap(cb, _this) {
    const length = this.length;
    const res = [];
    for (let i = 0; i < length; i++) {
      const r = cb.call(_this, this.at(i), i, this);
      res.push(...Array.isArray(r) ? r : [r]);
    }
    return res;
  }
  every(cb, _this) {
    const length = this.length;
    for (let i = 0; i < length; i++) {
      if (!cb.call(_this, this.at(i), i, this)) {
        return false;
      }
    }
    return true;
  }
  reduce(cb, initialValue) {
    let i = 0;
    let res;
    if (initialValue === void 0) {
      res = this.at(0);
      i++;
    } else {
      res = initialValue;
    }
    for (; i < this.length; i++) {
      res = cb(res, this.at(i), i, this);
    }
    return res;
  }
  reduceRight(cb, initialValue) {
    let i = this.length - 1;
    let res;
    if (initialValue === void 0) {
      res = this.at(i);
      i--;
    } else {
      res = initialValue;
    }
    for (; i >= 0; i--) {
      res = cb(res, this.at(i), i, this);
    }
    return res;
  }
  slice(start = 0, end) {
    const length = end ? Math.min(this.length, end) : this.length;
    const res = Array.from({ length: length - start });
    for (let i = start; i < length; i++)
      res[i] = this.at(i);
    return res;
  }
  join(separator) {
    return this.toArray().join(separator);
  }
  toReversed() {
    return this.toArray().reverse();
  }
  toSorted(compareFn) {
    return this.toArray().sort(compareFn);
  }
  toSpliced(start, deleteCount, ...items) {
    return this.toArray().splice(start, deleteCount, ...items);
  }
  fill(value, start, end) {
    const length = this.length;
    const s = Math.max(start ?? 0, 0);
    const e = Math.min(end ?? length, length);
    for (let i = s; i < e; i++) {
      this.set(i, value);
    }
    return this;
  }
  copyWithin(target, start, end) {
    const length = this.length;
    const e = end ?? length;
    const s = start < 0 ? Math.max(length + start, 0) : start;
    const t = target < 0 ? Math.max(length + target, 0) : target;
    const len = Math.min(e - s, length - t);
    for (let i = 0; i < len; i++) {
      this.set(t + i, this.at(s + i));
    }
    return this;
  }
  keys() {
    const length = this.length;
    return Array.from({ length }, (_, i) => i)[Symbol.iterator]();
  }
  values() {
    return this.toArray().values();
  }
  entries() {
    return this.toArray().entries();
  }
  flat(depth) {
    return this.toArray().flat(depth);
  }
  with(index, value) {
    return this.toArray().with(index, value);
  }
  includes(_searchElement, _fromIndex) {
    throw new Error(LIST_NO_SEARCH);
  }
  findLast(_cb, _thisArg) {
    throw new Error(LIST_NO_SEARCH);
  }
  findLastIndex(_cb, _t) {
    throw new Error(LIST_NO_SEARCH);
  }
  indexOf(_searchElement, _fromIndex) {
    throw new Error(LIST_NO_SEARCH);
  }
  lastIndexOf(_searchElement, _fromIndex) {
    throw new Error(LIST_NO_SEARCH);
  }
  pop() {
    throw new Error(LIST_NO_MUTABLE);
  }
  push(..._items) {
    throw new Error(LIST_NO_MUTABLE);
  }
  reverse() {
    throw new Error(LIST_NO_MUTABLE);
  }
  shift() {
    throw new Error(LIST_NO_MUTABLE);
  }
  unshift(..._items) {
    throw new Error(LIST_NO_MUTABLE);
  }
  splice(_start, _deleteCount, ..._rest) {
    throw new Error(LIST_NO_MUTABLE);
  }
  sort(_fn) {
    throw new Error(LIST_NO_MUTABLE);
  }
  get [Symbol.unscopables]() {
    return Array.prototype[Symbol.unscopables];
  }
  [Symbol.iterator]() {
    return this.values();
  }
  toJSON() {
    return this.toArray();
  }
  toString() {
    return this.join(",");
  }
  toLocaleString(_locales, _options) {
    return this.toString();
  }
  [Symbol.toStringTag]() {
    return "[object Array]";
  }
  static [Symbol.toStringTag]() {
    return this._capnp.displayName;
  }
};
var List = _List;
_proxyHandler = new WeakMap();
__publicField(List, "_capnp", {
  displayName: "List<Generic>",
  size: ListElementSize.VOID
});
__privateAdd(List, _proxyHandler, {
  get(target, prop, receiver) {
    const val = Reflect.get(target, prop, receiver);
    if (val !== void 0)
      return val;
    if (typeof prop === "string") {
      return target.get(+prop);
    }
  }
});
function initList$1(elementSize, length, l, compositeSize) {
  let c;
  switch (elementSize) {
    case ListElementSize.BIT: {
      c = l.segment.allocate(Math.ceil(length / 8));
      break;
    }
    case ListElementSize.BYTE:
    case ListElementSize.BYTE_2:
    case ListElementSize.BYTE_4:
    case ListElementSize.BYTE_8:
    case ListElementSize.POINTER: {
      c = l.segment.allocate(length * getListElementByteLength(elementSize));
      break;
    }
    case ListElementSize.COMPOSITE: {
      if (compositeSize === void 0) {
        throw new Error(format(PTR_COMPOSITE_SIZE_UNDEFINED));
      }
      compositeSize = padToWord(compositeSize);
      const byteLength = getByteLength(compositeSize) * length;
      c = l.segment.allocate(byteLength + 8);
      setStructPointer(length, compositeSize, c);
      break;
    }
    case ListElementSize.VOID: {
      setListPointer(0, elementSize, length, l);
      return;
    }
    default: {
      throw new Error(format(PTR_INVALID_LIST_SIZE, elementSize));
    }
  }
  const res = initPointer(c.segment, c.byteOffset, l);
  setListPointer(
    res.offsetWords,
    elementSize,
    length,
    res.pointer,
    compositeSize
  );
}
var Data = class extends List {
  static fromPointer(pointer) {
    validate(PointerType.LIST, pointer, ListElementSize.BYTE);
    return this._fromPointerUnchecked(pointer);
  }
  static _fromPointerUnchecked(pointer) {
    return new this(
      pointer.segment,
      pointer.byteOffset,
      pointer._capnp.depthLimit
    );
  }
  /**
   * Copy the contents of `src` into this Data pointer. If `src` is smaller than the length of this pointer then the
   * remaining bytes will be zeroed out. Extra bytes in `src` are ignored.
   *
   * @param {(ArrayBuffer | ArrayBufferView)} src The source buffer.
   * @returns {void}
   */
  // TODO: Would be nice to have a way to zero-copy a buffer by allocating a new segment into the message with that
  // buffer data.
  copyBuffer(src) {
    const c = getContent(this);
    const dstLength = this.length;
    const srcLength = src.byteLength;
    const i = src instanceof ArrayBuffer ? new Uint8Array(src) : new Uint8Array(
      src.buffer,
      src.byteOffset,
      Math.min(dstLength, srcLength)
    );
    const o = new Uint8Array(c.segment.buffer, c.byteOffset, this.length);
    o.set(i);
    if (dstLength > srcLength) {
      o.fill(0, srcLength, dstLength);
    }
  }
  /**
   * Read a byte from the specified offset.
   *
   * @param {number} byteOffset The byte offset to read.
   * @returns {number} The byte value.
   */
  get(byteOffset) {
    const c = getContent(this);
    return c.segment.getUint8(c.byteOffset + byteOffset);
  }
  /**
   * Write a byte at the specified offset.
   *
   * @param {number} byteOffset The byte offset to set.
   * @param {number} value The byte value to set.
   * @returns {void}
   */
  set(byteOffset, value) {
    const c = getContent(this);
    c.segment.setUint8(c.byteOffset + byteOffset, value);
  }
  /**
   * Creates a **copy** of the underlying buffer data and returns it as an ArrayBuffer.
   *
   * To obtain a reference to the underlying buffer instead, use `toUint8Array()` or `toDataView()`.
   *
   * @returns {ArrayBuffer} A copy of this data buffer.
   */
  toArrayBuffer() {
    const c = getContent(this);
    return c.segment.buffer.slice(c.byteOffset, c.byteOffset + this.length);
  }
  /**
   * Convert this Data pointer to a DataView representing the pointer's contents.
   *
   * WARNING: The DataView references memory from a message segment, so do not venture outside the bounds of the
   * DataView or else BAD THINGS.
   *
   * @returns {DataView} A live reference to the underlying buffer.
   */
  toDataView() {
    const c = getContent(this);
    return new DataView(c.segment.buffer, c.byteOffset, this.length);
  }
  [Symbol.toStringTag]() {
    return `Data_${super.toString()}`;
  }
  /**
   * Convert this Data pointer to a Uint8Array representing the pointer's contents.
   *
   * WARNING: The Uint8Array references memory from a message segment, so do not venture outside the bounds of the
   * Uint8Array or else BAD THINGS.
   *
   * @returns {DataView} A live reference to the underlying buffer.
   */
  toUint8Array() {
    const c = getContent(this);
    return new Uint8Array(c.segment.buffer, c.byteOffset, this.length);
  }
};
var textEncoder = new TextEncoder();
var textDecoder = new TextDecoder();
var Text = class extends List {
  static fromPointer(pointer) {
    validate(PointerType.LIST, pointer, ListElementSize.BYTE);
    return textFromPointerUnchecked(pointer);
  }
  /**
   * Read a utf-8 encoded string value from this pointer.
   *
   * @param {number} [index] The index at which to start reading; defaults to zero.
   * @returns {string} The string value.
   */
  get(index = 0) {
    if (isNull(this))
      return "";
    const c = getContent(this);
    return textDecoder.decode(
      new Uint8Array(
        c.segment.buffer,
        c.byteOffset + index,
        this.length - index
      )
    );
  }
  /**
   * Get the number of utf-8 encoded bytes in this text. This does **not** include the NUL byte.
   *
   * @returns {number} The number of bytes allocated for the text.
   */
  get length() {
    return super.length - 1;
  }
  /**
   * Write a utf-8 encoded string value starting at the specified index.
   *
   * @param {number} index The index at which to start copying the string. Note that if this is not zero the bytes
   * before `index` will be left as-is. All bytes after `index` will be overwritten.
   * @param {string} value The string value to set.
   * @returns {void}
   */
  set(index, value) {
    const src = textEncoder.encode(value);
    const dstLength = src.byteLength + index;
    let c;
    let original;
    if (!isNull(this)) {
      c = getContent(this);
      let originalLength = this.length;
      if (originalLength >= index) {
        originalLength = index;
      }
      original = new Uint8Array(
        c.segment.buffer.slice(
          c.byteOffset,
          c.byteOffset + Math.min(originalLength, index)
        )
      );
      erase(this);
    }
    initList$1(ListElementSize.BYTE, dstLength + 1, this);
    c = getContent(this);
    const dst = new Uint8Array(c.segment.buffer, c.byteOffset, dstLength);
    if (original)
      dst.set(original);
    dst.set(src, index);
  }
  toString() {
    return this.get();
  }
  toJSON() {
    return this.get();
  }
  [Symbol.toPrimitive]() {
    return this.get();
  }
  [Symbol.toStringTag]() {
    return `Text_${super.toString()}`;
  }
};
function textFromPointerUnchecked(pointer) {
  return new Text(
    pointer.segment,
    pointer.byteOffset,
    pointer._capnp.depthLimit
  );
}
var Struct = class extends Pointer {
  /**
   * Create a new pointer to a struct.
   *
   * @constructor {Struct}
   * @param {Segment} segment The segment the pointer resides in.
   * @param {number} byteOffset The offset from the beginning of the segment to the beginning of the pointer data.
   * @param {any} [depthLimit=MAX_DEPTH] The nesting depth limit for this object.
   * @param {number} [compositeIndex] If set, then this pointer is actually a reference to a composite list
   * (`this._getPointerTargetType() === PointerType.LIST`), and this number is used as the index of the struct within
   * the list. It is not valid to call `initStruct()` on a composite struct – the struct contents are initialized when
   * the list pointer is initialized.
   */
  constructor(segment, byteOffset, depthLimit = MAX_DEPTH, compositeIndex) {
    super(segment, byteOffset, depthLimit);
    this._capnp.compositeIndex = compositeIndex;
    this._capnp.compositeList = compositeIndex !== void 0;
  }
  static [Symbol.toStringTag]() {
    return this._capnp.displayName;
  }
  [Symbol.toStringTag]() {
    return `Struct_${super.toString()}${this._capnp.compositeIndex === void 0 ? "" : `,ci:${this._capnp.compositeIndex}`} > ${getContent(this).toString()}`;
  }
};
__publicField(Struct, "_capnp", {
  displayName: "Struct"
});
var AnyStruct = class extends Struct {
};
__publicField(AnyStruct, "_capnp", {
  displayName: "AnyStruct",
  id: "0",
  size: new ObjectSize(0, 0)
});
var FixedAnswer = class {
  struct() {
    return Promise.resolve(this.structSync());
  }
};
var ErrorAnswer = class extends FixedAnswer {
  err;
  constructor(err) {
    super();
    this.err = err;
  }
  structSync() {
    throw this.err;
  }
  pipelineCall(_transform, _call) {
    return this;
  }
  pipelineClose(_transform) {
    throw this.err;
  }
};
var ErrorClient = class {
  err;
  constructor(err) {
    this.err = err;
  }
  call(_call) {
    return new ErrorAnswer(this.err);
  }
  close() {
    throw this.err;
  }
};
function clientOrNull(client) {
  return client ? client : new ErrorClient(new Error(RPC_NULL_CLIENT));
}
var TMP_WORD = new DataView(new ArrayBuffer(8));
function initStruct(size, s) {
  if (s._capnp.compositeIndex !== void 0) {
    throw new Error(format(PTR_INIT_COMPOSITE_STRUCT, s));
  }
  erase(s);
  const c = s.segment.allocate(getByteLength(size));
  const res = initPointer(c.segment, c.byteOffset, s);
  setStructPointer(res.offsetWords, size, res.pointer);
}
function initStructAt(index, StructClass, p) {
  const s = getPointerAs(index, StructClass, p);
  initStruct(StructClass._capnp.size, s);
  return s;
}
function checkPointerBounds(index, s) {
  const pointerLength = getSize(s).pointerLength;
  if (index < 0 || index >= pointerLength) {
    throw new Error(
      format(PTR_STRUCT_POINTER_OUT_OF_BOUNDS, s, index, pointerLength)
    );
  }
}
function getInterfaceClientOrNullAt(index, s) {
  return getInterfaceClientOrNull(getPointer(index, s));
}
function getInterfaceClientOrNull(p) {
  let client = null;
  const capId = getInterfacePointer(p);
  const capTable = p.segment.message._capnp.capTable;
  if (capTable && capId >= 0 && capId < capTable.length) {
    client = capTable[capId];
  }
  return clientOrNull(client);
}
function resize(dstSize, s) {
  const srcSize = getSize(s);
  const srcContent = getContent(s);
  const dstContent = s.segment.allocate(getByteLength(dstSize));
  dstContent.segment.copyWords(
    dstContent.byteOffset,
    srcContent.segment,
    srcContent.byteOffset,
    Math.min(getDataWordLength(srcSize), getDataWordLength(dstSize))
  );
  const res = initPointer(dstContent.segment, dstContent.byteOffset, s);
  setStructPointer(res.offsetWords, dstSize, res.pointer);
  for (let i = 0; i < Math.min(srcSize.pointerLength, dstSize.pointerLength); i++) {
    const srcPtr = new Pointer(
      srcContent.segment,
      srcContent.byteOffset + srcSize.dataByteLength + i * 8
    );
    if (isNull(srcPtr)) {
      continue;
    }
    const srcPtrTarget = followFars(srcPtr);
    const srcPtrContent = getContent(srcPtr);
    const dstPtr = new Pointer(
      dstContent.segment,
      dstContent.byteOffset + dstSize.dataByteLength + i * 8
    );
    if (getTargetPointerType(srcPtr) === PointerType.LIST && getTargetListElementSize(srcPtr) === ListElementSize.COMPOSITE) {
      srcPtrContent.byteOffset -= 8;
    }
    const r = initPointer(
      srcPtrContent.segment,
      srcPtrContent.byteOffset,
      dstPtr
    );
    const a = srcPtrTarget.segment.getUint8(srcPtrTarget.byteOffset) & 3;
    const b = srcPtrTarget.segment.getUint32(srcPtrTarget.byteOffset + 4);
    r.pointer.segment.setUint32(r.pointer.byteOffset, a | r.offsetWords << 2);
    r.pointer.segment.setUint32(r.pointer.byteOffset + 4, b);
  }
  srcContent.segment.fillZeroWords(
    srcContent.byteOffset,
    getWordLength(srcSize)
  );
}
function getAs(StructClass, s) {
  return new StructClass(
    s.segment,
    s.byteOffset,
    s._capnp.depthLimit,
    s._capnp.compositeIndex
  );
}
function getBit(bitOffset, s, defaultMask) {
  const byteOffset = Math.floor(bitOffset / 8);
  const bitMask = 1 << bitOffset % 8;
  checkDataBounds(byteOffset, 1, s);
  const ds = getDataSection(s);
  const v = ds.segment.getUint8(ds.byteOffset + byteOffset);
  if (defaultMask === void 0)
    return (v & bitMask) !== 0;
  const defaultValue = defaultMask.getUint8(0);
  return ((v ^ defaultValue) & bitMask) !== 0;
}
function getData(index, s, defaultValue) {
  checkPointerBounds(index, s);
  const ps = getPointerSection(s);
  ps.byteOffset += index * 8;
  const l = new Data(ps.segment, ps.byteOffset, s._capnp.depthLimit - 1);
  if (isNull(l)) {
    if (defaultValue) {
      copyFrom(defaultValue, l);
    } else {
      initList$1(ListElementSize.BYTE, 0, l);
    }
  }
  return l;
}
function getDataSection(s) {
  return getContent(s);
}
function getFloat32(byteOffset, s, defaultMask) {
  checkDataBounds(byteOffset, 4, s);
  const ds = getDataSection(s);
  if (defaultMask === void 0) {
    return ds.segment.getFloat32(ds.byteOffset + byteOffset);
  }
  const v = ds.segment.getUint32(ds.byteOffset + byteOffset) ^ defaultMask.getUint32(0, true);
  TMP_WORD.setUint32(0, v, NATIVE_LITTLE_ENDIAN);
  return TMP_WORD.getFloat32(0, NATIVE_LITTLE_ENDIAN);
}
function getFloat64(byteOffset, s, defaultMask) {
  checkDataBounds(byteOffset, 8, s);
  const ds = getDataSection(s);
  if (defaultMask !== void 0) {
    const lo = ds.segment.getUint32(ds.byteOffset + byteOffset) ^ defaultMask.getUint32(0, true);
    const hi = ds.segment.getUint32(ds.byteOffset + byteOffset + 4) ^ defaultMask.getUint32(4, true);
    TMP_WORD.setUint32(0, lo, NATIVE_LITTLE_ENDIAN);
    TMP_WORD.setUint32(4, hi, NATIVE_LITTLE_ENDIAN);
    return TMP_WORD.getFloat64(0, NATIVE_LITTLE_ENDIAN);
  }
  return ds.segment.getFloat64(ds.byteOffset + byteOffset);
}
function getInt16(byteOffset, s, defaultMask) {
  checkDataBounds(byteOffset, 2, s);
  const ds = getDataSection(s);
  if (defaultMask === void 0) {
    return ds.segment.getInt16(ds.byteOffset + byteOffset);
  }
  const v = ds.segment.getUint16(ds.byteOffset + byteOffset) ^ defaultMask.getUint16(0, true);
  TMP_WORD.setUint16(0, v, NATIVE_LITTLE_ENDIAN);
  return TMP_WORD.getInt16(0, NATIVE_LITTLE_ENDIAN);
}
function getInt32(byteOffset, s, defaultMask) {
  checkDataBounds(byteOffset, 4, s);
  const ds = getDataSection(s);
  if (defaultMask === void 0) {
    return ds.segment.getInt32(ds.byteOffset + byteOffset);
  }
  const v = ds.segment.getUint32(ds.byteOffset + byteOffset) ^ defaultMask.getUint16(0, true);
  TMP_WORD.setUint32(0, v, NATIVE_LITTLE_ENDIAN);
  return TMP_WORD.getInt32(0, NATIVE_LITTLE_ENDIAN);
}
function getInt64(byteOffset, s, defaultMask) {
  checkDataBounds(byteOffset, 8, s);
  const ds = getDataSection(s);
  if (defaultMask !== void 0) {
    const lo = ds.segment.getUint32(ds.byteOffset + byteOffset) ^ defaultMask.getUint32(0, true);
    const hi = ds.segment.getUint32(ds.byteOffset + byteOffset + 4) ^ defaultMask.getUint32(4, true);
    TMP_WORD.setUint32(NATIVE_LITTLE_ENDIAN ? 0 : 4, lo, NATIVE_LITTLE_ENDIAN);
    TMP_WORD.setUint32(NATIVE_LITTLE_ENDIAN ? 4 : 0, hi, NATIVE_LITTLE_ENDIAN);
    return TMP_WORD.getBigInt64(0, NATIVE_LITTLE_ENDIAN);
  }
  return ds.segment.getInt64(ds.byteOffset + byteOffset);
}
function getInt8(byteOffset, s, defaultMask) {
  checkDataBounds(byteOffset, 1, s);
  const ds = getDataSection(s);
  if (defaultMask === void 0) {
    return ds.segment.getInt8(ds.byteOffset + byteOffset);
  }
  const v = ds.segment.getUint8(ds.byteOffset + byteOffset) ^ defaultMask.getUint8(0);
  TMP_WORD.setUint8(0, v);
  return TMP_WORD.getInt8(0);
}
function getList(index, ListClass, s, defaultValue) {
  checkPointerBounds(index, s);
  const ps = getPointerSection(s);
  ps.byteOffset += index * 8;
  const l = new ListClass(ps.segment, ps.byteOffset, s._capnp.depthLimit - 1);
  if (isNull(l)) {
    if (defaultValue) {
      copyFrom(defaultValue, l);
    } else {
      initList$1(ListClass._capnp.size, 0, l, ListClass._capnp.compositeSize);
    }
  } else if (ListClass._capnp.compositeSize !== void 0) {
    const srcSize = getTargetCompositeListSize(l);
    const dstSize = ListClass._capnp.compositeSize;
    if (dstSize.dataByteLength > srcSize.dataByteLength || dstSize.pointerLength > srcSize.pointerLength) {
      const srcContent = getContent(l);
      const srcLength = getTargetListLength(l);
      const dstContent = l.segment.allocate(
        getByteLength(dstSize) * srcLength + 8
      );
      const res = initPointer(dstContent.segment, dstContent.byteOffset, l);
      setListPointer(
        res.offsetWords,
        ListClass._capnp.size,
        srcLength,
        res.pointer,
        dstSize
      );
      setStructPointer(srcLength, dstSize, dstContent);
      dstContent.byteOffset += 8;
      for (let i = 0; i < srcLength; i++) {
        const srcElementOffset = srcContent.byteOffset + i * getByteLength(srcSize);
        const dstElementOffset = dstContent.byteOffset + i * getByteLength(dstSize);
        dstContent.segment.copyWords(
          dstElementOffset,
          srcContent.segment,
          srcElementOffset,
          getWordLength(srcSize)
        );
        for (let j = 0; j < srcSize.pointerLength; j++) {
          const srcPtr = new Pointer(
            srcContent.segment,
            srcElementOffset + srcSize.dataByteLength + j * 8
          );
          const dstPtr = new Pointer(
            dstContent.segment,
            dstElementOffset + dstSize.dataByteLength + j * 8
          );
          const srcPtrTarget = followFars(srcPtr);
          const srcPtrContent = getContent(srcPtr);
          if (getTargetPointerType(srcPtr) === PointerType.LIST && getTargetListElementSize(srcPtr) === ListElementSize.COMPOSITE) {
            srcPtrContent.byteOffset -= 8;
          }
          const r = initPointer(
            srcPtrContent.segment,
            srcPtrContent.byteOffset,
            dstPtr
          );
          const a = srcPtrTarget.segment.getUint8(srcPtrTarget.byteOffset) & 3;
          const b = srcPtrTarget.segment.getUint32(srcPtrTarget.byteOffset + 4);
          r.pointer.segment.setUint32(
            r.pointer.byteOffset,
            a | r.offsetWords << 2
          );
          r.pointer.segment.setUint32(r.pointer.byteOffset + 4, b);
        }
      }
      srcContent.segment.fillZeroWords(
        srcContent.byteOffset,
        getWordLength(srcSize) * srcLength
      );
    }
  }
  return l;
}
function getPointer(index, s) {
  checkPointerBounds(index, s);
  const ps = getPointerSection(s);
  ps.byteOffset += index * 8;
  return new Pointer(ps.segment, ps.byteOffset, s._capnp.depthLimit - 1);
}
function getPointerAs(index, PointerClass, s) {
  checkPointerBounds(index, s);
  const ps = getPointerSection(s);
  ps.byteOffset += index * 8;
  return new PointerClass(ps.segment, ps.byteOffset, s._capnp.depthLimit - 1);
}
function getPointerSection(s) {
  const ps = getContent(s);
  ps.byteOffset += padToWord$1(getSize(s).dataByteLength);
  return ps;
}
function getSize(s) {
  if (s._capnp.compositeIndex !== void 0) {
    const c = getContent(s, true);
    c.byteOffset -= 8;
    return getStructSize(c);
  }
  return getTargetStructSize(s);
}
function getStruct(index, StructClass, s, defaultValue) {
  const t = getPointerAs(index, StructClass, s);
  if (isNull(t)) {
    if (defaultValue) {
      copyFrom(defaultValue, t);
    } else {
      initStruct(StructClass._capnp.size, t);
    }
  } else {
    validate(PointerType.STRUCT, t);
    const ts = getTargetStructSize(t);
    if (ts.dataByteLength < StructClass._capnp.size.dataByteLength || ts.pointerLength < StructClass._capnp.size.pointerLength) {
      resize(StructClass._capnp.size, t);
    }
  }
  return t;
}
function getText(index, s, defaultValue) {
  const t = Text.fromPointer(getPointer(index, s));
  if (isNull(t) && defaultValue)
    t.set(0, defaultValue);
  return t.get(0);
}
function getUint16(byteOffset, s, defaultMask) {
  checkDataBounds(byteOffset, 2, s);
  const ds = getDataSection(s);
  if (defaultMask === void 0) {
    return ds.segment.getUint16(ds.byteOffset + byteOffset);
  }
  return ds.segment.getUint16(ds.byteOffset + byteOffset) ^ defaultMask.getUint16(0, true);
}
function getUint32(byteOffset, s, defaultMask) {
  checkDataBounds(byteOffset, 4, s);
  const ds = getDataSection(s);
  if (defaultMask === void 0) {
    return ds.segment.getUint32(ds.byteOffset + byteOffset);
  }
  return ds.segment.getUint32(ds.byteOffset + byteOffset) ^ defaultMask.getUint32(0, true);
}
function getUint64(byteOffset, s, defaultMask) {
  checkDataBounds(byteOffset, 8, s);
  const ds = getDataSection(s);
  if (defaultMask !== void 0) {
    const lo = ds.segment.getUint32(ds.byteOffset + byteOffset) ^ defaultMask.getUint32(0, true);
    const hi = ds.segment.getUint32(ds.byteOffset + byteOffset + 4) ^ defaultMask.getUint32(4, true);
    TMP_WORD.setUint32(NATIVE_LITTLE_ENDIAN ? 0 : 4, lo, NATIVE_LITTLE_ENDIAN);
    TMP_WORD.setUint32(NATIVE_LITTLE_ENDIAN ? 4 : 0, hi, NATIVE_LITTLE_ENDIAN);
    return TMP_WORD.getBigUint64(0, NATIVE_LITTLE_ENDIAN);
  }
  return ds.segment.getUint64(ds.byteOffset + byteOffset);
}
function getUint8(byteOffset, s, defaultMask) {
  checkDataBounds(byteOffset, 1, s);
  const ds = getDataSection(s);
  if (defaultMask === void 0) {
    return ds.segment.getUint8(ds.byteOffset + byteOffset);
  }
  return ds.segment.getUint8(ds.byteOffset + byteOffset) ^ defaultMask.getUint8(0);
}
function initData(index, length, s) {
  checkPointerBounds(index, s);
  const ps = getPointerSection(s);
  ps.byteOffset += index * 8;
  const l = new Data(ps.segment, ps.byteOffset, s._capnp.depthLimit - 1);
  erase(l);
  initList$1(ListElementSize.BYTE, length, l);
  return l;
}
function initList(index, ListClass, length, s) {
  checkPointerBounds(index, s);
  const ps = getPointerSection(s);
  ps.byteOffset += index * 8;
  const l = new ListClass(ps.segment, ps.byteOffset, s._capnp.depthLimit - 1);
  erase(l);
  initList$1(ListClass._capnp.size, length, l, ListClass._capnp.compositeSize);
  return l;
}
function setBit(bitOffset, value, s, defaultMask) {
  const byteOffset = Math.floor(bitOffset / 8);
  const bitMask = 1 << bitOffset % 8;
  checkDataBounds(byteOffset, 1, s);
  const ds = getDataSection(s);
  const b = ds.segment.getUint8(ds.byteOffset + byteOffset);
  if (defaultMask !== void 0) {
    value = (defaultMask.getUint8(0) & bitMask) === 0 ? value : !value;
  }
  ds.segment.setUint8(
    ds.byteOffset + byteOffset,
    value ? b | bitMask : b & ~bitMask
  );
}
function setFloat32(byteOffset, value, s, defaultMask) {
  checkDataBounds(byteOffset, 4, s);
  const ds = getDataSection(s);
  if (defaultMask !== void 0) {
    TMP_WORD.setFloat32(0, value, NATIVE_LITTLE_ENDIAN);
    const v = TMP_WORD.getUint32(0, NATIVE_LITTLE_ENDIAN) ^ defaultMask.getUint32(0, true);
    ds.segment.setUint32(ds.byteOffset + byteOffset, v);
    return;
  }
  ds.segment.setFloat32(ds.byteOffset + byteOffset, value);
}
function setFloat64(byteOffset, value, s, defaultMask) {
  checkDataBounds(byteOffset, 8, s);
  const ds = getDataSection(s);
  if (defaultMask !== void 0) {
    TMP_WORD.setFloat64(0, value, NATIVE_LITTLE_ENDIAN);
    const lo = TMP_WORD.getUint32(0, NATIVE_LITTLE_ENDIAN) ^ defaultMask.getUint32(0, true);
    const hi = TMP_WORD.getUint32(4, NATIVE_LITTLE_ENDIAN) ^ defaultMask.getUint32(4, true);
    ds.segment.setUint32(ds.byteOffset + byteOffset, lo);
    ds.segment.setUint32(ds.byteOffset + byteOffset + 4, hi);
    return;
  }
  ds.segment.setFloat64(ds.byteOffset + byteOffset, value);
}
function setInt16(byteOffset, value, s, defaultMask) {
  checkDataBounds(byteOffset, 2, s);
  const ds = getDataSection(s);
  if (defaultMask !== void 0) {
    TMP_WORD.setInt16(0, value, NATIVE_LITTLE_ENDIAN);
    const v = TMP_WORD.getUint16(0, NATIVE_LITTLE_ENDIAN) ^ defaultMask.getUint16(0, true);
    ds.segment.setUint16(ds.byteOffset + byteOffset, v);
    return;
  }
  ds.segment.setInt16(ds.byteOffset + byteOffset, value);
}
function setInt32(byteOffset, value, s, defaultMask) {
  checkDataBounds(byteOffset, 4, s);
  const ds = getDataSection(s);
  if (defaultMask !== void 0) {
    TMP_WORD.setInt32(0, value, NATIVE_LITTLE_ENDIAN);
    const v = TMP_WORD.getUint32(0, NATIVE_LITTLE_ENDIAN) ^ defaultMask.getUint32(0, true);
    ds.segment.setUint32(ds.byteOffset + byteOffset, v);
    return;
  }
  ds.segment.setInt32(ds.byteOffset + byteOffset, value);
}
function setInt64(byteOffset, value, s, defaultMask) {
  checkDataBounds(byteOffset, 8, s);
  const ds = getDataSection(s);
  if (defaultMask !== void 0) {
    TMP_WORD.setBigInt64(0, value, NATIVE_LITTLE_ENDIAN);
    const lo = TMP_WORD.getUint32(NATIVE_LITTLE_ENDIAN ? 0 : 4, NATIVE_LITTLE_ENDIAN) ^ defaultMask.getUint32(0, true);
    const hi = TMP_WORD.getUint32(NATIVE_LITTLE_ENDIAN ? 4 : 0, NATIVE_LITTLE_ENDIAN) ^ defaultMask.getUint32(4, true);
    ds.segment.setUint32(ds.byteOffset + byteOffset, lo);
    ds.segment.setUint32(ds.byteOffset + byteOffset + 4, hi);
    return;
  }
  ds.segment.setInt64(ds.byteOffset + byteOffset, value);
}
function setInt8(byteOffset, value, s, defaultMask) {
  checkDataBounds(byteOffset, 1, s);
  const ds = getDataSection(s);
  if (defaultMask !== void 0) {
    TMP_WORD.setInt8(0, value);
    const v = TMP_WORD.getUint8(0) ^ defaultMask.getUint8(0);
    ds.segment.setUint8(ds.byteOffset + byteOffset, v);
    return;
  }
  ds.segment.setInt8(ds.byteOffset + byteOffset, value);
}
function setText(index, value, s) {
  Text.fromPointer(getPointer(index, s)).set(0, value);
}
function setUint16(byteOffset, value, s, defaultMask) {
  checkDataBounds(byteOffset, 2, s);
  const ds = getDataSection(s);
  if (defaultMask !== void 0)
    value ^= defaultMask.getUint16(0, true);
  ds.segment.setUint16(ds.byteOffset + byteOffset, value);
}
function setUint32(byteOffset, value, s, defaultMask) {
  checkDataBounds(byteOffset, 4, s);
  const ds = getDataSection(s);
  if (defaultMask !== void 0)
    value ^= defaultMask.getUint32(0, true);
  ds.segment.setUint32(ds.byteOffset + byteOffset, value);
}
function setUint64(byteOffset, value, s, defaultMask) {
  checkDataBounds(byteOffset, 8, s);
  const ds = getDataSection(s);
  if (defaultMask !== void 0) {
    TMP_WORD.setBigUint64(0, value, NATIVE_LITTLE_ENDIAN);
    const lo = TMP_WORD.getUint32(NATIVE_LITTLE_ENDIAN ? 0 : 4, NATIVE_LITTLE_ENDIAN) ^ defaultMask.getUint32(0, true);
    const hi = TMP_WORD.getUint32(NATIVE_LITTLE_ENDIAN ? 4 : 0, NATIVE_LITTLE_ENDIAN) ^ defaultMask.getUint32(4, true);
    ds.segment.setUint32(ds.byteOffset + byteOffset, lo);
    ds.segment.setUint32(ds.byteOffset + byteOffset + 4, hi);
    return;
  }
  ds.segment.setUint64(ds.byteOffset + byteOffset, value);
}
function setUint8(byteOffset, value, s, defaultMask) {
  checkDataBounds(byteOffset, 1, s);
  const ds = getDataSection(s);
  if (defaultMask !== void 0)
    value ^= defaultMask.getUint8(0);
  ds.segment.setUint8(ds.byteOffset + byteOffset, value);
}
function testWhich(name, found, wanted, s) {
  if (found !== wanted) {
    throw new Error(format(PTR_INVALID_UNION_ACCESS, s, name, found, wanted));
  }
}
function checkDataBounds(byteOffset, byteLength, s) {
  const dataByteLength = getSize(s).dataByteLength;
  if (byteOffset < 0 || byteLength < 0 || byteOffset + byteLength > dataByteLength) {
    throw new Error(
      format(
        PTR_STRUCT_DATA_OUT_OF_BOUNDS,
        s,
        byteLength,
        byteOffset,
        dataByteLength
      )
    );
  }
}

// ../../node_modules/.pnpm/capnp-es@0.0.7_typescript@5.7.3/node_modules/capnp-es/dist/shared/capnp-es.DCKndyix.mjs
function CompositeList(CompositeClass) {
  return class extends List {
    static _capnp = {
      compositeSize: CompositeClass._capnp.size,
      displayName: `List<${CompositeClass._capnp.displayName}>`,
      size: ListElementSize.COMPOSITE
    };
    get(index) {
      return new CompositeClass(
        this.segment,
        this.byteOffset,
        this._capnp.depthLimit - 1,
        index
      );
    }
    set(index, value) {
      copyFrom(value, this.get(index));
    }
    [Symbol.toStringTag]() {
      return `Composite_${super.toString()},cls:${CompositeClass.toString()}`;
    }
  };
}
function _makePrimitiveMaskFn(byteLength, setter) {
  return (x) => {
    const dv = new DataView(new ArrayBuffer(byteLength));
    setter.call(dv, 0, x, true);
    return dv;
  };
}
var getFloat32Mask = _makePrimitiveMaskFn(
  4,
  DataView.prototype.setFloat32
);
var getFloat64Mask = _makePrimitiveMaskFn(
  8,
  DataView.prototype.setFloat64
);
var getInt16Mask = _makePrimitiveMaskFn(
  2,
  DataView.prototype.setInt16
);
var getInt32Mask = _makePrimitiveMaskFn(
  4,
  DataView.prototype.setInt32
);
var getInt64Mask = _makePrimitiveMaskFn(
  8,
  DataView.prototype.setBigInt64
);
var getInt8Mask = _makePrimitiveMaskFn(1, DataView.prototype.setInt8);
var getUint16Mask = _makePrimitiveMaskFn(
  2,
  DataView.prototype.setUint16
);
var getUint32Mask = _makePrimitiveMaskFn(
  4,
  DataView.prototype.setUint32
);
var getUint64Mask = _makePrimitiveMaskFn(
  8,
  DataView.prototype.setBigUint64
);
var getUint8Mask = _makePrimitiveMaskFn(
  1,
  DataView.prototype.setUint8
);

// ../../node_modules/.pnpm/capnp-es@0.0.7_typescript@5.7.3/node_modules/capnp-es/dist/shared/capnp-es.B1ADXvSS.mjs
var Interface = class extends Pointer {
  constructor(segment, byteOffset, depthLimit = MAX_DEPTH) {
    super(segment, byteOffset, depthLimit);
  }
  static fromPointer(p) {
    return getAsInterface(p);
  }
  getCapId() {
    return getCapID(this);
  }
  getClient() {
    return getClient(this);
  }
  [Symbol.for("nodejs.util.inspect.custom")]() {
    return format(
      "Interface_%d@%a,%d,limit:%x",
      this.segment.id,
      this.byteOffset,
      this.getCapId(),
      this._capnp.depthLimit
    );
  }
};
__publicField(Interface, "_capnp", {
  displayName: "Interface"
});
__publicField(Interface, "getCapID", getCapID);
__publicField(Interface, "getAsInterface", getAsInterface);
__publicField(Interface, "isInterface", isInterface);
__publicField(Interface, "getClient", getClient);
function getAsInterface(p) {
  if (getTargetPointerType(p) === PointerType.OTHER) {
    return new Interface(p.segment, p.byteOffset, p._capnp.depthLimit);
  }
  return null;
}
function isInterface(p) {
  return getTargetPointerType(p) === PointerType.OTHER;
}
function getCapID(i) {
  if (i.segment.getUint32(i.byteOffset) !== PointerType.OTHER) {
    return -1;
  }
  return i.segment.getUint32(i.byteOffset + 4);
}
function getClient(i) {
  const capID = getCapID(i);
  const { capTable } = i.segment.message._capnp;
  if (!capTable) {
    return null;
  }
  return capTable[capID];
}

// ../../node_modules/.pnpm/capnp-es@0.0.7_typescript@5.7.3/node_modules/capnp-es/dist/index.mjs
var Void = class extends Struct {
};
__publicField(Void, "_capnp", {
  displayName: "Void",
  id: "0",
  size: new ObjectSize(0, 0)
});
var utils = {
  __proto__: null,
  PointerAllocationResult,
  add,
  adopt,
  checkDataBounds,
  checkPointerBounds,
  copyFrom,
  copyFromInterface,
  copyFromList,
  copyFromStruct,
  disown,
  dump,
  erase,
  erasePointer,
  followFar,
  followFars,
  getAs,
  getBit,
  getCapabilityId,
  getContent,
  getData,
  getDataSection,
  getFarSegmentId,
  getFloat32,
  getFloat64,
  getInt16,
  getInt32,
  getInt64,
  getInt8,
  getInterfaceClientOrNull,
  getInterfaceClientOrNullAt,
  getInterfacePointer,
  getList,
  getListByteLength,
  getListElementByteLength,
  getListElementSize,
  getListLength,
  getOffsetWords,
  getPointer,
  getPointerAs,
  getPointerSection,
  getPointerType,
  getSize,
  getStruct,
  getStructDataWords,
  getStructPointerLength,
  getStructSize,
  getTargetCompositeListSize,
  getTargetCompositeListTag,
  getTargetListElementSize,
  getTargetListLength,
  getTargetPointerType,
  getTargetStructSize,
  getText,
  getUint16,
  getUint32,
  getUint64,
  getUint8,
  initData,
  initList,
  initPointer,
  initStruct,
  initStructAt,
  isDoubleFar,
  isNull,
  relocateTo,
  resize,
  setBit,
  setFarPointer,
  setFloat32,
  setFloat64,
  setInt16,
  setInt32,
  setInt64,
  setInt8,
  setInterfacePointer,
  setListPointer,
  setStructPointer,
  setText,
  setUint16,
  setUint32,
  setUint64,
  setUint8,
  testWhich,
  trackPointerAllocation,
  validate
};
function PointerList(PointerClass) {
  return class extends List {
    static _capnp = {
      displayName: `List<${PointerClass._capnp.displayName}>`,
      size: ListElementSize.POINTER
    };
    get(index) {
      const c = getContent(this);
      return new PointerClass(
        c.segment,
        c.byteOffset + index * 8,
        this._capnp.depthLimit - 1
      );
    }
    set(index, value) {
      copyFrom(value, this.get(index));
    }
    [Symbol.toStringTag]() {
      return `Pointer_${super.toString()},cls:${PointerClass.toString()}`;
    }
  };
}
var AnyPointerList = PointerList(Pointer);
var BoolList = class extends List {
  get(index) {
    const bitMask = 1 << index % 8;
    const byteOffset = index >>> 3;
    const c = getContent(this);
    const v = c.segment.getUint8(c.byteOffset + byteOffset);
    return (v & bitMask) !== 0;
  }
  set(index, value) {
    const bitMask = 1 << index % 8;
    const c = getContent(this);
    const byteOffset = c.byteOffset + (index >>> 3);
    const v = c.segment.getUint8(byteOffset);
    c.segment.setUint8(byteOffset, value ? v | bitMask : v & ~bitMask);
  }
  [Symbol.toStringTag]() {
    return `Bool_${super.toString()}`;
  }
};
__publicField(BoolList, "_capnp", {
  displayName: "List<boolean>",
  size: ListElementSize.BIT
});
var DataList = PointerList(Data);
var Float32List = class extends List {
  get(index) {
    const c = getContent(this);
    return c.segment.getFloat32(c.byteOffset + index * 4);
  }
  set(index, value) {
    const c = getContent(this);
    c.segment.setFloat32(c.byteOffset + index * 4, value);
  }
  [Symbol.toStringTag]() {
    return `Float32_${super.toString()}`;
  }
};
__publicField(Float32List, "_capnp", {
  displayName: "List<Float32>",
  size: ListElementSize.BYTE_4
});
var Float64List = class extends List {
  get(index) {
    const c = getContent(this);
    return c.segment.getFloat64(c.byteOffset + index * 8);
  }
  set(index, value) {
    const c = getContent(this);
    c.segment.setFloat64(c.byteOffset + index * 8, value);
  }
  [Symbol.toStringTag]() {
    return `Float64_${super.toString()}`;
  }
};
__publicField(Float64List, "_capnp", {
  displayName: "List<Float64>",
  size: ListElementSize.BYTE_8
});
var Int8List = class extends List {
  get(index) {
    const c = getContent(this);
    return c.segment.getInt8(c.byteOffset + index);
  }
  set(index, value) {
    const c = getContent(this);
    c.segment.setInt8(c.byteOffset + index, value);
  }
  [Symbol.toStringTag]() {
    return `Int8_${super.toString()}`;
  }
};
__publicField(Int8List, "_capnp", {
  displayName: "List<Int8>",
  size: ListElementSize.BYTE
});
var Int16List = class extends List {
  get(index) {
    const c = getContent(this);
    return c.segment.getInt16(c.byteOffset + index * 2);
  }
  set(index, value) {
    const c = getContent(this);
    c.segment.setInt16(c.byteOffset + index * 2, value);
  }
  [Symbol.toStringTag]() {
    return `Int16_${super.toString()}`;
  }
};
__publicField(Int16List, "_capnp", {
  displayName: "List<Int16>",
  size: ListElementSize.BYTE_2
});
var Int32List = class extends List {
  get(index) {
    const c = getContent(this);
    return c.segment.getInt32(c.byteOffset + index * 4);
  }
  set(index, value) {
    const c = getContent(this);
    c.segment.setInt32(c.byteOffset + index * 4, value);
  }
  [Symbol.toStringTag]() {
    return `Int32_${super.toString()}`;
  }
};
__publicField(Int32List, "_capnp", {
  displayName: "List<Int32>",
  size: ListElementSize.BYTE_4
});
var Int64List = class extends List {
  get(index) {
    const c = getContent(this);
    return c.segment.getInt64(c.byteOffset + index * 8);
  }
  set(index, value) {
    const c = getContent(this);
    c.segment.setInt64(c.byteOffset + index * 8, value);
  }
  [Symbol.toStringTag]() {
    return `Int64_${super.toString()}`;
  }
};
__publicField(Int64List, "_capnp", {
  displayName: "List<Int64>",
  size: ListElementSize.BYTE_8
});
var InterfaceList = PointerList(Interface);
var TextList = class extends List {
  get(index) {
    const c = getContent(this);
    c.byteOffset += index * 8;
    return Text.fromPointer(c).get(0);
  }
  set(index, value) {
    const c = getContent(this);
    c.byteOffset += index * 8;
    Text.fromPointer(c).set(0, value);
  }
  [Symbol.toStringTag]() {
    return `Text_${super.toString()}`;
  }
};
__publicField(TextList, "_capnp", {
  displayName: "List<Text>",
  size: ListElementSize.POINTER
});
var Uint8List = class extends List {
  get(index) {
    const c = getContent(this);
    return c.segment.getUint8(c.byteOffset + index);
  }
  set(index, value) {
    const c = getContent(this);
    c.segment.setUint8(c.byteOffset + index, value);
  }
  [Symbol.toStringTag]() {
    return `Uint8_${super.toString()}`;
  }
};
__publicField(Uint8List, "_capnp", {
  displayName: "List<Uint8>",
  size: ListElementSize.BYTE
});
var Uint16List = class extends List {
  get(index) {
    const c = getContent(this);
    return c.segment.getUint16(c.byteOffset + index * 2);
  }
  set(index, value) {
    const c = getContent(this);
    c.segment.setUint16(c.byteOffset + index * 2, value);
  }
  [Symbol.toStringTag]() {
    return `Uint16_${super.toString()}`;
  }
};
__publicField(Uint16List, "_capnp", {
  displayName: "List<Uint16>",
  size: ListElementSize.BYTE_2
});
var Uint32List = class extends List {
  get(index) {
    const c = getContent(this);
    return c.segment.getUint32(c.byteOffset + index * 4);
  }
  set(index, value) {
    const c = getContent(this);
    c.segment.setUint32(c.byteOffset + index * 4, value);
  }
  [Symbol.toStringTag]() {
    return `Uint32_${super.toString()}`;
  }
};
__publicField(Uint32List, "_capnp", {
  displayName: "List<Uint32>",
  size: ListElementSize.BYTE_4
});
var Uint64List = class extends List {
  get(index) {
    const c = getContent(this);
    return c.segment.getUint64(c.byteOffset + index * 8);
  }
  set(index, value) {
    const c = getContent(this);
    c.segment.setUint64(c.byteOffset + index * 8, value);
  }
  [Symbol.toStringTag]() {
    return `Uint64_${super.toString()}`;
  }
};
__publicField(Uint64List, "_capnp", {
  displayName: "List<Uint64>",
  size: ListElementSize.BYTE_8
});
var VoidList = PointerList(Void);
var ConnWeakRefRegistry = globalThis.FinalizationRegistry ? new FinalizationRegistry((cb) => cb()) : void 0;

// scripts/rtti/rtti.ts
var _capnpFileId = BigInt("0xb042d6da9e1721ad");
var Type_Which = {
  UNKNOWN: 0,
  VOIDT: 1,
  BOOLT: 2,
  NUMBER: 3,
  PROMISE: 4,
  STRUCTURE: 5,
  STRING: 6,
  OBJECT: 7,
  ARRAY: 8,
  MAYBE: 9,
  DICT: 10,
  ONE_OF: 11,
  BUILTIN: 12,
  INTRINSIC: 13,
  FUNCTION: 14,
  JSG_IMPL: 15,
  JS_BUILTIN: 16
};
var Type = class extends Struct {
  get _isUnknown() {
    return utils.getUint16(0, this) === 0;
  }
  set unknown(_) {
    utils.setUint16(0, 0, this);
  }
  get _isVoidt() {
    return utils.getUint16(0, this) === 1;
  }
  set voidt(_) {
    utils.setUint16(0, 1, this);
  }
  get _isBoolt() {
    return utils.getUint16(0, this) === 2;
  }
  set boolt(_) {
    utils.setUint16(0, 2, this);
  }
  _adoptNumber(value) {
    utils.setUint16(0, 3, this);
    utils.adopt(value, utils.getPointer(0, this));
  }
  _disownNumber() {
    return utils.disown(this.number);
  }
  /**
  * number type
  * */
  get number() {
    utils.testWhich("number", utils.getUint16(0, this), 3, this);
    return utils.getStruct(0, NumberType, this);
  }
  _hasNumber() {
    return !utils.isNull(utils.getPointer(0, this));
  }
  _initNumber() {
    utils.setUint16(0, 3, this);
    return utils.initStructAt(0, NumberType, this);
  }
  get _isNumber() {
    return utils.getUint16(0, this) === 3;
  }
  set number(value) {
    utils.setUint16(0, 3, this);
    utils.copyFrom(value, utils.getPointer(0, this));
  }
  _adoptPromise(value) {
    utils.setUint16(0, 4, this);
    utils.adopt(value, utils.getPointer(0, this));
  }
  _disownPromise() {
    return utils.disown(this.promise);
  }
  /**
  * jsg, kj Promise
  * */
  get promise() {
    utils.testWhich("promise", utils.getUint16(0, this), 4, this);
    return utils.getStruct(0, PromiseType, this);
  }
  _hasPromise() {
    return !utils.isNull(utils.getPointer(0, this));
  }
  _initPromise() {
    utils.setUint16(0, 4, this);
    return utils.initStructAt(0, PromiseType, this);
  }
  get _isPromise() {
    return utils.getUint16(0, this) === 4;
  }
  set promise(value) {
    utils.setUint16(0, 4, this);
    utils.copyFrom(value, utils.getPointer(0, this));
  }
  _adoptStructure(value) {
    utils.setUint16(0, 5, this);
    utils.adopt(value, utils.getPointer(0, this));
  }
  _disownStructure() {
    return utils.disown(this.structure);
  }
  /**
  * jsg resource or struct
  * */
  get structure() {
    utils.testWhich("structure", utils.getUint16(0, this), 5, this);
    return utils.getStruct(0, StructureType, this);
  }
  _hasStructure() {
    return !utils.isNull(utils.getPointer(0, this));
  }
  _initStructure() {
    utils.setUint16(0, 5, this);
    return utils.initStructAt(0, StructureType, this);
  }
  get _isStructure() {
    return utils.getUint16(0, this) === 5;
  }
  set structure(value) {
    utils.setUint16(0, 5, this);
    utils.copyFrom(value, utils.getPointer(0, this));
  }
  _adoptString(value) {
    utils.setUint16(0, 6, this);
    utils.adopt(value, utils.getPointer(0, this));
  }
  _disownString() {
    return utils.disown(this.string);
  }
  /**
  * any string-like type
  * */
  get string() {
    utils.testWhich("string", utils.getUint16(0, this), 6, this);
    return utils.getStruct(0, StringType, this);
  }
  _hasString() {
    return !utils.isNull(utils.getPointer(0, this));
  }
  _initString() {
    utils.setUint16(0, 6, this);
    return utils.initStructAt(0, StringType, this);
  }
  get _isString() {
    return utils.getUint16(0, this) === 6;
  }
  set string(value) {
    utils.setUint16(0, 6, this);
    utils.copyFrom(value, utils.getPointer(0, this));
  }
  get _isObject() {
    return utils.getUint16(0, this) === 7;
  }
  set object(_) {
    utils.setUint16(0, 7, this);
  }
  _adoptArray(value) {
    utils.setUint16(0, 8, this);
    utils.adopt(value, utils.getPointer(0, this));
  }
  _disownArray() {
    return utils.disown(this.array);
  }
  /**
  * Array or ArrayPtr
  * */
  get array() {
    utils.testWhich("array", utils.getUint16(0, this), 8, this);
    return utils.getStruct(0, ArrayType, this);
  }
  _hasArray() {
    return !utils.isNull(utils.getPointer(0, this));
  }
  _initArray() {
    utils.setUint16(0, 8, this);
    return utils.initStructAt(0, ArrayType, this);
  }
  get _isArray() {
    return utils.getUint16(0, this) === 8;
  }
  set array(value) {
    utils.setUint16(0, 8, this);
    utils.copyFrom(value, utils.getPointer(0, this));
  }
  _adoptMaybe(value) {
    utils.setUint16(0, 9, this);
    utils.adopt(value, utils.getPointer(0, this));
  }
  _disownMaybe() {
    return utils.disown(this.maybe);
  }
  /**
  * kj::Maybe or jsg::Optional
  * */
  get maybe() {
    utils.testWhich("maybe", utils.getUint16(0, this), 9, this);
    return utils.getStruct(0, MaybeType, this);
  }
  _hasMaybe() {
    return !utils.isNull(utils.getPointer(0, this));
  }
  _initMaybe() {
    utils.setUint16(0, 9, this);
    return utils.initStructAt(0, MaybeType, this);
  }
  get _isMaybe() {
    return utils.getUint16(0, this) === 9;
  }
  set maybe(value) {
    utils.setUint16(0, 9, this);
    utils.copyFrom(value, utils.getPointer(0, this));
  }
  _adoptDict(value) {
    utils.setUint16(0, 10, this);
    utils.adopt(value, utils.getPointer(0, this));
  }
  _disownDict() {
    return utils.disown(this.dict);
  }
  /**
  * jsg::Dict
  * */
  get dict() {
    utils.testWhich("dict", utils.getUint16(0, this), 10, this);
    return utils.getStruct(0, DictType, this);
  }
  _hasDict() {
    return !utils.isNull(utils.getPointer(0, this));
  }
  _initDict() {
    utils.setUint16(0, 10, this);
    return utils.initStructAt(0, DictType, this);
  }
  get _isDict() {
    return utils.getUint16(0, this) === 10;
  }
  set dict(value) {
    utils.setUint16(0, 10, this);
    utils.copyFrom(value, utils.getPointer(0, this));
  }
  _adoptOneOf(value) {
    utils.setUint16(0, 11, this);
    utils.adopt(value, utils.getPointer(0, this));
  }
  _disownOneOf() {
    return utils.disown(this.oneOf);
  }
  /**
  * kj::OneOf
  * */
  get oneOf() {
    utils.testWhich("oneOf", utils.getUint16(0, this), 11, this);
    return utils.getStruct(0, OneOfType, this);
  }
  _hasOneOf() {
    return !utils.isNull(utils.getPointer(0, this));
  }
  _initOneOf() {
    utils.setUint16(0, 11, this);
    return utils.initStructAt(0, OneOfType, this);
  }
  get _isOneOf() {
    return utils.getUint16(0, this) === 11;
  }
  set oneOf(value) {
    utils.setUint16(0, 11, this);
    utils.copyFrom(value, utils.getPointer(0, this));
  }
  _adoptBuiltin(value) {
    utils.setUint16(0, 12, this);
    utils.adopt(value, utils.getPointer(0, this));
  }
  _disownBuiltin() {
    return utils.disown(this.builtin);
  }
  /**
  * one of the builtin types
  * */
  get builtin() {
    utils.testWhich("builtin", utils.getUint16(0, this), 12, this);
    return utils.getStruct(0, BuiltinType, this);
  }
  _hasBuiltin() {
    return !utils.isNull(utils.getPointer(0, this));
  }
  _initBuiltin() {
    utils.setUint16(0, 12, this);
    return utils.initStructAt(0, BuiltinType, this);
  }
  get _isBuiltin() {
    return utils.getUint16(0, this) === 12;
  }
  set builtin(value) {
    utils.setUint16(0, 12, this);
    utils.copyFrom(value, utils.getPointer(0, this));
  }
  _adoptIntrinsic(value) {
    utils.setUint16(0, 13, this);
    utils.adopt(value, utils.getPointer(0, this));
  }
  _disownIntrinsic() {
    return utils.disown(this.intrinsic);
  }
  /**
  * one of v8 intrinsics
  * */
  get intrinsic() {
    utils.testWhich("intrinsic", utils.getUint16(0, this), 13, this);
    return utils.getStruct(0, IntrinsicType, this);
  }
  _hasIntrinsic() {
    return !utils.isNull(utils.getPointer(0, this));
  }
  _initIntrinsic() {
    utils.setUint16(0, 13, this);
    return utils.initStructAt(0, IntrinsicType, this);
  }
  get _isIntrinsic() {
    return utils.getUint16(0, this) === 13;
  }
  set intrinsic(value) {
    utils.setUint16(0, 13, this);
    utils.copyFrom(value, utils.getPointer(0, this));
  }
  _adoptFunction(value) {
    utils.setUint16(0, 14, this);
    utils.adopt(value, utils.getPointer(0, this));
  }
  _disownFunction() {
    return utils.disown(this.function);
  }
  /**
  * jsg::Function
  * */
  get function() {
    utils.testWhich("function", utils.getUint16(0, this), 14, this);
    return utils.getStruct(0, FunctionType, this);
  }
  _hasFunction() {
    return !utils.isNull(utils.getPointer(0, this));
  }
  _initFunction() {
    utils.setUint16(0, 14, this);
    return utils.initStructAt(0, FunctionType, this);
  }
  get _isFunction() {
    return utils.getUint16(0, this) === 14;
  }
  set function(value) {
    utils.setUint16(0, 14, this);
    utils.copyFrom(value, utils.getPointer(0, this));
  }
  _adoptJsgImpl(value) {
    utils.setUint16(0, 15, this);
    utils.adopt(value, utils.getPointer(0, this));
  }
  _disownJsgImpl() {
    return utils.disown(this.jsgImpl);
  }
  /**
  * jsg implementation type
  * */
  get jsgImpl() {
    utils.testWhich("jsgImpl", utils.getUint16(0, this), 15, this);
    return utils.getStruct(0, JsgImplType, this);
  }
  _hasJsgImpl() {
    return !utils.isNull(utils.getPointer(0, this));
  }
  _initJsgImpl() {
    utils.setUint16(0, 15, this);
    return utils.initStructAt(0, JsgImplType, this);
  }
  get _isJsgImpl() {
    return utils.getUint16(0, this) === 15;
  }
  set jsgImpl(value) {
    utils.setUint16(0, 15, this);
    utils.copyFrom(value, utils.getPointer(0, this));
  }
  _adoptJsBuiltin(value) {
    utils.setUint16(0, 16, this);
    utils.adopt(value, utils.getPointer(0, this));
  }
  _disownJsBuiltin() {
    return utils.disown(this.jsBuiltin);
  }
  get jsBuiltin() {
    utils.testWhich("jsBuiltin", utils.getUint16(0, this), 16, this);
    return utils.getStruct(0, JsBuiltinType, this);
  }
  _hasJsBuiltin() {
    return !utils.isNull(utils.getPointer(0, this));
  }
  _initJsBuiltin() {
    utils.setUint16(0, 16, this);
    return utils.initStructAt(0, JsBuiltinType, this);
  }
  get _isJsBuiltin() {
    return utils.getUint16(0, this) === 16;
  }
  set jsBuiltin(value) {
    utils.setUint16(0, 16, this);
    utils.copyFrom(value, utils.getPointer(0, this));
  }
  toString() {
    return "Type_" + super.toString();
  }
  which() {
    return utils.getUint16(0, this);
  }
};
__publicField(Type, "UNKNOWN", Type_Which.UNKNOWN);
__publicField(Type, "VOIDT", Type_Which.VOIDT);
__publicField(Type, "BOOLT", Type_Which.BOOLT);
__publicField(Type, "NUMBER", Type_Which.NUMBER);
__publicField(Type, "PROMISE", Type_Which.PROMISE);
__publicField(Type, "STRUCTURE", Type_Which.STRUCTURE);
__publicField(Type, "STRING", Type_Which.STRING);
__publicField(Type, "OBJECT", Type_Which.OBJECT);
__publicField(Type, "ARRAY", Type_Which.ARRAY);
__publicField(Type, "MAYBE", Type_Which.MAYBE);
__publicField(Type, "DICT", Type_Which.DICT);
__publicField(Type, "ONE_OF", Type_Which.ONE_OF);
__publicField(Type, "BUILTIN", Type_Which.BUILTIN);
__publicField(Type, "INTRINSIC", Type_Which.INTRINSIC);
__publicField(Type, "FUNCTION", Type_Which.FUNCTION);
__publicField(Type, "JSG_IMPL", Type_Which.JSG_IMPL);
__publicField(Type, "JS_BUILTIN", Type_Which.JS_BUILTIN);
__publicField(Type, "_capnp", {
  displayName: "Type",
  id: "d2347ab301451a8c",
  size: new ObjectSize(8, 1)
});
var NumberType = class extends Struct {
  get name() {
    return utils.getText(0, this);
  }
  set name(value) {
    utils.setText(0, value, this);
  }
  toString() {
    return "NumberType_" + super.toString();
  }
};
__publicField(NumberType, "_capnp", {
  displayName: "NumberType",
  id: "afd4316863bdd80a",
  size: new ObjectSize(0, 1)
});
var PromiseType = class extends Struct {
  _adoptValue(value) {
    utils.adopt(value, utils.getPointer(0, this));
  }
  _disownValue() {
    return utils.disown(this.value);
  }
  get value() {
    return utils.getStruct(0, Type, this);
  }
  _hasValue() {
    return !utils.isNull(utils.getPointer(0, this));
  }
  _initValue() {
    return utils.initStructAt(0, Type, this);
  }
  set value(value) {
    utils.copyFrom(value, utils.getPointer(0, this));
  }
  toString() {
    return "PromiseType_" + super.toString();
  }
};
__publicField(PromiseType, "_capnp", {
  displayName: "PromiseType",
  id: "977eaa74d24bb2dc",
  size: new ObjectSize(0, 1)
});
var StructureType = class extends Struct {
  get name() {
    return utils.getText(0, this);
  }
  set name(value) {
    utils.setText(0, value, this);
  }
  get fullyQualifiedName() {
    return utils.getText(1, this);
  }
  set fullyQualifiedName(value) {
    utils.setText(1, value, this);
  }
  toString() {
    return "StructureType_" + super.toString();
  }
};
__publicField(StructureType, "_capnp", {
  displayName: "StructureType",
  id: "9001b3522132305a",
  size: new ObjectSize(0, 2)
});
var StringType = class extends Struct {
  get name() {
    return utils.getText(0, this);
  }
  set name(value) {
    utils.setText(0, value, this);
  }
  toString() {
    return "StringType_" + super.toString();
  }
};
__publicField(StringType, "_capnp", {
  displayName: "StringType",
  id: "913621db0713d640",
  size: new ObjectSize(0, 1)
});
var IntrinsicType = class extends Struct {
  get name() {
    return utils.getText(0, this);
  }
  set name(value) {
    utils.setText(0, value, this);
  }
  toString() {
    return "IntrinsicType_" + super.toString();
  }
};
__publicField(IntrinsicType, "_capnp", {
  displayName: "IntrinsicType",
  id: "87c24648e89ccc02",
  size: new ObjectSize(0, 1)
});
var ArrayType = class extends Struct {
  _adoptElement(value) {
    utils.adopt(value, utils.getPointer(0, this));
  }
  _disownElement() {
    return utils.disown(this.element);
  }
  get element() {
    return utils.getStruct(0, Type, this);
  }
  _hasElement() {
    return !utils.isNull(utils.getPointer(0, this));
  }
  _initElement() {
    return utils.initStructAt(0, Type, this);
  }
  set element(value) {
    utils.copyFrom(value, utils.getPointer(0, this));
  }
  get name() {
    return utils.getText(1, this);
  }
  set name(value) {
    utils.setText(1, value, this);
  }
  toString() {
    return "ArrayType_" + super.toString();
  }
};
__publicField(ArrayType, "_capnp", {
  displayName: "ArrayType",
  id: "f6d86da0d225932b",
  size: new ObjectSize(0, 2)
});
var MaybeType = class extends Struct {
  _adoptValue(value) {
    utils.adopt(value, utils.getPointer(0, this));
  }
  _disownValue() {
    return utils.disown(this.value);
  }
  get value() {
    return utils.getStruct(0, Type, this);
  }
  _hasValue() {
    return !utils.isNull(utils.getPointer(0, this));
  }
  _initValue() {
    return utils.initStructAt(0, Type, this);
  }
  set value(value) {
    utils.copyFrom(value, utils.getPointer(0, this));
  }
  get name() {
    return utils.getText(1, this);
  }
  set name(value) {
    utils.setText(1, value, this);
  }
  toString() {
    return "MaybeType_" + super.toString();
  }
};
__publicField(MaybeType, "_capnp", {
  displayName: "MaybeType",
  id: "9d64649bff8a5cee",
  size: new ObjectSize(0, 2)
});
var DictType = class extends Struct {
  _adoptKey(value) {
    utils.adopt(value, utils.getPointer(0, this));
  }
  _disownKey() {
    return utils.disown(this.key);
  }
  get key() {
    return utils.getStruct(0, Type, this);
  }
  _hasKey() {
    return !utils.isNull(utils.getPointer(0, this));
  }
  _initKey() {
    return utils.initStructAt(0, Type, this);
  }
  set key(value) {
    utils.copyFrom(value, utils.getPointer(0, this));
  }
  _adoptValue(value) {
    utils.adopt(value, utils.getPointer(1, this));
  }
  _disownValue() {
    return utils.disown(this.value);
  }
  get value() {
    return utils.getStruct(1, Type, this);
  }
  _hasValue() {
    return !utils.isNull(utils.getPointer(1, this));
  }
  _initValue() {
    return utils.initStructAt(1, Type, this);
  }
  set value(value) {
    utils.copyFrom(value, utils.getPointer(1, this));
  }
  toString() {
    return "DictType_" + super.toString();
  }
};
__publicField(DictType, "_capnp", {
  displayName: "DictType",
  id: "b7d8e1ee6205d554",
  size: new ObjectSize(0, 2)
});
var _OneOfType = class extends Struct {
  _adoptVariants(value) {
    utils.adopt(value, utils.getPointer(0, this));
  }
  _disownVariants() {
    return utils.disown(this.variants);
  }
  get variants() {
    return utils.getList(0, _OneOfType._Variants, this);
  }
  _hasVariants() {
    return !utils.isNull(utils.getPointer(0, this));
  }
  _initVariants(length) {
    return utils.initList(0, _OneOfType._Variants, length, this);
  }
  set variants(value) {
    utils.copyFrom(value, utils.getPointer(0, this));
  }
  toString() {
    return "OneOfType_" + super.toString();
  }
};
var OneOfType = _OneOfType;
__publicField(OneOfType, "_capnp", {
  displayName: "OneOfType",
  id: "95216521d1f195ae",
  size: new ObjectSize(0, 1)
});
__publicField(OneOfType, "_Variants");
var BuiltinType_Type = {
  V8UINT8ARRAY: 0,
  V8ARRAY_BUFFER_VIEW: 1,
  JSG_BUFFER_SOURCE: 2,
  KJ_DATE: 3,
  V8FUNCTION: 4,
  V8ARRAY_BUFFER: 5
};
var BuiltinType = class extends Struct {
  get type() {
    return utils.getUint16(0, this);
  }
  set type(value) {
    utils.setUint16(0, value, this);
  }
  toString() {
    return "BuiltinType_" + super.toString();
  }
};
__publicField(BuiltinType, "Type", BuiltinType_Type);
__publicField(BuiltinType, "_capnp", {
  displayName: "BuiltinType",
  id: "96dfb79b276b3379",
  size: new ObjectSize(8, 0)
});
var _FunctionType = class extends Struct {
  _adoptReturnType(value) {
    utils.adopt(value, utils.getPointer(0, this));
  }
  _disownReturnType() {
    return utils.disown(this.returnType);
  }
  get returnType() {
    return utils.getStruct(0, Type, this);
  }
  _hasReturnType() {
    return !utils.isNull(utils.getPointer(0, this));
  }
  _initReturnType() {
    return utils.initStructAt(0, Type, this);
  }
  set returnType(value) {
    utils.copyFrom(value, utils.getPointer(0, this));
  }
  _adoptArgs(value) {
    utils.adopt(value, utils.getPointer(1, this));
  }
  _disownArgs() {
    return utils.disown(this.args);
  }
  get args() {
    return utils.getList(1, _FunctionType._Args, this);
  }
  _hasArgs() {
    return !utils.isNull(utils.getPointer(1, this));
  }
  _initArgs(length) {
    return utils.initList(1, _FunctionType._Args, length, this);
  }
  set args(value) {
    utils.copyFrom(value, utils.getPointer(1, this));
  }
  toString() {
    return "FunctionType_" + super.toString();
  }
};
var FunctionType = _FunctionType;
__publicField(FunctionType, "_capnp", {
  displayName: "FunctionType",
  id: "d7c3505ac05e5fad",
  size: new ObjectSize(0, 2)
});
__publicField(FunctionType, "_Args");
var JsgImplType_Type = {
  CONFIGURATION: 0,
  V8ISOLATE: 1,
  JSG_LOCK: 2,
  JSG_TYPE_HANDLER: 3,
  JSG_UNIMPLEMENTED: 4,
  JSG_VARARGS: 5,
  JSG_SELF_REF: 6,
  V8FUNCTION_CALLBACK_INFO: 7,
  V8PROPERTY_CALLBACK_INFO: 8,
  JSG_NAME: 9
};
var JsgImplType = class extends Struct {
  get type() {
    return utils.getUint16(0, this);
  }
  set type(value) {
    utils.setUint16(0, value, this);
  }
  toString() {
    return "JsgImplType_" + super.toString();
  }
};
__publicField(JsgImplType, "Type", JsgImplType_Type);
__publicField(JsgImplType, "_capnp", {
  displayName: "JsgImplType",
  id: "e0dfbe1216e6985e",
  size: new ObjectSize(8, 0)
});
var _Structure = class extends Struct {
  /**
  * Structure name
  * */
  get name() {
    return utils.getText(0, this);
  }
  set name(value) {
    utils.setText(0, value, this);
  }
  /**
  * All members in declaration order
  * */
  get fullyQualifiedName() {
    return utils.getText(3, this);
  }
  set fullyQualifiedName(value) {
    utils.setText(3, value, this);
  }
  _adoptMembers(value) {
    utils.adopt(value, utils.getPointer(1, this));
  }
  _disownMembers() {
    return utils.disown(this.members);
  }
  /**
  * base type
  * */
  get members() {
    return utils.getList(1, _Structure._Members, this);
  }
  _hasMembers() {
    return !utils.isNull(utils.getPointer(1, this));
  }
  _initMembers(length) {
    return utils.initList(1, _Structure._Members, length, this);
  }
  set members(value) {
    utils.copyFrom(value, utils.getPointer(1, this));
  }
  _adoptExtends(value) {
    utils.adopt(value, utils.getPointer(2, this));
  }
  _disownExtends() {
    return utils.disown(this.extends);
  }
  /**
  * true if the structure is iterable
  * */
  get extends() {
    return utils.getStruct(2, Type, this);
  }
  _hasExtends() {
    return !utils.isNull(utils.getPointer(2, this));
  }
  _initExtends() {
    return utils.initStructAt(2, Type, this);
  }
  set extends(value) {
    utils.copyFrom(value, utils.getPointer(2, this));
  }
  /**
  * true if the structure is async iterable
  * */
  get iterable() {
    return utils.getBit(0, this);
  }
  set iterable(value) {
    utils.setBit(0, value, this);
  }
  _adoptIterator(value) {
    utils.adopt(value, utils.getPointer(4, this));
  }
  _disownIterator() {
    return utils.disown(this.iterator);
  }
  /**
  * Fully-qualified structure name including namespaces and parents
  * */
  get iterator() {
    return utils.getStruct(4, Method, this);
  }
  _hasIterator() {
    return !utils.isNull(utils.getPointer(4, this));
  }
  _initIterator() {
    return utils.initStructAt(4, Method, this);
  }
  set iterator(value) {
    utils.copyFrom(value, utils.getPointer(4, this));
  }
  /**
  * Method returning iterator if the structure is iterable
  * */
  get asyncIterable() {
    return utils.getBit(1, this);
  }
  set asyncIterable(value) {
    utils.setBit(1, value, this);
  }
  _adoptAsyncIterator(value) {
    utils.adopt(value, utils.getPointer(5, this));
  }
  _disownAsyncIterator() {
    return utils.disown(this.asyncIterator);
  }
  /**
  * Method returning async iterator if the structure is async iterable
  * */
  get asyncIterator() {
    return utils.getStruct(5, Method, this);
  }
  _hasAsyncIterator() {
    return !utils.isNull(utils.getPointer(5, this));
  }
  _initAsyncIterator() {
    return utils.initStructAt(5, Method, this);
  }
  set asyncIterator(value) {
    utils.copyFrom(value, utils.getPointer(5, this));
  }
  /**
  * See `JSG_TS_ROOT`'s documentation in the `## TypeScript` section of the JSG README.md.
  * If `JSG_(STRUCT_)TS_ROOT` is declared for a type, this value will be `true`.
  * */
  get disposable() {
    return utils.getBit(3, this);
  }
  set disposable(value) {
    utils.setBit(3, value, this);
  }
  _adoptDispose(value) {
    utils.adopt(value, utils.getPointer(10, this));
  }
  _disownDispose() {
    return utils.disown(this.dispose);
  }
  /**
  * See `JSG_TS_OVERRIDE`'s documentation in the `## TypeScript` section of the JSG README.md.
  * If `JSG_(STRUCT_)TS_OVERRIDE` is declared for a type, this value will be the contents of the
  * macro declaration verbatim.
  * */
  get dispose() {
    return utils.getStruct(10, Method, this);
  }
  _hasDispose() {
    return !utils.isNull(utils.getPointer(10, this));
  }
  _initDispose() {
    return utils.initStructAt(10, Method, this);
  }
  set dispose(value) {
    utils.copyFrom(value, utils.getPointer(10, this));
  }
  /**
  * See `JSG_TS_DEFINE`'s documentation in the `## TypeScript` section of the JSG README.md.
  * If `JSG_(STRUCT_)TS_DEFINE` is declared for a type, this value will be the contents of the
  * macro declaration verbatim.
  * */
  get asyncDisposable() {
    return utils.getBit(4, this);
  }
  set asyncDisposable(value) {
    utils.setBit(4, value, this);
  }
  _adoptAsyncDispose(value) {
    utils.adopt(value, utils.getPointer(11, this));
  }
  _disownAsyncDispose() {
    return utils.disown(this.asyncDispose);
  }
  /**
  * If this type is callable as a function, the signature of said function. Otherwise, null.
  * */
  get asyncDispose() {
    return utils.getStruct(11, Method, this);
  }
  _hasAsyncDispose() {
    return !utils.isNull(utils.getPointer(11, this));
  }
  _initAsyncDispose() {
    return utils.initStructAt(11, Method, this);
  }
  set asyncDispose(value) {
    utils.copyFrom(value, utils.getPointer(11, this));
  }
  /**
  * List of all builtin modules provided by the context.
  * */
  get tsRoot() {
    return utils.getBit(2, this);
  }
  set tsRoot(value) {
    utils.setBit(2, value, this);
  }
  /**
  * true if the structure is disposable
  * */
  get tsOverride() {
    return utils.getText(6, this);
  }
  set tsOverride(value) {
    utils.setText(6, value, this);
  }
  /**
  * dispose method
  * */
  get tsDefine() {
    return utils.getText(7, this);
  }
  set tsDefine(value) {
    utils.setText(7, value, this);
  }
  _adoptCallable(value) {
    utils.adopt(value, utils.getPointer(8, this));
  }
  _disownCallable() {
    return utils.disown(this.callable);
  }
  /**
  * true if the structure is async disposable
  * */
  get callable() {
    return utils.getStruct(8, FunctionType, this);
  }
  _hasCallable() {
    return !utils.isNull(utils.getPointer(8, this));
  }
  _initCallable() {
    return utils.initStructAt(8, FunctionType, this);
  }
  set callable(value) {
    utils.copyFrom(value, utils.getPointer(8, this));
  }
  _adoptBuiltinModules(value) {
    utils.adopt(value, utils.getPointer(9, this));
  }
  _disownBuiltinModules() {
    return utils.disown(this.builtinModules);
  }
  /**
  * asyncDispose method
  * */
  get builtinModules() {
    return utils.getList(9, _Structure._BuiltinModules, this);
  }
  _hasBuiltinModules() {
    return !utils.isNull(utils.getPointer(9, this));
  }
  _initBuiltinModules(length) {
    return utils.initList(9, _Structure._BuiltinModules, length, this);
  }
  set builtinModules(value) {
    utils.copyFrom(value, utils.getPointer(9, this));
  }
  toString() {
    return "Structure_" + super.toString();
  }
};
var Structure = _Structure;
__publicField(Structure, "_capnp", {
  displayName: "Structure",
  id: "c9aee5d3d27484f2",
  size: new ObjectSize(8, 12)
});
__publicField(Structure, "_Members");
__publicField(Structure, "_BuiltinModules");
var Member_Nested = class extends Struct {
  _adoptStructure(value) {
    utils.adopt(value, utils.getPointer(0, this));
  }
  _disownStructure() {
    return utils.disown(this.structure);
  }
  get structure() {
    return utils.getStruct(0, Structure, this);
  }
  _hasStructure() {
    return !utils.isNull(utils.getPointer(0, this));
  }
  _initStructure() {
    return utils.initStructAt(0, Structure, this);
  }
  set structure(value) {
    utils.copyFrom(value, utils.getPointer(0, this));
  }
  /**
  * For JSG_NESTED_TYPE_NAMED, if name is different to structure
  * */
  get name() {
    return utils.getText(1, this);
  }
  set name(value) {
    utils.setText(1, value, this);
  }
  toString() {
    return "Member_Nested_" + super.toString();
  }
};
__publicField(Member_Nested, "_capnp", {
  displayName: "nested",
  id: "cc1920702876b1f6",
  size: new ObjectSize(8, 2)
});
var Member_Which = {
  METHOD: 0,
  PROPERTY: 1,
  NESTED: 2,
  CONSTANT: 3,
  CONSTRUCTOR: 4
};
var Member = class extends Struct {
  _adoptMethod(value) {
    utils.setUint16(0, 0, this);
    utils.adopt(value, utils.getPointer(0, this));
  }
  _disownMethod() {
    return utils.disown(this.method);
  }
  /**
  * any kind of method
  * */
  get method() {
    utils.testWhich("method", utils.getUint16(0, this), 0, this);
    return utils.getStruct(0, Method, this);
  }
  _hasMethod() {
    return !utils.isNull(utils.getPointer(0, this));
  }
  _initMethod() {
    utils.setUint16(0, 0, this);
    return utils.initStructAt(0, Method, this);
  }
  get _isMethod() {
    return utils.getUint16(0, this) === 0;
  }
  set method(value) {
    utils.setUint16(0, 0, this);
    utils.copyFrom(value, utils.getPointer(0, this));
  }
  _adoptProperty(value) {
    utils.setUint16(0, 1, this);
    utils.adopt(value, utils.getPointer(0, this));
  }
  _disownProperty() {
    return utils.disown(this.property);
  }
  /**
  * any kind of property
  * */
  get property() {
    utils.testWhich("property", utils.getUint16(0, this), 1, this);
    return utils.getStruct(0, Property, this);
  }
  _hasProperty() {
    return !utils.isNull(utils.getPointer(0, this));
  }
  _initProperty() {
    utils.setUint16(0, 1, this);
    return utils.initStructAt(0, Property, this);
  }
  get _isProperty() {
    return utils.getUint16(0, this) === 1;
  }
  set property(value) {
    utils.setUint16(0, 1, this);
    utils.copyFrom(value, utils.getPointer(0, this));
  }
  /**
  * nested type
  * */
  get nested() {
    utils.testWhich("nested", utils.getUint16(0, this), 2, this);
    return utils.getAs(Member_Nested, this);
  }
  _initNested() {
    utils.setUint16(0, 2, this);
    return utils.getAs(Member_Nested, this);
  }
  get _isNested() {
    return utils.getUint16(0, this) === 2;
  }
  set nested(_) {
    utils.setUint16(0, 2, this);
  }
  _adoptConstant(value) {
    utils.setUint16(0, 3, this);
    utils.adopt(value, utils.getPointer(0, this));
  }
  _disownConstant() {
    return utils.disown(this.constant);
  }
  /**
  * static constant
  * */
  get constant() {
    utils.testWhich("constant", utils.getUint16(0, this), 3, this);
    return utils.getStruct(0, Constant, this);
  }
  _hasConstant() {
    return !utils.isNull(utils.getPointer(0, this));
  }
  _initConstant() {
    utils.setUint16(0, 3, this);
    return utils.initStructAt(0, Constant, this);
  }
  get _isConstant() {
    return utils.getUint16(0, this) === 3;
  }
  set constant(value) {
    utils.setUint16(0, 3, this);
    utils.copyFrom(value, utils.getPointer(0, this));
  }
  _adoptConstructor(value) {
    utils.setUint16(0, 4, this);
    utils.adopt(value, utils.getPointer(0, this));
  }
  _disownConstructor() {
    return utils.disown(this.constructor);
  }
  /**
  * structure constructor
  * */
  get $constructor() {
    utils.testWhich("constructor", utils.getUint16(0, this), 4, this);
    return utils.getStruct(0, Constructor, this);
  }
  _hasConstructor() {
    return !utils.isNull(utils.getPointer(0, this));
  }
  _initConstructor() {
    utils.setUint16(0, 4, this);
    return utils.initStructAt(0, Constructor, this);
  }
  get _isConstructor() {
    return utils.getUint16(0, this) === 4;
  }
  set $constructor(value) {
    utils.setUint16(0, 4, this);
    utils.copyFrom(value, utils.getPointer(0, this));
  }
  toString() {
    return "Member_" + super.toString();
  }
  which() {
    return utils.getUint16(0, this);
  }
};
__publicField(Member, "METHOD", Member_Which.METHOD);
__publicField(Member, "PROPERTY", Member_Which.PROPERTY);
__publicField(Member, "NESTED", Member_Which.NESTED);
__publicField(Member, "CONSTANT", Member_Which.CONSTANT);
__publicField(Member, "CONSTRUCTOR", Member_Which.CONSTRUCTOR);
__publicField(Member, "_capnp", {
  displayName: "Member",
  id: "85c316fd4114aba7",
  size: new ObjectSize(8, 2)
});
var _Method = class extends Struct {
  get name() {
    return utils.getText(0, this);
  }
  set name(value) {
    utils.setText(0, value, this);
  }
  _adoptReturnType(value) {
    utils.adopt(value, utils.getPointer(1, this));
  }
  _disownReturnType() {
    return utils.disown(this.returnType);
  }
  get returnType() {
    return utils.getStruct(1, Type, this);
  }
  _hasReturnType() {
    return !utils.isNull(utils.getPointer(1, this));
  }
  _initReturnType() {
    return utils.initStructAt(1, Type, this);
  }
  set returnType(value) {
    utils.copyFrom(value, utils.getPointer(1, this));
  }
  _adoptArgs(value) {
    utils.adopt(value, utils.getPointer(2, this));
  }
  _disownArgs() {
    return utils.disown(this.args);
  }
  get args() {
    return utils.getList(2, _Method._Args, this);
  }
  _hasArgs() {
    return !utils.isNull(utils.getPointer(2, this));
  }
  _initArgs(length) {
    return utils.initList(2, _Method._Args, length, this);
  }
  set args(value) {
    utils.copyFrom(value, utils.getPointer(2, this));
  }
  get static() {
    return utils.getBit(0, this);
  }
  set static(value) {
    utils.setBit(0, value, this);
  }
  toString() {
    return "Method_" + super.toString();
  }
};
var Method = _Method;
__publicField(Method, "_capnp", {
  displayName: "Method",
  id: "a0a20f19ed7321e8",
  size: new ObjectSize(8, 3)
});
__publicField(Method, "_Args");
var Property = class extends Struct {
  get name() {
    return utils.getText(0, this);
  }
  set name(value) {
    utils.setText(0, value, this);
  }
  _adoptType(value) {
    utils.adopt(value, utils.getPointer(1, this));
  }
  _disownType() {
    return utils.disown(this.type);
  }
  get type() {
    return utils.getStruct(1, Type, this);
  }
  _hasType() {
    return !utils.isNull(utils.getPointer(1, this));
  }
  _initType() {
    return utils.initStructAt(1, Type, this);
  }
  set type(value) {
    utils.copyFrom(value, utils.getPointer(1, this));
  }
  get readonly() {
    return utils.getBit(0, this);
  }
  set readonly(value) {
    utils.setBit(0, value, this);
  }
  get lazy() {
    return utils.getBit(1, this);
  }
  set lazy(value) {
    utils.setBit(1, value, this);
  }
  get prototype() {
    return utils.getBit(2, this);
  }
  set prototype(value) {
    utils.setBit(2, value, this);
  }
  toString() {
    return "Property_" + super.toString();
  }
};
__publicField(Property, "_capnp", {
  displayName: "Property",
  id: "e1d238e9fecd3757",
  size: new ObjectSize(8, 2)
});
var Constant = class extends Struct {
  get name() {
    return utils.getText(0, this);
  }
  set name(value) {
    utils.setText(0, value, this);
  }
  /**
  * TODO: we may need a union here
  * */
  get value() {
    return utils.getInt64(0, this);
  }
  set value(value) {
    utils.setInt64(0, value, this);
  }
  toString() {
    return "Constant_" + super.toString();
  }
};
__publicField(Constant, "_capnp", {
  displayName: "Constant",
  id: "e354a1a55c4cfc59",
  size: new ObjectSize(8, 1)
});
var _Constructor = class extends Struct {
  _adoptArgs(value) {
    utils.adopt(value, utils.getPointer(0, this));
  }
  _disownArgs() {
    return utils.disown(this.args);
  }
  get args() {
    return utils.getList(0, _Constructor._Args, this);
  }
  _hasArgs() {
    return !utils.isNull(utils.getPointer(0, this));
  }
  _initArgs(length) {
    return utils.initList(0, _Constructor._Args, length, this);
  }
  set args(value) {
    utils.copyFrom(value, utils.getPointer(0, this));
  }
  toString() {
    return "Constructor_" + super.toString();
  }
};
var Constructor = _Constructor;
__publicField(Constructor, "_capnp", {
  displayName: "Constructor",
  id: "f4610fdb47099d17",
  size: new ObjectSize(0, 1)
});
__publicField(Constructor, "_Args");
var Module_Which = {
  STRUCTURE_NAME: 0,
  TS_DECLARATIONS: 1
};
var Module = class extends Struct {
  /**
  * if anyone ever needs module type, it can be implemented by either fixing the Modules reference
  * problem above or copying the original enum.
  * type @1 :Modules.ModuleType;
  * */
  get specifier() {
    return utils.getText(0, this);
  }
  set specifier(value) {
    utils.setText(0, value, this);
  }
  get structureName() {
    utils.testWhich("structureName", utils.getUint16(0, this), 0, this);
    return utils.getText(1, this);
  }
  get _isStructureName() {
    return utils.getUint16(0, this) === 0;
  }
  set structureName(value) {
    utils.setUint16(0, 0, this);
    utils.setText(1, value, this);
  }
  get tsDeclarations() {
    utils.testWhich("tsDeclarations", utils.getUint16(0, this), 1, this);
    return utils.getText(1, this);
  }
  get _isTsDeclarations() {
    return utils.getUint16(0, this) === 1;
  }
  set tsDeclarations(value) {
    utils.setUint16(0, 1, this);
    utils.setText(1, value, this);
  }
  toString() {
    return "Module_" + super.toString();
  }
  which() {
    return utils.getUint16(0, this);
  }
};
__publicField(Module, "STRUCTURE_NAME", Module_Which.STRUCTURE_NAME);
__publicField(Module, "TS_DECLARATIONS", Module_Which.TS_DECLARATIONS);
__publicField(Module, "_capnp", {
  displayName: "Module",
  id: "cd4221e3248069bd",
  size: new ObjectSize(8, 2)
});
var _StructureGroups_StructureGroup = class extends Struct {
  get name() {
    return utils.getText(0, this);
  }
  set name(value) {
    utils.setText(0, value, this);
  }
  _adoptStructures(value) {
    utils.adopt(value, utils.getPointer(1, this));
  }
  _disownStructures() {
    return utils.disown(this.structures);
  }
  get structures() {
    return utils.getList(1, _StructureGroups_StructureGroup._Structures, this);
  }
  _hasStructures() {
    return !utils.isNull(utils.getPointer(1, this));
  }
  _initStructures(length) {
    return utils.initList(1, _StructureGroups_StructureGroup._Structures, length, this);
  }
  set structures(value) {
    utils.copyFrom(value, utils.getPointer(1, this));
  }
  toString() {
    return "StructureGroups_StructureGroup_" + super.toString();
  }
};
var StructureGroups_StructureGroup = _StructureGroups_StructureGroup;
__publicField(StructureGroups_StructureGroup, "_capnp", {
  displayName: "StructureGroup",
  id: "fe89d9d03a268a31",
  size: new ObjectSize(0, 2)
});
__publicField(StructureGroups_StructureGroup, "_Structures");
var _StructureGroups = class extends Struct {
  _adoptGroups(value) {
    utils.adopt(value, utils.getPointer(0, this));
  }
  _disownGroups() {
    return utils.disown(this.groups);
  }
  get groups() {
    return utils.getList(0, _StructureGroups._Groups, this);
  }
  _hasGroups() {
    return !utils.isNull(utils.getPointer(0, this));
  }
  _initGroups(length) {
    return utils.initList(0, _StructureGroups._Groups, length, this);
  }
  set groups(value) {
    utils.copyFrom(value, utils.getPointer(0, this));
  }
  _adoptModules(value) {
    utils.adopt(value, utils.getPointer(1, this));
  }
  _disownModules() {
    return utils.disown(this.modules);
  }
  get modules() {
    return utils.getList(1, _StructureGroups._Modules, this);
  }
  _hasModules() {
    return !utils.isNull(utils.getPointer(1, this));
  }
  _initModules(length) {
    return utils.initList(1, _StructureGroups._Modules, length, this);
  }
  set modules(value) {
    utils.copyFrom(value, utils.getPointer(1, this));
  }
  toString() {
    return "StructureGroups_" + super.toString();
  }
};
var StructureGroups = _StructureGroups;
__publicField(StructureGroups, "StructureGroup", StructureGroups_StructureGroup);
__publicField(StructureGroups, "_capnp", {
  displayName: "StructureGroups",
  id: "ed8c71dbb06eb831",
  size: new ObjectSize(0, 2)
});
__publicField(StructureGroups, "_Groups");
__publicField(StructureGroups, "_Modules");
var JsBuiltinType = class extends Struct {
  /**
  * module from which the property is imported
  * */
  get module() {
    return utils.getText(0, this);
  }
  set module(value) {
    utils.setText(0, value, this);
  }
  /**
  * export name of the property
  * */
  get export() {
    return utils.getText(1, this);
  }
  set export(value) {
    utils.setText(1, value, this);
  }
  toString() {
    return "JsBuiltinType_" + super.toString();
  }
};
__publicField(JsBuiltinType, "_capnp", {
  displayName: "JsBuiltinType",
  id: "ccf1cde29b10a0bb",
  size: new ObjectSize(0, 2)
});
OneOfType._Variants = CompositeList(Type);
FunctionType._Args = CompositeList(Type);
Structure._Members = CompositeList(Member);
Structure._BuiltinModules = CompositeList(Module);
Method._Args = CompositeList(Type);
Constructor._Args = CompositeList(Type);
StructureGroups_StructureGroup._Structures = CompositeList(Structure);
StructureGroups._Groups = CompositeList(StructureGroups_StructureGroup);
StructureGroups._Modules = CompositeList(Module);
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ArrayType,
  BuiltinType,
  BuiltinType_Type,
  Constant,
  Constructor,
  DictType,
  FunctionType,
  IntrinsicType,
  JsBuiltinType,
  JsgImplType,
  JsgImplType_Type,
  MaybeType,
  Member,
  Member_Nested,
  Member_Which,
  Method,
  Module,
  Module_Which,
  NumberType,
  OneOfType,
  PromiseType,
  Property,
  StringType,
  Structure,
  StructureGroups,
  StructureGroups_StructureGroup,
  StructureType,
  Type,
  Type_Which,
  _capnpFileId
});
