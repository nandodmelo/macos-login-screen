/*
 * Simulação do LightDM para pré-visualizar o tema num navegador comum.
 * Dentro do nody-greeter o objeto real já existe e este arquivo não faz nada.
 *
 * Parâmetros de URL (só na pré-visualização):
 *   ?bg=/caminho/imagem.jpg   fundo a usar
 *   &typed=1                  simula senha digitada
 *   &wrong=1                  simula senha incorreta
 *   Senha aceita na simulação: "teste"
 */
(function () {
  'use strict';
  if (window._ready_event !== undefined || window.lightdm) return;
  console.warn('[macos-login] Rodando com mock.js (fora do LightDM).');

  const params = new URLSearchParams(location.search);
  if (params.get('bg')) window.MACOS_LOGIN = Object.assign({}, window.MACOS_LOGIN, { background: params.get('bg') });
  if (params.get('scale')) window.MACOS_LOGIN = Object.assign({}, window.MACOS_LOGIN, { scale: Number(params.get('scale')) });

  class Signal {
    constructor() { this._cbs = []; }
    connect(cb) { this._cbs.push(cb); }
    disconnect(cb) { this._cbs = this._cbs.filter((c) => c !== cb); }
    _emit(...a) { this._cbs.forEach((c) => c(...a)); }
  }

  const lightdm = {
    users: [{ username: 'fernando', display_name: 'fernando', image: '', session: 'cinnamon', logged_in: false }],
    sessions: [{ key: 'cinnamon', name: 'Cinnamon' }, { key: 'cinnamon2d', name: 'Cinnamon (Software)' }],
    default_session: 'cinnamon',
    select_user_hint: 'fernando',
    can_suspend: true, can_restart: true, can_shutdown: true,
    in_authentication: false,
    is_authenticated: false,
    show_prompt: new Signal(),
    show_message: new Signal(),
    authentication_complete: new Signal(),
    authenticate(u) {
      if (params.get('offline')) return false;          // simula "sem serviço do LightDM"
      this.in_authentication = true;
      const delay = params.get('slowprompt') ? 2000 : 60; // simula pedido de senha atrasado
      setTimeout(() => this.show_prompt._emit('Senha: ', 1), delay);
      return true;
    },
    cancel_authentication() { this.in_authentication = false; },
    respond(p) {
      setTimeout(() => {
        this.is_authenticated = p === 'teste';
        this.in_authentication = false;
        this.authentication_complete._emit();
      }, 500);
    },
    start_session(k) { console.log('[mock] start_session', k); },
    suspend() { console.log('[mock] suspend'); },
    restart() { console.log('[mock] restart'); },
    shutdown() { console.log('[mock] shutdown'); }
  };

  window.lightdm = lightdm;
  window.greeter_config = { branding: { background_images_dir: '/var/lib/macos-login' }, greeter: {} };
  window.theme_utils = { dirlist: (path, only, cb) => cb([]) };
  window._ready_event = new Event('GreeterReady');

  window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      window.dispatchEvent(window._ready_event);
      setTimeout(() => {
        const pw = document.getElementById('password');
        if (!pw) return;
        if (params.get('typed') || params.get('wrong')) {
          pw.value = 'senha123';
          pw.dispatchEvent(new Event('input'));
        }
        if (params.get('wrong')) document.getElementById('submit').click();
        if (params.get('pass')) {                       // digita e envia (testes automáticos)
          pw.value = params.get('pass');
          pw.dispatchEvent(new Event('input'));
          document.getElementById('submit').click();
        }
      }, 200);
    }, 5);
  });
})();
