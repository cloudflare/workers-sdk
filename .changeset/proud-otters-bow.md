---
"@cloudflare/vitest-pool-workers": minor
"create-cloudflare": minor
"@cloudflare/workers-shared": minor
"miniflare": minor
"wrangler": minor
---

chore: update esbuild

This patch updates esbuild from 0.17.19 to 0.24.0. That's a big bump! Lots has gone into esbuild since May '23. All the details are available at https://github.com/evanw/esbuild/blob/main/CHANGELOG.md / https://github.com/evanw/esbuild/blob/main/CHANGELOG-2023.md.

- We now support all modern JavasScript/TypeScript features suported by esbuild (as of September 2024). New additions include standard decorators, auto-accessors, and the `using` syntax.

- 0.18 introduced wider support for configuration specified via `tsconfig.json` https://github.com/evanw/esbuild/issues/3019. After observing the (lack of) any actual broken code over the last year for this release, we feel comfortable releasing this without considering it a breaking change.

- 0.19.3 introduced support for import attributes

  ```js
  import stuff from './stuff.json' with { type: 'json' }
  ```

  While we don't currently expose the esbuild configuration for developers to add their own plugins to customise how modules with import attributes are bundled, we may introduce new "types" ourselves in the future.

- 0.19.0 introduced support for wildcard imports. Specifics here (https://github.com/evanw/esbuild/blob/main/CHANGELOG-2023.md#0190). tl;dr -

  - These 2 patterns will bundle all files that match the glob pattern into a single file.

    ```js
    const json1 = await import("./data/" + kind + ".json");
    ```

    ```js
    const json2 = await import(`./data/${kind}.json`);
    ```

  - This pattern will NOT bundle any matching patterns:
    ```js
    const path = "./data/" + kind + ".js";
    const json2 = await import(path);
    ```
    You can use `find_additional_modules` to bundle any additional modules that are not referenced in the code but are required by the project.

  Now, this MAY be a breaking change for some. Specifically, if you were previously using the pattern (that will now include all files matching the glob pattern in the bundle), BUT `find_additional_modules` was NOT configured to include some files, those files would now be included in the bundle. For example, consider this code:

  ```js
  // src/index.js
  export default {
  	async fetch() {
  		const url = new URL(request.url);
  		const name = url.pathname;
  		const value = (await import("." + name)).default;
  		return new Response(value);
  	},
  };
  ```

  Imagine if in that folder, you had these 3 files:

  ```js
  // src/one.js
  export default "one";
  ```

  ```js
  // src/two.js
  export default "two";
  ```

  ```js
  // src/hidden/secret.js
  export default "do not share this secret";
  ```

  And your `wrangler.toml` was:

  ```toml
  name = "my-worker"
  main = "src/index.js
  ```

  Before this update:

  1. A request to anything but `http://localhost:8787/` would error. For example, a request to `http://localhost:8787/one.js` would error with _No such module "one.js"._

  2. Let's configure `wrangler.toml` to include all `.js` files in the `src` folder:

  ```toml
  name = "my-worker"
  main = "src/index.js

  find_additional_modules = true
  rules = [
    { type = "ESModule", globs = ["*.js"]}
  ]
  ```

  Now, a request to `http://localhost:8787/one.js` would return the contents of `src/one.js`, but a request to `http://localhost:8787/hidden/secret.js` would error with _No such module "hidden/secret.js"._ To include this file, you could expand the `rules` array to be:

  ```toml
  rules = [
    { type = "ESModule", globs = ["**/*.js"]}
  ]
  ```

  Then, a request to `http://localhost:8787/hidden/secret.js` will return the contents of `src/hidden/secret.js`.

  After this update:

  - Let's put the wrangler.toml back to its original configuration:

  ```toml
  name = "my-worker"
  main = "src/index.js
  ```

  - Now, a request to `http://localhost:8787/one.js` will return the contents of `src/one.js`, but a request to `http://localhost:8787/hidden/secret.js` will ALSO return the contents of `src/hidden/secret.js`. THIS MAY NOT BE WHAT YOU WANT. You can "fix" this in 2 ways:

    1. Remove the inline wildcard import:

    ```js
    // src/index.js
    export default {
    	async fetch() {
    		const name = new URL(request.url).pathname;
    		const moduleName = "./" + name;
    		const value = (await import(moduleName)).default;
    		return new Response(value);
    	},
    };
    ```

    Now, no extra modules are included in the bundle, and a request to `http://localhost:8787/hidden/secret.js` will throw an error. You can use the `find_additional_modules` feature to include it again.

    2. Don't use the wildcard import pattern:

    ```js
    // src/index.js
    import one from "./one.js";
    import two from "./two.js";

    export default {
    	async fetch() {
    		const name = new URL(request.url).pathname;
    		switch (name) {
    			case "/one.js":
    				return new Response(one);
    			case "/two.js":
    				return new Response(two);
    			default:
    				return new Response("Not found", { status: 404 });
    		}
    	},
    };
    ```

    Further, there may be some files that aren't modules (js/ts/wasm/text/binary/etc) that are in the folder being included (For example, a `photo.jpg` file). This pattern will now attempt to include them in the bundle, and throw an error. It will look like this:

    `[ERROR] No loader is configured for ".png" files: src/photo.jpg`

    To fix this, simply move the offending file to a different folder.

    In general, we DO NOT recommend using the wildcard import pattern. If done wrong, it can leak files into your bundle that you don't want, or make your worker slightly slower to start. If you must use it (either with a wildcard import pattern or with `find_additional_modules`) you must be diligent to check that your worker is working as expected and that you are not leaking files into your bundle that you don't want. You can configure eslint to disallow dynamic imports like this:

    ```jsonc
    // .eslintrc.js
    {
    	"rules": {
    		"no-restricted-syntax": [
    			"error",
    			{
    				"selector": "ImportExpression[argument.type!='Literal']",
    				"message": "Dynamic imports with non-literal arguments are not allowed.",
    			},
    		],
    	},
    }
    ```
