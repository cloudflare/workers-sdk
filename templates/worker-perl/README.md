# Perl hello world for Cloudflare Workers

Your Perl code in [index.pl](https://github.com/cloudflare/perl-worker-hello-world/blob/master/index.pl), running on Cloudflare Workers

In addition to [Wrangler](https://github.com/cloudflare/wrangler) you will need to install Perl 5 and [Perlito](https://github.com/fglock/Perlito), a compiler from Perl to Java and JavaScript. Clone Perlito from GitHub (last tested on commit 97c296f), don't install the older version available on CPAN.

#### Wrangler

To generate using [wrangler](https://github.com/cloudflare/wrangler)

```
wrangler generate projectname https://github.com/cloudflare/perl-worker-hello-world
```

Further documentation for Wrangler can be found [here](https://developers.cloudflare.com/workers/tooling/wrangler).

#### Perlito

Assuming you've cloned the Perlito repo to `~/Perlito` and `perl` on your path is Perl 5, run

```
cd projectname
echo -e "const window = this;\n" > index.js && \
perl ~/Perlito/perlito5.pl -Cjs index.pl >> index.js
```

That will compile your code into index.js, after which you can run `wrangler publish` to push it to Cloudflare. Prepending `const window = this` is a workaround for Perlito assuming the presence of a global window object, which doesn't exist in Workers.

For more information on how Perl translates to JavaScript, see the [Perlito docs](https://github.com/fglock/Perlito/blob/master/README-perlito5-JavaScript.md).
