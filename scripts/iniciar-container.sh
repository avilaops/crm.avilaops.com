#!/bin/sh
# Ponto de entrada da imagem de produção. Roda como o usuário node, nunca como
# root.
#
# Antes de subir, confere se as pastas onde a aplicação grava pertencem a quem
# roda o processo. Os volumes que já estão em produção foram gravados quando o
# container rodava como root. Sem esta conferência, o CRM subiria, passaria na
# verificação de saúde (que só olha o banco) e falharia em cada anexo do
# WhatsApp e em cada imagem de newsletter. Com ela, o container não sobe, a
# saúde reprova, o despachante volta a versão anterior e o motivo fica no log.
set -eu

for dir in "${MEDIA_DIR:-/app/storage/media}" "${NEWSLETTER_STORAGE_PATH:-/app/storage/newsletter}"; do
  if ! mkdir -p "$dir" 2>/dev/null; then
    echo "Não consigo criar $dir como $(id -un)." >&2
    exit 1
  fi
  alheio=$(find "$dir" ! -user "$(id -u)" | head -n 1)
  if [ -n "$alheio" ]; then
    echo "$alheio pertence a outro usuário, e o CRM roda como $(id -un) ($(id -u):$(id -g))." >&2
    echo "Acerte uma vez no servidor, no volume dessa pasta: chown -R $(id -u):$(id -g)" >&2
    exit 1
  fi
done

exec "$@"
