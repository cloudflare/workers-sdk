# Replace this before enabling signing, sessions, authentication, or CSRF features.
SECRET_KEY = "unused"
DEBUG = False
# Cloudflare routing validates the hostname before invoking this Worker.
ALLOWED_HOSTS = ["*"]

INSTALLED_APPS = []
MIDDLEWARE = []
ROOT_URLCONF = "django_app.urls"
TEMPLATES = []
WSGI_APPLICATION = "django_app.wsgi.application"
