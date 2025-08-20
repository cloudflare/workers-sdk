from workers import DurableObject, Response, WorkerEntrypoint

"""
 * Welcome to Cloudflare Workers! This is your first Durable Objects application.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your Durable Object in action
 * - Run `npm run deploy` to publish your application
 *
 * Learn more at https://developers.cloudflare.com/durable-objects
"""

"""
 * Env provides a mechanism to reference bindings declared in wrangler.jsonc within Python
 *
 * @typedef {Object} Env
 * @property {DurableObjectNamespace} MY_DURABLE_OBJECT - The Durable Object namespace binding
"""

# A Durable Object's behavior is defined in an exported Python class
class MyDurableObject(DurableObject):
    """
     * The constructor is invoked once upon creation of the Durable Object, i.e. the first call to
     * `DurableObjectStub::get` for a given identifier (no-op constructors can be omitted)
     *
     * @param {DurableObjectState} ctx - The interface for interacting with Durable Object state
     * @param {Env} env - The interface to reference bindings declared in wrangler.jsonc
    """
    def __init__(self, ctx, env):
        super().__init__(ctx, env)

    """
     * The Durable Object exposes an RPC method `say_hello` which will be invoked when when a Durable
     *  Object instance receives a request from a Worker via the same method invocation on the stub
     *
     * @param {string} name - The name provided to a Durable Object instance from a Worker
     * @returns {Promise<string>} The greeting to be sent back to the Worker
    """
    async def say_hello(self, name):
        return f"Hello, {name}!"


"""
* This is the standard fetch handler for a Cloudflare Worker
*
* @param {Request} request - The request submitted to the Worker from the client
* @param {Env} env - The interface to reference bindings declared in wrangler.jsonc
* @param {ExecutionContext} ctx - The execution context of the Worker
* @returns {Promise<Response>} The response to be sent back to the client
"""
class Default(WorkerEntrypoint):
    async def fetch(self, request):
		# Create a stub to open a communication channel with the Durable Object
		# instance named "foo".
		#
		# Requests from all Workers to the Durable Object instance named "foo"
		# will go to a single remote Durable Object instance.
        stub = self.env.MY_DURABLE_OBJECT.getByName("foo")

		# Call the `say_hello()` RPC method on the stub to invoke the method on
		# the remote Durable Object instance.
        greeting = await stub.say_hello("world")

        return Response(greeting)

