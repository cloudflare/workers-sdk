// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
// Generated from javascript_natives/helpers.js
export const NativeFunctions = [
    {
        name: 'eval',
        signatures: [['x']]
    },
    {
        name: 'parseInt',
        signatures: [['string', '?radix']]
    },
    {
        name: 'parseFloat',
        signatures: [['string']]
    },
    {
        name: 'isNaN',
        signatures: [['number']]
    },
    {
        name: 'isFinite',
        signatures: [['number']]
    },
    {
        name: 'decodeURI',
        signatures: [['encodedURI']]
    },
    {
        name: 'decodeURIComponent',
        signatures: [['encodedURIComponent']]
    },
    {
        name: 'encodeURI',
        signatures: [['uri']]
    },
    {
        name: 'encodeURIComponent',
        signatures: [['uriComponent']]
    },
    {
        name: 'escape',
        signatures: [['string']],
        receivers: ['Window']
    },
    {
        name: 'escape',
        signatures: [['ident']],
        receivers: ['CSS']
    },
    {
        name: 'unescape',
        signatures: [['string']]
    },
    {
        name: 'toString',
        signatures: [['?radix']],
        receivers: ['Number', 'BigInt']
    },
    {
        name: 'get',
        signatures: [['?options']],
        receivers: ['CredentialsContainer']
    },
    {
        name: 'get',
        signatures: [['name']],
        receivers: ['CustomElementRegistry', 'FormData', 'URLSearchParams']
    },
    {
        name: 'get',
        signatures: [['name'], ['key']],
        receivers: ['Headers']
    },
    {
        name: 'get',
        signatures: [['query'], ['key']],
        receivers: ['IDBIndex', 'IDBObjectStore']
    },
    {
        name: 'get',
        signatures: [['keyId']],
        receivers: ['MediaKeyStatusMap']
    },
    {
        name: 'get',
        signatures: [['target', 'p', 'receiver']],
        receivers: ['ProxyHandler']
    },
    {
        name: 'get',
        signatures: [['key']],
        receivers: ['Map', 'ReadonlyMap', 'WeakMap', 'XRHand']
    },
    {
        name: 'get',
        signatures: [['id']],
        receivers: ['Clients', 'BackgroundFetchManager']
    },
    {
        name: 'get',
        signatures: [['property']],
        receivers: ['StylePropertyMapReadOnly']
    },
    {
        name: 'get',
        signatures: [['name'], ['?options']],
        receivers: ['CookieStore']
    },
    {
        name: 'get',
        signatures: [['instrumentKey']],
        receivers: ['PaymentInstruments']
    },
    {
        name: 'set',
        signatures: [['v']],
        receivers: ['PropertyDescriptor']
    },
    {
        name: 'set',
        signatures: [['array', '?offset']],
        receivers: ['Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array', 'Int32Array', 'Uint32Array', 'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array']
    },
    {
        name: 'set',
        signatures: [['name', 'value', '?fileName'], ['name', 'value', '?filename']],
        receivers: ['FormData']
    },
    {
        name: 'set',
        signatures: [['name', 'value'], ['key', 'value']],
        receivers: ['Headers']
    },
    {
        name: 'set',
        signatures: [['name', 'value']],
        receivers: ['URLSearchParams']
    },
    {
        name: 'set',
        signatures: [['target', 'p', 'value', 'receiver']],
        receivers: ['ProxyHandler']
    },
    {
        name: 'set',
        signatures: [['key', 'value']],
        receivers: ['Map', 'WeakMap']
    },
    {
        name: 'set',
        signatures: [['property', '...values']],
        receivers: ['StylePropertyMap']
    },
    {
        name: 'set',
        signatures: [['cookieInit'], ['name', 'value']],
        receivers: ['CookieStore']
    },
    {
        name: 'set',
        signatures: [['instrumentKey', 'details']],
        receivers: ['PaymentInstruments']
    },
    {
        name: 'set',
        signatures: [['key', 'value', '?options']],
        receivers: ['SharedStorage']
    },
    {
        name: 'toLocaleString',
        signatures: [['?locales', '?options']],
        receivers: ['Date', 'Number', 'BigInt']
    },
    {
        name: 'hasOwnProperty',
        signatures: [['v']]
    },
    {
        name: 'isPrototypeOf',
        signatures: [['v']]
    },
    {
        name: 'propertyIsEnumerable',
        signatures: [['v']]
    },
    {
        name: 'getPrototypeOf',
        signatures: [['o']],
        receivers: ['ObjectConstructor']
    },
    {
        name: 'getPrototypeOf',
        signatures: [['target']],
        receivers: ['ProxyHandler']
    },
    {
        name: 'getOwnPropertyDescriptor',
        signatures: [['o', 'p']],
        receivers: ['ObjectConstructor']
    },
    {
        name: 'getOwnPropertyDescriptor',
        signatures: [['target', 'p']],
        receivers: ['ProxyHandler']
    },
    {
        name: 'getOwnPropertyNames',
        signatures: [['o']]
    },
    {
        name: 'create',
        signatures: [['o', '?properties']],
        receivers: ['ObjectConstructor']
    },
    {
        name: 'create',
        signatures: [['?options']],
        receivers: ['CredentialsContainer']
    },
    {
        name: 'defineProperty',
        signatures: [['o', 'p', 'attributes']],
        receivers: ['ObjectConstructor']
    },
    {
        name: 'defineProperty',
        signatures: [['target', 'p', 'attributes']],
        receivers: ['ProxyHandler']
    },
    {
        name: 'defineProperties',
        signatures: [['o', 'properties']]
    },
    {
        name: 'seal',
        signatures: [['o']]
    },
    {
        name: 'freeze',
        signatures: [['a'], ['f'], ['o']]
    },
    {
        name: 'preventExtensions',
        signatures: [['o']],
        receivers: ['ObjectConstructor']
    },
    {
        name: 'preventExtensions',
        signatures: [['target']],
        receivers: ['ProxyHandler']
    },
    {
        name: 'isSealed',
        signatures: [['o']]
    },
    {
        name: 'isFrozen',
        signatures: [['o']]
    },
    {
        name: 'isExtensible',
        signatures: [['o']],
        receivers: ['ObjectConstructor']
    },
    {
        name: 'isExtensible',
        signatures: [['target']],
        receivers: ['ProxyHandler']
    },
    {
        name: 'keys',
        signatures: [['o']],
        receivers: ['ObjectConstructor']
    },
    {
        name: 'keys',
        signatures: [['?request', '?options']],
        receivers: ['Cache']
    },
    {
        name: 'apply',
        signatures: [['thisArg', '?argArray']],
        receivers: ['Function']
    },
    {
        name: 'apply',
        signatures: [['thisArg', '?args']],
        receivers: ['CallableFunction', 'NewableFunction']
    },
    {
        name: 'apply',
        signatures: [['target', 'thisArg', 'argArray']],
        receivers: ['ProxyHandler']
    },
    {
        name: 'call',
        signatures: [['thisArg', '...argArray']],
        receivers: ['Function']
    },
    {
        name: 'call',
        signatures: [['thisArg', '...args']],
        receivers: ['CallableFunction', 'NewableFunction']
    },
    {
        name: 'bind',
        signatures: [['thisArg', '...argArray']],
        receivers: ['Function']
    },
    {
        name: 'bind',
        signatures: [['thisArg', '?arg0', '?arg1', '?arg2', '?arg3'], ['thisArg', '...args']],
        receivers: ['CallableFunction', 'NewableFunction']
    },
    {
        name: 'charAt',
        signatures: [['pos']]
    },
    {
        name: 'charCodeAt',
        signatures: [['index']]
    },
    {
        name: 'concat',
        signatures: [['...strings']],
        receivers: ['String']
    },
    {
        name: 'concat',
        signatures: [['...items']],
        receivers: ['ReadonlyArray', 'Array']
    },
    {
        name: 'indexOf',
        signatures: [['searchString', '?position']],
        receivers: ['String']
    },
    {
        name: 'indexOf',
        signatures: [['searchElement', '?fromIndex']],
        receivers: ['ReadonlyArray', 'Array', 'Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array', 'Int32Array', 'Uint32Array', 'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array']
    },
    {
        name: 'lastIndexOf',
        signatures: [['searchString', '?position']],
        receivers: ['String']
    },
    {
        name: 'lastIndexOf',
        signatures: [['searchElement', '?fromIndex']],
        receivers: ['ReadonlyArray', 'Array', 'Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array', 'Int32Array', 'Uint32Array', 'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array']
    },
    {
        name: 'localeCompare',
        signatures: [['that', '?locales', '?options']]
    },
    {
        name: 'match',
        signatures: [['regexp'], ['matcher']],
        receivers: ['String']
    },
    {
        name: 'match',
        signatures: [['request', '?options']],
        receivers: ['Cache', 'CacheStorage', 'BackgroundFetchRegistration']
    },
    {
        name: 'replace',
        signatures: [['searchValue', 'replaceValue'], ['searchValue', 'replacer']],
        receivers: ['String']
    },
    {
        name: 'replace',
        signatures: [['token', 'newToken']],
        receivers: ['DOMTokenList']
    },
    {
        name: 'replace',
        signatures: [['url']],
        receivers: ['Location']
    },
    {
        name: 'replace',
        signatures: [['text']],
        receivers: ['CSSStyleSheet']
    },
    {
        name: 'search',
        signatures: [['regexp'], ['searcher']]
    },
    {
        name: 'slice',
        signatures: [['?start', '?end']],
        receivers: ['String', 'ReadonlyArray', 'ConcatArray', 'Array', 'Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array', 'Int32Array', 'Uint32Array', 'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array']
    },
    {
        name: 'slice',
        signatures: [['begin', '?end']],
        receivers: ['ArrayBuffer', 'SharedArrayBuffer']
    },
    {
        name: 'slice',
        signatures: [['?start', '?end', '?contentType']],
        receivers: ['Blob']
    },
    {
        name: 'split',
        signatures: [['separator', '?limit'], ['splitter', '?limit']]
    },
    {
        name: 'substring',
        signatures: [['start', '?end']]
    },
    {
        name: 'toLocaleLowerCase',
        signatures: [['?locales']]
    },
    {
        name: 'toLocaleUpperCase',
        signatures: [['?locales']]
    },
    {
        name: 'substr',
        signatures: [['from', '?length']]
    },
    {
        name: 'fromCharCode',
        signatures: [['...codes']]
    },
    {
        name: 'toFixed',
        signatures: [['?fractionDigits']]
    },
    {
        name: 'toExponential',
        signatures: [['?fractionDigits']]
    },
    {
        name: 'toPrecision',
        signatures: [['?precision']]
    },
    {
        name: 'abs',
        signatures: [['x']]
    },
    {
        name: 'acos',
        signatures: [['x']]
    },
    {
        name: 'asin',
        signatures: [['x']]
    },
    {
        name: 'atan',
        signatures: [['x']]
    },
    {
        name: 'atan2',
        signatures: [['y', 'x']]
    },
    {
        name: 'ceil',
        signatures: [['x']]
    },
    {
        name: 'cos',
        signatures: [['x']]
    },
    {
        name: 'exp',
        signatures: [['x']]
    },
    {
        name: 'floor',
        signatures: [['x']]
    },
    {
        name: 'log',
        signatures: [['x']],
        receivers: ['Math']
    },
    {
        name: 'log',
        signatures: [['...data']],
        receivers: ['Console', 'console']
    },
    {
        name: 'max',
        signatures: [['...values']]
    },
    {
        name: 'min',
        signatures: [['...values']]
    },
    {
        name: 'pow',
        signatures: [['x', 'y']]
    },
    {
        name: 'round',
        signatures: [['x']]
    },
    {
        name: 'sin',
        signatures: [['x']]
    },
    {
        name: 'sqrt',
        signatures: [['x']]
    },
    {
        name: 'tan',
        signatures: [['x']]
    },
    {
        name: 'toLocaleDateString',
        signatures: [['?locales', '?options']]
    },
    {
        name: 'toLocaleTimeString',
        signatures: [['?locales', '?options']]
    },
    {
        name: 'setTime',
        signatures: [['time']]
    },
    {
        name: 'setMilliseconds',
        signatures: [['ms']]
    },
    {
        name: 'setUTCMilliseconds',
        signatures: [['ms']]
    },
    {
        name: 'setSeconds',
        signatures: [['sec', '?ms']]
    },
    {
        name: 'setUTCSeconds',
        signatures: [['sec', '?ms']]
    },
    {
        name: 'setMinutes',
        signatures: [['min', '?sec', '?ms']]
    },
    {
        name: 'setUTCMinutes',
        signatures: [['min', '?sec', '?ms']]
    },
    {
        name: 'setHours',
        signatures: [['hours', '?min', '?sec', '?ms']]
    },
    {
        name: 'setUTCHours',
        signatures: [['hours', '?min', '?sec', '?ms']]
    },
    {
        name: 'setDate',
        signatures: [['date']]
    },
    {
        name: 'setUTCDate',
        signatures: [['date']]
    },
    {
        name: 'setMonth',
        signatures: [['month', '?date']]
    },
    {
        name: 'setUTCMonth',
        signatures: [['month', '?date']]
    },
    {
        name: 'setFullYear',
        signatures: [['year', '?month', '?date']]
    },
    {
        name: 'setUTCFullYear',
        signatures: [['year', '?month', '?date']]
    },
    {
        name: 'toJSON',
        signatures: [['?key']],
        receivers: ['Date']
    },
    {
        name: 'parse',
        signatures: [['s']],
        receivers: ['DateConstructor']
    },
    {
        name: 'parse',
        signatures: [['text', '?reviver']],
        receivers: ['JSON']
    },
    {
        name: 'parse',
        signatures: [['cssText']],
        receivers: ['CSSColorValue', 'CSSNumericValue']
    },
    {
        name: 'parse',
        signatures: [['property', 'cssText']],
        receivers: ['CSSStyleValue']
    },
    {
        name: 'UTC',
        signatures: [['year', 'month', '?date', '?hours', '?minutes', '?seconds', '?ms']]
    },
    {
        name: 'exec',
        signatures: [['string']],
        receivers: ['RegExp']
    },
    {
        name: 'exec',
        signatures: [['?input', '?baseURL']],
        receivers: ['URLPattern']
    },
    {
        name: 'test',
        signatures: [['string']],
        receivers: ['RegExp']
    },
    {
        name: 'test',
        signatures: [['?input', '?baseURL']],
        receivers: ['URLPattern']
    },
    {
        name: 'compile',
        signatures: [['pattern', '?flags']]
    },
    {
        name: 'stringify',
        signatures: [['value', '?replacer', '?space']]
    },
    {
        name: 'join',
        signatures: [['?separator']]
    },
    {
        name: 'every',
        signatures: [['predicate', '?thisArg']]
    },
    {
        name: 'some',
        signatures: [['predicate', '?thisArg']]
    },
    {
        name: 'forEach',
        signatures: [['callbackfn', '?thisArg']]
    },
    {
        name: 'map',
        signatures: [['callbackfn', '?thisArg']]
    },
    {
        name: 'filter',
        signatures: [['predicate', '?thisArg']]
    },
    {
        name: 'reduce',
        signatures: [['callbackfn', '?initialValue']]
    },
    {
        name: 'reduceRight',
        signatures: [['callbackfn', '?initialValue']]
    },
    {
        name: 'push',
        signatures: [['...items']]
    },
    {
        name: 'sort',
        signatures: [['?compareFn']],
        receivers: ['Array', 'Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array', 'Int32Array', 'Uint32Array', 'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array']
    },
    {
        name: 'splice',
        signatures: [['start', '?deleteCount', '...items']]
    },
    {
        name: 'unshift',
        signatures: [['...items']]
    },
    {
        name: 'isArray',
        signatures: [['arg']]
    },
    {
        name: 'then',
        signatures: [['?onfulfilled', '?onrejected']]
    },
    {
        name: 'catch',
        signatures: [['?onrejected']]
    },
    {
        name: 'isView',
        signatures: [['arg']]
    },
    {
        name: 'getFloat32',
        signatures: [['byteOffset', '?littleEndian']]
    },
    {
        name: 'getFloat64',
        signatures: [['byteOffset', '?littleEndian']]
    },
    {
        name: 'getInt8',
        signatures: [['byteOffset']]
    },
    {
        name: 'getInt16',
        signatures: [['byteOffset', '?littleEndian']]
    },
    {
        name: 'getInt32',
        signatures: [['byteOffset', '?littleEndian']]
    },
    {
        name: 'getUint8',
        signatures: [['byteOffset']]
    },
    {
        name: 'getUint16',
        signatures: [['byteOffset', '?littleEndian']]
    },
    {
        name: 'getUint32',
        signatures: [['byteOffset', '?littleEndian']]
    },
    {
        name: 'setFloat32',
        signatures: [['byteOffset', 'value', '?littleEndian']]
    },
    {
        name: 'setFloat64',
        signatures: [['byteOffset', 'value', '?littleEndian']]
    },
    {
        name: 'setInt8',
        signatures: [['byteOffset', 'value']]
    },
    {
        name: 'setInt16',
        signatures: [['byteOffset', 'value', '?littleEndian']]
    },
    {
        name: 'setInt32',
        signatures: [['byteOffset', 'value', '?littleEndian']]
    },
    {
        name: 'setUint8',
        signatures: [['byteOffset', 'value']]
    },
    {
        name: 'setUint16',
        signatures: [['byteOffset', 'value', '?littleEndian']]
    },
    {
        name: 'setUint32',
        signatures: [['byteOffset', 'value', '?littleEndian']]
    },
    {
        name: 'copyWithin',
        signatures: [['target', 'start', '?end']]
    },
    {
        name: 'fill',
        signatures: [['value', '?start', '?end']],
        receivers: ['Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array', 'Int32Array', 'Uint32Array', 'Float32Array', 'Float64Array', 'Array', 'BigInt64Array', 'BigUint64Array']
    },
    {
        name: 'fill',
        signatures: [['?fillRule'], ['path', '?fillRule']],
        receivers: ['CanvasDrawPath']
    },
    {
        name: 'fill',
        signatures: [['?winding'], ['path', '?winding']],
        receivers: ['CanvasRenderingContext2D', 'OffscreenCanvasRenderingContext2D', 'PaintRenderingContext2D']
    },
    {
        name: 'find',
        signatures: [['predicate', '?thisArg']],
        receivers: ['Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array', 'Int32Array', 'Uint32Array', 'Float32Array', 'Float64Array', 'Array', 'ReadonlyArray', 'BigInt64Array', 'BigUint64Array']
    },
    {
        name: 'find',
        signatures: [['?string', '?caseSensitive', '?backwards', '?wrap', '?wholeWord', '?searchInFrames', '?showDialog']],
        receivers: ['Window']
    },
    {
        name: 'findIndex',
        signatures: [['predicate', '?thisArg']]
    },
    {
        name: 'subarray',
        signatures: [['?begin', '?end']]
    },
    {
        name: 'of',
        signatures: [['...items']]
    },
    {
        name: 'from',
        signatures: [['arrayLike', '?mapfn', '?thisArg']],
        receivers: ['Int8ArrayConstructor', 'Uint8ArrayConstructor', 'Uint8ClampedArrayConstructor', 'Int16ArrayConstructor', 'Uint16ArrayConstructor', 'Int32ArrayConstructor', 'Uint32ArrayConstructor', 'Float32ArrayConstructor', 'Float64ArrayConstructor', 'BigInt64ArrayConstructor', 'BigUint64ArrayConstructor']
    },
    {
        name: 'from',
        signatures: [['iterable', '?mapfn', '?thisArg'], ['arrayLike', '?mapfn', '?thisArg']],
        receivers: ['ArrayConstructor']
    },
    {
        name: 'drawArraysInstancedANGLE',
        signatures: [['mode', 'first', 'count', 'primcount']]
    },
    {
        name: 'drawElementsInstancedANGLE',
        signatures: [['mode', 'count', 'type', 'offset', 'primcount']]
    },
    {
        name: 'vertexAttribDivisorANGLE',
        signatures: [['index', 'divisor']]
    },
    {
        name: 'abort',
        signatures: [['?reason']],
        receivers: ['AbortController', 'WritableStream', 'WritableStreamDefaultWriter', 'AbortSignal']
    },
    {
        name: 'abort',
        signatures: [['reason']],
        receivers: ['UnderlyingSinkBase']
    },
    {
        name: 'addEventListener',
        signatures: [['type', 'listener', '?options']],
        receivers: ['AbortSignal', 'SharedWorker', 'Worker', 'ServiceWorker', 'Animation', 'AudioBufferSourceNode', 'AudioContext', 'AudioScheduledSourceNode', 'AudioWorkletNode', 'BaseAudioContext', 'BroadcastChannel', 'CSSAnimation', 'CSSTransition', 'CanvasCaptureMediaStreamTrack', 'ConstantSourceNode', 'Document', 'HTMLElement', 'MathMLElement', 'SVGElement', 'Element', 'EventSource', 'FileReader', 'FontFaceSet', 'Window', 'HTMLAnchorElement', 'HTMLAreaElement', 'HTMLAudioElement', 'HTMLBRElement', 'HTMLBaseElement', 'HTMLBodyElement', 'HTMLButtonElement', 'HTMLCanvasElement', 'HTMLDListElement', 'HTMLDataElement', 'HTMLDataListElement', 'HTMLDetailsElement', 'HTMLDialogElement', 'HTMLDirectoryElement', 'HTMLDivElement', 'HTMLDocument', 'HTMLEmbedElement', 'HTMLFieldSetElement', 'HTMLFontElement', 'HTMLFormElement', 'HTMLFrameElement', 'HTMLFrameSetElement', 'HTMLHRElement', 'HTMLHeadElement', 'HTMLHeadingElement', 'HTMLHtmlElement', 'HTMLIFrameElement', 'HTMLImageElement', 'HTMLInputElement', 'HTMLLIElement', 'HTMLLabelElement', 'HTMLLegendElement', 'HTMLLinkElement', 'HTMLMapElement', 'HTMLMarqueeElement', 'HTMLMediaElement', 'HTMLMenuElement', 'HTMLMetaElement', 'HTMLMeterElement', 'HTMLModElement', 'HTMLOListElement', 'HTMLObjectElement', 'HTMLOptGroupElement', 'HTMLOptionElement', 'HTMLOutputElement', 'HTMLParagraphElement', 'HTMLParamElement', 'HTMLPictureElement', 'HTMLPreElement', 'HTMLProgressElement', 'HTMLQuoteElement', 'HTMLScriptElement', 'HTMLSelectElement', 'HTMLSlotElement', 'HTMLSourceElement', 'HTMLSpanElement', 'HTMLStyleElement', 'HTMLTableCaptionElement', 'HTMLTableCellElement', 'HTMLTableColElement', 'HTMLTableDataCellElement', 'HTMLTableElement', 'HTMLTableHeaderCellElement', 'HTMLTableRowElement', 'HTMLTableSectionElement', 'HTMLTemplateElement', 'HTMLTextAreaElement', 'HTMLTimeElement', 'HTMLTitleElement', 'HTMLTrackElement', 'HTMLUListElement', 'HTMLUnknownElement', 'HTMLVideoElement', 'IDBDatabase', 'IDBOpenDBRequest', 'IDBRequest', 'IDBTransaction', 'MediaDevices', 'MediaKeySession', 'MediaQueryList', 'MediaRecorder', 'MediaSource', 'MediaStream', 'MediaStreamTrack', 'MessagePort', 'Notification', 'OfflineAudioContext', 'OscillatorNode', 'PaymentRequest', 'Performance', 'PermissionStatus', 'PictureInPictureWindow', 'RTCDTMFSender', 'RTCDataChannel', 'RTCDtlsTransport', 'RTCPeerConnection', 'RemotePlayback', 'SVGAElement', 'SVGAnimateElement', 'SVGAnimateMotionElement', 'SVGAnimateTransformElement', 'SVGAnimationElement', 'SVGCircleElement', 'SVGClipPathElement', 'SVGComponentTransferFunctionElement', 'SVGDefsElement', 'SVGDescElement', 'SVGEllipseElement', 'SVGFEBlendElement', 'SVGFEColorMatrixElement', 'SVGFEComponentTransferElement', 'SVGFECompositeElement', 'SVGFEConvolveMatrixElement', 'SVGFEDiffuseLightingElement', 'SVGFEDisplacementMapElement', 'SVGFEDistantLightElement', 'SVGFEDropShadowElement', 'SVGFEFloodElement', 'SVGFEFuncAElement', 'SVGFEFuncBElement', 'SVGFEFuncGElement', 'SVGFEFuncRElement', 'SVGFEGaussianBlurElement', 'SVGFEImageElement', 'SVGFEMergeElement', 'SVGFEMergeNodeElement', 'SVGFEMorphologyElement', 'SVGFEOffsetElement', 'SVGFEPointLightElement', 'SVGFESpecularLightingElement', 'SVGFESpotLightElement', 'SVGFETileElement', 'SVGFETurbulenceElement', 'SVGFilterElement', 'SVGForeignObjectElement', 'SVGGElement', 'SVGGeometryElement', 'SVGGradientElement', 'SVGGraphicsElement', 'SVGImageElement', 'SVGLineElement', 'SVGLinearGradientElement', 'SVGMPathElement', 'SVGMarkerElement', 'SVGMaskElement', 'SVGMetadataElement', 'SVGPathElement', 'SVGPatternElement', 'SVGPolygonElement', 'SVGPolylineElement', 'SVGRadialGradientElement', 'SVGRectElement', 'SVGSVGElement', 'SVGScriptElement', 'SVGSetElement', 'SVGStopElement', 'SVGStyleElement', 'SVGSwitchElement', 'SVGSymbolElement', 'SVGTSpanElement', 'SVGTextContentElement', 'SVGTextElement', 'SVGTextPathElement', 'SVGTextPositioningElement', 'SVGTitleElement', 'SVGUseElement', 'SVGViewElement', 'ScreenOrientation', 'ScriptProcessorNode', 'ServiceWorkerContainer', 'ServiceWorkerRegistration', 'ShadowRoot', 'SourceBuffer', 'SourceBufferList', 'SpeechSynthesis', 'SpeechSynthesisUtterance', 'TextTrack', 'TextTrackCue', 'TextTrackList', 'VTTCue', 'VisualViewport', 'WebSocket', 'XMLDocument', 'XMLHttpRequest', 'XMLHttpRequestEventTarget', 'XMLHttpRequestUpload', 'DedicatedWorkerGlobalScope', 'ServiceWorkerGlobalScope', 'SharedWorkerGlobalScope', 'WorkerGlobalScope']
    },
    {
        name: 'addEventListener',
        signatures: [['type', 'callback', '?options'], ['type', 'listener', '?options']],
        receivers: ['EventTarget']
    },
    {
        name: 'removeEventListener',
        signatures: [['type', 'listener', '?options']],
        receivers: ['AbortSignal', 'SharedWorker', 'Worker', 'ServiceWorker', 'Animation', 'AudioBufferSourceNode', 'AudioContext', 'AudioScheduledSourceNode', 'AudioWorkletNode', 'BaseAudioContext', 'BroadcastChannel', 'CSSAnimation', 'CSSTransition', 'CanvasCaptureMediaStreamTrack', 'ConstantSourceNode', 'Document', 'HTMLElement', 'MathMLElement', 'SVGElement', 'Element', 'EventSource', 'FileReader', 'FontFaceSet', 'Window', 'HTMLAnchorElement', 'HTMLAreaElement', 'HTMLAudioElement', 'HTMLBRElement', 'HTMLBaseElement', 'HTMLBodyElement', 'HTMLButtonElement', 'HTMLCanvasElement', 'HTMLDListElement', 'HTMLDataElement', 'HTMLDataListElement', 'HTMLDetailsElement', 'HTMLDialogElement', 'HTMLDirectoryElement', 'HTMLDivElement', 'HTMLDocument', 'HTMLEmbedElement', 'HTMLFieldSetElement', 'HTMLFontElement', 'HTMLFormElement', 'HTMLFrameElement', 'HTMLFrameSetElement', 'HTMLHRElement', 'HTMLHeadElement', 'HTMLHeadingElement', 'HTMLHtmlElement', 'HTMLIFrameElement', 'HTMLImageElement', 'HTMLInputElement', 'HTMLLIElement', 'HTMLLabelElement', 'HTMLLegendElement', 'HTMLLinkElement', 'HTMLMapElement', 'HTMLMarqueeElement', 'HTMLMediaElement', 'HTMLMenuElement', 'HTMLMetaElement', 'HTMLMeterElement', 'HTMLModElement', 'HTMLOListElement', 'HTMLObjectElement', 'HTMLOptGroupElement', 'HTMLOptionElement', 'HTMLOutputElement', 'HTMLParagraphElement', 'HTMLParamElement', 'HTMLPictureElement', 'HTMLPreElement', 'HTMLProgressElement', 'HTMLQuoteElement', 'HTMLScriptElement', 'HTMLSelectElement', 'HTMLSlotElement', 'HTMLSourceElement', 'HTMLSpanElement', 'HTMLStyleElement', 'HTMLTableCaptionElement', 'HTMLTableCellElement', 'HTMLTableColElement', 'HTMLTableDataCellElement', 'HTMLTableElement', 'HTMLTableHeaderCellElement', 'HTMLTableRowElement', 'HTMLTableSectionElement', 'HTMLTemplateElement', 'HTMLTextAreaElement', 'HTMLTimeElement', 'HTMLTitleElement', 'HTMLTrackElement', 'HTMLUListElement', 'HTMLUnknownElement', 'HTMLVideoElement', 'IDBDatabase', 'IDBOpenDBRequest', 'IDBRequest', 'IDBTransaction', 'MediaDevices', 'MediaKeySession', 'MediaQueryList', 'MediaRecorder', 'MediaSource', 'MediaStream', 'MediaStreamTrack', 'MessagePort', 'Notification', 'OfflineAudioContext', 'OscillatorNode', 'PaymentRequest', 'Performance', 'PermissionStatus', 'PictureInPictureWindow', 'RTCDTMFSender', 'RTCDataChannel', 'RTCDtlsTransport', 'RTCPeerConnection', 'RemotePlayback', 'SVGAElement', 'SVGAnimateElement', 'SVGAnimateMotionElement', 'SVGAnimateTransformElement', 'SVGAnimationElement', 'SVGCircleElement', 'SVGClipPathElement', 'SVGComponentTransferFunctionElement', 'SVGDefsElement', 'SVGDescElement', 'SVGEllipseElement', 'SVGFEBlendElement', 'SVGFEColorMatrixElement', 'SVGFEComponentTransferElement', 'SVGFECompositeElement', 'SVGFEConvolveMatrixElement', 'SVGFEDiffuseLightingElement', 'SVGFEDisplacementMapElement', 'SVGFEDistantLightElement', 'SVGFEDropShadowElement', 'SVGFEFloodElement', 'SVGFEFuncAElement', 'SVGFEFuncBElement', 'SVGFEFuncGElement', 'SVGFEFuncRElement', 'SVGFEGaussianBlurElement', 'SVGFEImageElement', 'SVGFEMergeElement', 'SVGFEMergeNodeElement', 'SVGFEMorphologyElement', 'SVGFEOffsetElement', 'SVGFEPointLightElement', 'SVGFESpecularLightingElement', 'SVGFESpotLightElement', 'SVGFETileElement', 'SVGFETurbulenceElement', 'SVGFilterElement', 'SVGForeignObjectElement', 'SVGGElement', 'SVGGeometryElement', 'SVGGradientElement', 'SVGGraphicsElement', 'SVGImageElement', 'SVGLineElement', 'SVGLinearGradientElement', 'SVGMPathElement', 'SVGMarkerElement', 'SVGMaskElement', 'SVGMetadataElement', 'SVGPathElement', 'SVGPatternElement', 'SVGPolygonElement', 'SVGPolylineElement', 'SVGRadialGradientElement', 'SVGRectElement', 'SVGSVGElement', 'SVGScriptElement', 'SVGSetElement', 'SVGStopElement', 'SVGStyleElement', 'SVGSwitchElement', 'SVGSymbolElement', 'SVGTSpanElement', 'SVGTextContentElement', 'SVGTextElement', 'SVGTextPathElement', 'SVGTextPositioningElement', 'SVGTitleElement', 'SVGUseElement', 'SVGViewElement', 'ScreenOrientation', 'ScriptProcessorNode', 'ServiceWorkerContainer', 'ServiceWorkerRegistration', 'ShadowRoot', 'SourceBuffer', 'SourceBufferList', 'SpeechSynthesis', 'SpeechSynthesisUtterance', 'TextTrack', 'TextTrackCue', 'TextTrackList', 'VTTCue', 'VisualViewport', 'WebSocket', 'XMLDocument', 'XMLHttpRequest', 'XMLHttpRequestEventTarget', 'XMLHttpRequestUpload', 'DedicatedWorkerGlobalScope', 'ServiceWorkerGlobalScope', 'SharedWorkerGlobalScope', 'WorkerGlobalScope']
    },
    {
        name: 'removeEventListener',
        signatures: [['type', 'callback', '?options'], ['type', 'listener', '?options']],
        receivers: ['EventTarget']
    },
    {
        name: 'getByteFrequencyData',
        signatures: [['array']]
    },
    {
        name: 'getByteTimeDomainData',
        signatures: [['array']]
    },
    {
        name: 'getFloatFrequencyData',
        signatures: [['array']]
    },
    {
        name: 'getFloatTimeDomainData',
        signatures: [['array']]
    },
    {
        name: 'animate',
        signatures: [['keyframes', '?options']]
    },
    {
        name: 'getAnimations',
        signatures: [['?options']],
        receivers: ['Element']
    },
    {
        name: 'cancel',
        signatures: [['?reason']],
        receivers: ['ReadableStream', 'ReadableStreamBYOBReader', 'ReadableStreamDefaultReader', 'UnderlyingSourceBase']
    },
    {
        name: 'finish',
        signatures: [['?descriptor']],
        receivers: ['GPUCommandEncoder', 'GPURenderBundleEncoder']
    },
    {
        name: 'updatePlaybackRate',
        signatures: [['playbackRate'], ['playback_rate']]
    },
    {
        name: 'updateTiming',
        signatures: [['?timing']]
    },
    {
        name: 'cancelAnimationFrame',
        signatures: [['handle']]
    },
    {
        name: 'requestAnimationFrame',
        signatures: [['callback']]
    },
    {
        name: 'copyFromChannel',
        signatures: [['destination', 'channelNumber', '?bufferOffset']]
    },
    {
        name: 'copyToChannel',
        signatures: [['source', 'channelNumber', '?bufferOffset']]
    },
    {
        name: 'getChannelData',
        signatures: [['channel'], ['channelIndex']]
    },
    {
        name: 'start',
        signatures: [['?when', '?offset', '?duration'], ['?when', '?grainOffset', '?grainDuration']],
        receivers: ['AudioBufferSourceNode']
    },
    {
        name: 'start',
        signatures: [['?when']],
        receivers: ['AudioScheduledSourceNode']
    },
    {
        name: 'start',
        signatures: [['?timeslice']],
        receivers: ['MediaRecorder']
    },
    {
        name: 'start',
        signatures: [['index']],
        receivers: ['TimeRanges']
    },
    {
        name: 'start',
        signatures: [['?callback']],
        receivers: ['DocumentTransition']
    },
    {
        name: 'start',
        signatures: [['controller']],
        receivers: ['UnderlyingSinkBase']
    },
    {
        name: 'start',
        signatures: [['stream']],
        receivers: ['UnderlyingSourceBase']
    },
    {
        name: 'start',
        signatures: [['?options']],
        receivers: ['IdleDetector']
    },
    {
        name: 'start',
        signatures: [['remoteParameters', '?role']],
        receivers: ['RTCIceTransport']
    },
    {
        name: 'close',
        signatures: [['?code', '?reason']],
        receivers: ['WebSocket']
    },
    {
        name: 'close',
        signatures: [['?returnValue']],
        receivers: ['HTMLDialogElement']
    },
    {
        name: 'close',
        signatures: [['?closeInfo']],
        receivers: ['WebSocketStream', 'WebTransport']
    },
    {
        name: 'createMediaElementSource',
        signatures: [['mediaElement']]
    },
    {
        name: 'createMediaStreamSource',
        signatures: [['mediaStream']]
    },
    {
        name: 'suspend',
        signatures: [['suspendTime']],
        receivers: ['OfflineAudioContext']
    },
    {
        name: 'setOrientation',
        signatures: [['x', 'y', 'z', 'xUp', 'yUp', 'zUp']],
        receivers: ['AudioListener']
    },
    {
        name: 'setOrientation',
        signatures: [['x', 'y', 'z']],
        receivers: ['PannerNode']
    },
    {
        name: 'setPosition',
        signatures: [['x', 'y', 'z']],
        receivers: ['AudioListener', 'PannerNode']
    },
    {
        name: 'setPosition',
        signatures: [['node', '?offset']],
        receivers: ['Selection']
    },
    {
        name: 'connect',
        signatures: [['destinationParam', '?output'], ['destination', '?output', '?input'], ['destinationNode', '?output', '?input']],
        receivers: ['AudioNode']
    },
    {
        name: 'disconnect',
        signatures: [['?output'], ['destinationNode', '?output', '?input'], ['destinationParam', '?output'], ['destination', '?output', '?input']],
        receivers: ['AudioNode']
    },
    {
        name: 'cancelAndHoldAtTime',
        signatures: [['cancelTime'], ['startTime']]
    },
    {
        name: 'cancelScheduledValues',
        signatures: [['cancelTime'], ['startTime']]
    },
    {
        name: 'exponentialRampToValueAtTime',
        signatures: [['value', 'endTime'], ['value', 'time']]
    },
    {
        name: 'linearRampToValueAtTime',
        signatures: [['value', 'endTime'], ['value', 'time']]
    },
    {
        name: 'setTargetAtTime',
        signatures: [['target', 'startTime', 'timeConstant'], ['target', 'time', 'timeConstant']]
    },
    {
        name: 'setValueAtTime',
        signatures: [['value', 'startTime'], ['value', 'time']]
    },
    {
        name: 'setValueCurveAtTime',
        signatures: [['values', 'startTime', 'duration'], ['values', 'time', 'duration']]
    },
    {
        name: 'stop',
        signatures: [['?when']],
        receivers: ['AudioScheduledSourceNode']
    },
    {
        name: 'createBuffer',
        signatures: [['numberOfChannels', 'length', 'sampleRate'], ['numberOfChannels', 'numberOfFrames', 'sampleRate']],
        receivers: ['BaseAudioContext']
    },
    {
        name: 'createBuffer',
        signatures: [['descriptor']],
        receivers: ['GPUDevice']
    },
    {
        name: 'createChannelMerger',
        signatures: [['?numberOfInputs']]
    },
    {
        name: 'createChannelSplitter',
        signatures: [['?numberOfOutputs']]
    },
    {
        name: 'createDelay',
        signatures: [['?maxDelayTime']]
    },
    {
        name: 'createIIRFilter',
        signatures: [['feedforward', 'feedback'], ['feedForward', 'feedBack']]
    },
    {
        name: 'createPeriodicWave',
        signatures: [['real', 'imag', '?constraints']]
    },
    {
        name: 'createScriptProcessor',
        signatures: [['?bufferSize', '?numberOfInputChannels', '?numberOfOutputChannels']]
    },
    {
        name: 'decodeAudioData',
        signatures: [['audioData', '?successCallback', '?errorCallback']]
    },
    {
        name: 'getFrequencyResponse',
        signatures: [['frequencyHz', 'magResponse', 'phaseResponse']]
    },
    {
        name: 'postMessage',
        signatures: [['message']],
        receivers: ['BroadcastChannel']
    },
    {
        name: 'postMessage',
        signatures: [['message', 'transfer'], ['message', '?options']],
        receivers: ['MessagePort', 'ServiceWorker', 'Worker', 'Client', 'DedicatedWorkerGlobalScope']
    },
    {
        name: 'postMessage',
        signatures: [['message', '?options'], ['message', 'transfer'], ['message', 'targetOrigin', '?transfer']],
        receivers: ['Window']
    },
    {
        name: 'postMessage',
        signatures: [['message', '?options']],
        receivers: ['HTMLPortalElement', 'PortalHost']
    },
    {
        name: 'deleteRule',
        signatures: [['index']],
        receivers: ['CSSGroupingRule', 'CSSStyleSheet']
    },
    {
        name: 'deleteRule',
        signatures: [['select']],
        receivers: ['CSSKeyframesRule']
    },
    {
        name: 'insertRule',
        signatures: [['rule', '?index']]
    },
    {
        name: 'appendRule',
        signatures: [['rule']]
    },
    {
        name: 'findRule',
        signatures: [['select']]
    },
    {
        name: 'item',
        signatures: [['index']],
        receivers: ['CSSRuleList', 'CSSStyleDeclaration', 'DOMRectList', 'DOMStringList', 'DOMTokenList', 'FileList', 'HTMLCollectionBase', 'HTMLCollectionOf', 'HTMLSelectElement', 'MediaList', 'MimeTypeArray', 'NamedNodeMap', 'NodeList', 'NodeListOf', 'Plugin', 'PluginArray', 'SpeechRecognitionResult', 'SpeechRecognitionResultList', 'StyleSheetList', 'TouchList', 'AccessibleNodeList', 'HTMLCollection', 'SpeechGrammarList', 'SQLResultSetRowList']
    },
    {
        name: 'item',
        signatures: [['?nameOrIndex']],
        receivers: ['HTMLAllCollection']
    },
    {
        name: 'getPropertyPriority',
        signatures: [['property']]
    },
    {
        name: 'getPropertyValue',
        signatures: [['property']]
    },
    {
        name: 'removeProperty',
        signatures: [['property']]
    },
    {
        name: 'setProperty',
        signatures: [['property', 'value', '?priority']]
    },
    {
        name: 'addRule',
        signatures: [['?selector', '?style', '?index']]
    },
    {
        name: 'removeRule',
        signatures: [['?index']]
    },
    {
        name: 'add',
        signatures: [['request']],
        receivers: ['Cache']
    },
    {
        name: 'add',
        signatures: [['...tokens']],
        receivers: ['DOMTokenList']
    },
    {
        name: 'add',
        signatures: [['data', '?type'], ['file']],
        receivers: ['DataTransferItemList']
    },
    {
        name: 'add',
        signatures: [['element', '?before']],
        receivers: ['HTMLOptionsCollection', 'HTMLSelectElement']
    },
    {
        name: 'add',
        signatures: [['value', '?key']],
        receivers: ['IDBObjectStore']
    },
    {
        name: 'add',
        signatures: [['typedArray', 'index', 'value']],
        receivers: ['Atomics']
    },
    {
        name: 'add',
        signatures: [['value']],
        receivers: ['Set', 'WeakSet']
    },
    {
        name: 'add',
        signatures: [['node', '?before']],
        receivers: ['AccessibleNodeList']
    },
    {
        name: 'add',
        signatures: [['...values']],
        receivers: ['CSSNumericValue']
    },
    {
        name: 'add',
        signatures: [['key']],
        receivers: ['CustomStateSet']
    },
    {
        name: 'add',
        signatures: [['description']],
        receivers: ['ContentIndex']
    },
    {
        name: 'add',
        signatures: [['a', 'b']],
        receivers: ['MLGraphBuilder']
    },
    {
        name: 'add',
        signatures: [['sub_apps']],
        receivers: ['SubApps']
    },
    {
        name: 'addAll',
        signatures: [['requests']]
    },
    {
        name: 'delete',
        signatures: [['request', '?options']],
        receivers: ['Cache']
    },
    {
        name: 'delete',
        signatures: [['cacheName']],
        receivers: ['CacheStorage']
    },
    {
        name: 'delete',
        signatures: [['name']],
        receivers: ['FormData', 'URLSearchParams', 'StorageBucketManager', 'NativeIOFileManager']
    },
    {
        name: 'delete',
        signatures: [['name'], ['key']],
        receivers: ['Headers']
    },
    {
        name: 'delete',
        signatures: [['query'], ['key']],
        receivers: ['IDBObjectStore']
    },
    {
        name: 'delete',
        signatures: [['key']],
        receivers: ['Map', 'WeakMap', 'SharedStorage']
    },
    {
        name: 'delete',
        signatures: [['value']],
        receivers: ['Set', 'WeakSet']
    },
    {
        name: 'delete',
        signatures: [['property']],
        receivers: ['StylePropertyMap']
    },
    {
        name: 'delete',
        signatures: [['id']],
        receivers: ['ContentIndex']
    },
    {
        name: 'delete',
        signatures: [['name'], ['options']],
        receivers: ['CookieStore']
    },
    {
        name: 'delete',
        signatures: [['instrumentKey']],
        receivers: ['PaymentInstruments']
    },
    {
        name: 'matchAll',
        signatures: [['?request', '?options']],
        receivers: ['Cache', 'BackgroundFetchRegistration']
    },
    {
        name: 'matchAll',
        signatures: [['regexp']],
        receivers: ['String']
    },
    {
        name: 'matchAll',
        signatures: [['?options']],
        receivers: ['Clients']
    },
    {
        name: 'put',
        signatures: [['request', 'response']],
        receivers: ['Cache']
    },
    {
        name: 'put',
        signatures: [['value', '?key']],
        receivers: ['IDBObjectStore']
    },
    {
        name: 'has',
        signatures: [['cacheName']],
        receivers: ['CacheStorage']
    },
    {
        name: 'has',
        signatures: [['name']],
        receivers: ['FormData', 'URLSearchParams']
    },
    {
        name: 'has',
        signatures: [['name'], ['key']],
        receivers: ['Headers']
    },
    {
        name: 'has',
        signatures: [['keyId']],
        receivers: ['MediaKeyStatusMap']
    },
    {
        name: 'has',
        signatures: [['target', 'p']],
        receivers: ['ProxyHandler']
    },
    {
        name: 'has',
        signatures: [['key']],
        receivers: ['Map', 'ReadonlyMap', 'WeakMap']
    },
    {
        name: 'has',
        signatures: [['value']],
        receivers: ['Set', 'ReadonlySet', 'WeakSet']
    },
    {
        name: 'has',
        signatures: [['property']],
        receivers: ['StylePropertyMapReadOnly']
    },
    {
        name: 'has',
        signatures: [['instrumentKey']],
        receivers: ['PaymentInstruments']
    },
    {
        name: 'open',
        signatures: [['cacheName']],
        receivers: ['CacheStorage']
    },
    {
        name: 'open',
        signatures: [['?unused1', '?unused2'], ['?type', '?replace'], ['url', 'name', 'features']],
        receivers: ['Document']
    },
    {
        name: 'open',
        signatures: [['name', '?version']],
        receivers: ['IDBFactory']
    },
    {
        name: 'open',
        signatures: [['?url', '?target', '?features']],
        receivers: ['Window']
    },
    {
        name: 'open',
        signatures: [['method', 'url', '?async', '?username', '?password']],
        receivers: ['XMLHttpRequest']
    },
    {
        name: 'open',
        signatures: [['name', '?options']],
        receivers: ['StorageBucketManager']
    },
    {
        name: 'open',
        signatures: [['?options']],
        receivers: ['EyeDropper']
    },
    {
        name: 'open',
        signatures: [['name']],
        receivers: ['NativeIOFileManager']
    },
    {
        name: 'drawImage',
        signatures: [['image', 'dx', 'dy', '?dw', '?dh'], ['image', 'sx', 'sy', 'sw', 'sh', 'dx', 'dy', 'dw', 'dh']],
        receivers: ['CanvasDrawImage']
    },
    {
        name: 'drawImage',
        signatures: [['image', 'x', 'y', '?width', '?height'], ['image', 'sx', 'sy', 'sw', 'sh', 'dx', 'dy', 'dw', 'dh']],
        receivers: ['CanvasRenderingContext2D', 'OffscreenCanvasRenderingContext2D', 'PaintRenderingContext2D']
    },
    {
        name: 'clip',
        signatures: [['?fillRule'], ['path', '?fillRule']],
        receivers: ['CanvasDrawPath']
    },
    {
        name: 'clip',
        signatures: [['?winding'], ['path', '?winding']],
        receivers: ['CanvasRenderingContext2D', 'OffscreenCanvasRenderingContext2D', 'PaintRenderingContext2D']
    },
    {
        name: 'isPointInPath',
        signatures: [['x', 'y', '?fillRule'], ['path', 'x', 'y', '?fillRule']],
        receivers: ['CanvasDrawPath']
    },
    {
        name: 'isPointInPath',
        signatures: [['x', 'y', '?winding'], ['path', 'x', 'y', '?winding']],
        receivers: ['CanvasRenderingContext2D', 'OffscreenCanvasRenderingContext2D', 'PaintRenderingContext2D']
    },
    {
        name: 'isPointInStroke',
        signatures: [['x', 'y'], ['path', 'x', 'y']],
        receivers: ['CanvasDrawPath', 'CanvasRenderingContext2D', 'OffscreenCanvasRenderingContext2D', 'PaintRenderingContext2D']
    },
    {
        name: 'isPointInStroke',
        signatures: [['?point']],
        receivers: ['SVGGeometryElement']
    },
    {
        name: 'stroke',
        signatures: [['?path']]
    },
    {
        name: 'createConicGradient',
        signatures: [['startAngle', 'x', 'y']],
        receivers: ['CanvasFillStrokeStyles']
    },
    {
        name: 'createConicGradient',
        signatures: [['startAngle', 'cx', 'cy']],
        receivers: ['CanvasRenderingContext2D', 'PaintRenderingContext2D']
    },
    {
        name: 'createConicGradient',
        signatures: [['startAngle', 'centerX', 'centerY']],
        receivers: ['OffscreenCanvasRenderingContext2D']
    },
    {
        name: 'createLinearGradient',
        signatures: [['x0', 'y0', 'x1', 'y1']]
    },
    {
        name: 'createPattern',
        signatures: [['image', 'repetition']],
        receivers: ['CanvasFillStrokeStyles']
    },
    {
        name: 'createPattern',
        signatures: [['image', 'repetitionType']],
        receivers: ['CanvasRenderingContext2D', 'OffscreenCanvasRenderingContext2D', 'PaintRenderingContext2D']
    },
    {
        name: 'createRadialGradient',
        signatures: [['x0', 'y0', 'r0', 'x1', 'y1', 'r1']]
    },
    {
        name: 'addColorStop',
        signatures: [['offset', 'color']]
    },
    {
        name: 'createImageData',
        signatures: [['imagedata'], ['sw', 'sh', '?settings']],
        receivers: ['CanvasImageData']
    },
    {
        name: 'createImageData',
        signatures: [['imagedata'], ['sw', 'sh', '?imageDataSettings']],
        receivers: ['CanvasRenderingContext2D', 'OffscreenCanvasRenderingContext2D']
    },
    {
        name: 'getImageData',
        signatures: [['sx', 'sy', 'sw', 'sh', '?settings']],
        receivers: ['CanvasImageData']
    },
    {
        name: 'getImageData',
        signatures: [['sx', 'sy', 'sw', 'sh', '?imageDataSettings']],
        receivers: ['CanvasRenderingContext2D', 'OffscreenCanvasRenderingContext2D']
    },
    {
        name: 'putImageData',
        signatures: [['imagedata', 'dx', 'dy', '?dirtyX', '?dirtyY', '?dirtyWidth', '?dirtyHeight']]
    },
    {
        name: 'arc',
        signatures: [['x', 'y', 'radius', 'startAngle', 'endAngle', '?counterclockwise'], ['x', 'y', 'radius', 'startAngle', 'endAngle', '?anticlockwise']]
    },
    {
        name: 'arcTo',
        signatures: [['x1', 'y1', 'x2', 'y2', 'radius']]
    },
    {
        name: 'bezierCurveTo',
        signatures: [['cp1x', 'cp1y', 'cp2x', 'cp2y', 'x', 'y']]
    },
    {
        name: 'ellipse',
        signatures: [['x', 'y', 'radiusX', 'radiusY', 'rotation', 'startAngle', 'endAngle', '?counterclockwise'], ['x', 'y', 'radiusX', 'radiusY', 'rotation', 'startAngle', 'endAngle', '?anticlockwise']]
    },
    {
        name: 'lineTo',
        signatures: [['x', 'y']]
    },
    {
        name: 'moveTo',
        signatures: [['x', 'y']],
        receivers: ['CanvasRenderingContext2D', 'Path2D', 'OffscreenCanvasRenderingContext2D', 'PaintRenderingContext2D', 'Window']
    },
    {
        name: 'moveTo',
        signatures: [['parent', 'name']],
        receivers: ['EntrySync']
    },
    {
        name: 'moveTo',
        signatures: [['parent', '?name', '?successCallback', '?errorCallback']],
        receivers: ['Entry']
    },
    {
        name: 'quadraticCurveTo',
        signatures: [['cpx', 'cpy', 'x', 'y']]
    },
    {
        name: 'rect',
        signatures: [['x', 'y', 'w', 'h'], ['x', 'y', 'width', 'height']]
    },
    {
        name: 'setLineDash',
        signatures: [['segments']],
        receivers: ['CanvasPathDrawingStyles']
    },
    {
        name: 'setLineDash',
        signatures: [['dash']],
        receivers: ['CanvasRenderingContext2D', 'OffscreenCanvasRenderingContext2D', 'PaintRenderingContext2D']
    },
    {
        name: 'setTransform',
        signatures: [['?transform']],
        receivers: ['CanvasPattern']
    },
    {
        name: 'setTransform',
        signatures: [['?transform'], ['a', 'b', 'c', 'd', 'e', 'f']],
        receivers: ['CanvasTransform', 'CanvasRenderingContext2D', 'OffscreenCanvasRenderingContext2D', 'PaintRenderingContext2D']
    },
    {
        name: 'clearRect',
        signatures: [['x', 'y', 'w', 'h']],
        receivers: ['CanvasRect']
    },
    {
        name: 'clearRect',
        signatures: [['x', 'y', 'width', 'height']],
        receivers: ['CanvasRenderingContext2D', 'OffscreenCanvasRenderingContext2D', 'PaintRenderingContext2D']
    },
    {
        name: 'fillRect',
        signatures: [['x', 'y', 'w', 'h']],
        receivers: ['CanvasRect']
    },
    {
        name: 'fillRect',
        signatures: [['x', 'y', 'width', 'height']],
        receivers: ['CanvasRenderingContext2D', 'OffscreenCanvasRenderingContext2D', 'PaintRenderingContext2D']
    },
    {
        name: 'strokeRect',
        signatures: [['x', 'y', 'w', 'h']],
        receivers: ['CanvasRect']
    },
    {
        name: 'strokeRect',
        signatures: [['x', 'y', 'width', 'height']],
        receivers: ['CanvasRenderingContext2D', 'OffscreenCanvasRenderingContext2D', 'PaintRenderingContext2D']
    },
    {
        name: 'fillText',
        signatures: [['text', 'x', 'y', '?maxWidth']]
    },
    {
        name: 'measureText',
        signatures: [['text']]
    },
    {
        name: 'strokeText',
        signatures: [['text', 'x', 'y', '?maxWidth']]
    },
    {
        name: 'rotate',
        signatures: [['angle']],
        receivers: ['CanvasTransform', 'SVGMatrix', 'CanvasRenderingContext2D', 'OffscreenCanvasRenderingContext2D', 'PaintRenderingContext2D']
    },
    {
        name: 'rotate',
        signatures: [['?rotX', '?rotY', '?rotZ']],
        receivers: ['DOMMatrixReadOnly']
    },
    {
        name: 'scale',
        signatures: [['x', 'y']],
        receivers: ['CanvasTransform', 'CanvasRenderingContext2D', 'OffscreenCanvasRenderingContext2D', 'PaintRenderingContext2D']
    },
    {
        name: 'scale',
        signatures: [['?scaleX', '?scaleY', '?scaleZ', '?originX', '?originY', '?originZ']],
        receivers: ['DOMMatrixReadOnly']
    },
    {
        name: 'scale',
        signatures: [['scaleFactor']],
        receivers: ['SVGMatrix']
    },
    {
        name: 'transform',
        signatures: [['a', 'b', 'c', 'd', 'e', 'f']]
    },
    {
        name: 'translate',
        signatures: [['x', 'y']],
        receivers: ['CanvasTransform', 'SVGMatrix', 'CanvasRenderingContext2D', 'OffscreenCanvasRenderingContext2D', 'PaintRenderingContext2D']
    },
    {
        name: 'translate',
        signatures: [['?tx', '?ty', '?tz']],
        receivers: ['DOMMatrixReadOnly']
    },
    {
        name: 'drawFocusIfNeeded',
        signatures: [['element'], ['path', 'element']]
    },
    {
        name: 'appendData',
        signatures: [['data']]
    },
    {
        name: 'deleteData',
        signatures: [['offset', 'count']],
        receivers: ['CharacterData']
    },
    {
        name: 'deleteData',
        signatures: [['key']],
        receivers: ['LockScreenData']
    },
    {
        name: 'insertData',
        signatures: [['offset', 'data']]
    },
    {
        name: 'replaceData',
        signatures: [['offset', 'count', 'data']]
    },
    {
        name: 'substringData',
        signatures: [['offset', 'count']]
    },
    {
        name: 'after',
        signatures: [['...nodes']]
    },
    {
        name: 'before',
        signatures: [['...nodes']]
    },
    {
        name: 'remove',
        signatures: [['...tokens']],
        receivers: ['DOMTokenList']
    },
    {
        name: 'remove',
        signatures: [['index']],
        receivers: ['DataTransferItemList', 'HTMLOptionsCollection', 'AccessibleNodeList']
    },
    {
        name: 'remove',
        signatures: [['?index']],
        receivers: ['HTMLSelectElement']
    },
    {
        name: 'remove',
        signatures: [['start', 'end']],
        receivers: ['SourceBuffer']
    },
    {
        name: 'remove',
        signatures: [['?options']],
        receivers: ['FileSystemHandle']
    },
    {
        name: 'remove',
        signatures: [['successCallback', '?errorCallback']],
        receivers: ['Entry']
    },
    {
        name: 'remove',
        signatures: [['app_id']],
        receivers: ['SubApps']
    },
    {
        name: 'replaceWith',
        signatures: [['...nodes']]
    },
    {
        name: 'read',
        signatures: [['view']],
        receivers: ['ReadableStreamBYOBReader']
    },
    {
        name: 'read',
        signatures: [['buffer', 'options']],
        receivers: ['FileSystemSyncAccessHandle']
    },
    {
        name: 'read',
        signatures: [['buffer', 'file_offset']],
        receivers: ['NativeIOFileSync', 'NativeIOFile']
    },
    {
        name: 'write',
        signatures: [['data']],
        receivers: ['Clipboard', 'FileSystemWritableFileStream', 'FileWriterSync', 'FileWriter']
    },
    {
        name: 'write',
        signatures: [['...text'], ['text']],
        receivers: ['Document']
    },
    {
        name: 'write',
        signatures: [['?chunk']],
        receivers: ['WritableStreamDefaultWriter']
    },
    {
        name: 'write',
        signatures: [['chunk', 'controller']],
        receivers: ['UnderlyingSinkBase']
    },
    {
        name: 'write',
        signatures: [['buffer', 'options']],
        receivers: ['FileSystemSyncAccessHandle']
    },
    {
        name: 'write',
        signatures: [['buffer', 'file_offset']],
        receivers: ['NativeIOFileSync', 'NativeIOFile']
    },
    {
        name: 'write',
        signatures: [['message', '?options']],
        receivers: ['NDEFReader']
    },
    {
        name: 'writeText',
        signatures: [['data']]
    },
    {
        name: 'getType',
        signatures: [['type']]
    },
    {
        name: 'initCompositionEvent',
        signatures: [['typeArg', '?bubblesArg', '?cancelableArg', '?viewArg', '?dataArg'], ['type', '?bubbles', '?cancelable', '?view', '?data']]
    },
    {
        name: 'store',
        signatures: [['credential']],
        receivers: ['CredentialsContainer']
    },
    {
        name: 'store',
        signatures: [['typedArray', 'index', 'value']],
        receivers: ['Atomics']
    },
    {
        name: 'getRandomValues',
        signatures: [['array']]
    },
    {
        name: 'define',
        signatures: [['name', 'constructor', '?options']]
    },
    {
        name: 'upgrade',
        signatures: [['root']]
    },
    {
        name: 'whenDefined',
        signatures: [['name']]
    },
    {
        name: 'initCustomEvent',
        signatures: [['type', '?bubbles', '?cancelable', '?detail']]
    },
    {
        name: 'createDocument',
        signatures: [['namespace', 'qualifiedName', '?doctype'], ['namespaceURI', 'qualifiedName', '?doctype']]
    },
    {
        name: 'createDocumentType',
        signatures: [['qualifiedName', 'publicId', 'systemId']]
    },
    {
        name: 'createHTMLDocument',
        signatures: [['?title']]
    },
    {
        name: 'hasFeature',
        signatures: [['...args']]
    },
    {
        name: 'multiplySelf',
        signatures: [['?other']]
    },
    {
        name: 'preMultiplySelf',
        signatures: [['?other']]
    },
    {
        name: 'rotateAxisAngleSelf',
        signatures: [['?x', '?y', '?z', '?angle']]
    },
    {
        name: 'rotateFromVectorSelf',
        signatures: [['?x', '?y']]
    },
    {
        name: 'rotateSelf',
        signatures: [['?rotX', '?rotY', '?rotZ']]
    },
    {
        name: 'scale3dSelf',
        signatures: [['?scale', '?originX', '?originY', '?originZ']]
    },
    {
        name: 'scaleSelf',
        signatures: [['?scaleX', '?scaleY', '?scaleZ', '?originX', '?originY', '?originZ']]
    },
    {
        name: 'setMatrixValue',
        signatures: [['transformList']]
    },
    {
        name: 'skewXSelf',
        signatures: [['?sx']]
    },
    {
        name: 'skewYSelf',
        signatures: [['?sy']]
    },
    {
        name: 'translateSelf',
        signatures: [['?tx', '?ty', '?tz']]
    },
    {
        name: 'multiply',
        signatures: [['?other']],
        receivers: ['DOMMatrixReadOnly']
    },
    {
        name: 'multiply',
        signatures: [['secondMatrix']],
        receivers: ['SVGMatrix']
    },
    {
        name: 'rotateAxisAngle',
        signatures: [['?x', '?y', '?z', '?angle']]
    },
    {
        name: 'rotateFromVector',
        signatures: [['?x', '?y']],
        receivers: ['DOMMatrixReadOnly']
    },
    {
        name: 'rotateFromVector',
        signatures: [['x', 'y']],
        receivers: ['SVGMatrix']
    },
    {
        name: 'scale3d',
        signatures: [['?scale', '?originX', '?originY', '?originZ']]
    },
    {
        name: 'scaleNonUniform',
        signatures: [['?scaleX', '?scaleY']],
        receivers: ['DOMMatrixReadOnly']
    },
    {
        name: 'scaleNonUniform',
        signatures: [['scaleFactorX', 'scaleFactorY']],
        receivers: ['SVGMatrix']
    },
    {
        name: 'skewX',
        signatures: [['?sx']],
        receivers: ['DOMMatrixReadOnly']
    },
    {
        name: 'skewX',
        signatures: [['angle']],
        receivers: ['SVGMatrix']
    },
    {
        name: 'skewY',
        signatures: [['?sy']],
        receivers: ['DOMMatrixReadOnly']
    },
    {
        name: 'skewY',
        signatures: [['angle']],
        receivers: ['SVGMatrix']
    },
    {
        name: 'transformPoint',
        signatures: [['?point']]
    },
    {
        name: 'parseFromString',
        signatures: [['string', 'type'], ['str', 'type', '?options']]
    },
    {
        name: 'matrixTransform',
        signatures: [['?matrix']],
        receivers: ['DOMPointReadOnly']
    },
    {
        name: 'matrixTransform',
        signatures: [['matrix']],
        receivers: ['SVGPoint']
    },
    {
        name: 'contains',
        signatures: [['string']],
        receivers: ['DOMStringList']
    },
    {
        name: 'contains',
        signatures: [['token']],
        receivers: ['DOMTokenList']
    },
    {
        name: 'contains',
        signatures: [['other']],
        receivers: ['Node']
    },
    {
        name: 'supports',
        signatures: [['token']],
        receivers: ['DOMTokenList']
    },
    {
        name: 'supports',
        signatures: [['conditionText'], ['property', 'value']],
        receivers: ['CSS']
    },
    {
        name: 'supports',
        signatures: [['type']],
        receivers: ['HTMLScriptElement']
    },
    {
        name: 'toggle',
        signatures: [['token', '?force']]
    },
    {
        name: 'clearData',
        signatures: [['?format']]
    },
    {
        name: 'getData',
        signatures: [['format']],
        receivers: ['DataTransfer']
    },
    {
        name: 'getData',
        signatures: [['key']],
        receivers: ['LockScreenData']
    },
    {
        name: 'setData',
        signatures: [['format', 'data']],
        receivers: ['DataTransfer']
    },
    {
        name: 'setData',
        signatures: [['data']],
        receivers: ['PendingBeacon']
    },
    {
        name: 'setData',
        signatures: [['key', 'data']],
        receivers: ['LockScreenData']
    },
    {
        name: 'setDragImage',
        signatures: [['image', 'x', 'y']]
    },
    {
        name: 'getAsString',
        signatures: [['callback']]
    },
    {
        name: 'clear',
        signatures: [['mask']],
        receivers: ['WebGLRenderingContext', 'WebGL2RenderingContextBase', 'WebGL2RenderingContext']
    },
    {
        name: 'adoptNode',
        signatures: [['node']]
    },
    {
        name: 'caretRangeFromPoint',
        signatures: [['?x', '?y']]
    },
    {
        name: 'createAttribute',
        signatures: [['localName']]
    },
    {
        name: 'createAttributeNS',
        signatures: [['namespace', 'qualifiedName'], ['namespaceURI', 'qualifiedName']]
    },
    {
        name: 'createCDATASection',
        signatures: [['data']]
    },
    {
        name: 'createComment',
        signatures: [['data']]
    },
    {
        name: 'createElement',
        signatures: [['localName', '?options'], ['tagName', '?options']]
    },
    {
        name: 'createElementNS',
        signatures: [['namespaceURI', 'qualifiedName', '?options'], ['namespace', 'qualifiedName', '?options']]
    },
    {
        name: 'createEvent',
        signatures: [['eventInterface'], ['eventType']]
    },
    {
        name: 'createNodeIterator',
        signatures: [['root', '?whatToShow', '?filter']]
    },
    {
        name: 'createProcessingInstruction',
        signatures: [['target', 'data']]
    },
    {
        name: 'createTextNode',
        signatures: [['data']]
    },
    {
        name: 'createTreeWalker',
        signatures: [['root', '?whatToShow', '?filter']]
    },
    {
        name: 'execCommand',
        signatures: [['commandId', '?showUI', '?value']]
    },
    {
        name: 'getElementById',
        signatures: [['elementId']]
    },
    {
        name: 'getElementsByClassName',
        signatures: [['classNames']]
    },
    {
        name: 'getElementsByName',
        signatures: [['elementName']]
    },
    {
        name: 'getElementsByTagName',
        signatures: [['qualifiedName'], ['localName']]
    },
    {
        name: 'getElementsByTagNameNS',
        signatures: [['namespaceURI', 'localName'], ['namespace', 'localName']]
    },
    {
        name: 'importNode',
        signatures: [['node', '?deep']]
    },
    {
        name: 'queryCommandEnabled',
        signatures: [['commandId']]
    },
    {
        name: 'queryCommandIndeterm',
        signatures: [['commandId']]
    },
    {
        name: 'queryCommandState',
        signatures: [['commandId']]
    },
    {
        name: 'queryCommandSupported',
        signatures: [['commandId']]
    },
    {
        name: 'queryCommandValue',
        signatures: [['commandId']]
    },
    {
        name: 'writeln',
        signatures: [['...text'], ['text']]
    },
    {
        name: 'elementFromPoint',
        signatures: [['x', 'y']]
    },
    {
        name: 'elementsFromPoint',
        signatures: [['x', 'y']]
    },
    {
        name: 'attachShadow',
        signatures: [['init'], ['shadowRootInitDict']]
    },
    {
        name: 'closest',
        signatures: [['selector'], ['selectors']]
    },
    {
        name: 'getAttribute',
        signatures: [['qualifiedName'], ['name']]
    },
    {
        name: 'getAttributeNS',
        signatures: [['namespace', 'localName'], ['namespaceURI', 'localName']]
    },
    {
        name: 'getAttributeNode',
        signatures: [['qualifiedName'], ['name']]
    },
    {
        name: 'getAttributeNodeNS',
        signatures: [['namespace', 'localName'], ['namespaceURI', 'localName']]
    },
    {
        name: 'hasAttribute',
        signatures: [['qualifiedName'], ['name']]
    },
    {
        name: 'hasAttributeNS',
        signatures: [['namespace', 'localName'], ['namespaceURI', 'localName']]
    },
    {
        name: 'hasPointerCapture',
        signatures: [['pointerId']]
    },
    {
        name: 'insertAdjacentElement',
        signatures: [['where', 'element']]
    },
    {
        name: 'insertAdjacentHTML',
        signatures: [['position', 'text']]
    },
    {
        name: 'insertAdjacentText',
        signatures: [['where', 'data']]
    },
    {
        name: 'matches',
        signatures: [['selectors']]
    },
    {
        name: 'releasePointerCapture',
        signatures: [['pointerId']]
    },
    {
        name: 'removeAttribute',
        signatures: [['qualifiedName'], ['name']]
    },
    {
        name: 'removeAttributeNS',
        signatures: [['namespace', 'localName'], ['namespaceURI', 'localName']]
    },
    {
        name: 'removeAttributeNode',
        signatures: [['attr']]
    },
    {
        name: 'requestFullscreen',
        signatures: [['?options']]
    },
    {
        name: 'requestPointerLock',
        signatures: [['?options']]
    },
    {
        name: 'scroll',
        signatures: [['?options'], ['x', 'y']]
    },
    {
        name: 'scrollBy',
        signatures: [['?options'], ['x', 'y']]
    },
    {
        name: 'scrollIntoView',
        signatures: [['?arg']]
    },
    {
        name: 'scrollTo',
        signatures: [['?options'], ['x', 'y']]
    },
    {
        name: 'setAttribute',
        signatures: [['qualifiedName', 'value'], ['name', 'value']]
    },
    {
        name: 'setAttributeNS',
        signatures: [['namespace', 'qualifiedName', 'value'], ['namespaceURI', 'name', 'value']]
    },
    {
        name: 'setAttributeNode',
        signatures: [['attr']]
    },
    {
        name: 'setAttributeNodeNS',
        signatures: [['attr']]
    },
    {
        name: 'setPointerCapture',
        signatures: [['pointerId']]
    },
    {
        name: 'toggleAttribute',
        signatures: [['qualifiedName', '?force']]
    },
    {
        name: 'webkitMatchesSelector',
        signatures: [['selectors']]
    },
    {
        name: 'initEvent',
        signatures: [['type', '?bubbles', '?cancelable']]
    },
    {
        name: 'handleEvent',
        signatures: [['object']]
    },
    {
        name: 'dispatchEvent',
        signatures: [['event']]
    },
    {
        name: 'readAsArrayBuffer',
        signatures: [['blob']]
    },
    {
        name: 'readAsBinaryString',
        signatures: [['blob']]
    },
    {
        name: 'readAsDataURL',
        signatures: [['blob']]
    },
    {
        name: 'readAsText',
        signatures: [['blob', '?encoding'], ['blob', '?label']]
    },
    {
        name: 'getDirectory',
        signatures: [['?path', '?options', '?successCallback', '?errorCallback']],
        receivers: ['FileSystemDirectoryEntry']
    },
    {
        name: 'getDirectory',
        signatures: [['path', 'flags']],
        receivers: ['DirectoryEntrySync']
    },
    {
        name: 'getDirectory',
        signatures: [['path', '?options', '?successCallback', '?errorCallback']],
        receivers: ['DirectoryEntry']
    },
    {
        name: 'getFile',
        signatures: [['?path', '?options', '?successCallback', '?errorCallback']],
        receivers: ['FileSystemDirectoryEntry']
    },
    {
        name: 'getFile',
        signatures: [['path', 'flags']],
        receivers: ['DirectoryEntrySync']
    },
    {
        name: 'getFile',
        signatures: [['path', '?options', '?successCallback', '?errorCallback']],
        receivers: ['DirectoryEntry']
    },
    {
        name: 'getDirectoryHandle',
        signatures: [['name', '?options']]
    },
    {
        name: 'getFileHandle',
        signatures: [['name', '?options']]
    },
    {
        name: 'removeEntry',
        signatures: [['name', '?options']]
    },
    {
        name: 'resolve',
        signatures: [['possibleDescendant'], ['possibleChild']],
        receivers: ['FileSystemDirectoryHandle']
    },
    {
        name: 'resolve',
        signatures: [['?value']],
        receivers: ['PromiseConstructor']
    },
    {
        name: 'readEntries',
        signatures: [['successCallback', '?errorCallback']],
        receivers: ['FileSystemDirectoryReader', 'DirectoryReader']
    },
    {
        name: 'getParent',
        signatures: [['?successCallback', '?errorCallback']],
        receivers: ['FileSystemEntry', 'Entry']
    },
    {
        name: 'file',
        signatures: [['successCallback', '?errorCallback']],
        receivers: ['FileSystemFileEntry', 'FileEntry']
    },
    {
        name: 'isSameEntry',
        signatures: [['other']]
    },
    {
        name: 'load',
        signatures: [['font', '?text']],
        receivers: ['FontFaceSet']
    },
    {
        name: 'load',
        signatures: [['sessionId']],
        receivers: ['MediaKeySession']
    },
    {
        name: 'load',
        signatures: [['typedArray', 'index']],
        receivers: ['Atomics']
    },
    {
        name: 'load',
        signatures: [['buffer']],
        receivers: ['MLModelLoader']
    },
    {
        name: 'check',
        signatures: [['font', '?text']]
    },
    {
        name: 'append',
        signatures: [['name', 'value', '?fileName'], ['name', 'value', '?filename']],
        receivers: ['FormData']
    },
    {
        name: 'append',
        signatures: [['name', 'value']],
        receivers: ['Headers', 'URLSearchParams']
    },
    {
        name: 'append',
        signatures: [['...nodes']],
        receivers: ['DocumentFragment', 'Document', 'Element']
    },
    {
        name: 'append',
        signatures: [['property', '...values']],
        receivers: ['StylePropertyMap']
    },
    {
        name: 'append',
        signatures: [['key', 'value']],
        receivers: ['SharedStorage']
    },
    {
        name: 'getAll',
        signatures: [['name']],
        receivers: ['FormData', 'URLSearchParams']
    },
    {
        name: 'getAll',
        signatures: [['?query', '?count']],
        receivers: ['IDBIndex', 'IDBObjectStore']
    },
    {
        name: 'getAll',
        signatures: [['property']],
        receivers: ['StylePropertyMapReadOnly']
    },
    {
        name: 'getAll',
        signatures: [['name'], ['?options']],
        receivers: ['CookieStore']
    },
    {
        name: 'clearWatch',
        signatures: [['watchId'], ['watchID']]
    },
    {
        name: 'getCurrentPosition',
        signatures: [['successCallback', '?errorCallback', '?options']]
    },
    {
        name: 'watchPosition',
        signatures: [['successCallback', '?errorCallback', '?options']]
    },
    {
        name: 'namedItem',
        signatures: [['name']],
        receivers: ['HTMLAllCollection', 'HTMLCollection', 'HTMLCollectionOf', 'HTMLFormControlsCollection', 'HTMLSelectElement', 'MimeTypeArray', 'Plugin', 'PluginArray']
    },
    {
        name: 'namedItem',
        signatures: [['?name']],
        receivers: ['RTCStatsResponse']
    },
    {
        name: 'setCustomValidity',
        signatures: [['error']]
    },
    {
        name: 'captureStream',
        signatures: [['?frameRequestRate'], ['?frameRate']],
        receivers: ['HTMLCanvasElement']
    },
    {
        name: 'getContext',
        signatures: [['contextId', '?options'], ['contextId', '?attributes']],
        receivers: ['HTMLCanvasElement']
    },
    {
        name: 'getContext',
        signatures: [['contextType', '?attributes']],
        receivers: ['OffscreenCanvas']
    },
    {
        name: 'toBlob',
        signatures: [['callback', '?type', '?quality']]
    },
    {
        name: 'toDataURL',
        signatures: [['?type', '?quality']]
    },
    {
        name: 'requestSubmit',
        signatures: [['?submitter']]
    },
    {
        name: 'submit',
        signatures: [['buffers']],
        receivers: ['GPUQueue']
    },
    {
        name: 'decode',
        signatures: [['?input', '?options']],
        receivers: ['TextDecoder']
    },
    {
        name: 'decode',
        signatures: [['chunk']],
        receivers: ['AudioDecoder', 'VideoDecoder']
    },
    {
        name: 'decode',
        signatures: [['?options']],
        receivers: ['ImageDecoder']
    },
    {
        name: 'select',
        signatures: [['properties', '?options']],
        receivers: ['ContactsManager']
    },
    {
        name: 'setRangeText',
        signatures: [['replacement', '?start', '?end', '?selectionMode']]
    },
    {
        name: 'setSelectionRange',
        signatures: [['start', 'end', '?direction']]
    },
    {
        name: 'stepDown',
        signatures: [['?n']]
    },
    {
        name: 'stepUp',
        signatures: [['?n']]
    },
    {
        name: 'addTextTrack',
        signatures: [['kind', '?label', '?language']]
    },
    {
        name: 'canPlayType',
        signatures: [['type']]
    },
    {
        name: 'fastSeek',
        signatures: [['time']]
    },
    {
        name: 'setMediaKeys',
        signatures: [['mediaKeys']]
    },
    {
        name: 'focus',
        signatures: [['?options']],
        receivers: ['HTMLOrSVGElement', 'HTMLElement', 'MathMLElement', 'SVGElement']
    },
    {
        name: 'focus',
        signatures: [['focus_behavior']],
        receivers: ['BrowserCaptureMediaStreamTrack', 'FocusableMediaStreamTrack']
    },
    {
        name: 'assign',
        signatures: [['...nodes']],
        receivers: ['HTMLSlotElement']
    },
    {
        name: 'assign',
        signatures: [['url']],
        receivers: ['Location']
    },
    {
        name: 'assign',
        signatures: [['target', 'source'], ['target', '...sources'], ['target', 'source1', 'source2', '?source3']],
        receivers: ['ObjectConstructor']
    },
    {
        name: 'assignedElements',
        signatures: [['?options']]
    },
    {
        name: 'assignedNodes',
        signatures: [['?options']]
    },
    {
        name: 'deleteRow',
        signatures: [['index']]
    },
    {
        name: 'insertRow',
        signatures: [['?index']]
    },
    {
        name: 'deleteCell',
        signatures: [['index']]
    },
    {
        name: 'insertCell',
        signatures: [['?index']]
    },
    {
        name: 'back',
        signatures: [['?options']],
        receivers: ['Navigation']
    },
    {
        name: 'forward',
        signatures: [['?options']],
        receivers: ['Navigation']
    },
    {
        name: 'go',
        signatures: [['?delta']]
    },
    {
        name: 'pushState',
        signatures: [['data', 'unused', '?url'], ['data', 'title', '?url']]
    },
    {
        name: 'replaceState',
        signatures: [['data', 'unused', '?url'], ['data', 'title', '?url']]
    },
    {
        name: 'advance',
        signatures: [['count']]
    },
    {
        name: 'continue',
        signatures: [['?key']]
    },
    {
        name: 'continuePrimaryKey',
        signatures: [['key', 'primaryKey']]
    },
    {
        name: 'update',
        signatures: [['value']],
        receivers: ['IDBCursor']
    },
    {
        name: 'update',
        signatures: [['response']],
        receivers: ['MediaKeySession']
    },
    {
        name: 'createObjectStore',
        signatures: [['name', '?options']]
    },
    {
        name: 'deleteObjectStore',
        signatures: [['name']]
    },
    {
        name: 'transaction',
        signatures: [['storeNames', '?mode', '?options']],
        receivers: ['IDBDatabase']
    },
    {
        name: 'transaction',
        signatures: [['callback', '?errorCallback', '?successCallback']],
        receivers: ['Database']
    },
    {
        name: 'cmp',
        signatures: [['first', 'second']]
    },
    {
        name: 'deleteDatabase',
        signatures: [['name']]
    },
    {
        name: 'count',
        signatures: [['?query'], ['?key']],
        receivers: ['IDBIndex', 'IDBObjectStore']
    },
    {
        name: 'count',
        signatures: [['?label']],
        receivers: ['Console', 'console']
    },
    {
        name: 'getAllKeys',
        signatures: [['?query', '?count']]
    },
    {
        name: 'getKey',
        signatures: [['query'], ['key']],
        receivers: ['IDBIndex', 'IDBObjectStore']
    },
    {
        name: 'getKey',
        signatures: [['name']],
        receivers: ['PushSubscription']
    },
    {
        name: 'openCursor',
        signatures: [['?query', '?direction'], ['?range', '?direction']]
    },
    {
        name: 'openKeyCursor',
        signatures: [['?query', '?direction'], ['?range', '?direction']]
    },
    {
        name: 'includes',
        signatures: [['key']],
        receivers: ['IDBKeyRange']
    },
    {
        name: 'includes',
        signatures: [['searchString', '?position']],
        receivers: ['String']
    },
    {
        name: 'includes',
        signatures: [['searchElement', '?fromIndex']],
        receivers: ['Array', 'ReadonlyArray', 'Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array', 'Int32Array', 'Uint32Array', 'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array']
    },
    {
        name: 'createIndex',
        signatures: [['name', 'keyPath', '?options']]
    },
    {
        name: 'deleteIndex',
        signatures: [['name']]
    },
    {
        name: 'index',
        signatures: [['name']]
    },
    {
        name: 'objectStore',
        signatures: [['name']]
    },
    {
        name: 'transferFromImageBitmap',
        signatures: [['bitmap']]
    },
    {
        name: 'observe',
        signatures: [['target']],
        receivers: ['IntersectionObserver']
    },
    {
        name: 'observe',
        signatures: [['target', '?options']],
        receivers: ['MutationObserver', 'ResizeObserver']
    },
    {
        name: 'observe',
        signatures: [['?options']],
        receivers: ['PerformanceObserver']
    },
    {
        name: 'unobserve',
        signatures: [['target']]
    },
    {
        name: 'getModifierState',
        signatures: [['keyArg']]
    },
    {
        name: 'initKeyboardEvent',
        signatures: [['typeArg', '?bubblesArg', '?cancelableArg', '?viewArg', '?keyArg', '?locationArg', '?ctrlKey', '?altKey', '?shiftKey', '?metaKey'], ['type', '?bubbles', '?cancelable', '?view', '?keyIdentifier', '?location', '?ctrlKey', '?altKey', '?shiftKey', '?metaKey']]
    },
    {
        name: 'setKeyframes',
        signatures: [['keyframes']]
    },
    {
        name: 'reload',
        signatures: [['?options']],
        receivers: ['Navigation']
    },
    {
        name: 'query',
        signatures: [['permissionDesc'], ['permission']],
        receivers: ['Permissions']
    },
    {
        name: 'request',
        signatures: [['name', 'callback'], ['name', 'options', 'callback']],
        receivers: ['LockManager']
    },
    {
        name: 'request',
        signatures: [['permissions']],
        receivers: ['Permissions']
    },
    {
        name: 'request',
        signatures: [['?type']],
        receivers: ['WakeLock']
    },
    {
        name: 'decodingInfo',
        signatures: [['configuration']]
    },
    {
        name: 'encodingInfo',
        signatures: [['configuration']]
    },
    {
        name: 'getDisplayMedia',
        signatures: [['?constraints']]
    },
    {
        name: 'getUserMedia',
        signatures: [['?constraints']],
        receivers: ['MediaDevices']
    },
    {
        name: 'getUserMedia',
        signatures: [['constraints', 'successCallback', 'errorCallback']],
        receivers: ['Navigator']
    },
    {
        name: 'generateRequest',
        signatures: [['initDataType', 'initData']]
    },
    {
        name: 'createSession',
        signatures: [['?sessionType']]
    },
    {
        name: 'setServerCertificate',
        signatures: [['serverCertificate']]
    },
    {
        name: 'appendMedium',
        signatures: [['medium']]
    },
    {
        name: 'deleteMedium',
        signatures: [['medium']]
    },
    {
        name: 'addListener',
        signatures: [['callback'], ['listener']]
    },
    {
        name: 'removeListener',
        signatures: [['callback'], ['listener']]
    },
    {
        name: 'setActionHandler',
        signatures: [['action', 'handler']]
    },
    {
        name: 'setPositionState',
        signatures: [['?state']]
    },
    {
        name: 'addSourceBuffer',
        signatures: [['type'], ['config']]
    },
    {
        name: 'endOfStream',
        signatures: [['?error']]
    },
    {
        name: 'removeSourceBuffer',
        signatures: [['sourceBuffer'], ['buffer']]
    },
    {
        name: 'setLiveSeekableRange',
        signatures: [['start', 'end']]
    },
    {
        name: 'addTrack',
        signatures: [['track']],
        receivers: ['MediaStream']
    },
    {
        name: 'addTrack',
        signatures: [['track', '...streams']],
        receivers: ['RTCPeerConnection']
    },
    {
        name: 'getTrackById',
        signatures: [['trackId']],
        receivers: ['MediaStream']
    },
    {
        name: 'getTrackById',
        signatures: [['id']],
        receivers: ['TextTrackList', 'AudioTrackList', 'VideoTrackList']
    },
    {
        name: 'removeTrack',
        signatures: [['track']],
        receivers: ['MediaStream']
    },
    {
        name: 'removeTrack',
        signatures: [['sender']],
        receivers: ['RTCPeerConnection']
    },
    {
        name: 'applyConstraints',
        signatures: [['?constraints']]
    },
    {
        name: 'getCapabilities',
        signatures: [['kind']],
        receivers: ['RTCRtpReceiver', 'RTCRtpSender']
    },
    {
        name: 'initMessageEvent',
        signatures: [['type', '?bubbles', '?cancelable', '?data', '?origin', '?lastEventId', '?source', '?ports']]
    },
    {
        name: 'initMouseEvent',
        signatures: [['typeArg', 'canBubbleArg', 'cancelableArg', 'viewArg', 'detailArg', 'screenXArg', 'screenYArg', 'clientXArg', 'clientYArg', 'ctrlKeyArg', 'altKeyArg', 'shiftKeyArg', 'metaKeyArg', 'buttonArg', 'relatedTargetArg'], ['type', '?bubbles', '?cancelable', '?view', '?detail', '?screenX', '?screenY', '?clientX', '?clientY', '?ctrlKey', '?altKey', '?shiftKey', '?metaKey', '?button', '?relatedTarget']]
    },
    {
        name: 'initMutationEvent',
        signatures: [['typeArg', '?bubblesArg', '?cancelableArg', '?relatedNodeArg', '?prevValueArg', '?newValueArg', '?attrNameArg', '?attrChangeArg'], ['?type', '?bubbles', '?cancelable', '?relatedNode', '?prevValue', '?newValue', '?attrName', '?attrChange']]
    },
    {
        name: 'getNamedItem',
        signatures: [['qualifiedName'], ['name']]
    },
    {
        name: 'getNamedItemNS',
        signatures: [['namespace', 'localName'], ['namespaceURI', 'localName']]
    },
    {
        name: 'removeNamedItem',
        signatures: [['qualifiedName'], ['name']]
    },
    {
        name: 'removeNamedItemNS',
        signatures: [['namespace', 'localName'], ['namespaceURI', 'localName']]
    },
    {
        name: 'setNamedItem',
        signatures: [['attr']]
    },
    {
        name: 'setNamedItemNS',
        signatures: [['attr']]
    },
    {
        name: 'canShare',
        signatures: [['?data']]
    },
    {
        name: 'requestMediaKeySystemAccess',
        signatures: [['keySystem', 'supportedConfigurations']]
    },
    {
        name: 'sendBeacon',
        signatures: [['url', '?data']]
    },
    {
        name: 'share',
        signatures: [['?data']]
    },
    {
        name: 'vibrate',
        signatures: [['pattern']]
    },
    {
        name: 'registerProtocolHandler',
        signatures: [['scheme', 'url']]
    },
    {
        name: 'appendChild',
        signatures: [['node']],
        receivers: ['Node']
    },
    {
        name: 'appendChild',
        signatures: [['child']],
        receivers: ['AccessibleNode']
    },
    {
        name: 'cloneNode',
        signatures: [['?deep']]
    },
    {
        name: 'compareDocumentPosition',
        signatures: [['other']]
    },
    {
        name: 'getRootNode',
        signatures: [['?options']]
    },
    {
        name: 'insertBefore',
        signatures: [['node', 'child']]
    },
    {
        name: 'isDefaultNamespace',
        signatures: [['namespace'], ['namespaceURI']]
    },
    {
        name: 'isEqualNode',
        signatures: [['otherNode']]
    },
    {
        name: 'isSameNode',
        signatures: [['otherNode']]
    },
    {
        name: 'lookupNamespaceURI',
        signatures: [['prefix']],
        receivers: ['Node']
    },
    {
        name: 'lookupNamespaceURI',
        signatures: [['?prefix']],
        receivers: ['XPathNSResolver']
    },
    {
        name: 'lookupPrefix',
        signatures: [['namespace'], ['namespaceURI']]
    },
    {
        name: 'normalize',
        signatures: [['?form']],
        receivers: ['String']
    },
    {
        name: 'removeChild',
        signatures: [['child']]
    },
    {
        name: 'replaceChild',
        signatures: [['node', 'child']]
    },
    {
        name: 'bindVertexArrayOES',
        signatures: [['arrayObject']],
        receivers: ['OES_vertex_array_object']
    },
    {
        name: 'bindVertexArrayOES',
        signatures: [['?arrayObject']],
        receivers: ['OESVertexArrayObject']
    },
    {
        name: 'deleteVertexArrayOES',
        signatures: [['arrayObject']],
        receivers: ['OES_vertex_array_object']
    },
    {
        name: 'deleteVertexArrayOES',
        signatures: [['?arrayObject']],
        receivers: ['OESVertexArrayObject']
    },
    {
        name: 'isVertexArrayOES',
        signatures: [['arrayObject']],
        receivers: ['OES_vertex_array_object']
    },
    {
        name: 'isVertexArrayOES',
        signatures: [['?arrayObject']],
        receivers: ['OESVertexArrayObject']
    },
    {
        name: 'framebufferTextureMultiviewOVR',
        signatures: [['target', 'attachment', 'texture', 'level', 'baseViewIndex', 'numViews']]
    },
    {
        name: 'setPeriodicWave',
        signatures: [['periodicWave']]
    },
    {
        name: 'prepend',
        signatures: [['...nodes']]
    },
    {
        name: 'querySelector',
        signatures: [['selectors']]
    },
    {
        name: 'querySelectorAll',
        signatures: [['selectors']]
    },
    {
        name: 'replaceChildren',
        signatures: [['...nodes']]
    },
    {
        name: 'addPath',
        signatures: [['path', '?transform']]
    },
    {
        name: 'show',
        signatures: [['?detailsPromise']],
        receivers: ['PaymentRequest']
    },
    {
        name: 'updateWith',
        signatures: [['detailsPromise']]
    },
    {
        name: 'complete',
        signatures: [['?result'], ['?paymentResult']],
        receivers: ['PaymentResponse']
    },
    {
        name: 'complete',
        signatures: [['merchantSessionPromise']],
        receivers: ['MerchantValidationEvent']
    },
    {
        name: 'retry',
        signatures: [['?errorFields']]
    },
    {
        name: 'clearMarks',
        signatures: [['?markName']]
    },
    {
        name: 'clearMeasures',
        signatures: [['?measureName']]
    },
    {
        name: 'getEntriesByName',
        signatures: [['name', '?type'], ['name', '?entryType']]
    },
    {
        name: 'getEntriesByType',
        signatures: [['type'], ['entryType']]
    },
    {
        name: 'mark',
        signatures: [['markName', '?markOptions']]
    },
    {
        name: 'measure',
        signatures: [['measureName', '?startOrMeasureOptions', '?endMark']]
    },
    {
        name: 'setResourceTimingBufferSize',
        signatures: [['maxSize']]
    },
    {
        name: 'refresh',
        signatures: [['?reload']]
    },
    {
        name: 'permissionState',
        signatures: [['?options']]
    },
    {
        name: 'subscribe',
        signatures: [['?options']],
        receivers: ['PushManager']
    },
    {
        name: 'subscribe',
        signatures: [['subscriptions']],
        receivers: ['CookieStoreManager']
    },
    {
        name: 'unsubscribe',
        signatures: [['subscriptions']],
        receivers: ['CookieStoreManager']
    },
    {
        name: 'insertDTMF',
        signatures: [['tones', '?duration', '?interToneGap']]
    },
    {
        name: 'send',
        signatures: [['data']],
        receivers: ['RTCDataChannel', 'WebSocket']
    },
    {
        name: 'send',
        signatures: [['?body']],
        receivers: ['XMLHttpRequest']
    },
    {
        name: 'send',
        signatures: [['command']],
        receivers: ['InspectorOverlayHost']
    },
    {
        name: 'send',
        signatures: [['message'], ['data']],
        receivers: ['PresentationConnection']
    },
    {
        name: 'send',
        signatures: [['data', '?timestamp']],
        receivers: ['MIDIOutput']
    },
    {
        name: 'addIceCandidate',
        signatures: [['?candidate', '?successCallback', '?failureCallback']]
    },
    {
        name: 'addTransceiver',
        signatures: [['trackOrKind', '?init']]
    },
    {
        name: 'createAnswer',
        signatures: [['?options'], ['successCallback', 'failureCallback']]
    },
    {
        name: 'createDataChannel',
        signatures: [['label', '?dataChannelDict']]
    },
    {
        name: 'createOffer',
        signatures: [['?options'], ['successCallback', 'failureCallback', '?options']]
    },
    {
        name: 'getStats',
        signatures: [['?selector'], ['?callbackOrSelector', '?legacySelector']],
        receivers: ['RTCPeerConnection']
    },
    {
        name: 'setConfiguration',
        signatures: [['?configuration']]
    },
    {
        name: 'setLocalDescription',
        signatures: [['?description', '?successCallback', '?failureCallback']]
    },
    {
        name: 'setRemoteDescription',
        signatures: [['description', '?successCallback', '?failureCallback']]
    },
    {
        name: 'replaceTrack',
        signatures: [['withTrack']]
    },
    {
        name: 'setParameters',
        signatures: [['parameters']]
    },
    {
        name: 'setStreams',
        signatures: [['...streams']]
    },
    {
        name: 'setCodecPreferences',
        signatures: [['codecs']]
    },
    {
        name: 'collapse',
        signatures: [['?toStart']],
        receivers: ['Range']
    },
    {
        name: 'collapse',
        signatures: [['node', '?offset']],
        receivers: ['Selection']
    },
    {
        name: 'compareBoundaryPoints',
        signatures: [['how', 'sourceRange']]
    },
    {
        name: 'comparePoint',
        signatures: [['node', 'offset']]
    },
    {
        name: 'createContextualFragment',
        signatures: [['fragment']]
    },
    {
        name: 'insertNode',
        signatures: [['node']]
    },
    {
        name: 'intersectsNode',
        signatures: [['node']]
    },
    {
        name: 'isPointInRange',
        signatures: [['node', 'offset']]
    },
    {
        name: 'selectNode',
        signatures: [['node']]
    },
    {
        name: 'selectNodeContents',
        signatures: [['node']]
    },
    {
        name: 'setEnd',
        signatures: [['node', 'offset']]
    },
    {
        name: 'setEndAfter',
        signatures: [['node']]
    },
    {
        name: 'setEndBefore',
        signatures: [['node']]
    },
    {
        name: 'setStart',
        signatures: [['node', 'offset']]
    },
    {
        name: 'setStartAfter',
        signatures: [['node']]
    },
    {
        name: 'setStartBefore',
        signatures: [['node']]
    },
    {
        name: 'surroundContents',
        signatures: [['newParent']]
    },
    {
        name: 'getReader',
        signatures: [['?options']]
    },
    {
        name: 'pipeThrough',
        signatures: [['transform', '?options']]
    },
    {
        name: 'pipeTo',
        signatures: [['destination', '?options']]
    },
    {
        name: 'enqueue',
        signatures: [['?chunk']],
        receivers: ['ReadableStreamDefaultController', 'TransformStreamDefaultController']
    },
    {
        name: 'enqueue',
        signatures: [['chunk']],
        receivers: ['ReadableByteStreamController']
    },
    {
        name: 'error',
        signatures: [['?e']],
        receivers: ['ReadableStreamDefaultController', 'WritableStreamDefaultController', 'ReadableByteStreamController']
    },
    {
        name: 'error',
        signatures: [['?reason']],
        receivers: ['TransformStreamDefaultController']
    },
    {
        name: 'error',
        signatures: [['...data']],
        receivers: ['Console', 'console']
    },
    {
        name: 'cancelWatchAvailability',
        signatures: [['?id']]
    },
    {
        name: 'prompt',
        signatures: [['?message', '?_default'], ['?message', '?defaultValue']],
        receivers: ['Window']
    },
    {
        name: 'watchAvailability',
        signatures: [['callback']]
    },
    {
        name: 'convertToSpecifiedUnits',
        signatures: [['unitType']]
    },
    {
        name: 'newValueSpecifiedUnits',
        signatures: [['unitType', 'valueInSpecifiedUnits']]
    },
    {
        name: 'beginElementAt',
        signatures: [['offset']]
    },
    {
        name: 'endElementAt',
        signatures: [['offset']]
    },
    {
        name: 'setStdDeviation',
        signatures: [['stdDeviationX', 'stdDeviationY']]
    },
    {
        name: 'getPointAtLength',
        signatures: [['distance']]
    },
    {
        name: 'isPointInFill',
        signatures: [['?point']]
    },
    {
        name: 'getBBox',
        signatures: [['?options']]
    },
    {
        name: 'appendItem',
        signatures: [['newItem']]
    },
    {
        name: 'getItem',
        signatures: [['index']],
        receivers: ['SVGLengthList', 'SVGNumberList', 'SVGPointList', 'SVGStringList', 'SVGTransformList']
    },
    {
        name: 'getItem',
        signatures: [['key']],
        receivers: ['Storage']
    },
    {
        name: 'getItem',
        signatures: [['dimension1Index', '...dimensionNIndexes']],
        receivers: ['VBArray']
    },
    {
        name: 'initialize',
        signatures: [['newItem']]
    },
    {
        name: 'insertItemBefore',
        signatures: [['newItem', 'index']],
        receivers: ['SVGLengthList', 'SVGNumberList', 'SVGPointList', 'SVGTransformList']
    },
    {
        name: 'insertItemBefore',
        signatures: [['newItem', 'index'], ['item', 'index']],
        receivers: ['SVGStringList']
    },
    {
        name: 'removeItem',
        signatures: [['index']],
        receivers: ['SVGLengthList', 'SVGNumberList', 'SVGPointList', 'SVGStringList', 'SVGTransformList']
    },
    {
        name: 'removeItem',
        signatures: [['key']],
        receivers: ['Storage']
    },
    {
        name: 'replaceItem',
        signatures: [['newItem', 'index']]
    },
    {
        name: 'setOrientToAngle',
        signatures: [['angle']]
    },
    {
        name: 'checkEnclosure',
        signatures: [['element', 'rect']]
    },
    {
        name: 'checkIntersection',
        signatures: [['element', 'rect']]
    },
    {
        name: 'createSVGTransformFromMatrix',
        signatures: [['?matrix']]
    },
    {
        name: 'getEnclosureList',
        signatures: [['rect', 'referenceElement']]
    },
    {
        name: 'getIntersectionList',
        signatures: [['rect', 'referenceElement']]
    },
    {
        name: 'setCurrentTime',
        signatures: [['seconds']]
    },
    {
        name: 'suspendRedraw',
        signatures: [['maxWaitMilliseconds']]
    },
    {
        name: 'unsuspendRedraw',
        signatures: [['suspendHandleID'], ['suspendHandleId']]
    },
    {
        name: 'getCharNumAtPosition',
        signatures: [['?point']]
    },
    {
        name: 'getEndPositionOfChar',
        signatures: [['charnum']]
    },
    {
        name: 'getExtentOfChar',
        signatures: [['charnum']]
    },
    {
        name: 'getRotationOfChar',
        signatures: [['charnum']]
    },
    {
        name: 'getStartPositionOfChar',
        signatures: [['charnum']]
    },
    {
        name: 'getSubStringLength',
        signatures: [['charnum', 'nchars']]
    },
    {
        name: 'selectSubString',
        signatures: [['charnum', 'nchars']]
    },
    {
        name: 'setMatrix',
        signatures: [['?matrix']]
    },
    {
        name: 'setRotate',
        signatures: [['angle', 'cx', 'cy']]
    },
    {
        name: 'setScale',
        signatures: [['sx', 'sy']]
    },
    {
        name: 'setSkewX',
        signatures: [['angle']]
    },
    {
        name: 'setSkewY',
        signatures: [['angle']]
    },
    {
        name: 'setTranslate',
        signatures: [['tx', 'ty']]
    },
    {
        name: 'lock',
        signatures: [['orientation']],
        receivers: ['ScreenOrientation']
    },
    {
        name: 'lock',
        signatures: [['?keyCodes']],
        receivers: ['Keyboard']
    },
    {
        name: 'addRange',
        signatures: [['range']]
    },
    {
        name: 'containsNode',
        signatures: [['node', '?allowPartialContainment']]
    },
    {
        name: 'extend',
        signatures: [['node', '?offset']]
    },
    {
        name: 'getRangeAt',
        signatures: [['index']]
    },
    {
        name: 'removeRange',
        signatures: [['range']]
    },
    {
        name: 'selectAllChildren',
        signatures: [['node']]
    },
    {
        name: 'setBaseAndExtent',
        signatures: [['anchorNode', 'anchorOffset', 'focusNode', 'focusOffset'], ['baseNode', 'baseOffset', 'extentNode', 'extentOffset']]
    },
    {
        name: 'getRegistration',
        signatures: [['?clientURL'], ['?documentURL']]
    },
    {
        name: 'register',
        signatures: [['scriptURL', '?options'], ['url', '?options']],
        receivers: ['ServiceWorkerContainer']
    },
    {
        name: 'register',
        signatures: [['target', 'heldValue', '?unregisterToken']],
        receivers: ['FinalizationRegistry']
    },
    {
        name: 'register',
        signatures: [['tag', '?options']],
        receivers: ['PeriodicSyncManager']
    },
    {
        name: 'register',
        signatures: [['tag']],
        receivers: ['SyncManager']
    },
    {
        name: 'getNotifications',
        signatures: [['?filter']]
    },
    {
        name: 'showNotification',
        signatures: [['title', '?options']]
    },
    {
        name: 'unregister',
        signatures: [['unregisterToken']],
        receivers: ['FinalizationRegistry']
    },
    {
        name: 'unregister',
        signatures: [['tag']],
        receivers: ['PeriodicSyncManager']
    },
    {
        name: 'appendBuffer',
        signatures: [['data']]
    },
    {
        name: 'changeType',
        signatures: [['type'], ['config']]
    },
    {
        name: 'speak',
        signatures: [['utterance']]
    },
    {
        name: 'key',
        signatures: [['index']]
    },
    {
        name: 'setItem',
        signatures: [['key', 'value']]
    },
    {
        name: 'initStorageEvent',
        signatures: [['type', '?bubbles', '?cancelable', '?key', '?oldValue', '?newValue', '?url', '?storageArea']]
    },
    {
        name: 'matchMedium',
        signatures: [['?mediaquery']]
    },
    {
        name: 'decrypt',
        signatures: [['algorithm', 'key', 'data']]
    },
    {
        name: 'deriveBits',
        signatures: [['algorithm', 'baseKey', 'length']]
    },
    {
        name: 'deriveKey',
        signatures: [['algorithm', 'baseKey', 'derivedKeyType', 'extractable', 'keyUsages']]
    },
    {
        name: 'digest',
        signatures: [['algorithm', 'data']]
    },
    {
        name: 'encrypt',
        signatures: [['algorithm', 'key', 'data']]
    },
    {
        name: 'exportKey',
        signatures: [['format', 'key']]
    },
    {
        name: 'generateKey',
        signatures: [['algorithm', 'extractable', 'keyUsages']]
    },
    {
        name: 'importKey',
        signatures: [['format', 'keyData', 'algorithm', 'extractable', 'keyUsages']]
    },
    {
        name: 'sign',
        signatures: [['algorithm', 'key', 'data']],
        receivers: ['SubtleCrypto']
    },
    {
        name: 'sign',
        signatures: [['x']],
        receivers: ['Math']
    },
    {
        name: 'unwrapKey',
        signatures: [['format', 'wrappedKey', 'unwrappingKey', 'unwrapAlgorithm', 'unwrappedKeyAlgorithm', 'extractable', 'keyUsages']]
    },
    {
        name: 'verify',
        signatures: [['algorithm', 'key', 'signature', 'data']]
    },
    {
        name: 'wrapKey',
        signatures: [['format', 'key', 'wrappingKey', 'wrapAlgorithm']]
    },
    {
        name: 'splitText',
        signatures: [['offset']]
    },
    {
        name: 'encode',
        signatures: [['?input']],
        receivers: ['TextEncoder']
    },
    {
        name: 'encode',
        signatures: [['data']],
        receivers: ['AudioEncoder']
    },
    {
        name: 'encode',
        signatures: [['frame', '?options']],
        receivers: ['VideoEncoder']
    },
    {
        name: 'encodeInto',
        signatures: [['source', 'destination']]
    },
    {
        name: 'addCue',
        signatures: [['cue']]
    },
    {
        name: 'removeCue',
        signatures: [['cue']]
    },
    {
        name: 'getCueById',
        signatures: [['id']]
    },
    {
        name: 'end',
        signatures: [['index']],
        receivers: ['TimeRanges']
    },
    {
        name: 'initUIEvent',
        signatures: [['typeArg', '?bubblesArg', '?cancelableArg', '?viewArg', '?detailArg'], ['type', '?bubbles', '?cancelable', '?view', '?detail']]
    },
    {
        name: 'getTranslatedShaderSource',
        signatures: [['shader']]
    },
    {
        name: 'drawBuffersWEBGL',
        signatures: [['buffers']]
    },
    {
        name: 'multiDrawArraysInstancedWEBGL',
        signatures: [['mode', 'firstsList', 'firstsOffset', 'countsList', 'countsOffset', 'instanceCountsList', 'instanceCountsOffset', 'drawcount']]
    },
    {
        name: 'multiDrawArraysWEBGL',
        signatures: [['mode', 'firstsList', 'firstsOffset', 'countsList', 'countsOffset', 'drawcount']]
    },
    {
        name: 'multiDrawElementsInstancedWEBGL',
        signatures: [['mode', 'countsList', 'countsOffset', 'type', 'offsetsList', 'offsetsOffset', 'instanceCountsList', 'instanceCountsOffset', 'drawcount']]
    },
    {
        name: 'multiDrawElementsWEBGL',
        signatures: [['mode', 'countsList', 'countsOffset', 'type', 'offsetsList', 'offsetsOffset', 'drawcount']]
    },
    {
        name: 'beginQuery',
        signatures: [['target', 'query']]
    },
    {
        name: 'beginTransformFeedback',
        signatures: [['primitiveMode']]
    },
    {
        name: 'bindBufferBase',
        signatures: [['target', 'index', 'buffer']]
    },
    {
        name: 'bindBufferRange',
        signatures: [['target', 'index', 'buffer', 'offset', 'size']]
    },
    {
        name: 'bindSampler',
        signatures: [['unit', 'sampler']]
    },
    {
        name: 'bindTransformFeedback',
        signatures: [['target', 'tf'], ['target', 'feedback']]
    },
    {
        name: 'bindVertexArray',
        signatures: [['array'], ['vertexArray']]
    },
    {
        name: 'blitFramebuffer',
        signatures: [['srcX0', 'srcY0', 'srcX1', 'srcY1', 'dstX0', 'dstY0', 'dstX1', 'dstY1', 'mask', 'filter']]
    },
    {
        name: 'clearBufferfi',
        signatures: [['buffer', 'drawbuffer', 'depth', 'stencil']]
    },
    {
        name: 'clearBufferfv',
        signatures: [['buffer', 'drawbuffer', 'values', '?srcOffset'], ['buffer', 'drawbuffer', 'value', '?srcOffset']]
    },
    {
        name: 'clearBufferiv',
        signatures: [['buffer', 'drawbuffer', 'values', '?srcOffset'], ['buffer', 'drawbuffer', 'value', '?srcOffset']]
    },
    {
        name: 'clearBufferuiv',
        signatures: [['buffer', 'drawbuffer', 'values', '?srcOffset'], ['buffer', 'drawbuffer', 'value', '?srcOffset']]
    },
    {
        name: 'clientWaitSync',
        signatures: [['sync', 'flags', 'timeout']]
    },
    {
        name: 'compressedTexImage3D',
        signatures: [['target', 'level', 'internalformat', 'width', 'height', 'depth', 'border', 'imageSize', 'offset'], ['target', 'level', 'internalformat', 'width', 'height', 'depth', 'border', 'srcData', '?srcOffset', '?srcLengthOverride'], ['target', 'level', 'internalformat', 'width', 'height', 'depth', 'border', 'data', '?srcOffset', '?srcLengthOverride']]
    },
    {
        name: 'compressedTexSubImage3D',
        signatures: [['target', 'level', 'xoffset', 'yoffset', 'zoffset', 'width', 'height', 'depth', 'format', 'imageSize', 'offset'], ['target', 'level', 'xoffset', 'yoffset', 'zoffset', 'width', 'height', 'depth', 'format', 'srcData', '?srcOffset', '?srcLengthOverride'], ['target', 'level', 'xoffset', 'yoffset', 'zoffset', 'width', 'height', 'depth', 'format', 'data', '?srcOffset', '?srcLengthOverride']]
    },
    {
        name: 'copyBufferSubData',
        signatures: [['readTarget', 'writeTarget', 'readOffset', 'writeOffset', 'size']]
    },
    {
        name: 'copyTexSubImage3D',
        signatures: [['target', 'level', 'xoffset', 'yoffset', 'zoffset', 'x', 'y', 'width', 'height']]
    },
    {
        name: 'createSampler',
        signatures: [['?descriptor']],
        receivers: ['GPUDevice']
    },
    {
        name: 'deleteQuery',
        signatures: [['query']]
    },
    {
        name: 'deleteSampler',
        signatures: [['sampler']]
    },
    {
        name: 'deleteSync',
        signatures: [['sync']],
        receivers: ['WebGL2RenderingContext']
    },
    {
        name: 'deleteSync',
        signatures: [['name']],
        receivers: ['NativeIOFileManager']
    },
    {
        name: 'deleteTransformFeedback',
        signatures: [['tf'], ['feedback']]
    },
    {
        name: 'deleteVertexArray',
        signatures: [['vertexArray']]
    },
    {
        name: 'drawArraysInstanced',
        signatures: [['mode', 'first', 'count', 'instanceCount']]
    },
    {
        name: 'drawBuffers',
        signatures: [['buffers']]
    },
    {
        name: 'drawElementsInstanced',
        signatures: [['mode', 'count', 'type', 'offset', 'instanceCount']]
    },
    {
        name: 'drawRangeElements',
        signatures: [['mode', 'start', 'end', 'count', 'type', 'offset']]
    },
    {
        name: 'endQuery',
        signatures: [['target']]
    },
    {
        name: 'fenceSync',
        signatures: [['condition', 'flags']]
    },
    {
        name: 'framebufferTextureLayer',
        signatures: [['target', 'attachment', 'texture', 'level', 'layer']]
    },
    {
        name: 'getActiveUniformBlockName',
        signatures: [['program', 'uniformBlockIndex']]
    },
    {
        name: 'getActiveUniformBlockParameter',
        signatures: [['program', 'uniformBlockIndex', 'pname']]
    },
    {
        name: 'getActiveUniforms',
        signatures: [['program', 'uniformIndices', 'pname']]
    },
    {
        name: 'getBufferSubData',
        signatures: [['target', 'srcByteOffset', 'dstBuffer', '?dstOffset', '?length'], ['target', 'srcByteOffset', 'dstData', '?dstOffset', '?length']]
    },
    {
        name: 'getFragDataLocation',
        signatures: [['program', 'name']]
    },
    {
        name: 'getIndexedParameter',
        signatures: [['target', 'index']]
    },
    {
        name: 'getInternalformatParameter',
        signatures: [['target', 'internalformat', 'pname']]
    },
    {
        name: 'getQuery',
        signatures: [['target', 'pname']]
    },
    {
        name: 'getQueryParameter',
        signatures: [['query', 'pname']]
    },
    {
        name: 'getSamplerParameter',
        signatures: [['sampler', 'pname']]
    },
    {
        name: 'getSyncParameter',
        signatures: [['sync', 'pname']]
    },
    {
        name: 'getTransformFeedbackVarying',
        signatures: [['program', 'index']]
    },
    {
        name: 'getUniformBlockIndex',
        signatures: [['program', 'uniformBlockName']]
    },
    {
        name: 'getUniformIndices',
        signatures: [['program', 'uniformNames']]
    },
    {
        name: 'invalidateFramebuffer',
        signatures: [['target', 'attachments']]
    },
    {
        name: 'invalidateSubFramebuffer',
        signatures: [['target', 'attachments', 'x', 'y', 'width', 'height']]
    },
    {
        name: 'isQuery',
        signatures: [['query']]
    },
    {
        name: 'isSampler',
        signatures: [['sampler']]
    },
    {
        name: 'isSync',
        signatures: [['sync']]
    },
    {
        name: 'isTransformFeedback',
        signatures: [['tf'], ['feedback']]
    },
    {
        name: 'isVertexArray',
        signatures: [['vertexArray']]
    },
    {
        name: 'readBuffer',
        signatures: [['src'], ['mode']]
    },
    {
        name: 'renderbufferStorageMultisample',
        signatures: [['target', 'samples', 'internalformat', 'width', 'height']]
    },
    {
        name: 'samplerParameterf',
        signatures: [['sampler', 'pname', 'param']]
    },
    {
        name: 'samplerParameteri',
        signatures: [['sampler', 'pname', 'param']]
    },
    {
        name: 'texImage3D',
        signatures: [['target', 'level', 'internalformat', 'width', 'height', 'depth', 'border', 'format', 'type', 'pboOffset'], ['target', 'level', 'internalformat', 'width', 'height', 'depth', 'border', 'format', 'type', 'source'], ['target', 'level', 'internalformat', 'width', 'height', 'depth', 'border', 'format', 'type', 'srcData', '?srcOffset'], ['target', 'level', 'internalformat', 'width', 'height', 'depth', 'border', 'format', 'type', 'offset'], ['target', 'level', 'internalformat', 'width', 'height', 'depth', 'border', 'format', 'type', 'data'], ['target', 'level', 'internalformat', 'width', 'height', 'depth', 'border', 'format', 'type', 'image'], ['target', 'level', 'internalformat', 'width', 'height', 'depth', 'border', 'format', 'type', 'canvas'], ['target', 'level', 'internalformat', 'width', 'height', 'depth', 'border', 'format', 'type', 'offscreenCanvas'], ['target', 'level', 'internalformat', 'width', 'height', 'depth', 'border', 'format', 'type', 'video'], ['target', 'level', 'internalformat', 'width', 'height', 'depth', 'border', 'format', 'type', 'frame'], ['target', 'level', 'internalformat', 'width', 'height', 'depth', 'border', 'format', 'type', 'bitmap'], ['target', 'level', 'internalformat', 'width', 'height', 'depth', 'border', 'format', 'type', 'pixels', '?srcOffset']]
    },
    {
        name: 'texStorage2D',
        signatures: [['target', 'levels', 'internalformat', 'width', 'height']]
    },
    {
        name: 'texStorage3D',
        signatures: [['target', 'levels', 'internalformat', 'width', 'height', 'depth']]
    },
    {
        name: 'texSubImage3D',
        signatures: [['target', 'level', 'xoffset', 'yoffset', 'zoffset', 'width', 'height', 'depth', 'format', 'type', 'pboOffset'], ['target', 'level', 'xoffset', 'yoffset', 'zoffset', 'width', 'height', 'depth', 'format', 'type', 'source'], ['target', 'level', 'xoffset', 'yoffset', 'zoffset', 'width', 'height', 'depth', 'format', 'type', 'offset'], ['target', 'level', 'xoffset', 'yoffset', 'zoffset', 'width', 'height', 'depth', 'format', 'type', 'data'], ['target', 'level', 'xoffset', 'yoffset', 'zoffset', 'width', 'height', 'depth', 'format', 'type', 'image'], ['target', 'level', 'xoffset', 'yoffset', 'zoffset', 'width', 'height', 'depth', 'format', 'type', 'canvas'], ['target', 'level', 'xoffset', 'yoffset', 'zoffset', 'width', 'height', 'depth', 'format', 'type', 'offscreenCanvas'], ['target', 'level', 'xoffset', 'yoffset', 'zoffset', 'width', 'height', 'depth', 'format', 'type', 'video'], ['target', 'level', 'xoffset', 'yoffset', 'zoffset', 'width', 'height', 'depth', 'format', 'type', 'frame'], ['target', 'level', 'xoffset', 'yoffset', 'zoffset', 'width', 'height', 'depth', 'format', 'type', 'bitmap'], ['target', 'level', 'xoffset', 'yoffset', 'zoffset', 'width', 'height', 'depth', 'format', 'type', 'srcData', '?srcOffset'], ['target', 'level', 'xoffset', 'yoffset', 'zoffset', 'width', 'height', 'depth', 'format', 'type', 'pixels', '?srcOffset']]
    },
    {
        name: 'transformFeedbackVaryings',
        signatures: [['program', 'varyings', 'bufferMode']]
    },
    {
        name: 'uniform1ui',
        signatures: [['location', 'v0']]
    },
    {
        name: 'uniform1uiv',
        signatures: [['location', 'data', '?srcOffset', '?srcLength'], ['location', 'v', '?srcOffset', '?srcLength']]
    },
    {
        name: 'uniform2ui',
        signatures: [['location', 'v0', 'v1']]
    },
    {
        name: 'uniform2uiv',
        signatures: [['location', 'data', '?srcOffset', '?srcLength'], ['location', 'v', '?srcOffset', '?srcLength']]
    },
    {
        name: 'uniform3ui',
        signatures: [['location', 'v0', 'v1', 'v2']]
    },
    {
        name: 'uniform3uiv',
        signatures: [['location', 'data', '?srcOffset', '?srcLength'], ['location', 'v', '?srcOffset', '?srcLength']]
    },
    {
        name: 'uniform4ui',
        signatures: [['location', 'v0', 'v1', 'v2', 'v3']]
    },
    {
        name: 'uniform4uiv',
        signatures: [['location', 'data', '?srcOffset', '?srcLength'], ['location', 'v', '?srcOffset', '?srcLength']]
    },
    {
        name: 'uniformBlockBinding',
        signatures: [['program', 'uniformBlockIndex', 'uniformBlockBinding']]
    },
    {
        name: 'uniformMatrix2x3fv',
        signatures: [['location', 'transpose', 'data', '?srcOffset', '?srcLength'], ['location', 'transpose', 'value', '?srcOffset', '?srcLength']]
    },
    {
        name: 'uniformMatrix2x4fv',
        signatures: [['location', 'transpose', 'data', '?srcOffset', '?srcLength'], ['location', 'transpose', 'value', '?srcOffset', '?srcLength']]
    },
    {
        name: 'uniformMatrix3x2fv',
        signatures: [['location', 'transpose', 'data', '?srcOffset', '?srcLength'], ['location', 'transpose', 'value', '?srcOffset', '?srcLength']]
    },
    {
        name: 'uniformMatrix3x4fv',
        signatures: [['location', 'transpose', 'data', '?srcOffset', '?srcLength'], ['location', 'transpose', 'value', '?srcOffset', '?srcLength']]
    },
    {
        name: 'uniformMatrix4x2fv',
        signatures: [['location', 'transpose', 'data', '?srcOffset', '?srcLength'], ['location', 'transpose', 'value', '?srcOffset', '?srcLength']]
    },
    {
        name: 'uniformMatrix4x3fv',
        signatures: [['location', 'transpose', 'data', '?srcOffset', '?srcLength'], ['location', 'transpose', 'value', '?srcOffset', '?srcLength']]
    },
    {
        name: 'vertexAttribDivisor',
        signatures: [['index', 'divisor']]
    },
    {
        name: 'vertexAttribI4i',
        signatures: [['index', 'x', 'y', 'z', 'w']]
    },
    {
        name: 'vertexAttribI4iv',
        signatures: [['index', 'values'], ['index', 'v']]
    },
    {
        name: 'vertexAttribI4ui',
        signatures: [['index', 'x', 'y', 'z', 'w']]
    },
    {
        name: 'vertexAttribI4uiv',
        signatures: [['index', 'values'], ['index', 'v']]
    },
    {
        name: 'vertexAttribIPointer',
        signatures: [['index', 'size', 'type', 'stride', 'offset']]
    },
    {
        name: 'waitSync',
        signatures: [['sync', 'flags', 'timeout']]
    },
    {
        name: 'bufferData',
        signatures: [['target', 'size', 'usage'], ['target', 'srcData', 'usage', '?srcOffset', '?length']],
        receivers: ['WebGL2RenderingContextOverloads']
    },
    {
        name: 'bufferData',
        signatures: [['target', 'size', 'usage'], ['target', 'data', 'usage']],
        receivers: ['WebGLRenderingContextOverloads', 'WebGLRenderingContext', 'WebGL2RenderingContextBase', 'WebGL2RenderingContext']
    },
    {
        name: 'bufferData',
        signatures: [['target', 'srcData', 'usage', 'srcOffset', '?length']],
        receivers: ['WebGL2RenderingContext']
    },
    {
        name: 'bufferSubData',
        signatures: [['target', 'dstByteOffset', 'srcData', '?srcOffset', '?length']],
        receivers: ['WebGL2RenderingContextOverloads']
    },
    {
        name: 'bufferSubData',
        signatures: [['target', 'offset', 'data']],
        receivers: ['WebGLRenderingContextOverloads', 'WebGLRenderingContext', 'WebGL2RenderingContextBase', 'WebGL2RenderingContext']
    },
    {
        name: 'bufferSubData',
        signatures: [['target', 'dstByteOffset', 'srcData', 'srcOffset', '?length']],
        receivers: ['WebGL2RenderingContext']
    },
    {
        name: 'compressedTexImage2D',
        signatures: [['target', 'level', 'internalformat', 'width', 'height', 'border', 'imageSize', 'offset'], ['target', 'level', 'internalformat', 'width', 'height', 'border', 'srcData', '?srcOffset', '?srcLengthOverride']],
        receivers: ['WebGL2RenderingContextOverloads']
    },
    {
        name: 'compressedTexImage2D',
        signatures: [['target', 'level', 'internalformat', 'width', 'height', 'border', 'data']],
        receivers: ['WebGLRenderingContextOverloads', 'WebGLRenderingContext', 'WebGL2RenderingContextBase', 'WebGL2RenderingContext']
    },
    {
        name: 'compressedTexImage2D',
        signatures: [['target', 'level', 'internalformat', 'width', 'height', 'border', 'imageSize', 'offset'], ['target', 'level', 'internalformat', 'width', 'height', 'border', 'data', 'srcOffset', '?srcLengthOverride']],
        receivers: ['WebGL2RenderingContext']
    },
    {
        name: 'compressedTexSubImage2D',
        signatures: [['target', 'level', 'xoffset', 'yoffset', 'width', 'height', 'format', 'imageSize', 'offset'], ['target', 'level', 'xoffset', 'yoffset', 'width', 'height', 'format', 'srcData', '?srcOffset', '?srcLengthOverride']],
        receivers: ['WebGL2RenderingContextOverloads']
    },
    {
        name: 'compressedTexSubImage2D',
        signatures: [['target', 'level', 'xoffset', 'yoffset', 'width', 'height', 'format', 'data']],
        receivers: ['WebGLRenderingContextOverloads', 'WebGLRenderingContext', 'WebGL2RenderingContextBase', 'WebGL2RenderingContext']
    },
    {
        name: 'compressedTexSubImage2D',
        signatures: [['target', 'level', 'xoffset', 'yoffset', 'width', 'height', 'format', 'imageSize', 'offset'], ['target', 'level', 'xoffset', 'yoffset', 'width', 'height', 'format', 'data', 'srcOffset', '?srcLengthOverride']],
        receivers: ['WebGL2RenderingContext']
    },
    {
        name: 'readPixels',
        signatures: [['x', 'y', 'width', 'height', 'format', 'type', 'dstData', '?dstOffset'], ['x', 'y', 'width', 'height', 'format', 'type', 'offset']],
        receivers: ['WebGL2RenderingContextOverloads']
    },
    {
        name: 'readPixels',
        signatures: [['x', 'y', 'width', 'height', 'format', 'type', 'pixels']],
        receivers: ['WebGLRenderingContextOverloads', 'WebGLRenderingContext', 'WebGL2RenderingContextBase', 'WebGL2RenderingContext']
    },
    {
        name: 'readPixels',
        signatures: [['x', 'y', 'width', 'height', 'format', 'type', 'offset'], ['x', 'y', 'width', 'height', 'format', 'type', 'dstData', 'offset']],
        receivers: ['WebGL2RenderingContext']
    },
    {
        name: 'texImage2D',
        signatures: [['target', 'level', 'internalformat', 'format', 'type', 'source'], ['target', 'level', 'internalformat', 'width', 'height', 'border', 'format', 'type', 'pixels'], ['target', 'level', 'internalformat', 'width', 'height', 'border', 'format', 'type', 'pboOffset'], ['target', 'level', 'internalformat', 'width', 'height', 'border', 'format', 'type', 'source'], ['target', 'level', 'internalformat', 'width', 'height', 'border', 'format', 'type', 'srcData', 'srcOffset']],
        receivers: ['WebGL2RenderingContextOverloads']
    },
    {
        name: 'texImage2D',
        signatures: [['target', 'level', 'internalformat', 'format', 'type', 'source'], ['target', 'level', 'internalformat', 'width', 'height', 'border', 'format', 'type', 'pixels']],
        receivers: ['WebGLRenderingContextOverloads']
    },
    {
        name: 'texImage2D',
        signatures: [['target', 'level', 'internalformat', 'format', 'type', 'pixels'], ['target', 'level', 'internalformat', 'format', 'type', 'image'], ['target', 'level', 'internalformat', 'format', 'type', 'canvas'], ['target', 'level', 'internalformat', 'format', 'type', 'offscreenCanvas'], ['target', 'level', 'internalformat', 'format', 'type', 'video'], ['target', 'level', 'internalformat', 'format', 'type', 'bitmap'], ['target', 'level', 'internalformat', 'format', 'type', 'frame'], ['target', 'level', 'internalformat', 'width', 'height', 'border', 'format', 'type', 'pixels']],
        receivers: ['WebGLRenderingContext', 'WebGL2RenderingContextBase', 'WebGL2RenderingContext']
    },
    {
        name: 'texImage2D',
        signatures: [['target', 'level', 'internalformat', 'width', 'height', 'border', 'format', 'type', 'offset'], ['target', 'level', 'internalformat', 'width', 'height', 'border', 'format', 'type', 'data'], ['target', 'level', 'internalformat', 'width', 'height', 'border', 'format', 'type', 'image'], ['target', 'level', 'internalformat', 'width', 'height', 'border', 'format', 'type', 'canvas'], ['target', 'level', 'internalformat', 'width', 'height', 'border', 'format', 'type', 'offscreenCanvas'], ['target', 'level', 'internalformat', 'width', 'height', 'border', 'format', 'type', 'video'], ['target', 'level', 'internalformat', 'width', 'height', 'border', 'format', 'type', 'frame'], ['target', 'level', 'internalformat', 'width', 'height', 'border', 'format', 'type', 'bitmap'], ['target', 'level', 'internalformat', 'width', 'height', 'border', 'format', 'type', 'srcData', 'srcOffset']],
        receivers: ['WebGL2RenderingContext']
    },
    {
        name: 'texSubImage2D',
        signatures: [['target', 'level', 'xoffset', 'yoffset', 'format', 'type', 'source'], ['target', 'level', 'xoffset', 'yoffset', 'width', 'height', 'format', 'type', 'pixels'], ['target', 'level', 'xoffset', 'yoffset', 'width', 'height', 'format', 'type', 'pboOffset'], ['target', 'level', 'xoffset', 'yoffset', 'width', 'height', 'format', 'type', 'source'], ['target', 'level', 'xoffset', 'yoffset', 'width', 'height', 'format', 'type', 'srcData', 'srcOffset']],
        receivers: ['WebGL2RenderingContextOverloads']
    },
    {
        name: 'texSubImage2D',
        signatures: [['target', 'level', 'xoffset', 'yoffset', 'format', 'type', 'source'], ['target', 'level', 'xoffset', 'yoffset', 'width', 'height', 'format', 'type', 'pixels']],
        receivers: ['WebGLRenderingContextOverloads']
    },
    {
        name: 'texSubImage2D',
        signatures: [['target', 'level', 'xoffset', 'yoffset', 'format', 'type', 'pixels'], ['target', 'level', 'xoffset', 'yoffset', 'format', 'type', 'image'], ['target', 'level', 'xoffset', 'yoffset', 'format', 'type', 'canvas'], ['target', 'level', 'xoffset', 'yoffset', 'format', 'type', 'offscreenCanvas'], ['target', 'level', 'xoffset', 'yoffset', 'format', 'type', 'video'], ['target', 'level', 'xoffset', 'yoffset', 'format', 'type', 'bitmap'], ['target', 'level', 'xoffset', 'yoffset', 'format', 'type', 'frame'], ['target', 'level', 'xoffset', 'yoffset', 'width', 'height', 'format', 'type', 'pixels']],
        receivers: ['WebGLRenderingContext', 'WebGL2RenderingContextBase', 'WebGL2RenderingContext']
    },
    {
        name: 'texSubImage2D',
        signatures: [['target', 'level', 'xoffset', 'yoffset', 'width', 'height', 'format', 'type', 'offset'], ['target', 'level', 'xoffset', 'yoffset', 'width', 'height', 'format', 'type', 'data'], ['target', 'level', 'xoffset', 'yoffset', 'width', 'height', 'format', 'type', 'image'], ['target', 'level', 'xoffset', 'yoffset', 'width', 'height', 'format', 'type', 'canvas'], ['target', 'level', 'xoffset', 'yoffset', 'width', 'height', 'format', 'type', 'offscreenCanvas'], ['target', 'level', 'xoffset', 'yoffset', 'width', 'height', 'format', 'type', 'video'], ['target', 'level', 'xoffset', 'yoffset', 'width', 'height', 'format', 'type', 'frame'], ['target', 'level', 'xoffset', 'yoffset', 'width', 'height', 'format', 'type', 'bitmap'], ['target', 'level', 'xoffset', 'yoffset', 'width', 'height', 'format', 'type', 'srcData', 'srcOffset']],
        receivers: ['WebGL2RenderingContext']
    },
    {
        name: 'uniform1fv',
        signatures: [['location', 'data', '?srcOffset', '?srcLength']],
        receivers: ['WebGL2RenderingContextOverloads']
    },
    {
        name: 'uniform1fv',
        signatures: [['location', 'v']],
        receivers: ['WebGLRenderingContextOverloads', 'WebGLRenderingContext', 'WebGL2RenderingContextBase', 'WebGL2RenderingContext']
    },
    {
        name: 'uniform1fv',
        signatures: [['location', 'v', 'srcOffset', '?srcLength']],
        receivers: ['WebGL2RenderingContext']
    },
    {
        name: 'uniform1iv',
        signatures: [['location', 'data', '?srcOffset', '?srcLength']],
        receivers: ['WebGL2RenderingContextOverloads']
    },
    {
        name: 'uniform1iv',
        signatures: [['location', 'v']],
        receivers: ['WebGLRenderingContextOverloads', 'WebGLRenderingContext', 'WebGL2RenderingContextBase', 'WebGL2RenderingContext']
    },
    {
        name: 'uniform1iv',
        signatures: [['location', 'v', 'srcOffset', '?srcLength']],
        receivers: ['WebGL2RenderingContext']
    },
    {
        name: 'uniform2fv',
        signatures: [['location', 'data', '?srcOffset', '?srcLength']],
        receivers: ['WebGL2RenderingContextOverloads']
    },
    {
        name: 'uniform2fv',
        signatures: [['location', 'v']],
        receivers: ['WebGLRenderingContextOverloads', 'WebGLRenderingContext', 'WebGL2RenderingContextBase', 'WebGL2RenderingContext']
    },
    {
        name: 'uniform2fv',
        signatures: [['location', 'v', 'srcOffset', '?srcLength']],
        receivers: ['WebGL2RenderingContext']
    },
    {
        name: 'uniform2iv',
        signatures: [['location', 'data', '?srcOffset', '?srcLength']],
        receivers: ['WebGL2RenderingContextOverloads']
    },
    {
        name: 'uniform2iv',
        signatures: [['location', 'v']],
        receivers: ['WebGLRenderingContextOverloads', 'WebGLRenderingContext', 'WebGL2RenderingContextBase', 'WebGL2RenderingContext']
    },
    {
        name: 'uniform2iv',
        signatures: [['location', 'v', 'srcOffset', '?srcLength']],
        receivers: ['WebGL2RenderingContext']
    },
    {
        name: 'uniform3fv',
        signatures: [['location', 'data', '?srcOffset', '?srcLength']],
        receivers: ['WebGL2RenderingContextOverloads']
    },
    {
        name: 'uniform3fv',
        signatures: [['location', 'v']],
        receivers: ['WebGLRenderingContextOverloads', 'WebGLRenderingContext', 'WebGL2RenderingContextBase', 'WebGL2RenderingContext']
    },
    {
        name: 'uniform3fv',
        signatures: [['location', 'v', 'srcOffset', '?srcLength']],
        receivers: ['WebGL2RenderingContext']
    },
    {
        name: 'uniform3iv',
        signatures: [['location', 'data', '?srcOffset', '?srcLength']],
        receivers: ['WebGL2RenderingContextOverloads']
    },
    {
        name: 'uniform3iv',
        signatures: [['location', 'v']],
        receivers: ['WebGLRenderingContextOverloads', 'WebGLRenderingContext', 'WebGL2RenderingContextBase', 'WebGL2RenderingContext']
    },
    {
        name: 'uniform3iv',
        signatures: [['location', 'v', 'srcOffset', '?srcLength']],
        receivers: ['WebGL2RenderingContext']
    },
    {
        name: 'uniform4fv',
        signatures: [['location', 'data', '?srcOffset', '?srcLength']],
        receivers: ['WebGL2RenderingContextOverloads']
    },
    {
        name: 'uniform4fv',
        signatures: [['location', 'v']],
        receivers: ['WebGLRenderingContextOverloads', 'WebGLRenderingContext', 'WebGL2RenderingContextBase', 'WebGL2RenderingContext']
    },
    {
        name: 'uniform4fv',
        signatures: [['location', 'v', 'srcOffset', '?srcLength']],
        receivers: ['WebGL2RenderingContext']
    },
    {
        name: 'uniform4iv',
        signatures: [['location', 'data', '?srcOffset', '?srcLength']],
        receivers: ['WebGL2RenderingContextOverloads']
    },
    {
        name: 'uniform4iv',
        signatures: [['location', 'v']],
        receivers: ['WebGLRenderingContextOverloads', 'WebGLRenderingContext', 'WebGL2RenderingContextBase', 'WebGL2RenderingContext']
    },
    {
        name: 'uniform4iv',
        signatures: [['location', 'v', 'srcOffset', '?srcLength']],
        receivers: ['WebGL2RenderingContext']
    },
    {
        name: 'uniformMatrix2fv',
        signatures: [['location', 'transpose', 'data', '?srcOffset', '?srcLength']],
        receivers: ['WebGL2RenderingContextOverloads']
    },
    {
        name: 'uniformMatrix2fv',
        signatures: [['location', 'transpose', 'value']],
        receivers: ['WebGLRenderingContextOverloads']
    },
    {
        name: 'uniformMatrix2fv',
        signatures: [['location', 'transpose', 'array']],
        receivers: ['WebGLRenderingContext', 'WebGL2RenderingContextBase', 'WebGL2RenderingContext']
    },
    {
        name: 'uniformMatrix2fv',
        signatures: [['location', 'transpose', 'array', 'srcOffset', '?srcLength']],
        receivers: ['WebGL2RenderingContext']
    },
    {
        name: 'uniformMatrix3fv',
        signatures: [['location', 'transpose', 'data', '?srcOffset', '?srcLength']],
        receivers: ['WebGL2RenderingContextOverloads']
    },
    {
        name: 'uniformMatrix3fv',
        signatures: [['location', 'transpose', 'value']],
        receivers: ['WebGLRenderingContextOverloads']
    },
    {
        name: 'uniformMatrix3fv',
        signatures: [['location', 'transpose', 'array']],
        receivers: ['WebGLRenderingContext', 'WebGL2RenderingContextBase', 'WebGL2RenderingContext']
    },
    {
        name: 'uniformMatrix3fv',
        signatures: [['location', 'transpose', 'array', 'srcOffset', '?srcLength']],
        receivers: ['WebGL2RenderingContext']
    },
    {
        name: 'uniformMatrix4fv',
        signatures: [['location', 'transpose', 'data', '?srcOffset', '?srcLength']],
        receivers: ['WebGL2RenderingContextOverloads']
    },
    {
        name: 'uniformMatrix4fv',
        signatures: [['location', 'transpose', 'value']],
        receivers: ['WebGLRenderingContextOverloads']
    },
    {
        name: 'uniformMatrix4fv',
        signatures: [['location', 'transpose', 'array']],
        receivers: ['WebGLRenderingContext', 'WebGL2RenderingContextBase', 'WebGL2RenderingContext']
    },
    {
        name: 'uniformMatrix4fv',
        signatures: [['location', 'transpose', 'array', 'srcOffset', '?srcLength']],
        receivers: ['WebGL2RenderingContext']
    },
    {
        name: 'activeTexture',
        signatures: [['texture']]
    },
    {
        name: 'attachShader',
        signatures: [['program', 'shader']]
    },
    {
        name: 'bindAttribLocation',
        signatures: [['program', 'index', 'name']]
    },
    {
        name: 'bindBuffer',
        signatures: [['target', 'buffer']]
    },
    {
        name: 'bindFramebuffer',
        signatures: [['target', 'framebuffer']]
    },
    {
        name: 'bindRenderbuffer',
        signatures: [['target', 'renderbuffer']]
    },
    {
        name: 'bindTexture',
        signatures: [['target', 'texture']]
    },
    {
        name: 'blendColor',
        signatures: [['red', 'green', 'blue', 'alpha']]
    },
    {
        name: 'blendEquation',
        signatures: [['mode']]
    },
    {
        name: 'blendEquationSeparate',
        signatures: [['modeRGB', 'modeAlpha']]
    },
    {
        name: 'blendFunc',
        signatures: [['sfactor', 'dfactor']]
    },
    {
        name: 'blendFuncSeparate',
        signatures: [['srcRGB', 'dstRGB', 'srcAlpha', 'dstAlpha']]
    },
    {
        name: 'checkFramebufferStatus',
        signatures: [['target']]
    },
    {
        name: 'clearColor',
        signatures: [['red', 'green', 'blue', 'alpha']]
    },
    {
        name: 'clearDepth',
        signatures: [['depth']]
    },
    {
        name: 'clearStencil',
        signatures: [['s']]
    },
    {
        name: 'colorMask',
        signatures: [['red', 'green', 'blue', 'alpha']]
    },
    {
        name: 'compileShader',
        signatures: [['shader']]
    },
    {
        name: 'copyTexImage2D',
        signatures: [['target', 'level', 'internalformat', 'x', 'y', 'width', 'height', 'border']]
    },
    {
        name: 'copyTexSubImage2D',
        signatures: [['target', 'level', 'xoffset', 'yoffset', 'x', 'y', 'width', 'height']]
    },
    {
        name: 'createShader',
        signatures: [['type']]
    },
    {
        name: 'createTexture',
        signatures: [['descriptor']],
        receivers: ['GPUDevice']
    },
    {
        name: 'cullFace',
        signatures: [['mode']]
    },
    {
        name: 'deleteBuffer',
        signatures: [['buffer']]
    },
    {
        name: 'deleteFramebuffer',
        signatures: [['framebuffer']]
    },
    {
        name: 'deleteProgram',
        signatures: [['program']]
    },
    {
        name: 'deleteRenderbuffer',
        signatures: [['renderbuffer']]
    },
    {
        name: 'deleteShader',
        signatures: [['shader']]
    },
    {
        name: 'deleteTexture',
        signatures: [['texture']]
    },
    {
        name: 'depthFunc',
        signatures: [['func']]
    },
    {
        name: 'depthMask',
        signatures: [['flag']]
    },
    {
        name: 'depthRange',
        signatures: [['zNear', 'zFar']]
    },
    {
        name: 'detachShader',
        signatures: [['program', 'shader']]
    },
    {
        name: 'disable',
        signatures: [['cap']],
        receivers: ['WebGLRenderingContext', 'WebGL2RenderingContextBase', 'WebGL2RenderingContext']
    },
    {
        name: 'disableVertexAttribArray',
        signatures: [['index']]
    },
    {
        name: 'drawArrays',
        signatures: [['mode', 'first', 'count']]
    },
    {
        name: 'drawElements',
        signatures: [['mode', 'count', 'type', 'offset']]
    },
    {
        name: 'enable',
        signatures: [['cap']],
        receivers: ['WebGLRenderingContext', 'WebGL2RenderingContextBase', 'WebGL2RenderingContext']
    },
    {
        name: 'enableVertexAttribArray',
        signatures: [['index']]
    },
    {
        name: 'framebufferRenderbuffer',
        signatures: [['target', 'attachment', 'renderbuffertarget', 'renderbuffer']]
    },
    {
        name: 'framebufferTexture2D',
        signatures: [['target', 'attachment', 'textarget', 'texture', 'level']]
    },
    {
        name: 'frontFace',
        signatures: [['mode']]
    },
    {
        name: 'generateMipmap',
        signatures: [['target']]
    },
    {
        name: 'getActiveAttrib',
        signatures: [['program', 'index']]
    },
    {
        name: 'getActiveUniform',
        signatures: [['program', 'index']]
    },
    {
        name: 'getAttachedShaders',
        signatures: [['program']]
    },
    {
        name: 'getAttribLocation',
        signatures: [['program', 'name']]
    },
    {
        name: 'getBufferParameter',
        signatures: [['target', 'pname']]
    },
    {
        name: 'getExtension',
        signatures: [['extensionName'], ['name']]
    },
    {
        name: 'getFramebufferAttachmentParameter',
        signatures: [['target', 'attachment', 'pname']]
    },
    {
        name: 'getParameter',
        signatures: [['pname']],
        receivers: ['WebGLRenderingContext', 'WebGL2RenderingContextBase', 'WebGL2RenderingContext']
    },
    {
        name: 'getParameter',
        signatures: [['namespaceURI', 'localName']],
        receivers: ['XSLTProcessor']
    },
    {
        name: 'getProgramInfoLog',
        signatures: [['program']]
    },
    {
        name: 'getProgramParameter',
        signatures: [['program', 'pname']]
    },
    {
        name: 'getRenderbufferParameter',
        signatures: [['target', 'pname']]
    },
    {
        name: 'getShaderInfoLog',
        signatures: [['shader']]
    },
    {
        name: 'getShaderParameter',
        signatures: [['shader', 'pname']]
    },
    {
        name: 'getShaderPrecisionFormat',
        signatures: [['shadertype', 'precisiontype']]
    },
    {
        name: 'getShaderSource',
        signatures: [['shader']]
    },
    {
        name: 'getTexParameter',
        signatures: [['target', 'pname']]
    },
    {
        name: 'getUniform',
        signatures: [['program', 'location']]
    },
    {
        name: 'getUniformLocation',
        signatures: [['program', 'name']]
    },
    {
        name: 'getVertexAttrib',
        signatures: [['index', 'pname']]
    },
    {
        name: 'getVertexAttribOffset',
        signatures: [['index', 'pname']]
    },
    {
        name: 'hint',
        signatures: [['target', 'mode']]
    },
    {
        name: 'isBuffer',
        signatures: [['buffer']]
    },
    {
        name: 'isEnabled',
        signatures: [['cap']]
    },
    {
        name: 'isFramebuffer',
        signatures: [['framebuffer']]
    },
    {
        name: 'isProgram',
        signatures: [['program']]
    },
    {
        name: 'isRenderbuffer',
        signatures: [['renderbuffer']]
    },
    {
        name: 'isShader',
        signatures: [['shader']]
    },
    {
        name: 'isTexture',
        signatures: [['texture']]
    },
    {
        name: 'lineWidth',
        signatures: [['width']]
    },
    {
        name: 'linkProgram',
        signatures: [['program']]
    },
    {
        name: 'pixelStorei',
        signatures: [['pname', 'param']]
    },
    {
        name: 'polygonOffset',
        signatures: [['factor', 'units']]
    },
    {
        name: 'renderbufferStorage',
        signatures: [['target', 'internalformat', 'width', 'height']]
    },
    {
        name: 'sampleCoverage',
        signatures: [['value', 'invert']]
    },
    {
        name: 'scissor',
        signatures: [['x', 'y', 'width', 'height']]
    },
    {
        name: 'shaderSource',
        signatures: [['shader', 'source'], ['shader', 'string']]
    },
    {
        name: 'stencilFunc',
        signatures: [['func', 'ref', 'mask']]
    },
    {
        name: 'stencilFuncSeparate',
        signatures: [['face', 'func', 'ref', 'mask']]
    },
    {
        name: 'stencilMask',
        signatures: [['mask']]
    },
    {
        name: 'stencilMaskSeparate',
        signatures: [['face', 'mask']]
    },
    {
        name: 'stencilOp',
        signatures: [['fail', 'zfail', 'zpass']]
    },
    {
        name: 'stencilOpSeparate',
        signatures: [['face', 'fail', 'zfail', 'zpass']]
    },
    {
        name: 'texParameterf',
        signatures: [['target', 'pname', 'param']]
    },
    {
        name: 'texParameteri',
        signatures: [['target', 'pname', 'param']]
    },
    {
        name: 'uniform1f',
        signatures: [['location', 'x']]
    },
    {
        name: 'uniform1i',
        signatures: [['location', 'x']]
    },
    {
        name: 'uniform2f',
        signatures: [['location', 'x', 'y']]
    },
    {
        name: 'uniform2i',
        signatures: [['location', 'x', 'y']]
    },
    {
        name: 'uniform3f',
        signatures: [['location', 'x', 'y', 'z']]
    },
    {
        name: 'uniform3i',
        signatures: [['location', 'x', 'y', 'z']]
    },
    {
        name: 'uniform4f',
        signatures: [['location', 'x', 'y', 'z', 'w']]
    },
    {
        name: 'uniform4i',
        signatures: [['location', 'x', 'y', 'z', 'w']]
    },
    {
        name: 'useProgram',
        signatures: [['program']]
    },
    {
        name: 'validateProgram',
        signatures: [['program']]
    },
    {
        name: 'vertexAttrib1f',
        signatures: [['index', 'x'], ['indx', 'x']]
    },
    {
        name: 'vertexAttrib1fv',
        signatures: [['index', 'values'], ['indx', 'values']]
    },
    {
        name: 'vertexAttrib2f',
        signatures: [['index', 'x', 'y'], ['indx', 'x', 'y']]
    },
    {
        name: 'vertexAttrib2fv',
        signatures: [['index', 'values'], ['indx', 'values']]
    },
    {
        name: 'vertexAttrib3f',
        signatures: [['index', 'x', 'y', 'z'], ['indx', 'x', 'y', 'z']]
    },
    {
        name: 'vertexAttrib3fv',
        signatures: [['index', 'values'], ['indx', 'values']]
    },
    {
        name: 'vertexAttrib4f',
        signatures: [['index', 'x', 'y', 'z', 'w'], ['indx', 'x', 'y', 'z', 'w']]
    },
    {
        name: 'vertexAttrib4fv',
        signatures: [['index', 'values'], ['indx', 'values']]
    },
    {
        name: 'vertexAttribPointer',
        signatures: [['index', 'size', 'type', 'normalized', 'stride', 'offset'], ['indx', 'size', 'type', 'normalized', 'stride', 'offset']]
    },
    {
        name: 'viewport',
        signatures: [['x', 'y', 'width', 'height']]
    },
    {
        name: 'alert',
        signatures: [['?message']]
    },
    {
        name: 'cancelIdleCallback',
        signatures: [['handle']]
    },
    {
        name: 'confirm',
        signatures: [['?message']]
    },
    {
        name: 'getComputedStyle',
        signatures: [['elt', '?pseudoElt']]
    },
    {
        name: 'matchMedia',
        signatures: [['query']]
    },
    {
        name: 'moveBy',
        signatures: [['x', 'y']]
    },
    {
        name: 'requestIdleCallback',
        signatures: [['callback', '?options']]
    },
    {
        name: 'resizeBy',
        signatures: [['x', 'y']]
    },
    {
        name: 'resizeTo',
        signatures: [['width', 'height'], ['x', 'y']]
    },
    {
        name: 'atob',
        signatures: [['data']]
    },
    {
        name: 'btoa',
        signatures: [['data']]
    },
    {
        name: 'clearInterval',
        signatures: [['?id']]
    },
    {
        name: 'clearTimeout',
        signatures: [['?id']],
        receivers: ['Window', 'WorkerGlobalScope']
    },
    {
        name: 'clearTimeout',
        signatures: [['?id'], ['handle']],
        receivers: ['Window']
    },
    {
        name: 'createImageBitmap',
        signatures: [['image', '?options'], ['image', 'sx', 'sy', 'sw', 'sh', '?options']],
        receivers: ['Window', 'WorkerGlobalScope']
    },
    {
        name: 'createImageBitmap',
        signatures: [['image', '?options'], ['imageBitmap', '?options'], ['image', 'sx', 'sy', 'sw', 'sh', '?options'], ['imageBitmap', 'sx', 'sy', 'sw', 'sh', '?options']],
        receivers: ['Window']
    },
    {
        name: 'createImageBitmap',
        signatures: [['imageBitmap', '?options'], ['imageBitmap', 'sx', 'sy', 'sw', 'sh', '?options']],
        receivers: ['WorkerGlobalScope']
    },
    {
        name: 'fetch',
        signatures: [['input', '?init']],
        receivers: ['Window', 'WorkerGlobalScope']
    },
    {
        name: 'fetch',
        signatures: [['id', 'requests', '?options']],
        receivers: ['BackgroundFetchManager']
    },
    {
        name: 'queueMicrotask',
        signatures: [['callback']]
    },
    {
        name: 'reportError',
        signatures: [['e']]
    },
    {
        name: 'setInterval',
        signatures: [['handler', '?timeout', '...arguments']]
    },
    {
        name: 'setTimeout',
        signatures: [['handler', '?timeout', '...arguments']]
    },
    {
        name: 'addModule',
        signatures: [['moduleURL', '?options']],
        receivers: ['Worklet']
    },
    {
        name: 'addModule',
        signatures: [['moduleURL']],
        receivers: ['SharedStorageWorklet']
    },
    {
        name: 'getResponseHeader',
        signatures: [['name']]
    },
    {
        name: 'overrideMimeType',
        signatures: [['mime']]
    },
    {
        name: 'setRequestHeader',
        signatures: [['name', 'value']]
    },
    {
        name: 'serializeToString',
        signatures: [['root']]
    },
    {
        name: 'createExpression',
        signatures: [['expression', '?resolver']]
    },
    {
        name: 'createNSResolver',
        signatures: [['nodeResolver']]
    },
    {
        name: 'evaluate',
        signatures: [['expression', 'contextNode', '?resolver', '?type', '?result']],
        receivers: ['XPathEvaluatorBase']
    },
    {
        name: 'evaluate',
        signatures: [['contextNode', '?type', '?result'], ['contextNode', '?type', '?inResult']],
        receivers: ['XPathExpression']
    },
    {
        name: 'evaluate',
        signatures: [['expression', 'contextNode', '?resolver', '?type', '?inResult']],
        receivers: ['Document', 'XPathEvaluator']
    },
    {
        name: 'snapshotItem',
        signatures: [['index']]
    },
    {
        name: 'importStylesheet',
        signatures: [['style']]
    },
    {
        name: 'removeParameter',
        signatures: [['namespaceURI', 'localName']]
    },
    {
        name: 'setParameter',
        signatures: [['namespaceURI', 'localName', 'value']]
    },
    {
        name: 'transformToDocument',
        signatures: [['source']]
    },
    {
        name: 'transformToFragment',
        signatures: [['source', 'output']]
    },
    {
        name: 'assert',
        signatures: [['?condition', '...data']]
    },
    {
        name: 'countReset',
        signatures: [['?label']]
    },
    {
        name: 'debug',
        signatures: [['...data']]
    },
    {
        name: 'dir',
        signatures: [['?item', '?options']]
    },
    {
        name: 'dirxml',
        signatures: [['...data']]
    },
    {
        name: 'group',
        signatures: [['...data']]
    },
    {
        name: 'groupCollapsed',
        signatures: [['...data']]
    },
    {
        name: 'info',
        signatures: [['...data']]
    },
    {
        name: 'table',
        signatures: [['?tabularData', '?properties']]
    },
    {
        name: 'time',
        signatures: [['?label']]
    },
    {
        name: 'timeEnd',
        signatures: [['?label']]
    },
    {
        name: 'timeLog',
        signatures: [['?label', '...data']]
    },
    {
        name: 'timeStamp',
        signatures: [['?label']]
    },
    {
        name: 'trace',
        signatures: [['...data']]
    },
    {
        name: 'warn',
        signatures: [['...data']]
    },
    {
        name: 'importScripts',
        signatures: [['...urls']]
    },
    {
        name: 'Write',
        signatures: [['s']]
    },
    {
        name: 'WriteLine',
        signatures: [['s']]
    },
    {
        name: 'WriteBlankLines',
        signatures: [['intLines']]
    },
    {
        name: 'Read',
        signatures: [['characters']]
    },
    {
        name: 'Skip',
        signatures: [['characters']]
    },
    {
        name: 'lbound',
        signatures: [['?dimension']]
    },
    {
        name: 'ubound',
        signatures: [['?dimension']]
    },
    {
        name: 'next',
        signatures: [['...args']],
        receivers: ['Generator', 'AsyncIterator', 'AsyncGenerator']
    },
    {
        name: 'next',
        signatures: [['...args'], ['?value']],
        receivers: ['Iterator']
    },
    {
        name: 'return',
        signatures: [['value']],
        receivers: ['Generator', 'AsyncGenerator']
    },
    {
        name: 'return',
        signatures: [['?value']],
        receivers: ['Iterator', 'AsyncIterator']
    },
    {
        name: 'throw',
        signatures: [['e']],
        receivers: ['Generator', 'AsyncGenerator']
    },
    {
        name: 'throw',
        signatures: [['?e']],
        receivers: ['Iterator', 'AsyncIterator']
    },
    {
        name: 'entries',
        signatures: [['o']],
        receivers: ['ObjectConstructor']
    },
    {
        name: 'values',
        signatures: [['o']],
        receivers: ['ObjectConstructor']
    },
    {
        name: 'all',
        signatures: [['values']]
    },
    {
        name: 'race',
        signatures: [['values']]
    },
    {
        name: 'reject',
        signatures: [['?reason']]
    },
    {
        name: 'construct',
        signatures: [['target', 'argArray', 'newTarget']]
    },
    {
        name: 'deleteProperty',
        signatures: [['target', 'p']]
    },
    {
        name: 'ownKeys',
        signatures: [['target']]
    },
    {
        name: 'setPrototypeOf',
        signatures: [['target', 'v']],
        receivers: ['ProxyHandler']
    },
    {
        name: 'setPrototypeOf',
        signatures: [['o', 'proto']],
        receivers: ['ObjectConstructor']
    },
    {
        name: 'revocable',
        signatures: [['target', 'handler']]
    },
    {
        name: 'for',
        signatures: [['key']]
    },
    {
        name: 'keyFor',
        signatures: [['sym']]
    },
    {
        name: 'getOwnPropertyDescriptors',
        signatures: [['o']]
    },
    {
        name: 'and',
        signatures: [['typedArray', 'index', 'value']]
    },
    {
        name: 'compareExchange',
        signatures: [['typedArray', 'index', 'expectedValue', 'replacementValue']]
    },
    {
        name: 'exchange',
        signatures: [['typedArray', 'index', 'value']]
    },
    {
        name: 'isLockFree',
        signatures: [['size']]
    },
    {
        name: 'or',
        signatures: [['typedArray', 'index', 'value']]
    },
    {
        name: 'sub',
        signatures: [['typedArray', 'index', 'value']],
        receivers: ['Atomics']
    },
    {
        name: 'sub',
        signatures: [['...values']],
        receivers: ['CSSNumericValue']
    },
    {
        name: 'wait',
        signatures: [['typedArray', 'index', 'value', '?timeout']]
    },
    {
        name: 'notify',
        signatures: [['typedArray', 'index', '?count']]
    },
    {
        name: 'xor',
        signatures: [['typedArray', 'index', 'value']]
    },
    {
        name: 'padStart',
        signatures: [['maxLength', '?fillString']]
    },
    {
        name: 'padEnd',
        signatures: [['maxLength', '?fillString']]
    },
    {
        name: 'finally',
        signatures: [['?onfinally']]
    },
    {
        name: 'fromEntries',
        signatures: [['entries']]
    },
    {
        name: 'allSettled',
        signatures: [['values']]
    },
    {
        name: 'any',
        signatures: [['values']]
    },
    {
        name: 'replaceAll',
        signatures: [['searchValue', 'replaceValue'], ['searchValue', 'replacer']]
    },
    {
        name: 'hasOwn',
        signatures: [['o', 'v']]
    },
    {
        name: 'at',
        signatures: [['index']]
    },
    {
        name: 'clz32',
        signatures: [['x']]
    },
    {
        name: 'imul',
        signatures: [['x', 'y']]
    },
    {
        name: 'log10',
        signatures: [['x']]
    },
    {
        name: 'log2',
        signatures: [['x']]
    },
    {
        name: 'log1p',
        signatures: [['x']]
    },
    {
        name: 'expm1',
        signatures: [['x']]
    },
    {
        name: 'cosh',
        signatures: [['x']]
    },
    {
        name: 'sinh',
        signatures: [['x']]
    },
    {
        name: 'tanh',
        signatures: [['x']]
    },
    {
        name: 'acosh',
        signatures: [['x']]
    },
    {
        name: 'asinh',
        signatures: [['x']]
    },
    {
        name: 'atanh',
        signatures: [['x']]
    },
    {
        name: 'hypot',
        signatures: [['...values']]
    },
    {
        name: 'trunc',
        signatures: [['x']]
    },
    {
        name: 'fround',
        signatures: [['x']]
    },
    {
        name: 'cbrt',
        signatures: [['x']]
    },
    {
        name: 'isInteger',
        signatures: [['number']]
    },
    {
        name: 'isSafeInteger',
        signatures: [['number']]
    },
    {
        name: 'getOwnPropertySymbols',
        signatures: [['o']]
    },
    {
        name: 'is',
        signatures: [['value1', 'value2']]
    },
    {
        name: 'codePointAt',
        signatures: [['pos']]
    },
    {
        name: 'endsWith',
        signatures: [['searchString', '?endPosition']]
    },
    {
        name: 'repeat',
        signatures: [['count']]
    },
    {
        name: 'startsWith',
        signatures: [['searchString', '?position']]
    },
    {
        name: 'anchor',
        signatures: [['name']]
    },
    {
        name: 'fontcolor',
        signatures: [['color']]
    },
    {
        name: 'fontsize',
        signatures: [['size']]
    },
    {
        name: 'link',
        signatures: [['url']]
    },
    {
        name: 'fromCodePoint',
        signatures: [['...codePoints']]
    },
    {
        name: 'raw',
        signatures: [['template', '...substitutions']]
    },
    {
        name: 'flatMap',
        signatures: [['callback', '?thisArg']]
    },
    {
        name: 'flat',
        signatures: [['?depth']]
    },
    {
        name: 'asIntN',
        signatures: [['bits', 'int']]
    },
    {
        name: 'asUintN',
        signatures: [['bits', 'int']]
    },
    {
        name: 'getBigInt64',
        signatures: [['byteOffset', '?littleEndian']]
    },
    {
        name: 'getBigUint64',
        signatures: [['byteOffset', '?littleEndian']]
    },
    {
        name: 'setBigInt64',
        signatures: [['byteOffset', 'value', '?littleEndian']]
    },
    {
        name: 'setBigUint64',
        signatures: [['byteOffset', 'value', '?littleEndian']]
    },
    {
        name: 'openWindow',
        signatures: [['url']]
    },
    {
        name: 'waitUntil',
        signatures: [['f']]
    },
    {
        name: 'respondWith',
        signatures: [['r']],
        receivers: ['FetchEvent']
    },
    {
        name: 'respondWith',
        signatures: [['paymentAbortedResponse']],
        receivers: ['AbortPaymentEvent']
    },
    {
        name: 'respondWith',
        signatures: [['canMakePaymentResponse']],
        receivers: ['CanMakePaymentEvent']
    },
    {
        name: 'respondWith',
        signatures: [['response']],
        receivers: ['PaymentRequestEvent']
    },
    {
        name: 'navigate',
        signatures: [['url']],
        receivers: ['WindowClient']
    },
    {
        name: 'navigate',
        signatures: [['url', '?options']],
        receivers: ['Navigation']
    },
    {
        name: 'Animation',
        signatures: [['?effect', '?timeline']]
    },
    {
        name: 'DocumentTimeline',
        signatures: [['?options']]
    },
    {
        name: 'KeyframeEffect',
        signatures: [['source'], ['target', 'keyframes', '?options']]
    },
    {
        name: 'ScrollTimeline',
        signatures: [['?options']]
    },
    {
        name: 'ViewTimeline',
        signatures: [['?options']]
    },
    {
        name: 'AccessibleNodeList',
        signatures: [['?nodes']]
    },
    {
        name: '',
        signatures: [['index', 'node']],
        receivers: ['AccessibleNodeList']
    },
    {
        name: '',
        signatures: [['index']],
        receivers: ['DataTransferItemList', 'CSSKeyframesRule', 'CSSNumericArray', 'HTMLFormControlsCollection', 'RadioNodeList', 'HTMLAllCollection', 'AudioTrackList', 'TextTrackCueList', 'TextTrackList', 'VideoTrackList', 'SourceBufferList', 'TrackDefaultList', 'ImageTrackList', 'XRInputSourceArray']
    },
    {
        name: '',
        signatures: [['name'], ['property', '?propertyValue']],
        receivers: ['CSSStyleDeclaration']
    },
    {
        name: '',
        signatures: [['index', '?val']],
        receivers: ['CSSTransformValue', 'CSSUnparsedValue']
    },
    {
        name: '',
        signatures: [['name']],
        receivers: ['StyleSheetList', 'RTCStatsResponse']
    },
    {
        name: '',
        signatures: [['name', '?value']],
        receivers: ['DOMStringMap', 'HTMLEmbedElement', 'HTMLObjectElement']
    },
    {
        name: '',
        signatures: [['index'], ['name']],
        receivers: ['Window', 'HTMLFormElement']
    },
    {
        name: '',
        signatures: [['index', '?option'], ['name']],
        receivers: ['HTMLOptionsCollection']
    },
    {
        name: '',
        signatures: [['index', 'option']],
        receivers: ['HTMLSelectElement']
    },
    {
        name: '',
        signatures: [['index', 'newItem']],
        receivers: ['SVGLengthList', 'SVGNumberList', 'SVGPointList', 'SVGStringList', 'SVGTransformList']
    },
    {
        name: 'CSSStyleSheet',
        signatures: [['?options']]
    },
    {
        name: 'replaceSync',
        signatures: [['text']]
    },
    {
        name: 'CSSHSL',
        signatures: [['h', 's', 'l', '?alpha']]
    },
    {
        name: 'CSSHWB',
        signatures: [['h', 'w', 'b', '?alpha']]
    },
    {
        name: 'CSSKeywordValue',
        signatures: [['keyword']]
    },
    {
        name: 'CSSMathClamp',
        signatures: [['lower', 'value', 'upper']]
    },
    {
        name: 'CSSMathInvert',
        signatures: [['arg']]
    },
    {
        name: 'CSSMathMax',
        signatures: [['...args']]
    },
    {
        name: 'CSSMathMin',
        signatures: [['...args']]
    },
    {
        name: 'CSSMathNegate',
        signatures: [['arg']]
    },
    {
        name: 'CSSMathProduct',
        signatures: [['...args']]
    },
    {
        name: 'CSSMathSum',
        signatures: [['...args']]
    },
    {
        name: 'CSSMatrixComponent',
        signatures: [['matrix', '?options']]
    },
    {
        name: 'mul',
        signatures: [['...values']]
    },
    {
        name: 'div',
        signatures: [['...values']]
    },
    {
        name: 'equals',
        signatures: [['...values']]
    },
    {
        name: 'to',
        signatures: [['unit']]
    },
    {
        name: 'toSum',
        signatures: [['...units']]
    },
    {
        name: 'CSSPerspective',
        signatures: [['length']]
    },
    {
        name: 'CSSPositionValue',
        signatures: [['x', 'y']]
    },
    {
        name: 'CSSRGB',
        signatures: [['r', 'g', 'b', '?alpha']]
    },
    {
        name: 'CSSRotate',
        signatures: [['angleValue'], ['x', 'y', 'z', 'angle']]
    },
    {
        name: 'CSSScale',
        signatures: [['x', 'y', '?z']]
    },
    {
        name: 'CSSSkewX',
        signatures: [['ax']]
    },
    {
        name: 'CSSSkewY',
        signatures: [['ay']]
    },
    {
        name: 'CSSSkew',
        signatures: [['ax', 'ay']]
    },
    {
        name: 'parseAll',
        signatures: [['property', 'cssText']]
    },
    {
        name: 'CSSTransformValue',
        signatures: [['transforms']]
    },
    {
        name: 'CSSTranslate',
        signatures: [['x', 'y', '?z']]
    },
    {
        name: 'CSSUnitValue',
        signatures: [['value', 'unit']]
    },
    {
        name: 'number',
        signatures: [['value']]
    },
    {
        name: 'percent',
        signatures: [['value']]
    },
    {
        name: 'em',
        signatures: [['value']]
    },
    {
        name: 'ex',
        signatures: [['value']]
    },
    {
        name: 'ch',
        signatures: [['value']]
    },
    {
        name: 'rem',
        signatures: [['value']]
    },
    {
        name: 'vw',
        signatures: [['value']]
    },
    {
        name: 'vh',
        signatures: [['value']]
    },
    {
        name: 'vi',
        signatures: [['value']]
    },
    {
        name: 'vb',
        signatures: [['value']]
    },
    {
        name: 'vmin',
        signatures: [['value']]
    },
    {
        name: 'vmax',
        signatures: [['value']]
    },
    {
        name: 'svw',
        signatures: [['value']]
    },
    {
        name: 'svh',
        signatures: [['value']]
    },
    {
        name: 'svi',
        signatures: [['value']]
    },
    {
        name: 'svb',
        signatures: [['value']]
    },
    {
        name: 'svmin',
        signatures: [['value']]
    },
    {
        name: 'svmax',
        signatures: [['value']]
    },
    {
        name: 'lvw',
        signatures: [['value']]
    },
    {
        name: 'lvh',
        signatures: [['value']]
    },
    {
        name: 'lvi',
        signatures: [['value']]
    },
    {
        name: 'lvb',
        signatures: [['value']]
    },
    {
        name: 'lvmin',
        signatures: [['value']]
    },
    {
        name: 'lvmax',
        signatures: [['value']]
    },
    {
        name: 'dvw',
        signatures: [['value']]
    },
    {
        name: 'dvh',
        signatures: [['value']]
    },
    {
        name: 'dvi',
        signatures: [['value']]
    },
    {
        name: 'dvb',
        signatures: [['value']]
    },
    {
        name: 'dvmin',
        signatures: [['value']]
    },
    {
        name: 'dvmax',
        signatures: [['value']]
    },
    {
        name: 'cqw',
        signatures: [['value']]
    },
    {
        name: 'cqh',
        signatures: [['value']]
    },
    {
        name: 'cqi',
        signatures: [['value']]
    },
    {
        name: 'cqb',
        signatures: [['value']]
    },
    {
        name: 'cqmin',
        signatures: [['value']]
    },
    {
        name: 'cqmax',
        signatures: [['value']]
    },
    {
        name: 'cm',
        signatures: [['value']]
    },
    {
        name: 'mm',
        signatures: [['value']]
    },
    {
        name: 'in',
        signatures: [['value']]
    },
    {
        name: 'pt',
        signatures: [['value']]
    },
    {
        name: 'pc',
        signatures: [['value']]
    },
    {
        name: 'px',
        signatures: [['value']]
    },
    {
        name: 'Q',
        signatures: [['value']]
    },
    {
        name: 'deg',
        signatures: [['value']]
    },
    {
        name: 'grad',
        signatures: [['value']]
    },
    {
        name: 'rad',
        signatures: [['value']]
    },
    {
        name: 'turn',
        signatures: [['value']]
    },
    {
        name: 's',
        signatures: [['value']]
    },
    {
        name: 'ms',
        signatures: [['value']]
    },
    {
        name: 'Hz',
        signatures: [['value']]
    },
    {
        name: 'kHz',
        signatures: [['value']]
    },
    {
        name: 'dpi',
        signatures: [['value']]
    },
    {
        name: 'dpcm',
        signatures: [['value']]
    },
    {
        name: 'dppx',
        signatures: [['value']]
    },
    {
        name: 'fr',
        signatures: [['value']]
    },
    {
        name: 'CSSUnparsedValue',
        signatures: [['members']]
    },
    {
        name: 'CSSVariableReferenceValue',
        signatures: [['variable', '?fallback']]
    },
    {
        name: 'FontFaceSetLoadEvent',
        signatures: [['type', '?eventInitDict']]
    },
    {
        name: 'FontFace',
        signatures: [['family', 'source', '?descriptors']]
    },
    {
        name: 'MediaQueryListEvent',
        signatures: [['type', '?eventInitDict']]
    },
    {
        name: 'registerProperty',
        signatures: [['definition']]
    },
    {
        name: 'timeout',
        signatures: [['milliseconds']]
    },
    {
        name: 'Comment',
        signatures: [['?data']]
    },
    {
        name: 'hasTrustToken',
        signatures: [['issuer']]
    },
    {
        name: 'DOMException',
        signatures: [['?message', '?name']]
    },
    {
        name: 'getInnerHTML',
        signatures: [['?options']]
    },
    {
        name: 'isVisible',
        signatures: [['?options']]
    },
    {
        name: 'scrollIntoViewIfNeeded',
        signatures: [['?centerIfNeeded']]
    },
    {
        name: 'CustomEvent',
        signatures: [['type', '?eventInitDict']]
    },
    {
        name: 'MutationObserver',
        signatures: [['callback']]
    },
    {
        name: 'setApplyScroll',
        signatures: [['scrollStateCallback', 'nativeScrollBehavior']]
    },
    {
        name: 'setDistributeScroll',
        signatures: [['scrollStateCallback', 'nativeScrollBehavior']]
    },
    {
        name: 'expand',
        signatures: [['?unit']]
    },
    {
        name: 'StaticRange',
        signatures: [['init']]
    },
    {
        name: 'Text',
        signatures: [['?data']]
    },
    {
        name: 'CharacterBoundsUpdateEvent',
        signatures: [['type', '?options']]
    },
    {
        name: 'EditContext',
        signatures: [['?options']]
    },
    {
        name: 'updateSelection',
        signatures: [['start', 'end']]
    },
    {
        name: 'updateControlBounds',
        signatures: [['controlBounds']]
    },
    {
        name: 'updateSelectionBounds',
        signatures: [['selectionBounds']]
    },
    {
        name: 'updateCharacterBounds',
        signatures: [['rangeStart', 'characterBounds']]
    },
    {
        name: 'updateText',
        signatures: [['start', 'end', 'newText']]
    },
    {
        name: 'TextFormatUpdateEvent',
        signatures: [['type', '?options']]
    },
    {
        name: 'TextFormat',
        signatures: [['?options']]
    },
    {
        name: 'TextUpdateEvent',
        signatures: [['type', '?options']]
    },
    {
        name: 'modify',
        signatures: [['?alter', '?direction', '?granularity']]
    },
    {
        name: 'AnimationEvent',
        signatures: [['type', '?eventInitDict']]
    },
    {
        name: 'AnimationPlaybackEvent',
        signatures: [['type', '?eventInitDict']]
    },
    {
        name: 'ClipboardEvent',
        signatures: [['type', '?eventInitDict']]
    },
    {
        name: 'CompositionEvent',
        signatures: [['type', '?eventInitDict']]
    },
    {
        name: 'DragEvent',
        signatures: [['type', '?eventInitDict']]
    },
    {
        name: 'ErrorEvent',
        signatures: [['type', '?eventInitDict']]
    },
    {
        name: 'FocusEvent',
        signatures: [['type', '?eventInitDict']]
    },
    {
        name: 'HashChangeEvent',
        signatures: [['type', '?eventInitDict']]
    },
    {
        name: 'InputEvent',
        signatures: [['type', '?eventInitDict']]
    },
    {
        name: 'KeyboardEvent',
        signatures: [['type', '?eventInitDict']]
    },
    {
        name: 'MessageEvent',
        signatures: [['type', '?eventInitDict']]
    },
    {
        name: 'MouseEvent',
        signatures: [['type', '?eventInitDict']]
    },
    {
        name: 'OverscrollEvent',
        signatures: [['type', 'bubbles', '?eventInitDict']]
    },
    {
        name: 'PageTransitionEvent',
        signatures: [['type', '?eventInitDict']]
    },
    {
        name: 'PointerEvent',
        signatures: [['type', '?eventInitDict']]
    },
    {
        name: 'PopStateEvent',
        signatures: [['type', '?eventInitDict']]
    },
    {
        name: 'ProgressEvent',
        signatures: [['type', '?eventInitDict']]
    },
    {
        name: 'PromiseRejectionEvent',
        signatures: [['type', 'eventInitDict']]
    },
    {
        name: 'SecurityPolicyViolationEvent',
        signatures: [['type', '?eventInitDict']]
    },
    {
        name: 'initTextEvent',
        signatures: [['?type', '?bubbles', '?cancelable', '?view', '?data']]
    },
    {
        name: 'TouchEvent',
        signatures: [['type', '?eventInitDict']]
    },
    {
        name: 'TransitionEvent',
        signatures: [['type', '?eventInitDict']]
    },
    {
        name: 'UIEvent',
        signatures: [['type', '?eventInitDict']]
    },
    {
        name: 'WheelEvent',
        signatures: [['type', '?eventInitDict']]
    },
    {
        name: 'Headers',
        signatures: [['?init']]
    },
    {
        name: 'Request',
        signatures: [['input', '?init']]
    },
    {
        name: 'Response',
        signatures: [['?body', '?init']]
    },
    {
        name: 'redirect',
        signatures: [['url', '?status']]
    },
    {
        name: 'Blob',
        signatures: [['?blobParts', '?options']]
    },
    {
        name: 'File',
        signatures: [['fileBits', 'fileName', '?options']]
    },
    {
        name: 'createObjectURL',
        signatures: [['blob'], ['source']]
    },
    {
        name: 'revokeObjectURL',
        signatures: [['url']]
    },
    {
        name: 'createSelectorDirective',
        signatures: [['arg']]
    },
    {
        name: 'TextDirective',
        signatures: [['?options']]
    },
    {
        name: 'getHighEntropyValues',
        signatures: [['hints']]
    },
    {
        name: 'PendingBeacon',
        signatures: [['url', '?options']]
    },
    {
        name: 'ReportingObserver',
        signatures: [['callback', '?options']]
    },
    {
        name: 'isInputPending',
        signatures: [['?options']]
    },
    {
        name: 'getComputedAccessibleNode',
        signatures: [['element']]
    },
    {
        name: 'webkitRequestAnimationFrame',
        signatures: [['callback']]
    },
    {
        name: 'webkitCancelAnimationFrame',
        signatures: [['id']]
    },
    {
        name: 'webkitRequestFullScreen',
        signatures: [['?options']]
    },
    {
        name: 'webkitRequestFullscreen',
        signatures: [['?options']]
    },
    {
        name: 'DOMMatrixReadOnly',
        signatures: [['?init']]
    },
    {
        name: 'fromMatrix',
        signatures: [['?other']]
    },
    {
        name: 'fromFloat32Array',
        signatures: [['array32']]
    },
    {
        name: 'fromFloat64Array',
        signatures: [['array64']]
    },
    {
        name: 'DOMMatrix',
        signatures: [['?init']]
    },
    {
        name: 'DOMPointReadOnly',
        signatures: [['?x', '?y', '?z', '?w']]
    },
    {
        name: 'fromPoint',
        signatures: [['?other']]
    },
    {
        name: 'DOMPoint',
        signatures: [['?x', '?y', '?z', '?w']]
    },
    {
        name: 'DOMQuad',
        signatures: [['?p1', '?p2', '?p3', '?p4']]
    },
    {
        name: 'fromRect',
        signatures: [['?other']]
    },
    {
        name: 'fromQuad',
        signatures: [['?other']]
    },
    {
        name: 'DOMRectReadOnly',
        signatures: [['?x', '?y', '?width', '?height']]
    },
    {
        name: 'DOMRect',
        signatures: [['?x', '?y', '?width', '?height']]
    },
    {
        name: 'Highlight',
        signatures: [['...initRanges']]
    },
    {
        name: 'convertToBlob',
        signatures: [['?options']]
    },
    {
        name: 'ImageData',
        signatures: [['sw', 'sh', '?settings'], ['data', 'sw', '?sh', '?settings']]
    },
    {
        name: 'CloseWatcher',
        signatures: [['?options']]
    },
    {
        name: 'reportEvent',
        signatures: [['event']]
    },
    {
        name: 'FormDataEvent',
        signatures: [['type', 'eventInitDict']]
    },
    {
        name: 'FormData',
        signatures: [['?form']]
    },
    {
        name: 'Option',
        signatures: [['?data', '?value', '?defaultSelected', '?selected']]
    },
    {
        name: 'SubmitEvent',
        signatures: [['type', '?eventInitDict']]
    },
    {
        name: 'Image',
        signatures: [['?width', '?height']]
    },
    {
        name: 'Audio',
        signatures: [['?src']]
    },
    {
        name: 'activate',
        signatures: [['?options']]
    },
    {
        name: 'PortalActivateEvent',
        signatures: [['type', '?eventInitDict']]
    },
    {
        name: 'TrackEvent',
        signatures: [['type', '?eventInitDict']]
    },
    {
        name: 'VTTCue',
        signatures: [['startTime', 'endTime', 'text']]
    },
    {
        name: 'InputDeviceCapabilities',
        signatures: [['?deviceInitDict']]
    },
    {
        name: 'Touch',
        signatures: [['initDict']]
    },
    {
        name: 'copyText',
        signatures: [['text']]
    },
    {
        name: 'showContextMenuAtPoint',
        signatures: [['x', 'y', 'items', '?document']]
    },
    {
        name: 'sendMessageToEmbedder',
        signatures: [['message']]
    },
    {
        name: 'IntersectionObserver',
        signatures: [['callback', '?options']]
    },
    {
        name: 'layoutNextFragment',
        signatures: [['?options']]
    },
    {
        name: 'registerLayout',
        signatures: [['name', 'layoutCtor']]
    },
    {
        name: 'watch',
        signatures: [['signals', 'callback']]
    },
    {
        name: 'writeMessage',
        signatures: [['buffer', 'handles']]
    },
    {
        name: 'readMessage',
        signatures: [['?flags']]
    },
    {
        name: 'writeData',
        signatures: [['buffer', '?options']]
    },
    {
        name: 'discardData',
        signatures: [['numBytes', '?options']]
    },
    {
        name: 'readData',
        signatures: [['buffer', '?options']]
    },
    {
        name: 'mapBuffer',
        signatures: [['offset', 'numBytes']]
    },
    {
        name: 'duplicateBufferHandle',
        signatures: [['?options']]
    },
    {
        name: 'createDataPipe',
        signatures: [['options']]
    },
    {
        name: 'createSharedBuffer',
        signatures: [['numBytes']]
    },
    {
        name: 'bindInterface',
        signatures: [['interfaceName', 'request_handle', '?scope']]
    },
    {
        name: 'MojoInterfaceInterceptor',
        signatures: [['interfaceName', '?scope']]
    },
    {
        name: 'MojoInterfaceRequestEvent',
        signatures: [['type', '?eventInitDict']]
    },
    {
        name: 'NavigateEvent',
        signatures: [['type', 'eventInit']]
    },
    {
        name: 'transitionWhile',
        signatures: [['newNavigationAction', '?options']]
    },
    {
        name: 'NavigationCurrentEntryChangeEvent',
        signatures: [['type', 'eventInit']]
    },
    {
        name: 'updateCurrentEntry',
        signatures: [['options']]
    },
    {
        name: 'traverseTo',
        signatures: [['key', '?options']]
    },
    {
        name: 'OffscreenCanvas',
        signatures: [['width', 'height']]
    },
    {
        name: 'setValueAndClosePopup',
        signatures: [['numberValue', 'stringValue']]
    },
    {
        name: 'setValue',
        signatures: [['value']]
    },
    {
        name: 'localizeNumberString',
        signatures: [['numberString']]
    },
    {
        name: 'formatMonth',
        signatures: [['year', 'zeroBaseMonth']]
    },
    {
        name: 'formatShortMonth',
        signatures: [['year', 'zeroBaseMonth']]
    },
    {
        name: 'formatWeek',
        signatures: [['year', 'weekNumber', 'localizedStartDate']]
    },
    {
        name: 'setWindowRect',
        signatures: [['x', 'y', 'width', 'height']]
    },
    {
        name: 'ScrollState',
        signatures: [['?scrollStateInit']]
    },
    {
        name: 'consumeDelta',
        signatures: [['x', 'y']]
    },
    {
        name: 'allowsFeature',
        signatures: [['feature', '?origin']]
    },
    {
        name: 'getAllowlistForFeature',
        signatures: [['feature']]
    },
    {
        name: 'ResizeObserver',
        signatures: [['callback']]
    },
    {
        name: 'ByteLengthQueuingStrategy',
        signatures: [['init']]
    },
    {
        name: 'CountQueuingStrategy',
        signatures: [['init']]
    },
    {
        name: 'ReadableStreamBYOBReader',
        signatures: [['stream']]
    },
    {
        name: 'respond',
        signatures: [['bytesWritten']]
    },
    {
        name: 'respondWithNewView',
        signatures: [['view']]
    },
    {
        name: 'ReadableStreamDefaultReader',
        signatures: [['stream']]
    },
    {
        name: 'ReadableStream',
        signatures: [['?underlyingSource', '?strategy']]
    },
    {
        name: 'TransformStream',
        signatures: [['?transformer', '?writableStrategy', '?readableStrategy']]
    },
    {
        name: 'WritableStream',
        signatures: [['?underlyingSink', '?strategy']]
    },
    {
        name: 'PerformanceMark',
        signatures: [['markName', '?markOptions']]
    },
    {
        name: 'PerformanceObserver',
        signatures: [['callback']]
    },
    {
        name: 'Profiler',
        signatures: [['options']]
    },
    {
        name: 'createPolicy',
        signatures: [['policyName', '?policyOptions']]
    },
    {
        name: 'isHTML',
        signatures: [['checkedObject']]
    },
    {
        name: 'isScript',
        signatures: [['checkedObject']]
    },
    {
        name: 'isScriptURL',
        signatures: [['checkedObject']]
    },
    {
        name: 'getAttributeType',
        signatures: [['tagName', 'attribute', '?elementNS', '?attrNs']]
    },
    {
        name: 'getPropertyType',
        signatures: [['tagName', 'property', '?elementNS']]
    },
    {
        name: 'getTypeMapping',
        signatures: [['?ns']]
    },
    {
        name: 'createHTML',
        signatures: [['input', '...args']]
    },
    {
        name: 'createScript',
        signatures: [['input', '...args']]
    },
    {
        name: 'createScriptURL',
        signatures: [['input', '...args']]
    },
    {
        name: 'URLSearchParams',
        signatures: [['?init']]
    },
    {
        name: 'URL',
        signatures: [['url', '?base']]
    },
    {
        name: 'SharedWorker',
        signatures: [['scriptURL', '?options']]
    },
    {
        name: 'Worker',
        signatures: [['scriptURL', '?options']]
    },
    {
        name: 'setTrustToken',
        signatures: [['trustToken']]
    },
    {
        name: 'joinAdInterestGroup',
        signatures: [['group', 'durationSeconds']]
    },
    {
        name: 'leaveAdInterestGroup',
        signatures: [['?group']]
    },
    {
        name: 'runAdAuction',
        signatures: [['config']]
    },
    {
        name: 'adAuctionComponents',
        signatures: [['numComponents']]
    },
    {
        name: 'deprecatedURNToURL',
        signatures: [['uuid_url']]
    },
    {
        name: 'deprecatedReplaceInURN',
        signatures: [['uuid_url', 'replacements']]
    },
    {
        name: 'createAdRequest',
        signatures: [['config']]
    },
    {
        name: 'finalizeAd',
        signatures: [['ads', 'config']]
    },
    {
        name: 'registerAnimator',
        signatures: [['name', 'animatorCtor']]
    },
    {
        name: 'WorkletAnimation',
        signatures: [['animatorName', 'effects', '?timeline', '?options']]
    },
    {
        name: 'BeforeInstallPromptEvent',
        signatures: [['type', '?eventInitDict']]
    },
    {
        name: 'setSinkId',
        signatures: [['sinkId']]
    },
    {
        name: 'BackgroundFetchEvent',
        signatures: [['type', 'init']]
    },
    {
        name: 'BackgroundFetchUpdateUIEvent',
        signatures: [['type', 'init']]
    },
    {
        name: 'updateUI',
        signatures: [['?options']]
    },
    {
        name: 'PeriodicSyncEvent',
        signatures: [['type', 'init']]
    },
    {
        name: 'SyncEvent',
        signatures: [['type', 'init']]
    },
    {
        name: 'setAppBadge',
        signatures: [['?contents']]
    },
    {
        name: 'watchAdvertisements',
        signatures: [['?options']]
    },
    {
        name: 'getDescriptor',
        signatures: [['descriptor']],
        receivers: ['BluetoothRemoteGATTCharacteristic']
    },
    {
        name: 'getDescriptor',
        signatures: [['name']],
        receivers: ['BluetoothUUID']
    },
    {
        name: 'getDescriptors',
        signatures: [['?descriptor']]
    },
    {
        name: 'writeValue',
        signatures: [['value']]
    },
    {
        name: 'writeValueWithResponse',
        signatures: [['value']]
    },
    {
        name: 'writeValueWithoutResponse',
        signatures: [['value']]
    },
    {
        name: 'getPrimaryService',
        signatures: [['service']]
    },
    {
        name: 'getPrimaryServices',
        signatures: [['?service']]
    },
    {
        name: 'getCharacteristic',
        signatures: [['characteristic']],
        receivers: ['BluetoothRemoteGATTService']
    },
    {
        name: 'getCharacteristic',
        signatures: [['name']],
        receivers: ['BluetoothUUID']
    },
    {
        name: 'getCharacteristics',
        signatures: [['?characteristic']]
    },
    {
        name: 'getService',
        signatures: [['name']]
    },
    {
        name: 'canonicalUUID',
        signatures: [['alias']]
    },
    {
        name: 'requestDevice',
        signatures: [['?options']],
        receivers: ['Bluetooth']
    },
    {
        name: 'requestDevice',
        signatures: [['options']],
        receivers: ['HID', 'USB']
    },
    {
        name: 'requestDevice',
        signatures: [['?descriptor']],
        receivers: ['GPUAdapter']
    },
    {
        name: 'requestLEScan',
        signatures: [['?options']]
    },
    {
        name: 'MediaStreamTrackGenerator',
        signatures: [['kind'], ['init']]
    },
    {
        name: 'MediaStreamTrackProcessor',
        signatures: [['init'], ['track', '?bufferSize']]
    },
    {
        name: 'BroadcastChannel',
        signatures: [['name']]
    },
    {
        name: 'setExpires',
        signatures: [['expires']]
    },
    {
        name: 'CanvasFilter',
        signatures: [['init']]
    },
    {
        name: 'CanvasFormattedTextRun',
        signatures: [['text']]
    },
    {
        name: 'CanvasFormattedText',
        signatures: [['?text']]
    },
    {
        name: 'getRun',
        signatures: [['index']]
    },
    {
        name: 'appendRun',
        signatures: [['newRun']]
    },
    {
        name: 'setRun',
        signatures: [['index', 'run']]
    },
    {
        name: 'insertRun',
        signatures: [['index', 'run']]
    },
    {
        name: 'deleteRun',
        signatures: [['index', '?length']]
    },
    {
        name: 'roundRect',
        signatures: [['x', 'y', 'w', 'h', '?radii']]
    },
    {
        name: 'scrollPathIntoView',
        signatures: [['?path']]
    },
    {
        name: 'fillFormattedText',
        signatures: [['formattedText', 'x', 'y', 'wrapWidth', '?height']]
    },
    {
        name: 'Path2D',
        signatures: [['?path']]
    },
    {
        name: 'ClipboardItem',
        signatures: [['items']]
    },
    {
        name: 'CompressionStream',
        signatures: [['format']]
    },
    {
        name: 'DecompressionStream',
        signatures: [['format']]
    },
    {
        name: 'ContentIndexEvent',
        signatures: [['type', 'init']]
    },
    {
        name: 'FederatedCredential',
        signatures: [['data']]
    },
    {
        name: 'logoutRps',
        signatures: [['?logout_requests']]
    },
    {
        name: 'PasswordCredential',
        signatures: [['data'], ['form']]
    },
    {
        name: 'registerPaint',
        signatures: [['name', 'paintCtor']]
    },
    {
        name: 'updateInkTrailStartPoint',
        signatures: [['evt', 'style']]
    },
    {
        name: 'requestPresenter',
        signatures: [['?param']]
    },
    {
        name: 'DeviceMotionEvent',
        signatures: [['type', '?eventInitDict']]
    },
    {
        name: 'DeviceOrientationEvent',
        signatures: [['type', '?eventInitDict']]
    },
    {
        name: 'TCPSocket',
        signatures: [['remoteAddress', 'remotePort', '?options']]
    },
    {
        name: 'UDPSocket',
        signatures: [['address', 'port', '?options']]
    },
    {
        name: 'TextDecoderStream',
        signatures: [['?label', '?options']]
    },
    {
        name: 'TextDecoder',
        signatures: [['?label', '?options']]
    },
    {
        name: 'MediaEncryptedEvent',
        signatures: [['type', '?eventInitDict']]
    },
    {
        name: 'MediaKeyMessageEvent',
        signatures: [['type', 'eventInitDict']]
    },
    {
        name: 'getStatusForPolicy',
        signatures: [['policy']]
    },
    {
        name: 'EventSource',
        signatures: [['url', '?eventSourceInitDict']]
    },
    {
        name: 'createWritable',
        signatures: [['?options']]
    },
    {
        name: 'move',
        signatures: [['new_entry_name'], ['destination_directory', '?new_entry_name']]
    },
    {
        name: 'queryPermission',
        signatures: [['?descriptor']]
    },
    {
        name: 'requestPermission',
        signatures: [['?descriptor']],
        receivers: ['FileSystemHandle']
    },
    {
        name: 'requestPermission',
        signatures: [['?deprecatedCallback']],
        receivers: ['Notification']
    },
    {
        name: 'truncate',
        signatures: [['size']]
    },
    {
        name: 'seek',
        signatures: [['offset']],
        receivers: ['FileSystemWritableFileStream']
    },
    {
        name: 'seek',
        signatures: [['position']],
        receivers: ['FileWriterSync', 'FileWriter']
    },
    {
        name: 'showOpenFilePicker',
        signatures: [['?options']]
    },
    {
        name: 'showSaveFilePicker',
        signatures: [['?options']]
    },
    {
        name: 'showDirectoryPicker',
        signatures: [['?options']]
    },
    {
        name: 'webkitRequestFileSystem',
        signatures: [['type', 'size', '?successCallback', '?errorCallback']],
        receivers: ['DedicatedWorkerGlobalScope', 'SharedWorkerGlobalScope']
    },
    {
        name: 'webkitRequestFileSystem',
        signatures: [['type', 'size', 'successCallback', '?errorCallback']],
        receivers: ['Window']
    },
    {
        name: 'webkitRequestFileSystemSync',
        signatures: [['type', 'size']]
    },
    {
        name: 'webkitResolveLocalFileSystemURL',
        signatures: [['url', 'successCallback', '?errorCallback']]
    },
    {
        name: 'webkitResolveLocalFileSystemSyncURL',
        signatures: [['url']]
    },
    {
        name: 'isolatedFileSystem',
        signatures: [['fileSystemId', 'registeredName']]
    },
    {
        name: 'upgradeDraggedFileSystemPermissions',
        signatures: [['domFileSystem']]
    },
    {
        name: 'removeRecursively',
        signatures: [['successCallback', '?errorCallback']],
        receivers: ['DirectoryEntry']
    },
    {
        name: 'getMetadata',
        signatures: [['successCallback', '?errorCallback']],
        receivers: ['Entry']
    },
    {
        name: 'copyTo',
        signatures: [['parent', 'name']],
        receivers: ['EntrySync']
    },
    {
        name: 'copyTo',
        signatures: [['parent', '?name', '?successCallback', '?errorCallback']],
        receivers: ['Entry']
    },
    {
        name: 'copyTo',
        signatures: [['destination', 'options']],
        receivers: ['AudioData']
    },
    {
        name: 'copyTo',
        signatures: [['destination']],
        receivers: ['EncodedAudioChunk', 'EncodedVideoChunk']
    },
    {
        name: 'copyTo',
        signatures: [['destination', '?options']],
        receivers: ['VideoFrame']
    },
    {
        name: 'createWriter',
        signatures: [['successCallback', '?errorCallback']],
        receivers: ['FileEntry']
    },
    {
        name: 'queryLocalFonts',
        signatures: [['?options']]
    },
    {
        name: 'GamepadAxisEvent',
        signatures: [['type', '?eventInitDict']]
    },
    {
        name: 'GamepadButtonEvent',
        signatures: [['type', '?eventInitDict']]
    },
    {
        name: 'GamepadEvent',
        signatures: [['type', '?eventInitDict']]
    },
    {
        name: 'playEffect',
        signatures: [['type', 'params']]
    },
    {
        name: 'addStroke',
        signatures: [['stroke']]
    },
    {
        name: 'removeStroke',
        signatures: [['stroke']]
    },
    {
        name: 'startDrawing',
        signatures: [['?hints']]
    },
    {
        name: 'addPoint',
        signatures: [['point']]
    },
    {
        name: 'createHandwritingRecognizer',
        signatures: [['constraint']]
    },
    {
        name: 'queryHandwritingRecognizer',
        signatures: [['constraint']]
    },
    {
        name: 'HIDConnectionEvent',
        signatures: [['type', 'eventInitDict']]
    },
    {
        name: 'sendReport',
        signatures: [['reportId', 'data']]
    },
    {
        name: 'sendFeatureReport',
        signatures: [['reportId', 'data']]
    },
    {
        name: 'receiveFeatureReport',
        signatures: [['reportId']]
    },
    {
        name: 'ImageCapture',
        signatures: [['track']]
    },
    {
        name: 'takePhoto',
        signatures: [['?photoSettings']]
    },
    {
        name: 'batchGetAll',
        signatures: [['?keys', '?count']]
    },
    {
        name: 'only',
        signatures: [['value']]
    },
    {
        name: 'lowerBound',
        signatures: [['bound', '?open']]
    },
    {
        name: 'upperBound',
        signatures: [['bound', '?open']]
    },
    {
        name: 'bound',
        signatures: [['lower', 'upper', '?lowerOpen', '?upperOpen']]
    },
    {
        name: 'IDBVersionChangeEvent',
        signatures: [['type', '?eventInitDict']]
    },
    {
        name: 'setConsumer',
        signatures: [['consumer']]
    },
    {
        name: 'BlobEvent',
        signatures: [['type', 'eventInitDict']]
    },
    {
        name: 'MediaRecorder',
        signatures: [['stream', '?options']]
    },
    {
        name: 'isTypeSupported',
        signatures: [['type']]
    },
    {
        name: 'MediaMetadata',
        signatures: [['?init']]
    },
    {
        name: 'setMicrophoneActive',
        signatures: [['active']]
    },
    {
        name: 'setCameraActive',
        signatures: [['active']]
    },
    {
        name: 'appendEncodedChunks',
        signatures: [['chunks']]
    },
    {
        name: 'TrackDefaultList',
        signatures: [['?trackDefaults']]
    },
    {
        name: 'TrackDefault',
        signatures: [['type', 'language', 'label', 'kinds', '?byteStreamTrackID']]
    },
    {
        name: 'cropTo',
        signatures: [['crop_id']]
    },
    {
        name: 'fromElement',
        signatures: [['element']]
    },
    {
        name: 'getDisplayMediaSet',
        signatures: [['?constraints']]
    },
    {
        name: 'setCaptureHandleConfig',
        signatures: [['?config']]
    },
    {
        name: 'MediaStreamEvent',
        signatures: [['type', '?eventInitDict']]
    },
    {
        name: 'MediaStreamTrackEvent',
        signatures: [['type', 'eventInitDict']]
    },
    {
        name: 'MediaStream',
        signatures: [['?stream'], ['tracks']]
    },
    {
        name: 'webkitGetUserMedia',
        signatures: [['constraints', 'successCallback', 'errorCallback']]
    },
    {
        name: 'OverconstrainedError',
        signatures: [['constraint', 'message']]
    },
    {
        name: 'MLModelLoader',
        signatures: [['context']]
    },
    {
        name: 'compute',
        signatures: [['inputs']]
    },
    {
        name: 'createContext',
        signatures: [['?options']]
    },
    {
        name: 'MLGraphBuilder',
        signatures: [['context']]
    },
    {
        name: 'input',
        signatures: [['name', 'desc']]
    },
    {
        name: 'constant',
        signatures: [['desc', 'bufferView']]
    },
    {
        name: 'clamp',
        signatures: [['?options'], ['input', '?options']]
    },
    {
        name: 'conv2d',
        signatures: [['input', 'filter', '?options']]
    },
    {
        name: 'gemm',
        signatures: [['a', 'b', '?options']]
    },
    {
        name: 'averagePool2d',
        signatures: [['input', '?options']]
    },
    {
        name: 'reshape',
        signatures: [['input', 'newShape']]
    },
    {
        name: 'softmax',
        signatures: [['input']]
    },
    {
        name: 'getFileSystemAccessTransferToken',
        signatures: [['fileHandle']]
    },
    {
        name: 'openSync',
        signatures: [['name']]
    },
    {
        name: 'rename',
        signatures: [['old_name', 'new_name']]
    },
    {
        name: 'renameSync',
        signatures: [['old_name', 'new_name']]
    },
    {
        name: 'requestCapacity',
        signatures: [['requested_capacity']]
    },
    {
        name: 'requestCapacitySync',
        signatures: [['released_capacity']]
    },
    {
        name: 'releaseCapacity',
        signatures: [['released_capacity']]
    },
    {
        name: 'releaseCapacitySync',
        signatures: [['released_capacity']]
    },
    {
        name: 'setLength',
        signatures: [['length']]
    },
    {
        name: 'unregisterProtocolHandler',
        signatures: [['scheme', 'url']]
    },
    {
        name: 'NDEFMessage',
        signatures: [['messageInit']]
    },
    {
        name: 'scan',
        signatures: [['?options']]
    },
    {
        name: 'makeReadOnly',
        signatures: [['?options']]
    },
    {
        name: 'NDEFReadingEvent',
        signatures: [['type', 'eventInitDict']]
    },
    {
        name: 'NDEFRecord',
        signatures: [['recordInit']]
    },
    {
        name: 'NotificationEvent',
        signatures: [['type', 'eventInitDict']]
    },
    {
        name: 'Notification',
        signatures: [['title', '?options']]
    },
    {
        name: 'TimestampTrigger',
        signatures: [['timestamp']]
    },
    {
        name: 'AbortPaymentEvent',
        signatures: [['type', 'eventInitDict']]
    },
    {
        name: 'CanMakePaymentEvent',
        signatures: [['type', 'eventInitDict']]
    },
    {
        name: 'getDetails',
        signatures: [['itemIds']]
    },
    {
        name: 'consume',
        signatures: [['purchaseToken']]
    },
    {
        name: 'getDigitalGoodsService',
        signatures: [['paymentMethod']]
    },
    {
        name: 'MerchantValidationEvent',
        signatures: [['type', '?eventInitDict']]
    },
    {
        name: 'enableDelegations',
        signatures: [['delegations']]
    },
    {
        name: 'PaymentMethodChangeEvent',
        signatures: [['type', '?eventInitDict']]
    },
    {
        name: 'PaymentRequestEvent',
        signatures: [['type', 'eventInitDict']]
    },
    {
        name: 'changePaymentMethod',
        signatures: [['methodName', '?methodDetails']]
    },
    {
        name: 'changeShippingAddress',
        signatures: [['shippingAddress']]
    },
    {
        name: 'changeShippingOption',
        signatures: [['shippingOption']]
    },
    {
        name: 'PaymentRequestUpdateEvent',
        signatures: [['type', '?eventInitDict']]
    },
    {
        name: 'PaymentRequest',
        signatures: [['methodData', '?details', '?options']]
    },
    {
        name: 'RTCDataChannelEvent',
        signatures: [['type', 'eventInitDict']]
    },
    {
        name: 'RTCDTMFToneChangeEvent',
        signatures: [['type', 'eventInitDict']]
    },
    {
        name: 'RTCErrorEvent',
        signatures: [['type', 'eventInitDict']]
    },
    {
        name: 'RTCError',
        signatures: [['init', '?message']]
    },
    {
        name: 'RTCIceCandidate',
        signatures: [['?candidateInitDict']]
    },
    {
        name: 'gather',
        signatures: [['options']]
    },
    {
        name: 'addRemoteCandidate',
        signatures: [['remoteCandidate']]
    },
    {
        name: 'stat',
        signatures: [['name']]
    },
    {
        name: 'RTCPeerConnectionIceErrorEvent',
        signatures: [['type', 'eventInitDict']]
    },
    {
        name: 'RTCPeerConnectionIceEvent',
        signatures: [['type', '?eventInitDict']]
    },
    {
        name: 'RTCPeerConnection',
        signatures: [['?configuration', '?mediaConstraints']]
    },
    {
        name: 'generateCertificate',
        signatures: [['keygenAlgorithm']]
    },
    {
        name: 'addStream',
        signatures: [['stream']]
    },
    {
        name: 'removeStream',
        signatures: [['stream']]
    },
    {
        name: 'createDTMFSender',
        signatures: [['track']]
    },
    {
        name: 'setOfferedRtpHeaderExtensions',
        signatures: [['headerExtensionsToOffer']]
    },
    {
        name: 'RTCSessionDescription',
        signatures: [['?descriptionInitDict']]
    },
    {
        name: 'revoke',
        signatures: [['permission']]
    },
    {
        name: 'requestAll',
        signatures: [['permissions']]
    },
    {
        name: 'PictureInPictureEvent',
        signatures: [['type', 'eventInitDict']]
    },
    {
        name: 'requestPictureInPictureWindow',
        signatures: [['?options']]
    },
    {
        name: 'PresentationConnectionAvailableEvent',
        signatures: [['type', 'eventInitDict']]
    },
    {
        name: 'PresentationConnectionCloseEvent',
        signatures: [['type', 'eventInitDict']]
    },
    {
        name: 'PresentationRequest',
        signatures: [['url'], ['urls']]
    },
    {
        name: 'reconnect',
        signatures: [['id']]
    },
    {
        name: 'PushEvent',
        signatures: [['type', '?eventInitDict']]
    },
    {
        name: 'PushSubscriptionChangeEvent',
        signatures: [['type', '?eventInitDict']]
    },
    {
        name: 'queryUsageAndQuota',
        signatures: [['storageType', '?usageCallback', '?errorCallback']],
        receivers: ['DeprecatedStorageInfo']
    },
    {
        name: 'queryUsageAndQuota',
        signatures: [['usageCallback', '?errorCallback']],
        receivers: ['DeprecatedStorageQuota']
    },
    {
        name: 'requestQuota',
        signatures: [['storageType', 'newQuotaInBytes', '?quotaCallback', '?errorCallback']],
        receivers: ['DeprecatedStorageInfo']
    },
    {
        name: 'requestQuota',
        signatures: [['newQuotaInBytes', '?quotaCallback', '?errorCallback']],
        receivers: ['DeprecatedStorageQuota']
    },
    {
        name: 'DOMError',
        signatures: [['name', '?message']]
    },
    {
        name: 'setHTML',
        signatures: [['markup', '?options']]
    },
    {
        name: 'Sanitizer',
        signatures: [['?config']]
    },
    {
        name: 'sanitize',
        signatures: [['input']]
    },
    {
        name: 'sanitizeFor',
        signatures: [['element', 'markup']]
    },
    {
        name: 'postTask',
        signatures: [['callback', '?options']]
    },
    {
        name: 'isAncestor',
        signatures: [['parentId']]
    },
    {
        name: 'TaskController',
        signatures: [['?init']]
    },
    {
        name: 'setPriority',
        signatures: [['priority']]
    },
    {
        name: 'TaskPriorityChangeEvent',
        signatures: [['type', 'eventInitDict']]
    },
    {
        name: 'AbsoluteOrientationSensor',
        signatures: [['?sensorOptions']]
    },
    {
        name: 'Accelerometer',
        signatures: [['?sensorOptions']]
    },
    {
        name: 'AmbientLightSensor',
        signatures: [['?sensorOptions']]
    },
    {
        name: 'GravitySensor',
        signatures: [['?sensorOptions']]
    },
    {
        name: 'Gyroscope',
        signatures: [['?sensorOptions']]
    },
    {
        name: 'LinearAccelerationSensor',
        signatures: [['?sensorOptions']]
    },
    {
        name: 'Magnetometer',
        signatures: [['?sensorOptions']]
    },
    {
        name: 'populateMatrix',
        signatures: [['targetBuffer']]
    },
    {
        name: 'RelativeOrientationSensor',
        signatures: [['?sensorOptions']]
    },
    {
        name: 'SensorErrorEvent',
        signatures: [['type', 'eventInitDict']]
    },
    {
        name: 'requestPort',
        signatures: [['?options']]
    },
    {
        name: 'ExtendableEvent',
        signatures: [['type', '?eventInitDict']]
    },
    {
        name: 'ExtendableMessageEvent',
        signatures: [['type', '?eventInitDict']]
    },
    {
        name: 'FetchEvent',
        signatures: [['type', 'eventInitDict']]
    },
    {
        name: 'InstallEvent',
        signatures: [['type', '?eventInitDict']]
    },
    {
        name: 'setHeaderValue',
        signatures: [['value']]
    },
    {
        name: 'BarcodeDetector',
        signatures: [['?barcodeDetectorOptions']]
    },
    {
        name: 'detect',
        signatures: [['image']]
    },
    {
        name: 'FaceDetector',
        signatures: [['?faceDetectorOptions']]
    },
    {
        name: 'selectURL',
        signatures: [['name', 'urls', '?options']]
    },
    {
        name: 'run',
        signatures: [['name', '?options']]
    },
    {
        name: 'addFromUri',
        signatures: [['src', '?weight']]
    },
    {
        name: 'addFromString',
        signatures: [['string', '?weight']]
    },
    {
        name: 'SpeechRecognitionErrorEvent',
        signatures: [['type', '?eventInitDict']]
    },
    {
        name: 'SpeechRecognitionEvent',
        signatures: [['type', '?initDict']]
    },
    {
        name: 'SpeechSynthesisErrorEvent',
        signatures: [['type', 'eventInitDict']]
    },
    {
        name: 'SpeechSynthesisEvent',
        signatures: [['type', 'eventInitDict']]
    },
    {
        name: 'SpeechSynthesisUtterance',
        signatures: [['?text']]
    },
    {
        name: 'StorageEvent',
        signatures: [['type', '?eventInitDict']]
    },
    {
        name: 'URLPattern',
        signatures: [['?input', '?baseURL']]
    },
    {
        name: 'compareComponent',
        signatures: [['component', 'left', 'right']]
    },
    {
        name: 'requestVideoFrameCallback',
        signatures: [['callback']]
    },
    {
        name: 'cancelVideoFrameCallback',
        signatures: [['handle']]
    },
    {
        name: 'VirtualKeyboardGeometryChangeEvent',
        signatures: [['type']]
    },
    {
        name: 'AnalyserNode',
        signatures: [['context', '?options']]
    },
    {
        name: 'AudioBufferSourceNode',
        signatures: [['context', '?options']]
    },
    {
        name: 'AudioBuffer',
        signatures: [['options']]
    },
    {
        name: 'AudioContext',
        signatures: [['?contextOptions']]
    },
    {
        name: 'AudioProcessingEvent',
        signatures: [['type', 'eventInitDict']]
    },
    {
        name: 'registerProcessor',
        signatures: [['name', 'processorCtor']]
    },
    {
        name: 'AudioWorkletNode',
        signatures: [['context', 'name', '?options']]
    },
    {
        name: 'BiquadFilterNode',
        signatures: [['context', '?options']]
    },
    {
        name: 'ChannelMergerNode',
        signatures: [['context', '?options']]
    },
    {
        name: 'ChannelSplitterNode',
        signatures: [['context', '?options']]
    },
    {
        name: 'ConstantSourceNode',
        signatures: [['context', '?options']]
    },
    {
        name: 'ConvolverNode',
        signatures: [['context', '?options']]
    },
    {
        name: 'DelayNode',
        signatures: [['context', '?options']]
    },
    {
        name: 'DynamicsCompressorNode',
        signatures: [['context', '?options']]
    },
    {
        name: 'GainNode',
        signatures: [['context', '?options']]
    },
    {
        name: 'IIRFilterNode',
        signatures: [['context', 'options']]
    },
    {
        name: 'MediaElementAudioSourceNode',
        signatures: [['context', 'options']]
    },
    {
        name: 'MediaStreamAudioDestinationNode',
        signatures: [['context', '?options']]
    },
    {
        name: 'MediaStreamAudioSourceNode',
        signatures: [['context', 'options']]
    },
    {
        name: 'OfflineAudioCompletionEvent',
        signatures: [['type', 'eventInitDict']]
    },
    {
        name: 'OfflineAudioContext',
        signatures: [['options'], ['numberOfChannels', 'numberOfFrames', 'sampleRate']]
    },
    {
        name: 'OscillatorNode',
        signatures: [['context', '?options']]
    },
    {
        name: 'PannerNode',
        signatures: [['context', '?options']]
    },
    {
        name: 'PeriodicWave',
        signatures: [['context', '?options']]
    },
    {
        name: 'StereoPannerNode',
        signatures: [['context', '?options']]
    },
    {
        name: 'WaveShaperNode',
        signatures: [['context', '?options']]
    },
    {
        name: 'AudioData',
        signatures: [['init']]
    },
    {
        name: 'allocationSize',
        signatures: [['options']],
        receivers: ['AudioData']
    },
    {
        name: 'allocationSize',
        signatures: [['?options']],
        receivers: ['VideoFrame']
    },
    {
        name: 'AudioDecoder',
        signatures: [['init']]
    },
    {
        name: 'configure',
        signatures: [['config']],
        receivers: ['AudioDecoder', 'AudioEncoder', 'VideoDecoder', 'VideoEncoder']
    },
    {
        name: 'configure',
        signatures: [['descriptor']],
        receivers: ['GPUCanvasContext']
    },
    {
        name: 'isConfigSupported',
        signatures: [['config']]
    },
    {
        name: 'AudioEncoder',
        signatures: [['init']]
    },
    {
        name: 'EncodedAudioChunk',
        signatures: [['init']]
    },
    {
        name: 'EncodedVideoChunk',
        signatures: [['init']]
    },
    {
        name: 'ImageDecoder',
        signatures: [['init']]
    },
    {
        name: 'VideoColorSpace',
        signatures: [['?init']]
    },
    {
        name: 'VideoDecoder',
        signatures: [['init']]
    },
    {
        name: 'VideoEncoder',
        signatures: [['init']]
    },
    {
        name: 'VideoFrame',
        signatures: [['source', '?init'], ['data', 'init']]
    },
    {
        name: 'changeVersion',
        signatures: [['oldVersion', 'newVersion', '?callback', '?errorCallback', '?successCallback']]
    },
    {
        name: 'readTransaction',
        signatures: [['callback', '?errorCallback', '?successCallback']]
    },
    {
        name: 'executeSql',
        signatures: [['sqlStatement', '?arguments', '?callback', '?errorCallback']]
    },
    {
        name: 'openDatabase',
        signatures: [['name', 'version', 'displayName', 'estimatedSize', '?creationCallback']]
    },
    {
        name: 'queryCounterEXT',
        signatures: [['query', 'target']]
    },
    {
        name: 'deleteQueryEXT',
        signatures: [['query']]
    },
    {
        name: 'isQueryEXT',
        signatures: [['query']]
    },
    {
        name: 'beginQueryEXT',
        signatures: [['target', 'query']]
    },
    {
        name: 'endQueryEXT',
        signatures: [['target']]
    },
    {
        name: 'getQueryEXT',
        signatures: [['target', 'pname']]
    },
    {
        name: 'getQueryObjectEXT',
        signatures: [['query', 'pname']]
    },
    {
        name: 'enableiOES',
        signatures: [['target', 'index']]
    },
    {
        name: 'disableiOES',
        signatures: [['target', 'index']]
    },
    {
        name: 'blendEquationiOES',
        signatures: [['buf', 'mode']]
    },
    {
        name: 'blendEquationSeparateiOES',
        signatures: [['buf', 'modeRGB', 'modeAlpha']]
    },
    {
        name: 'blendFunciOES',
        signatures: [['buf', 'src', 'dst']]
    },
    {
        name: 'blendFuncSeparateiOES',
        signatures: [['buf', 'srcRGB', 'dstRGB', 'srcAlpha', 'dstAlpha']]
    },
    {
        name: 'colorMaskiOES',
        signatures: [['buf', 'r', 'g', 'b', 'a']]
    },
    {
        name: 'WebGLContextEvent',
        signatures: [['type', '?eventInit']]
    },
    {
        name: 'drawArraysInstancedBaseInstanceWEBGL',
        signatures: [['mode', 'first', 'count', 'instance_count', 'baseinstance']]
    },
    {
        name: 'drawElementsInstancedBaseVertexBaseInstanceWEBGL',
        signatures: [['mode', 'count', 'type', 'offset', 'instance_count', 'basevertex', 'baseinstance']]
    },
    {
        name: 'multiDrawArraysInstancedBaseInstanceWEBGL',
        signatures: [['mode', 'firstsList', 'firstsOffset', 'countsList', 'countsOffset', 'instanceCountsList', 'instanceCountsOffset', 'baseInstancesList', 'baseInstancesOffset', 'drawcount']]
    },
    {
        name: 'multiDrawElementsInstancedBaseVertexBaseInstanceWEBGL',
        signatures: [['mode', 'countsList', 'countsOffset', 'type', 'offsetsList', 'offsetsOffset', 'instanceCountsList', 'instanceCountsOffset', 'baseVerticesList', 'baseVerticesOffset', 'baseInstancesList', 'baseInstancesOffset', 'drawcount']]
    },
    {
        name: 'drawingBufferStorage',
        signatures: [['sizedformat', 'width', 'height']]
    },
    {
        name: 'shareVideoImageWEBGL',
        signatures: [['target', 'video']]
    },
    {
        name: 'releaseVideoImageWEBGL',
        signatures: [['target']]
    },
    {
        name: 'importVideoFrame',
        signatures: [['videoFrame']]
    },
    {
        name: 'releaseVideoFrame',
        signatures: [['handle']]
    },
    {
        name: 'requestAdapterInfo',
        signatures: [['?unmaskHints']]
    },
    {
        name: 'mapAsync',
        signatures: [['mode', '?offset', '?size']]
    },
    {
        name: 'getMappedRange',
        signatures: [['?offset', '?size']]
    },
    {
        name: 'getPreferredFormat',
        signatures: [['adapter']]
    },
    {
        name: 'beginRenderPass',
        signatures: [['descriptor']]
    },
    {
        name: 'beginComputePass',
        signatures: [['?descriptor']]
    },
    {
        name: 'copyBufferToBuffer',
        signatures: [['src', 'srcOffset', 'dst', 'dstOffset', 'size']]
    },
    {
        name: 'copyBufferToTexture',
        signatures: [['source', 'destination', 'copySize']]
    },
    {
        name: 'copyTextureToBuffer',
        signatures: [['source', 'destination', 'copySize']]
    },
    {
        name: 'copyTextureToTexture',
        signatures: [['source', 'destination', 'copySize']]
    },
    {
        name: 'pushDebugGroup',
        signatures: [['groupLabel']]
    },
    {
        name: 'insertDebugMarker',
        signatures: [['markerLabel']]
    },
    {
        name: 'resolveQuerySet',
        signatures: [['querySet', 'firstQuery', 'queryCount', 'destination', 'destinationOffset']]
    },
    {
        name: 'writeTimestamp',
        signatures: [['querySet', 'queryIndex']]
    },
    {
        name: 'clearBuffer',
        signatures: [['buffer', '?offset', '?size']]
    },
    {
        name: 'setPipeline',
        signatures: [['pipeline']]
    },
    {
        name: 'dispatchWorkgroups',
        signatures: [['workgroupCountX', '?workgroupCountY', '?workgroupCountZ']]
    },
    {
        name: 'dispatchWorkgroupsIndirect',
        signatures: [['indirectBuffer', 'indirectOffset']]
    },
    {
        name: 'dispatch',
        signatures: [['workgroupCountX', '?workgroupCountY', '?workgroupCountZ']]
    },
    {
        name: 'dispatchIndirect',
        signatures: [['indirectBuffer', 'indirectOffset']]
    },
    {
        name: 'experimentalImportTexture',
        signatures: [['canvas', 'usage']]
    },
    {
        name: 'importExternalTexture',
        signatures: [['descriptor']]
    },
    {
        name: 'createBindGroup',
        signatures: [['descriptor']]
    },
    {
        name: 'createBindGroupLayout',
        signatures: [['descriptor']]
    },
    {
        name: 'createPipelineLayout',
        signatures: [['descriptor']]
    },
    {
        name: 'createShaderModule',
        signatures: [['descriptor']]
    },
    {
        name: 'createRenderPipeline',
        signatures: [['descriptor']]
    },
    {
        name: 'createComputePipeline',
        signatures: [['descriptor']]
    },
    {
        name: 'createRenderPipelineAsync',
        signatures: [['descriptor']]
    },
    {
        name: 'createComputePipelineAsync',
        signatures: [['descriptor']]
    },
    {
        name: 'createCommandEncoder',
        signatures: [['?descriptor']]
    },
    {
        name: 'createRenderBundleEncoder',
        signatures: [['descriptor']]
    },
    {
        name: 'createQuerySet',
        signatures: [['descriptor']]
    },
    {
        name: 'pushErrorScope',
        signatures: [['filter']]
    },
    {
        name: 'GPUOutOfMemoryError',
        signatures: [['message']]
    },
    {
        name: 'getBindGroupLayout',
        signatures: [['index']]
    },
    {
        name: 'setBindGroup',
        signatures: [['index', 'bindGroup', '?dynamicOffsets'], ['index', 'bindGroup', 'dynamicOffsetsData', 'dynamicOffsetsDataStart', 'dynamicOffsetsDataLength']]
    },
    {
        name: 'writeBuffer',
        signatures: [['buffer', 'bufferOffset', 'data', '?dataElementOffset', '?dataElementCount'], ['buffer', 'bufferOffset', 'data', '?dataByteOffset', '?byteSize']]
    },
    {
        name: 'writeTexture',
        signatures: [['destination', 'data', 'dataLayout', 'size']]
    },
    {
        name: 'copyExternalImageToTexture',
        signatures: [['source', 'destination', 'copySize']]
    },
    {
        name: 'setIndexBuffer',
        signatures: [['buffer', 'format', '?offset', '?size']]
    },
    {
        name: 'setVertexBuffer',
        signatures: [['slot', 'buffer', '?offset', '?size']]
    },
    {
        name: 'draw',
        signatures: [['vertexCount', '?instanceCount', '?firstVertex', '?firstInstance']]
    },
    {
        name: 'drawIndexed',
        signatures: [['indexCount', '?instanceCount', '?firstIndex', '?baseVertex', '?firstInstance']]
    },
    {
        name: 'drawIndirect',
        signatures: [['indirectBuffer', 'indirectOffset']]
    },
    {
        name: 'drawIndexedIndirect',
        signatures: [['indirectBuffer', 'indirectOffset']]
    },
    {
        name: 'setViewport',
        signatures: [['x', 'y', 'width', 'height', 'minDepth', 'maxDepth']]
    },
    {
        name: 'setScissorRect',
        signatures: [['x', 'y', 'width', 'height']]
    },
    {
        name: 'setBlendConstant',
        signatures: [['color']]
    },
    {
        name: 'setStencilReference',
        signatures: [['reference']]
    },
    {
        name: 'executeBundles',
        signatures: [['bundles']]
    },
    {
        name: 'beginOcclusionQuery',
        signatures: [['queryIndex']]
    },
    {
        name: 'createView',
        signatures: [['?descriptor']]
    },
    {
        name: 'GPUUncapturedErrorEvent',
        signatures: [['type', 'gpuUncapturedErrorEventInitDict']]
    },
    {
        name: 'GPUValidationError',
        signatures: [['message']]
    },
    {
        name: 'requestAdapter',
        signatures: [['?options']]
    },
    {
        name: 'MIDIConnectionEvent',
        signatures: [['type', '?eventInitDict']]
    },
    {
        name: 'MIDIMessageEvent',
        signatures: [['type', '?eventInitDict']]
    },
    {
        name: 'requestMIDIAccess',
        signatures: [['?options']]
    },
    {
        name: 'CloseEvent',
        signatures: [['type', '?eventInitDict']]
    },
    {
        name: 'WebSocketStream',
        signatures: [['url', '?options']]
    },
    {
        name: 'WebSocket',
        signatures: [['url', '?protocols']]
    },
    {
        name: 'WebTransportError',
        signatures: [['?init']]
    },
    {
        name: 'WebTransport',
        signatures: [['url', '?options']]
    },
    {
        name: 'USBAlternateInterface',
        signatures: [['deviceInterface', 'alternateSetting']]
    },
    {
        name: 'USBConfiguration',
        signatures: [['device', 'configurationValue']]
    },
    {
        name: 'USBConnectionEvent',
        signatures: [['type', 'eventInitDict']]
    },
    {
        name: 'selectConfiguration',
        signatures: [['configurationValue']]
    },
    {
        name: 'claimInterface',
        signatures: [['interfaceNumber']]
    },
    {
        name: 'releaseInterface',
        signatures: [['interfaceNumber']]
    },
    {
        name: 'selectAlternateInterface',
        signatures: [['interfaceNumber', 'alternateSetting']]
    },
    {
        name: 'controlTransferIn',
        signatures: [['setup', 'length']]
    },
    {
        name: 'controlTransferOut',
        signatures: [['setup', '?data']]
    },
    {
        name: 'clearHalt',
        signatures: [['direction', 'endpointNumber']]
    },
    {
        name: 'transferIn',
        signatures: [['endpointNumber', 'length']]
    },
    {
        name: 'transferOut',
        signatures: [['endpointNumber', 'data']]
    },
    {
        name: 'isochronousTransferIn',
        signatures: [['endpointNumber', 'packetLengths']]
    },
    {
        name: 'isochronousTransferOut',
        signatures: [['endpointNumber', 'data', 'packetLengths']]
    },
    {
        name: 'USBEndpoint',
        signatures: [['alternate', 'endpointNumber', 'direction']]
    },
    {
        name: 'USBInTransferResult',
        signatures: [['status', '?data']]
    },
    {
        name: 'USBInterface',
        signatures: [['configuration', 'interfaceNumber']]
    },
    {
        name: 'USBIsochronousInTransferPacket',
        signatures: [['status', '?data']]
    },
    {
        name: 'USBIsochronousInTransferResult',
        signatures: [['packets', '?data']]
    },
    {
        name: 'USBIsochronousOutTransferPacket',
        signatures: [['status', '?bytesWritten']]
    },
    {
        name: 'USBIsochronousOutTransferResult',
        signatures: [['packets']]
    },
    {
        name: 'USBOutTransferResult',
        signatures: [['status', '?bytesWritten']]
    },
    {
        name: 'WindowControlsOverlayGeometryChangeEvent',
        signatures: [['type', 'eventInitDict']]
    },
    {
        name: 'getPose',
        signatures: [['relative_to']]
    },
    {
        name: 'XRInputSourceEvent',
        signatures: [['type', 'eventInitDict']]
    },
    {
        name: 'XRInputSourcesChangeEvent',
        signatures: [['type', 'eventInitDict']]
    },
    {
        name: 'XRRay',
        signatures: [['transform'], ['?origin', '?direction']]
    },
    {
        name: 'XRReferenceSpaceEvent',
        signatures: [['type', 'eventInitDict']]
    },
    {
        name: 'getOffsetReferenceSpace',
        signatures: [['originOffset']]
    },
    {
        name: 'XRRigidTransform',
        signatures: [['?position', '?orientation']]
    },
    {
        name: 'XRSessionEvent',
        signatures: [['type', 'eventInitDict']]
    },
    {
        name: 'supportsSession',
        signatures: [['mode']]
    },
    {
        name: 'isSessionSupported',
        signatures: [['mode']]
    },
    {
        name: 'requestSession',
        signatures: [['mode', '?options']]
    },
    {
        name: 'XRWebGLBinding',
        signatures: [['session', 'context']]
    },
    {
        name: 'getReflectionCubeMap',
        signatures: [['lightProbe']]
    },
    {
        name: 'getCameraImage',
        signatures: [['camera']]
    },
    {
        name: 'getDepthInformation',
        signatures: [['view']]
    },
    {
        name: 'XRWebGLLayer',
        signatures: [['session', 'context', '?layerInit']]
    },
    {
        name: 'getViewport',
        signatures: [['view']]
    },
    {
        name: 'getNativeFramebufferScaleFactor',
        signatures: [['session']]
    }
];
//# sourceMappingURL=NativeFunctions.js.map