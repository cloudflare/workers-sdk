# @cloudflare/codemod

Internal codemod utilities for the Cloudflare Workers SDK.

## Developing Codemods

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

### Key Files

| File                    | Purpose                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| `src/dev.ts`            | Dev entry point; exports `testTransform()` and contains the editable `testCodemod()` sandbox |
| `dev-snippets/test.ts`  | Default sample input — replace its contents freely                                           |
| `dev-snippets-outputs/` | Auto-generated transform output, gitignored — safe to inspect, never committed               |

### `testTransform(filePath, methods)`

Mirrors the production `transformFile()` API but instead of silently writing in place it:

- Prints the transformed source to the console
- Writes the result to the corresponding path under `dev-snippets-outputs/`

The `filePath` argument must point to a file inside `dev-snippets/`; paths outside that directory are rejected.

### Inspecting the AST

`src/dev.ts` includes a commented-out `_printSnippet()` helper. Uncomment its call at the bottom of the file to log the AST of an arbitrary snippet to the console — useful when you need to know the exact node shape to target in a visitor:

```ts
const _printSnippet = () => {
	const snippet = `if (true) { console.log("potato"); }`;
	const program = parseTs(snippet).program;
	console.log(program.body[0]);
};
_printSnippet(); // uncomment to run
```
