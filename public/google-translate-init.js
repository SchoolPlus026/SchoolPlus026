window.googleTranslateElementInit = function() {
  if (window.google && window.google.translate) {
    new window.google.translate.TranslateElement({pageLanguage: 'en', autoDisplay: false}, 'google_translate_element');
  }
};
