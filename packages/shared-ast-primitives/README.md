# `@cloudflare/shared-ast-primitives`

Internal AST-manipulation primitives shared across Cloudflare Workers SDK codemods.

This package wraps [`recast`](https://github.com/benjamn/recast) with a small set of
helpers (`parseJs`, `parseTs`, `parseFile`, `transformFile`, `mergeObjectProperties`)
used by C3 and autoconfig to transform user project files. It is private and not published.

## Developing

Writing codemods often requires trial and error. The package ships a dedicated dev workflow so you can iterate on transforms in isolation without writing throw-away scripts.

### Commands

| Command         | Description                                                |
| --------------- | ---------------------------------------------------------- |
| `pnpm dev`      | Run `src/dev.ts` in watch mode (hot-reloads on every save) |
| `pnpm dev:once` | Run `src/dev.ts` once without watching                     |

### Workflow

1. **Edit `dev-snippets/test.ts`** — put whatever source code you want to transform into this file. It is the default input used by the dev script. You can add more files under `dev-snippets/` and reference them from `src/dev.ts`.

2. **Edit `testCodemod()` in `src/dev.ts`** — this is your sandbox. Call `testTransform()` with the path to your snippet and a [`recast` visitor](https://github.com/benjamn/recast) that describes the transform:

   ```ts
   const testCodemod = () => {
   	testTransform("../dev-snippets/test.ts", {
   		visitIdentifier(n) {
   			n.node.name = "MyNewName";
   			return false;
   		},
   	});
   };
   ```

3. **Run `pnpm dev`** — the transformed code is printed to the console and written to `dev-snippets-outputs/test.ts` (gitignored). Inspect the output file to verify the transform behaves as expected.

### `testTransform(filePath, methods)`

Mirrors the production `transformFile()` API but instead of silently writing in place it:

- Prints the transformed source to the console
- Writes the result to the corresponding path under `dev-snippets-outputs/`

The `filePath` argument must point to a file inside `dev-snippets/`; paths outside that directory are rejected.
