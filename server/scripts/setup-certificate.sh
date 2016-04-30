#!/bin/sh
service nginx stop  # or whatever your webserver is
/usr/local/bin/letsencrypt certonly -nvv -d erquy.vejja.fr --standalone --standalone-supported-challenges tls-sni-01 > /var/log/letsencrypt/setup.log 2>&1
LE_STATUS=$?
service nginx start # or whatever your webserver is
if [ "$LE_STATUS" != 0 ]; then
    echo Setup failed:
    cat /var/log/letsencrypt/setup.log
    exit 1
fi
