/* Tela de login estilo macOS para o nody-greeter (LightDM). */
(function () {
  'use strict';

  const DIR = '/var/lib/macos-login/';
  const cfg = Object.assign({
    background: '',      // arquivo dentro de /var/lib/macos-login (ou caminho absoluto)
    blur: 0,             // desfoque do fundo em px
    dim: 0.12,           // escurecimento do fundo (0 a 0.8)
    clock24h: true,
    names: {},           // { usuario: "Nome para exibir" }
    session: '',         // sessão forçada (ex.: "cinnamon"); vazio = última usada
    scale: 80            // tamanho dos elementos, em % (50 a 150)
  }, window.MACOS_LOGIN || {});

  const isSecondary = document.body.classList.contains('secondary');
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, Number(v) || 0));

  /* ---------------- Fundo ---------------- */
  function showBackground(src) {
    const bg = $('bg');
    if (!src) { bg.classList.add('ready'); return; }
    const img = new Image();
    img.onload = () => { bg.style.backgroundImage = `url("${src}")`; bg.classList.add('ready'); };
    img.onerror = () => bg.classList.add('ready');
    img.src = src;
  }

  function setupScale() {
    document.documentElement.style.setProperty('--scale', clamp(cfg.scale, 50, 150) / 100);
  }

  function setupBackground() {
    $('dim').style.opacity = clamp(cfg.dim, 0, 0.8);
    if (cfg.blur > 0) $('bg').style.filter = `blur(${clamp(cfg.blur, 0, 80)}px)`;
    if (cfg.background) {
      showBackground(cfg.background.startsWith('/') ? cfg.background : DIR + cfg.background);
      return true;
    }
    return false;
  }

  // Sem configuração: usa a primeira imagem da pasta de fundos do greeter
  function backgroundFromDir() {
    const tu = window.theme_utils, gc = window.greeter_config;
    if (!tu || !gc) return showBackground('');
    const dir = (gc.branding && gc.branding.background_images_dir) || DIR;
    tu.dirlist(dir, true, (files) => {
      const img = (files || []).find((f) => /\.(jpe?g|png|webp)$/i.test(f));
      showBackground(img || '');
    });
  }

  /* ---------------- Relógio ---------------- */
  function tick() {
    const now = new Date();
    const date = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    $('date').textContent = date.charAt(0).toUpperCase() + date.slice(1);
    $('time').textContent = now.toLocaleTimeString('pt-BR', { hour: 'numeric', minute: '2-digit', hour12: !cfg.clock24h })
      .replace(/\s?[AP]M$/i, '');
    setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
  }

  /* ---------------- Usuário ---------------- */
  let lightdm = null;
  let users = [];
  let user = null;
  let msgTimer = 0;
  let awaitingPrompt = false;   // LightDM ainda não pediu a senha
  let pending = null;           // senha digitada antes do pedido chegar
  let busy = false;             // senha enviada, aguardando resultado
  let offline = false;          // sem serviço do LightDM (ex.: macos-login testar)

  function displayName(u) {
    return (cfg.names && cfg.names[u.username]) || u.display_name || u.username;
  }

  function initials(name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    const s = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] || '?').slice(0, 1);
    return s.toUpperCase();
  }

  function showUser(u) {
    user = u;
    const name = displayName(u);
    $('username').textContent = name;
    $('avatar-initials').textContent = initials(name);
    const img = $('avatar-img');
    img.classList.remove('ok');
    img.onload = () => img.classList.add('ok');
    img.onerror = () => img.classList.remove('ok');
    if (u.image) img.src = u.image; else img.removeAttribute('src');
    $('avatar').classList.toggle('many', users.length > 1);
  }

  function pickUser() {
    const hint = lightdm.select_user_hint;
    return users.find((x) => x.username === hint) || users.find((x) => x.logged_in) || users[0] || null;
  }

  function sessionKey() {
    const sessions = lightdm.sessions || [];
    const has = (k) => k && sessions.some((s) => s.key === k);
    if (has(cfg.session)) return cfg.session;
    if (user && has(user.session)) return user.session;
    if (has(lightdm.default_session)) return lightdm.default_session;
    if (has('cinnamon')) return 'cinnamon';
    return sessions.length ? sessions[0].key : null;
  }

  /* ---------------- Autenticação ---------------- */
  function showMessage(text, ms) {
    const m = $('message');
    m.textContent = text;
    m.classList.add('show');
    clearTimeout(msgTimer);
    if (ms) msgTimer = setTimeout(() => m.classList.remove('show'), ms);
  }

  // O campo nunca fica bloqueado: se a senha for enviada antes do LightDM pedir,
  // ela fica guardada e é respondida assim que o pedido chegar.
  function startAuth() {
    if (!user) return;
    awaitingPrompt = true;
    try {
      if (lightdm.in_authentication) lightdm.cancel_authentication();
      offline = lightdm.authenticate(user.username) === false;
    } catch (e) {
      offline = true;
    }
  }

  function setBusy(on) {
    busy = on;
    $('pass-form').classList.toggle('busy', on);
    $('password').readOnly = on;
  }

  function onPrompt(text, type) {
    awaitingPrompt = false;
    const pw = $('password');
    if (pending !== null) {               // já tinha senha esperando: responde direto
      const p = pending;
      pending = null;
      lightdm.respond(p);
      return;
    }
    pw.type = type === 1 ? 'password' : 'text';
    const t = (text || '').replace(/:\s*$/, '').trim();
    pw.placeholder = (!t || /^(password|senha)$/i.test(t)) ? 'Digite a senha' : t;
    setBusy(false);
    pw.focus();
  }

  function onComplete() {
    const form = $('pass-form');
    setBusy(false);
    pending = null;
    if (lightdm.is_authenticated) {
      document.body.classList.add('leaving');
      setTimeout(() => lightdm.start_session(sessionKey()), 800);
      return;
    }
    const pw = $('password');
    pw.value = '';
    $('pass-form').querySelector('.field').classList.remove('has-text');
    form.classList.remove('shake');
    void form.offsetWidth;            // reinicia a animação
    form.classList.add('shake');
    showMessage('Senha incorreta', 2500);
    startAuth();
  }

  function submit(e) {
    e.preventDefault();
    const pw = $('password');
    if (!pw.value || busy) return;
    if (offline) {
      showMessage('Modo de teste: não é possível entrar daqui', 3500);
      return;
    }
    setBusy(true);
    if (awaitingPrompt) { pending = pw.value; return; }
    lightdm.respond(pw.value);
  }

  /* ---------------- Energia ---------------- */
  function setupPower() {
    const can = { suspend: lightdm.can_suspend, restart: lightdm.can_restart, shutdown: lightdm.can_shutdown };
    document.querySelectorAll('.power-btn').forEach((b) => {
      const action = b.dataset.action;
      if (!can[action]) { b.classList.add('hidden'); return; }
      b.addEventListener('click', () => lightdm[action]());
    });
  }

  /* ---------------- Teclado ---------------- */
  function setupKeyboard() {
    const pw = $('password');
    const field = pw.parentElement;
    pw.addEventListener('input', () => field.classList.toggle('has-text', pw.value.length > 0));
    const caps = (e) => {
      if (e.getModifierState) $('caps').classList.toggle('on', e.getModifierState('CapsLock'));
    };
    window.addEventListener('keydown', (e) => {
      caps(e);
      if (e.key === 'Escape') { pw.value = ''; field.classList.remove('has-text'); return; }
      if (document.activeElement !== pw && e.key.length === 1) pw.focus();
    });
    window.addEventListener('keyup', caps);
    document.addEventListener('mousedown', (e) => {
      if (!e.target.closest('button')) setTimeout(() => pw.focus(), 0);
    });
    pw.focus();
  }

  /* ---------------- Início ---------------- */
  let started = false;
  function init() {
    if (started || !window.lightdm) return;
    started = true;
    lightdm = window.lightdm;

    if (!cfg.background) backgroundFromDir();

    if (isSecondary) {
      lightdm.authentication_complete.connect(() => {
        if (lightdm.is_authenticated) document.body.classList.add('leaving');
      });
      return;
    }

    users = lightdm.users || [];
    const u = pickUser();
    if (u) showUser(u);
    else showMessage('Nenhum usuário encontrado');

    $('avatar').addEventListener('click', () => {
      if (users.length < 2) return;
      showUser(users[(users.indexOf(user) + 1) % users.length]);
      startAuth();
    });

    lightdm.show_prompt.connect(onPrompt);
    lightdm.show_message.connect((text) => showMessage(text, 6000));
    lightdm.authentication_complete.connect(onComplete);
    $('pass-form').addEventListener('submit', submit);

    setupPower();
    setupKeyboard();
    startAuth();
  }

  setupScale();
  setupBackground();
  if (!isSecondary) tick();
  window.addEventListener('GreeterReady', init);
  // Garantia caso o evento já tenha sido disparado antes deste script carregar
  setTimeout(init, 1500);
})();
