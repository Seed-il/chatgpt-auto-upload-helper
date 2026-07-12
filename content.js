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
        let isClicking = false;
        const clickWhenReady = () => {
          try {
            if (isClicking) return;
            const sendBtn = findSendButton();
            if (sendBtn && !sendBtn.disabled) {
              isClicking = true;
              // 500ms settle delay to ensure React state and file attachments are fully registered
              setTimeout(() => {
                try {
                  const activeBtn = findSendButton();
                  if (activeBtn && !activeBtn.disabled) {
                    clickSendButton(activeBtn);
                    
                    // Poll for textarea clearing (confirming it was actually sent)
                    let pollCount = 0;
                    const checkSent = () => {
                      const text = getEditorText(editor).trim();
                      if (text === '') {
                        sendResponse({ ok: true });
                      } else if (pollCount > 100) { // 5 seconds timeout
                        sendResponse({ ok: false, error: '프롬프트 전송에 실패했습니다. 입력창이 비워지지 않았습니다.' });
                      } else {
                        pollCount++;
                        setTimeout(checkSent, 50);
                      }
                    };
                    setTimeout(checkSent, 50);
                  } else {
                    isClicking = false;
                    setTimeout(clickWhenReady, 50);
                  }
                } catch (e) {
                  sendResponse({ ok: false, error: e.message });
                }
              }, 500);
            } else {
              const timeoutSec = message.timeout || 60;
              const maxWaitCount = timeoutSec * 20;
              if (waitBtnCount < maxWaitCount) {
                waitBtnCount++;
                setTimeout(clickWhenReady, 50);
              } else {
                sendResponse({ ok: false, error: `전송 버튼이 활성화되지 않았습니다. 이미지 업로드 시간이 초과되었습니다 (${timeoutSec}초).` });
              }
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

  if (message?.type === 'CHECK_EDITOR_EMPTY') {
    try {
      const editor = findPromptEditor();
      if (!editor) {
        sendResponse({ ok: true, empty: true });
      } else {
        const text = getEditorText(editor).trim();
        sendResponse({ ok: true, empty: text === '' });
      }
    } catch (error) {
      sendResponse({ ok: false, error: error.message });
    }
    return;
  }
});

function isActualEditor(el) {
  const style = window.getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  if (style.display === 'none' || style.visibility === 'hidden') {
    return false;
  }
  if (style.opacity === '0' || rect.width <= 5 || rect.height <= 5) {
    return false;
  }
  return true;
}

function findPromptEditor() {
  const composer = document.querySelector('form, [data-testid="composer-background"]');
  if (!composer) return null;

  const candidates = [
    '#prompt-textarea',
    'textarea',
    '[contenteditable="true"][role="textbox"]',
    '[contenteditable="true"]'
  ];
  for (const selector of candidates) {
    const found = [...composer.querySelectorAll(selector)].find(isActualEditor);
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
    'form button[type="submit"]'
  ];
  for (const selector of candidates) {
    const found = composer.querySelector(selector);
    if (found) {
      const label = found.getAttribute('aria-label') || '';
      const testId = found.getAttribute('data-testid') || '';
      const isExcluded = 
        testId.includes('stop') || testId.includes('speech') || testId.includes('voice') || testId.includes('audio') ||
        label.includes('Stop') || label.includes('중지') || label.includes('음성') || label.includes('Read') || label.includes('read');
      if (!isExcluded) {
        return found;
      }
    }
  }
  return null;
}

function clickSendButton(btn) {
  btn.focus();
  // Create a realistic mouse click event that bubbles up to React's delegated listeners
  const clickEvent = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    view: window
  });
  btn.dispatchEvent(clickEvent);
}

