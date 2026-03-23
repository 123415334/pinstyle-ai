// Open the side panel automatically when the toolbar icon is clicked.
// setPanelBehavior is the recommended MV3 approach — no onClicked listener needed.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(console.error);
