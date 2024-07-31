#!/bin/sh

#!/bin/sh
if ! which -- "${1}"; then
  # first arg is not an executable
  if [ -e /tmp/.X99-lock ]; then rm /tmp/.X99-lock -f; fi
  export DISPLAY=:99
  Xvfb "${DISPLAY}" -nolisten unix &
#  exec pnpm start:ts -- run ./data/docker.config.json "$@"
  exec node ./cli.mjs run ./data/docker.config.json "$@"
fi

exec "$@"
