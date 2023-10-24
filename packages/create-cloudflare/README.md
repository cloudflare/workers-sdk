# create-cloudflare

A CLI for creating and deploying new applications to [Cloudflare](https://developers.cloudflare.com/).

## Usage

### Setup via Interactive CLI

To create new applications via interactive CLI, run:

```bash
npm create cloudflare@latest
# or
pnpm create cloudflare@latest
# or
yarn create cloudflare
```

### Setup via CLI Arguments

#### New Websites or Web applications via Frameworks

To create a new website or web framework without interaction, run:

```bash
npm create cloudflare@latest -- --type webFramework --framework <frameworkName>
# or
pnpm create cloudflare@latest ...
# or
yarn create cloudflare ...
```

Currently supported framework options: `angular`, `astro`, `docusaurus`, `gatsby`, `hono`, `next`, `nuxt`, `qwik`, `react`, `remix`, `solid`, `svelte`, `vue`.

#### New Workers via Templates

To create a new Javascript "Hello World" worker, run:

```bash
npm create cloudflare@latest hello-world -- --type hello-world --no-ts
```

To create a new Typescript "Hello World" worker, run:

```bash
npm create cloudflare@latest hello-world -- --type hello-world --ts
```

Current template options are: `hello-world`, `common`, `chatgptPlugin`, or `openapi`.

#### Additional arguments

|               |                                                                         |
| ------------- | :---------------------------------------------------------------------: |
| `--deploy`    | deploy your application automatically, bypassing the interactive prompt |
| `--no-deploy` |   create and scaffold a new application and bypass deployment prompt    |

### Community

- Join us [on Discord](https://discord.cloudflare.com)
- File an issue [on Github](https://github.com/cloudflare/workers-sdk/issues/new/choose)
