chrome.runtime.onInstalled.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'GET_ACTIVE_CHATGPT_TAB') {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      const tab = tabs[0];
      const url = tab?.url || '';
      const isChatGPT = /^https:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(url);
      sendResponse({
        ok: Boolean(tab && isChatGPT),
        tabId: tab?.id ?? null,
        url
      });
    });
    return true;
  }

  if (message?.type === 'ENSURE_CONTENT_SCRIPT') {
    const tabId = Number(message.tabId);
    if (!Number.isInteger(tabId)) {
      sendResponse({ ok: false, error: '유효한 ChatGPT 탭을 찾지 못했습니다.' });
      return;
    }

    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }

      const url = tab?.url || '';
      if (!/^https:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(url)) {
        sendResponse({ ok: false, error: 'ChatGPT 탭에서만 사용할 수 있습니다.' });
        return;
      }

      chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
      }, () => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        sendResponse({ ok: true });
      });
    });
    return true;
  }
});
