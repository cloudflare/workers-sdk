# Wrangler Styleguide

The aim of this guideline is to assist all of Wrangler's contributors with guidelines on building consistently throughout Wrangler and to provide end users with the best chance for success.
<code style="color : orange">text</code>


## Styleguide legen

- Italicized text is placeholder text that should be replaced.
- \<Text contained within angle brackets are placeholder commands or filepaths.\>
- <code style="color : orange">Bold, yellow text designated the user's input that must occur before the next line can display.</code>

## Wrangler syntax

- Commands should follow an object verb order, such as ‘d1 create’.
```sh
wrangler <object / noun> <verb>
```

- Subcommands should follow the main command with a space
```sh
wrangler \<command\> \<subcommand\> \<arg\> --*option*`
```


## Wrangler command -help

```sh
🧮 *Brief description of the product, the value it offers and how Wrangler can interact with it*

🔧 *Command is currently in open beta / command is experimental*

Commands:
  wrangler \<command\> \<subcommand\> \<arg\> *description of command*

Options:
  -o, --option  *option description* \[data_type\] \[default: true/false\]


--------------------
📣 *announcement*
📃 To learn more, visit our documentation on *product name*: https://developers.cloudflare.com/*product name*
--------------------

```

## Wrangler <command> create success state ::

```sh
🌀 Creating ___ with title "___"
✨ Success. *add details of success and what the user can now do*
📣 *Optional announcement*

To start interacting with this ___ from a Worker, *if additional steps required, such as obtaining account ID from dash, add them here* \(then\) open your Worker’s config file and add the following binding configuration:

\[\[array\]\]
binding = "<VARIABLE_NAME>"
name = "___"
id = "___"
```


## Wrangler command general success state
```sh
🌀 *action verb* *object*. *details of what is currently happening if necessary*
🚧 *Updated additional details of the current status if necessary*
✨ Success. *add details of and what the user can now do*
📣 *announcement*

*Description of what the next steps the user can take to be successful. If there are predictable happy paths following a success state, make those paths clear to the user here.*
```

## Wrangler <command-related-error>
```sh
✘  ERROR  *API error code if applicable*: *concise description of what the error is*:

Error details:
*Description of what caused the error*

How to solve this error:
<direction on how to resolve the error>
wrangler <example of full command user tried to run>

*description of the command’s purpose*

Positionals:
  positional  <positional description>.  \[data-type\] \[required/optional\]

Options:
  -o, --option  *option description* \[data type\] \[default: true/false\]

If you think this is a bug then please create an issue at https://github.com/cloudflare/workers-sdk/issues/new/choose

🪵  Logs were written to \<filepath\>

```


## Wrangler <general-error>
```sh
✘  ERROR  *error code if applicable*: *concise description of what the error is*

Error details:
*description of what caused the error*

How to solve this error:
*direction on how to resolve the error*

--------------------
To learn more about ___, read our documentation at https://developers.cloudflare.com/*product name*

If you think this is a bug then please create an issue at https://github.com/cloudflare/workers-sdk/issues/new/choose
--------------------

√ Would you like to report this error to Cloudflare? \<y/n\>

*User inputs y or n*

🪵  Logs were written to \<filepath\>

```

## Wrangler Y/N choice
```sh
*choice description* \<y/n\>
<code style="color : purple">**User inputs y or n**</code>

```