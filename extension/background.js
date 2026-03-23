// Explicitly open the side panel when the toolbar icon is clicked.
// More reliable than setPanelBehavior across Chrome and Arc versions.
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});
