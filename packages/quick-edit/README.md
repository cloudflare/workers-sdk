# VSCode for Web

This package contains Cloudflare's fork of VSCode for Web, to support web editing of Workers. This package contains code and setup for building VSCode for Web.

The code in this package is used by the `workers-playground` package.

## Developing

Note: Currently it's not possible to run VSCode's dev server to develop patches. This is because of a limitation with the `wrangler dev` file server for Workers Assets and the number of assets that would be watched locally.

## Building

- Use Node.js 22
  - VSCode's build process requires this
- Run `pnpm install`
- Run `pnpm -F "@cloudflare/quick-edit" run setup`
  - installs dependencies
  - clones VSCode (currently v1.102.1)
  - applies the patches specified in `./patches`
  - symlinks the top level packages within `workers-sdk`
- Run `pnpm -F "@cloudflare/quick-edit" run custom:build`
  - This takes up to 15 mins to run
  - It's not `build` because it would then run when people run the top level `pnpm run build` to build other packages in the repository.

## Debugging

- Change the `quickEditHost` constant in [workers-playground/src/QuickEditor/VSCodeEditor.tsx](../workers-playground/src/QuickEditor/VSCodeEditor.tsx) to http://localhost:8787
- Run the following in parallel:
  - `pnpm -F workers-playground dev` -> `http://localhost:5173`
  - `pnpm -F "@cloudflare/quick-edit" exec wrangler dev` -> `http://localhost:8787`
- Get a user token to connect to a preview Worker
  - Navigate to https://playground-testing.devprod.cloudflare.dev/
  - This will respond with a `error code: 522` response, which is expected
  - Grab the `user` cookie from the 522 response
- Open http://localhost:5173/playground
  - Open the devtools and add the `user` cookie from the previous step to this site
  - Refresh the page and play around with the editor

## Deployment

Deployments are managed by GitHub Actions:

- deploy-pages-previews.yml:
  - Runs on any PR that has the `preview:quick-edit` label.
  - Deploys a preview, which can then be accessed via [https://<SHA>.quick-edit-cny.pages.dev/].
- changesets.yml:
  - Runs when a "Version Packages" PR, containing a changeset that touches this package, is merged to `main`.
  - Deploys this package to production, which can then be accessed via [https://quick-edit-cny.pages.dev/].

## Patching VSCode

If you need to add additional patches to VSCode, ensure you've run `pnpm run setup`. Then:

1. Make your changes in the checked out VSCode in `vendor/vscode`.
2. Commit your changes with `git commit -m "YOUR MESSAGE" --no-verify` (run this in the `vendor/vscode` directory).
3. Prepare a new series of patches for VSCode with (again, run in the `vendor/vscode` directory) `git format-patch -o ../../packages/quick-edit/patches base`.

## Modifying VSCode settings

If you need to change VSCode's configuration, open the `packages/quick-edit/src/index.ts` file.

The `WORKBENCH_WEB_CONFIGURATION` object contains VSCode's setup config, but the property `configurationDefaults` is most relevant, since it lets you set defaults for any VSCode settings. The format is exactly the same as VSCode's `settings.json` file.

## Embedding VSCode

> [!WARNING]
> Cloudflare does not officially support embedding this version of VSCode in third-party contexts—use at your own risk! This documentation is aimed at people inside Cloudflare embedding this package.

The primary purpose of the patches we apply to VSCode is to allow the visible filesystem within VSCode to be controllable from the outside (by a web page that embeds the editor). You can refer to `packages/workers-playground/src/QuickEditor/VSCodeEditor.tsx` as a reference implementation.

To communicate with VSCode, a web page needs to load the deployed editor in an iframe:

```html
<iframe
	src="https://quick-edit.devprod.cloudflare.dev?worker=$worker&theme=dark"
></iframe>
```

The `$worker` query parameter should be set to the path of the to-be-edited Worker on the virtual filesystem. The protocol used for the virtual filesystem is `cfs`, so it should look like `cfs:/my-worker-name`.

To load files into the VSCode filesystem and react to changes from within VSCode, you need to send over a `MessagePort`:

```ts
import { Channel } from "@cloudflare/workers-editor-shared";
import type {
	FromQuickEditMessage,
	ToQuickEditMessage,
	WorkerLoadedMessage,
	WrappedChannel,
} from "@cloudflare/workers-editor-shared";

const editor; // Acquire a reference to the iframe DOM element somehow. This will depend on the frontend framework in use.

const channel = Channel<ToQuickEditMessage, FromQuickEditMessage>(
	new MessageChannel()
);

editor.addEventListener("load", () => {
	editor.contentWindow.postMessage("PORT", "*", [channel.remote])
})

// When you have the initial contents of the Worker (loaded from an API, perhaps)
channel.postMessage({
	type: "WorkerLoaded",
	body: {
		// Refer to the WorkerLoaded type for details
	},
})

channel.onMessage(message => {
	// message is of type SetEntryPoint, UpdateFile, CreateFile, or DeleteFile
	// Refer to @cloudflare/workers-editor-shared for details
})

```
