SECRET_KEY = ""
DEBUG = False
# Cloudflare routing validates the hostname before invoking this Worker.
ALLOWED_HOSTS = ["*"]

INSTALLED_APPS = []
MIDDLEWARE = []
ROOT_URLCONF = "django_app.urls"
TEMPLATES = []
WSGI_APPLICATION = "django_app.wsgi.application"
