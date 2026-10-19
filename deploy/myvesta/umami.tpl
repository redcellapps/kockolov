# Umami (visitor statistics) — myVesta/VestaCP nginx proxy template (HTTP): everything goes to https://.
server {
    listen      %ip%:%proxy_port%;
    server_name %domain_idn% %alias_idn%;

    location /.well-known/acme-challenge/ {
        proxy_pass http://%ip%:%web_port%;
    }

    location / {
        return 301 https://%domain_idn%$request_uri;
    }

    include %home%/%user%/conf/web/nginx.%domain%.conf*;
}
