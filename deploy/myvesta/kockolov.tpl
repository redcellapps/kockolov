# Kockolov — myVesta/VestaCP nginx proxy template (HTTP).
# Copy to /usr/local/vesta/data/templates/web/nginx/ and pick "kockolov" as the
# domain's Proxy template. Everything on http:// is redirected to https://.
server {
    listen      %ip%:%proxy_port%;
    server_name %domain_idn% %alias_idn%;

    # Let's Encrypt validation (myVesta also adds its own rule through the include below)
    location /.well-known/acme-challenge/ {
        proxy_pass http://%ip%:%web_port%;
    }

    location / {
        return 301 https://%domain_idn%$request_uri;
    }

    include %home%/%user%/conf/web/nginx.%domain%.conf*;
}