function isGenerating() {
  const composer = document.querySelector('form, [data-testid="composer-background"]');
  if (!composer) return false;

  const editor = findPromptEditor();
  if (!editor) {
    // If composer exists but no editor is found inside, assume transition/loading state
    return true;
  }

  // 0. Check if the message input textarea is disabled (Universal indicator of generation/busy state)
  if (editor.disabled || editor.hasAttribute('disabled')) {
    return true;
  }

  // 1. Check if the stop button explicitly exists inside the composer
  const stopIndicators = [
    'button[data-testid="stop-button"]',
    'button[aria-label*="Stop"]',
    'button[aria-label*="stop"]',
    'button[aria-label*="중지"]',
    'button[aria-label*="중단"]',
    'button[aria-label*="멈춤"]'
  ];
  for (const selector of stopIndicators) {
    const found = composer.querySelector(selector);
    if (found) return true;
  }

  // 1.5. Scoped check for stop buttons containing square rects inside the composer
  const buttons = composer.querySelectorAll('button');
  for (const btn of buttons) {
    const rect = btn.querySelector('rect');
    if (rect) {
      const w = parseFloat(rect.getAttribute('width') || '0');
      const h = parseFloat(rect.getAttribute('height') || '0');
      // A stop button icon is a solid square (e.g. 10x10, 12x12, 16x16)
      if (w >= 6 && w <= 24 && Math.abs(w - h) < 2) {
        return true;
      }
    }
    const svg = btn.querySelector('svg');
    if (svg && svg.getAttribute('class')?.includes('stop')) {
      return true;
    }
  }

  // 2. Check if the send button is completely absent from the DOM, or disabled while the editor has text
  const editorText = getEditorText(editor).trim();
  if (editorText !== '') {
    const sendBtn = findSendButton();
    if (!sendBtn || sendBtn.disabled) {
      return true;
    }
  }

  // 3. Check for active streaming elements (specific to ChatGPT response blocks)
  const streamingIndicators = [
    '.result-streaming',
    '[class*="result-streaming"]'
  ];
  for (const selector of streamingIndicators) {
    if (document.querySelector(selector)) return true;
  }

  // 4. Check for DALL-E / Image Generation loading states inside the latest assistant response
  const assistantMessages = document.querySelectorAll('[data-message-author-role="assistant"], .agent-turn');
  if (assistantMessages.length > 0) {
    const lastMsg = assistantMessages[assistantMessages.length - 1];
    
    // Check if DALL-E was invoked or image block is present
    const hasDalle = lastMsg.textContent.includes('DALL·E') || 
                     lastMsg.textContent.includes('DALL-E') || 
                     lastMsg.querySelector('[class*="dalle"]') ||
                     lastMsg.querySelector('[data-testid*="dalle"]');
                     
    if (hasDalle) {
      // Look for active loading animation classes or elements (pulse animations, spinners, loading indicators)
      const hasLoader = !!(
        lastMsg.querySelector('.animate-pulse') ||
        lastMsg.querySelector('[class*="loading"]') ||
        lastMsg.querySelector('[class*="spinner"]') ||
        lastMsg.querySelector('svg[class*="animate-spin"]') ||
        lastMsg.querySelector('[role="status"]') ||
        lastMsg.querySelector('[aria-busy="true"]')
      );
      if (hasLoader) {
        return true;
      }

      // Check if there are any image elements inside the message block
      const imgs = lastMsg.querySelectorAll('img');
      let foundLargeImg = false;
      if (imgs.length > 0) {
        for (const img of imgs) {
          // Skip small avatars/icons by checking their layout size
          const rect = img.getBoundingClientRect();
          const isLarge = rect.width > 40 || rect.height > 40 || img.naturalWidth > 40;
          if (isLarge) {
            foundLargeImg = true;
            // If the generated image is not yet fully loaded or has a width of 0, it is still rendering
            if (!img.complete || img.naturalWidth === 0) {
              return true;
            }
          }
        }
      }
      
      // If DALL-E was triggered but we haven't found any large generated images yet,
      // it means it's still in the early generation or placeholder phase.
      if (!foundLargeImg) {
        return true;
      }
    }
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

  if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
    const current = editor.value;
    const next = mode === 'append' && current.trim() ? `${current}\n${text}` : text;
    const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value') ||
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    descriptor?.set?.call(editor, next);
    editor.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: 'insertText',
      data: text
    }));
  } else {
    // For contenteditable div: select all contents and insert via execCommand to update React state
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    selection.removeAllRanges();
    selection.addRange(range);
    
    if (mode === 'append') {
      const current = editor.textContent || '';
      const next = current.trim() ? `${current}\n${text}` : text;
      document.execCommand('insertText', false, next);
    } else {
      document.execCommand('insertText', false, text);
    }
  }

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
