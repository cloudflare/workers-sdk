# Perl hello world for Cloudflare Workers

Your Perl code in [index.pl](https://github.com/cloudflare/perl-worker-hello-world/blob/master/index.pl), running on Cloudflare Workers

In addition to [Wrangler](https://github.com/cloudflare/wrangler) you will need to install Perl 5 and [Perlito](https://github.com/fglock/Perlito), a compiler from Perl to Java and JavaScript. Clone Perlito from GitHub (last tested on commit 97c296f), don't install the older version available on CPAN.

## Setup

To create a `my-project` directory using this template, run:

```sh
$ npm init cloudflare my-project worker-perl --no-delegate-c3
# or
$ yarn create cloudflare my-project worker-perl --no-delegate-c3
# or
$ pnpm create cloudflare my-project worker-perl --no-delegate-c3
```

> **Note:** Each command invokes [`create-cloudflare`](https://www.npmjs.com/package/create-cloudflare) for project creation.


## Wrangler

Wrangler is used to develop, deploy, and configure your Worker via CLI.

Further documentation for Wrangler can be found [here](https://developers.cloudflare.com/workers/tooling/wrangler).

## Perlito

Assuming you've cloned the Perlito repo to `~/Perlito` and `perl` on your path is Perl 5, run

```sh
cd projectname
echo -e "const window = this;\n" > index.js && \
perl ~/Perlito/perlito5.pl -Cjs index.pl >> index.js
```

That will compile your code into index.js, after which you can run `wrangler deploy` to push it to Cloudflare. Prepending `const window = this` is a workaround for Perlito assuming the presence of a global window object, which doesn't exist in Workers.

For more information on how Perl translates to JavaScript, see the [Perlito docs](https://github.com/fglock/Perlito/blob/master/README-perlito5-JavaScript.md).
