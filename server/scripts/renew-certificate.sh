#!/bin/sh
service nginx stop  # or whatever your webserver is
/usr/local/bin/letsencrypt renew -nvv --standalone --standalone-supported-challenges tls-sni-01 > /var/log/letsencrypt/renew.log 2>&1
LE_STATUS=$?
service nginx start # or whatever your webserver is
if [ "$LE_STATUS" != 0 ]; then
    echo Automated renewal failed:
    cat /var/log/letsencrypt/renew.log
    exit 1
fi
