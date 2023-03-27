// This is the glue to make emscripten work
const document = this || {};

document.currentScript = null;
globalThis.setInterval = undefined;
