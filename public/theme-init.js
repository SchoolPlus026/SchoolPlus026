(function() {
  const theme = localStorage.getItem('sp_theme') || 'light';
  document.documentElement.setAttribute('data-theme', theme);
  if (theme === 'light') {
    document.documentElement.classList.add('light');
    document.documentElement.classList.remove('dark');
  } else {
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('light');
  }
})();
