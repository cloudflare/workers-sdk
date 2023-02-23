# Python hello world for Cloudflare Workers

Your Python code in [index.py](https://github.com/cloudflare/python-worker-hello-world/blob/master/index.py), running on Cloudflare Workers.

In addition to [Wrangler](https://github.com/cloudflare/wrangler2) and [npm](https://www.npmjs.com/get-npm), you will need to install [Transcrypt](https://www.transcrypt.org/docs/html/installation_use.html), including Python 3.7 and virtualenv.

#### Wrangler

- Clone repository (`git clone https://github.com/cloudflare/python-worker-hello-world`)
- Run `npm install`
- Update `wrangler.toml` with your project `name`, `account_id`, and `route` as required

Further documentation for Wrangler can be found [here](https://developers.cloudflare.com/workers/wrangler/).

#### Transcrypt

Before building your project, you'll need to do one-time setup of Transcrypt. Assuming you have Python 3.7 and virtualenv installed per the linked instructions above, that setup on unix systems looks like the following (for windows see [virtualenv docs](https://virtualenv.pypa.io/en/latest/user_guide.html#activators)):

```
cd projectname

virtualenv env

source env/bin/activate

pip install transcrypt
```

After that you can run Wrangler commands, such as `wrangler publish` to push your code to Cloudflare. If you exit virtualenv (`deactivate`) and return to the project directory later, you'll need to activate virtualenv (`source env/bin/activate`) but will not need to rerun the other installation commands.

If `python3` is not Python 3.7 on your system, make sure you install it, create the virtualenv using the right version of Python, and edit webpack.config.js under `command` to specify the correct path to the Python 3.7 executable in the virtualenv directory. If you are using Windows, see [this workaround for an issue with transcrypt-loader paths](https://github.com/QQuick/Transcrypt/issues/624#issuecomment-507866238).

For more information on how Python translates to Javascript, see the [Transcrypt docs](https://www.transcrypt.org/documentation). especially the [module mechanism](https://www.transcrypt.org/docs/html/special_facilities.html#transcrypt-s-module-mechanism) and [aliases](http://www.transcrypt.org/docs/html/special_facilities.html#pragma-alias).

Because of aliases, for a KV namespace binding named `KV` you can use `KV.put` normally, but need to use `KV.js_get` instead of `KV.get`. For example, a handler using KV might look like:

```
def handleRequest(request):
    return KV.js_get('foo').then(
        lambda v: __new__(Response('Python Worker hello world! ' + v, {
        'headers' : { 'content-type' : 'text/plain' }
    })))
```
