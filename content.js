if (!globalThis.__promptSheetHelperInjected) {
  globalThis.__promptSheetHelperInjected = true;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'INSERT_PROMPT') {
    try {
      const editor = findPromptEditor();
      if (!editor) throw new Error('ChatGPT 입력란을 찾지 못했습니다. 대화 페이지를 열어주세요.');
      insertText(editor, message.prompt, message.mode || 'replace');
      
      if (message.autoSend) {
        let waitBtnCount = 0;
        const clickWhenReady = () => {
          try {
            const sendBtn = findSendButton();
            if (sendBtn && !sendBtn.disabled) {
              clickSendButton(sendBtn);
              
              // Poll for textarea clearing or generation start
              let pollCount = 0;
              const checkSent = () => {
                const text = getEditorText(editor).trim();
                if (text === '' || isGenerating() || pollCount > 60) {
                  sendResponse({ ok: true });
                } else {
                  pollCount++;
                  setTimeout(checkSent, 50);
                }
              };
              setTimeout(checkSent, 50);
            } else if (waitBtnCount < 300) { // Max 15 seconds (300 * 50ms)
              waitBtnCount++;
              setTimeout(clickWhenReady, 50);
            } else {
              sendResponse({ ok: false, error: '전송 버튼이 활성화되지 않았습니다. 이미지 업로드 시간이 초과되었습니다.' });
            }
          } catch (e) {
            sendResponse({ ok: false, error: e.message });
          }
        };
        setTimeout(clickWhenReady, 50);
      } else {
        sendResponse({ ok: true });
      }
    } catch (error) {
      sendResponse({ ok: false, error: error.message });
    }
    return true; // Keep message channel open for async response
  }

  if (message?.type === 'UPLOAD_IMAGES') {
    try {
      const input = findFileInput();
      if (!input) throw new Error('파일 업로드 입력 요소를 찾지 못했습니다. ChatGPT 페이지 UI가 변경되었을 수 있습니다.');
      const transfer = new DataTransfer();
      for (const serialized of message.files || []) {
        transfer.items.add(dataUrlToFile(serialized));
      }
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      sendResponse({ ok: true, count: transfer.files.length });
    } catch (error) {
      sendResponse({ ok: false, error: error.message });
    }
    return;
  }

  if (message?.type === 'CHECK_GENERATING') {
    sendResponse({ ok: true, generating: isGenerating() });
    return;
  }
});

function findPromptEditor() {
  const candidates = [
    'textarea[placeholder*="Message"]',
    'textarea',
    '[contenteditable="true"][role="textbox"]',
    '[contenteditable="true"]'
  ];
  for (const selector of candidates) {
    const found = [...document.querySelectorAll(selector)].find(isVisible);
    if (found) return found;
  }
  return null;
}

function findFileInput() {
  const candidates = [...document.querySelectorAll('input[type="file"]')];
  return candidates.find((input) => !input.disabled) || null;
}

function findSendButton() {
  const composer = document.querySelector('form, [data-testid="composer-background"]');
  if (!composer) return null;

  const candidates = [
    'button[data-testid="send-button"]',
    'button[aria-label*="Send"]',
    'button[aria-label*="send"]',
    'button[aria-label*="전송"]',
    'button[aria-label*="보내기"]',
    'form button[type="submit"]',
    '[data-testid="composer-background"] button:has(svg)'
  ];
  for (const selector of candidates) {
    const found = composer.querySelector(selector);
    if (found) return found;
  }

  // Fallback: Look for a button with an SVG inside the composer, excluding attachment/voice keys
  const buttons = composer.querySelectorAll('button');
  for (const btn of buttons) {
    const ariaLabel = btn.getAttribute('aria-label') || '';
    const testId = btn.getAttribute('data-testid') || '';
    if (
      testId.includes('clip') || 
      testId.includes('voice') || 
      testId.includes('attachment') ||
      ariaLabel.includes('Attach') || 
      ariaLabel.includes('voice') ||
      ariaLabel.includes('첨부') ||
      ariaLabel.includes('음성')
    ) {
      continue;
    }
    if (btn.querySelector('svg')) {
      return btn;
    }
  }
  return null;
}

function clickSendButton(btn) {
  btn.focus();
  btn.click();
}

function isGenerating() {
  const composer = document.querySelector('form, [data-testid="composer-background"]');
  if (!composer) return false;

  // 1. Check if the stop button explicitly exists in the DOM
  const stopIndicators = [
    'button[data-testid="stop-button"]',
    'button[aria-label*="Stop"]',
    'button[aria-label*="stop"]',
    'button[aria-label*="중지"]',
    'button svg rect[width="10"]',
    'button svg rect[width="12"]',
    'button svg rect[width="14"]',
    'button svg rect[width="16"]'
  ];
  for (const selector of stopIndicators) {
    const found = document.querySelector(selector);
    if (found) return true;
  }

  // 2. Check if any button has a square icon (stop button)
  const buttons = document.querySelectorAll('button');
  for (const btn of buttons) {
    if (btn.querySelector('rect')) return true;
    const svg = btn.querySelector('svg');
    if (svg) {
      if (svg.innerHTML.includes('rect') || svg.getAttribute('class')?.includes('stop')) {
        return true;
      }
    }
  }

  // 3. Check if the send button is completely absent from the DOM or disabled
  const sendBtn = findSendButton();
  if (!sendBtn || sendBtn.disabled) {
    return true;
  }

  // 4. Check for active streaming elements (specific to ChatGPT response blocks)
  const streamingIndicators = [
    '.result-streaming',
    '[class*="result-streaming"]'
  ];
  for (const selector of streamingIndicators) {
    if (document.querySelector(selector)) return true;
  }

  return false;
}

function isVisible(element) {
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
}

function insertText(editor, text, mode) {
  editor.focus();
  const current = getEditorText(editor);
  const next = mode === 'append' && current.trim() ? `${current}\n${text}` : text;

  if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value') ||
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    descriptor?.set?.call(editor, next);
  } else {
    editor.textContent = next;
  }

  editor.dispatchEvent(new InputEvent('input', {
    bubbles: true,
    inputType: 'insertText',
    data: text
  }));
  editor.dispatchEvent(new Event('change', { bubbles: true }));
}

function getEditorText(editor) {
  return editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement
    ? editor.value
    : editor.textContent || '';
}

function dataUrlToFile({ name, type, dataUrl }) {
  const [header, base64] = dataUrl.split(',');
  const mime = type || header.match(/data:(.*?);base64/)?.[1] || 'application/octet-stream';
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  return new File([bytes], name || `reference-${Date.now()}.png`, { type: mime });
}

}
