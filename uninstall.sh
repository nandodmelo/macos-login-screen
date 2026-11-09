#!/usr/bin/env bash
# Volta para a tela de login anterior (SLiM) e remove o tema macos.
# Uso: sudo ./uninstall.sh            (mantém o nody-greeter e suas imagens)
#      sudo ./uninstall.sh --purge    (remove tudo, inclusive o nody-greeter)
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "Rode com sudo: sudo $0"; exit 1; }
PURGE=${1:-}
step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

step "Voltando o gerenciador de login para o SLiM"
if [[ -x /usr/bin/slim && -f /lib/systemd/system/slim.service ]]; then
  echo "/usr/bin/slim" > /etc/X11/default-display-manager
  echo "slim shared/default-x-display-manager select slim" | debconf-set-selections || true
  ln -sf /lib/systemd/system/slim.service /etc/systemd/system/display-manager.service
else
  echo "SLiM não encontrado; o LightDM continua, mas com o login padrão do Mint (slick-greeter)."
fi
systemctl daemon-reload

step "Removendo a configuração do LightDM"
rm -f /etc/lightdm/lightdm.conf.d/90-macos-login.conf
if [[ -f /etc/lightdm/web-greeter.yml.antes-macos ]]; then
  mv -f /etc/lightdm/web-greeter.yml.antes-macos /etc/lightdm/web-greeter.yml
fi

step "Removendo o tema e o script de monitores"
rm -rf /usr/share/web-greeter/themes/macos
rm -f /usr/local/sbin/macos-login-display-setup

if [[ $PURGE == --purge ]]; then
  step "Removendo nody-greeter, comando e imagens"
  apt-get remove -y nody-greeter || true
  rm -f /usr/local/bin/macos-login /etc/default/macos-login
  rm -rf /var/lib/macos-login
  if [[ -n ${SUDO_USER:-} ]]; then
    home=$(getent passwd "$SUDO_USER" | cut -d: -f6)
    rm -f "$home/.config/autostart/macos-login-sync.desktop"
  fi
  pkill -f "macos-login watch" 2>/dev/null || true
fi

echo
echo "Pronto. Reinicie para voltar à tela de login anterior: sudo reboot"
