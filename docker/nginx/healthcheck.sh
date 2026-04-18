#!/bin/sh
# Verify nginx process is running and admin panel API is reachable

if ! pidof nginx >/dev/null 2>&1; then
    echo "UNHEALTHY: nginx process not running"
    exit 1
fi

RESPONSE=$(curl --silent --max-time 5 --fail http://127.0.0.1:81/api/ 2>/dev/null)
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
    echo "UNHEALTHY: backend API unreachable (curl exit $EXIT_CODE)"
    exit 1
fi

OK=$(echo "$RESPONSE" | jq --raw-output --max-time 3 '.status' 2>/dev/null)

if [ "$OK" = "OK" ]; then
    echo "OK"
    exit 0
else
    echo "UNHEALTHY: API returned unexpected response"
    exit 1
fi
