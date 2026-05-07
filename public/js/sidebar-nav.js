document.addEventListener('DOMContentLoaded', () => {
  function handleClick(e) {
    const a = e.target.closest && e.target.closest('.sidebar-nav a');
    if (!a) return;
    e.preventDefault();
    const href = a.getAttribute('href');
    fetch(href, { credentials: 'same-origin' })
      .then(resp => {
        if (resp.url && resp.url.includes('/login')) {
          window.location = '/login';
          return null;
        }
        return resp.text();
      })
      .then(html => {
        if (!html) return;
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const newMain = doc.querySelector('.main-content');
        if (newMain) {
          const currentMain = document.querySelector('.main-content');
          if (currentMain) currentMain.innerHTML = newMain.innerHTML;
          history.pushState({ path: href }, '', href);
          document.querySelectorAll('.sidebar-nav a').forEach(el => el.classList.remove('active'));
          a.classList.add('active');
        } else {
          window.location = href;
        }
      }).catch(err => { console.error(err); window.location = href; });
  }

  document.body.addEventListener('click', handleClick);

  window.addEventListener('popstate', (e) => {
    const path = e.state && e.state.path ? e.state.path : location.pathname;
    fetch(path, { credentials: 'same-origin' }).then(r => r.text()).then(html => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const newMain = doc.querySelector('.main-content');
      if (newMain) document.querySelector('.main-content').innerHTML = newMain.innerHTML;
    }).catch(() => { window.location = path; });
  });
});
