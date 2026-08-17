(function () {
  'use strict';

  const tabs = document.querySelectorAll('.login-tabs button');
  const prompt = document.getElementById('loginPrompt');
  const form = document.getElementById('loginForm');
  const msg = document.getElementById('loginMsg');
  let role = new URLSearchParams(location.search).get('role') === 'ti' ? 'ti' : 'cliente';

  function setRole(r) {
    role = r;
    tabs.forEach((t) => {
      const active = t.dataset.role === r;
      t.classList.toggle('is-active', active);
      t.setAttribute('aria-selected', String(active));
    });
    prompt.textContent = r === 'ti' ? '> autenticar_equipe()' : '> autenticar_cliente()';
    msg.textContent = '';
    msg.className = 'form-msg';
  }
  tabs.forEach((t) => t.addEventListener('click', () => setRole(t.dataset.role)));
  setRole(role);

  let USERS = [];
  EGMPortal.fetchJSON('data/users.json').then((users) => { USERS = users; }).catch(() => {
    msg.textContent = 'Não consegui carregar os dados de login. Veja se está rodando via servidor local (não abrindo o .html direto do disco).';
    msg.className = 'form-msg is-error';
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim().toLowerCase();
    const password = document.getElementById('loginPassword').value;
    const user = USERS.find((u) => u.role === role && u.email.toLowerCase() === email && u.senha === password);

    if (!user) {
      msg.textContent = 'E-mail ou senha incorretos.';
      msg.className = 'form-msg is-error';
      return;
    }
    msg.textContent = '✓ autenticado, entrando...';
    msg.className = 'form-msg is-success';
    const target = role === 'ti' ? 'ti.html' : 'cliente.html';
    setTimeout(() => { location.href = EGMPortal.loginUrl(target, user.id); }, 350);
  });
})();
