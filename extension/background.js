// Dual approach for maximum compatibility across Chrome and Arc versions.

// Approach 1: setPanelBehavior (Chrome 116+ declarative)
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(console.error);

// Approach 2: explicit open on click (fires only if approach 1 didn't consume the click)
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel
    .open({ tabId: tab.id })
    .catch((err) => {
      console.error('[PinStyle] sidePanel.open failed:', err);
      // Last resort: try windowId instead of tabId
      chrome.sidePanel.open({ windowId: tab.windowId }).catch(console.error);
    });
});
