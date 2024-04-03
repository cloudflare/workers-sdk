# Wrangler Styleguide

The aim of this guideline is to help Wrangler contributors maintain consistent patterns throughout Wrangler and to provide end users with content that educates users on how to successfully complete tasks.

## Styleguide legend

- \*Text in between stars designates placeholder text that should be replaced.\*
- \<Text contained within angle brackets are placeholder commands, args or filepaths.\>
- #Text in between hashtags designates the user's input that must occur before the next line can display.#

## Wrangler syntax

- Commands should follow an object verb order, such as ‘d1 create’.

```sh
wrangler <object / noun> <verb>
```

- Subcommands should follow the main command with a space

```sh
wrangler <command> <subcommand> <arg> --<option>`
```

## Wrangler \<command\> --help

```sh
🧮 *Brief description of the product, the value it offers and how Wrangler can interact with it*

🔧 *Command is currently in open beta / command is experimental (if relevant)*

Commands:
  wrangler <command> <subcommand> <arg> *Description of command*

Options:
  -<o (option shorthand)>, --<option (option name)>  *Option description* [*data_type*] [default: *true/false*]


--------------------
📣 *Announcement*
📃 To learn more, visit our documentation on *Product name*: https://developers.cloudflare.com/*productname*
--------------------

```

## Create success state with binding

```sh
🌀 Creating ___ with title "___"
✨ Success. *Add details of success and what the user can now do*
📣 *Optional announcement*

To start interacting with this ___ from a Worker, *If additional steps required, such as obtaining account ID from dash, add them here* \(then\) open your Worker’s config file and add the following binding configuration:

[[array]]
binding = "<VARIABLE_NAME>"
name = "___"
id = "___"
```

## General success state

```sh
🌀 *Action verb* *Object*. *details of what is currently happening if necessary*
🚧 *Updated additional details of the current status if necessary*
✨ Success. *Add details of and what the user can now do*
📣 *Announcement*

*Description of what the next steps the user can take to be successful. If there are predictable happy paths following a success state, make those paths clear to the user here.*
```

## Command related error

```sh
✘  ERROR  *API error code if applicable*: *Concise description of what the error is*:

Error details:
*Description of what caused the error*

How to solve this error:
*Direction on how to resolve the error*

wrangler *example of full command user tried to run*

*Description of the command’s purpose*

Positionals:
  positional  *Positional description*.  [data-type] [required/optional]

Options:
  -o, --option  *Option description* [data type] [default: true/false]

If you think this is a bug then please create an issue at https://github.com/cloudflare/workers-sdk/issues/new/choose

🪵  Logs were written to <filepath>

```

## General error

```sh
✘  ERROR  *Error code if applicable*: *Concise description of what the error is*

Error details:
*description of what caused the error*

How to solve this error:
*direction on how to resolve the error*

--------------------
To learn more about ___, read our documentation at https://developers.cloudflare.com/*productname*

If you think this is a bug then please create an issue at https://github.com/cloudflare/workers-sdk/issues/new/choose
--------------------

√ Would you like to report this error to Cloudflare? <y/n>

#User inputs y or n#

🪵  Logs were written to <filepath>

```

## Y/N choice

```sh
*choice description* <y/n>
#User inputs y or n#

```

## Wrangler prompts

### Written value prompt

```sh
wrangler <command>
<prompt request>
<defaut_value>

#User enters value then presses enter#

<response detailing what task/s have been performed and with what values where applicable OR continue to next prompt>
```

### Multiple choice prompt

```sh
Wrangler <command>
<prompt request>
  ◉ <Choice 1>
  ○ <Choice 2>
  ○ <Choice 3>

  #User presses enter#

<response detailing what task/s have been performed and with what values where applicable OR continue to next prompt>
```
