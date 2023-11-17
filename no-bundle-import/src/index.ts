var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// wrangler-modules-watch:wrangler:modules-watch
var init_wrangler_modules_watch = __esm({
  "wrangler-modules-watch:wrangler:modules-watch"() {
    init_modules_watch_stub();
  }
});

// ../../../Library/pnpm/store/v3/tmp/dlx-78901/node_modules/.pnpm/file+..+..+..+..+..+..+dev+wrangler2+packages+wrangler+wrangler-3.16.0.tgz/node_modules/wrangler/templates/modules-watch-stub.js
var init_modules_watch_stub = __esm({
  "../../../Library/pnpm/store/v3/tmp/dlx-78901/node_modules/.pnpm/file+..+..+..+..+..+..+dev+wrangler2+packages+wrangler+wrangler-3.16.0.tgz/node_modules/wrangler/templates/modules-watch-stub.js"() {
    init_wrangler_modules_watch();
  }
});

// src/say-hello.ts
var sayHello;
var init_say_hello = __esm({
  "src/say-hello.ts"() {
    init_modules_watch_stub();
    sayHello = (name) => `Hello ${name}`;
  }
});

// src/dynamic.cjs
var require_dynamic = __commonJS({
  "src/dynamic.cjs"(exports, module) {
    init_modules_watch_stub();
    module.exports = "cjs-string";
  }
});

// src/say-hello.cjs
var require_say_hello = __commonJS({
  "src/say-hello.cjs"(exports, module) {
    init_modules_watch_stub();
    module.exports.sayHello = (name) => `Hello ${name}`;
    module.exports.loop = require_dynamic();
  }
});

// src/nested/say-hello.ts
var require_say_hello2 = __commonJS({
  "src/nested/say-hello.ts"(exports, module) {
    init_modules_watch_stub();
    module.exports.sayHello = (name) => `Hello ${name}`;
  }
});

// src/nested/index.ts
var nested_exports = {};
__export(nested_exports, {
  johnSmith: () => johnSmith,
  loadWasm: () => loadWasm
});
import subWasm from "./e581cae83ec55f54c959019151983497c012c4fb-simple.wasm";
import sibWasm from "./e581cae83ec55f54c959019151983497c012c4fb-simple.wasm";
async function loadWasm() {
  const sibling = await new Promise(async (resolve) => {
    const moduleImport = {
      imports: {
        imported_func(arg) {
          resolve("sibling" + arg);
        }
      }
    };
    const m = await WebAssembly.instantiate(sibWasm, moduleImport);
    m.exports.exported_func();
  });
  const subdirectory = await new Promise(async (resolve) => {
    const moduleImport = {
      imports: {
        imported_func(arg) {
          resolve("subdirectory" + arg);
        }
      }
    };
    const m = await WebAssembly.instantiate(subWasm, moduleImport);
    m.exports.exported_func();
  });
  return sibling + subdirectory;
}
var import_say_hello2, johnSmith;
var init_nested = __esm({
  "src/nested/index.ts"() {
    init_modules_watch_stub();
    init_say_hello();
    import_say_hello2 = __toESM(require_say_hello2());
    johnSmith = sayHello("John Smith") === import_say_hello2.default.sayHello("John Smith") ? sayHello("John Smith") : false;
  }
});

// src/dynamic.ts
var dynamic_exports = {};
__export(dynamic_exports, {
  default: () => dynamic_default
});
var dynamic_default;
var init_dynamic = __esm({
  "src/dynamic.ts"() {
    init_modules_watch_stub();
    dynamic_default = "dynamic";
  }
});

// src/index.ts
init_modules_watch_stub();
init_say_hello();
var import_say_hello4 = __toESM(require_say_hello());
init_nested();
import WASM from "./e581cae83ec55f54c959019151983497c012c4fb-simple.wasm";
import nestedWasm from "./e581cae83ec55f54c959019151983497c012c4fb-simple.wasm";
import text from "./1b33ad54d78085be5ecb1cf1b3e9da821e708075-data.txt";
import binData from "./e3869ec477661fad6b9fc25914bb2eee5455b483-data.bin";
var src_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/dynamic") {
      return new Response(`${(await Promise.resolve().then(() => (init_dynamic(), dynamic_exports))).default}`);
    }
    if (url.pathname === "/wasm") {
      return new Response(
        await new Promise(async (resolve) => {
          const moduleImport = {
            imports: {
              imported_func(arg) {
                resolve(arg);
              }
            }
          };
          const module1 = await WebAssembly.instantiate(WASM, moduleImport);
          module1.exports.exported_func();
        })
      );
    }
    if (url.pathname === "/wasm-nested") {
      return new Response(
        await new Promise(async (resolve) => {
          const moduleImport = {
            imports: {
              imported_func(arg) {
                resolve("nested" + arg);
              }
            }
          };
          const m = await WebAssembly.instantiate(nestedWasm, moduleImport);
          m.exports.exported_func();
        })
      );
    }
    if (url.pathname === "/wasm-dynamic") {
      return new Response(
        `${await (await Promise.resolve().then(() => (init_nested(), nested_exports))).loadWasm()}`
      );
    }
    if (url.pathname.startsWith("/lang")) {
      const language = url.pathname.split("/lang/")[1];
      return new Response(
        `${JSON.parse((await import(`./lang/${language}`)).default).hello}`
      );
    }
    if (url.pathname === "/txt") {
      return new Response(text);
    }
    if (url.pathname === "/bin") {
      return new Response(binData);
    }
    if (url.pathname === "/cjs") {
      return new Response(
        `CJS: ${import_say_hello4.default.sayHello("Jane Smith")} and ${johnSmith}`
      );
    }
    if (url.pathname === "/cjs-loop") {
      return new Response(`CJS: ${import_say_hello4.default.loop}`);
    }
    return new Response(`${sayHello("Jane Smith")} and ${johnSmith}`);
  }
};
export {
  src_default as default
};
//# sourceMappingURL=index.js.map
