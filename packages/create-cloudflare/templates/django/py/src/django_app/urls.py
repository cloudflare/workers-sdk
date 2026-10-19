from django.http import HttpResponse
from django.urls import path


def root(request):
    return HttpResponse("Hello from Django on Cloudflare Workers!")


urlpatterns = [path("", root)]
