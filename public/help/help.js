// Mounts the in-app help center (help-navigator) with the game's help corpus.
// Loaded after /vendor/help-navigator/index.global.js (the IIFE build, which
// exposes the HelpNavigatorKit global) and help/content.js.
(function () {
  if (!globalThis.HelpNavigatorKit || !globalThis.BG_HELP_CONTENT) return;

  globalThis.HelpNavigatorKit.HelpNavigator.init({
    content: globalThis.BG_HELP_CONTENT,
    theme: 'dark',
    accentColor: '#e0a353', // matches --accent in style.css
    position: 'bottom-right',
    hotkey: 'F1', // the game itself binds no keys, so F1 is free
    texts: {
      panelTitle: 'Backgammon 3D Help',
      launcherLabel: 'Open game help',
      searchPlaceholder: 'Search rules, controls…',
    },
  });
})();
