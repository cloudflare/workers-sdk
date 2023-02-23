def handleRequest(request):
    return __new__(Response('Python Worker hello world!', {
        'headers' : { 'content-type' : 'text/plain' }
    }))

addEventListener('fetch', (lambda event: event.respondWith(handleRequest(event.request))))
