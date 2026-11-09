#!/usr/bin/env bash
# Instala a tela de login estilo macOS: LightDM + nody-greeter + tema "macos".
# Uso: sudo ./install.sh
set -euo pipefail

NODY_VERSION=1.6.2
NODY_SHA256=3b8b2937fa42a36ccce596363f82650fe64d4891ac22374d33a8a6dcd44290d2
NODY_URL="https://github.com/JezerM/nody-greeter/releases/download/${NODY_VERSION}/nody-greeter-${NODY_VERSION}-ubuntu.deb"

HERE=$(cd "$(dirname "$0")" && pwd)
step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

[[ $EUID -eq 0 ]] || { echo "Rode com sudo: sudo $0"; exit 1; }
TARGET_USER=${SUDO_USER:-}
[[ -n $TARGET_USER && $TARGET_USER != root ]] || { echo "Rode com sudo a partir do seu usuário (não como root direto)."; exit 1; }
TARGET_HOME=$(getent passwd "$TARGET_USER" | cut -d: -f6)

step "1/7 LightDM e nody-greeter ${NODY_VERSION}"
apt-get install -y lightdm gir1.2-lightdm-1
if [[ "$(dpkg-query -W -f='${Version}' nody-greeter 2>/dev/null || true)" != "$NODY_VERSION" ]]; then
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT
  curl -fL --progress-bar -o "$tmp/nody-greeter.deb" "$NODY_URL"
  echo "$NODY_SHA256  $tmp/nody-greeter.deb" | sha256sum -c -
  apt-get install -y "$tmp/nody-greeter.deb"
else
  echo "nody-greeter ${NODY_VERSION} já instalado."
fi

step "2/7 Tema macos"
rm -rf /usr/share/web-greeter/themes/macos
install -d /usr/share/web-greeter/themes/macos
cp -r "$HERE/theme/macos/." /usr/share/web-greeter/themes/macos/
chmod -R a+rX /usr/share/web-greeter/themes/macos

step "3/7 Configuração do nody-greeter"
if [[ -f /etc/lightdm/web-greeter.yml && ! -f /etc/lightdm/web-greeter.yml.antes-macos ]]; then
  cp -a /etc/lightdm/web-greeter.yml /etc/lightdm/web-greeter.yml.antes-macos
fi
install -m 644 "$HERE/system/web-greeter.yml" /etc/lightdm/web-greeter.yml

step "4/7 Pasta de imagens e configuração (/var/lib/macos-login, do usuário $TARGET_USER)"
install -d -o "$TARGET_USER" -g "$TARGET_USER" -m 755 /var/lib/macos-login

step "5/7 Comandos"
install -m 755 "$HERE/bin/macos-login" /usr/local/bin/macos-login
install -m 755 "$HERE/system/macos-login-display-setup" /usr/local/sbin/macos-login-display-setup
[[ -f /etc/default/macos-login ]] || install -m 644 "$HERE/system/macos-login.default" /etc/default/macos-login

step "6/7 LightDM usando o nody-greeter"
install -d /etc/lightdm/lightdm.conf.d
install -m 644 "$HERE/system/90-macos-login.conf" /etc/lightdm/lightdm.conf.d/90-macos-login.conf

step "7/7 Trocando o gerenciador de login: SLiM → LightDM"
echo "/usr/sbin/lightdm" > /etc/X11/default-display-manager
echo "lightdm shared/default-x-display-manager select lightdm" | debconf-set-selections || true
ln -sf /lib/systemd/system/lightdm.service /etc/systemd/system/display-manager.service
systemctl daemon-reload

step "Copiando o papel de parede atual para a tela de login"
sudo -u "$TARGET_USER" -H env HOME="$TARGET_HOME" /usr/local/bin/macos-login desktop \
  || echo "  (não foi possível copiar agora; use: macos-login desktop)"

cat <<EOF

Pronto! A nova tela de login aparece na próxima vez que o PC ligar.

  • Conferir antes de reiniciar:  macos-login testar
  • Configurar (imagem, nome...): macos-login --help

Se algo der errado no próximo boot (tela preta ou login que não abre):
  1. Pressione Ctrl+Alt+F3 e entre com usuário e senha no modo texto
  2. Rode:  sudo $HERE/uninstall.sh
  3. Rode:  sudo reboot      (volta para o SLiM, como antes)
EOF
