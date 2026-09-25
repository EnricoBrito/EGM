(function () {
  'use strict';

  const ROOT = document.body.dataset.root || '';

  Promise.all([
    fetch(ROOT + 'data/company.json').then((r) => r.json()),
    fetch(ROOT + 'data/timeline.json').then((r) => r.json())
  ])
    .then(([company, timeline]) => {
      document.getElementById('statProducao').textContent = company.prazoProducao;
      document.getElementById('statImplantacao').textContent = company.prazoImplantacao;
      document.getElementById('statModo').textContent = company.modoTrabalho;

      const list = document.getElementById('docProcess');
      list.innerHTML = timeline.map((s) => `
        <li>
          <span class="doc-process__num">${s.step}</span>
          <div class="doc-process__body">
            <h3>${s.title}</h3>
            <p>${s.text}</p>
          </div>
        </li>`).join('');
    })
    .catch((err) => {
      console.error('EGM: falha ao carregar dados da documentação.', err);
      const list = document.getElementById('docProcess');
      if (list) list.innerHTML = '<li><div class="doc-process__body"><p>Não foi possível carregar os dados. Se você abriu este arquivo direto do disco, rode um servidor local (ex: <code>python -m http.server</code>).</p></div></li>';
    });
})();
