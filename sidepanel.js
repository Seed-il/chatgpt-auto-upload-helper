const DEFAULT_SETTINGS = {
  aspectRatio: '16:9',
  commonPrompt: '',
  includeReferenceRule: true,
  includeAspectRule: true,
  includeCommonPrompt: true,
  autoSendPrompt: false,
  userLanguage: ''
};

// Supabase Configuration - Fill in your Supabase project details here
const SUPABASE_URL = 'https://ojzgyqcsbzkgxmmmmvam.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qemd5cWNzYnprZ3htbW1tdmFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzNDE2NTYsImV4cCI6MjA5ODkxNzY1Nn0.2B-LYUFYysF9bN3lni3iJRfmgeAcIeQcXsRVIFQqd_Q';
// Lemon Squeezy Store URL - Replace with your actual checkout link
const LEMON_SQUEEZY_URL = 'https://yourstore.lemonsqueezy.com/checkout/buy/productId?embed=1';
const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const state = {
  files: [],
  prompts: [],
  settings: { ...DEFAULT_SETTINGS },
  isPro: false,
  user: null
};

const pipelineState = {
  running: false,
  currentIndex: 0,
  tabId: null,
  abort: false
};

let currentLocaleData = null;

const $ = (selector) => document.querySelector(selector);
const imageInput = $('#imageInput');
const imagePreview = $('#imagePreview');
const imageCount = $('#imageCount');
const promptInput = $('#promptInput');
const promptCards = $('#promptCards');
const promptCount = $('#promptCount');
const statusText = $('#statusText');
const aspectRatio = $('#aspectRatio');
const commonPrompt = $('#commonPrompt');
const includeReferenceRule = $('#includeReferenceRule');
const includeAspectRule = $('#includeAspectRule');
const includeCommonPrompt = $('#includeCommonPrompt');
const settingsPreview = $('#settingsPreview');
const autoSendPrompt = $('#autoSendPrompt');
const langSelect = $('#langSelect');

init();

async function init() {
  const saved = await chrome.storage.local.get(['prompts', 'settings', 'isPro', 'user']);
  if (saved.settings && typeof saved.settings === 'object') {
    state.settings = { ...DEFAULT_SETTINGS, ...saved.settings };
  }
  state.isPro = saved.isPro || false;
  state.user = saved.user || null;

  // Determine active language
  let lang = state.settings.userLanguage;
  if (!lang) {
    const uiLang = chrome.i18n.getUILanguage() || 'en';
    lang = uiLang.startsWith('ko') ? 'ko' : 'en';
  }

  await loadLocale(lang);
  localizeUI();
  langSelect.value = lang;

  if (Array.isArray(saved.prompts)) {
    state.prompts = saved.prompts;
    promptInput.value = saved.prompts.join('\n');
    renderPromptCards();
  }
  
  hydrateSettingsUI();
  bindEvents();
  updateSettingsPreview();

  // Render auth state
  if (state.user) {
    $('#loginScreen').style.display = 'none';
    $('.app-shell').style.display = 'block';
    updateUserProfileUI();
  } else {
    $('#loginScreen').style.display = 'flex';
    $('.app-shell').style.display = 'none';
  }
}

async function loadLocale(lang) {
  try {
    const url = chrome.runtime.getURL(`_locales/${lang}/messages.json`);
    const response = await fetch(url);
    currentLocaleData = await response.json();
    state.settings.userLanguage = lang;
  } catch (e) {
    console.error('Failed to load locale:', lang, e);
    if (lang !== 'en') {
      await loadLocale('en');
    }
  }
}

function getTranslation(key, placeholders = []) {
  if (currentLocaleData && currentLocaleData[key]) {
    let msg = currentLocaleData[key].message;
    placeholders.forEach((placeholder, index) => {
      msg = msg.replace(`$${index + 1}`, placeholder);
    });
    return msg;
  }
  return chrome.i18n.getMessage(key, placeholders) || key;
}

async function changeLanguage(lang) {
  await loadLocale(lang);
  localizeUI();
  updateSettingsPreview();
  renderPromptCards();
  await renderImages();
  
  state.settings.userLanguage = lang;
  await chrome.storage.local.set({ settings: state.settings });
  
  setStatus(getTranslation('statusDefault'), '');
}

function localizeUI() {
  document.documentElement.lang = state.settings.userLanguage || 'en';

  document.querySelectorAll('[data-i18n]').forEach((element) => {
    const key = element.getAttribute('data-i18n');
    const message = getTranslation(key);
    if (message) {
      element.textContent = message;
    }
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
    const key = element.getAttribute('data-i18n-placeholder');
    const message = getTranslation(key);
    if (message) {
      element.placeholder = message;
    }
  });

  document.querySelectorAll('[data-i18n-title]').forEach((element) => {
    const key = element.getAttribute('data-i18n-title');
    const message = getTranslation(key);
    if (message) {
      element.title = message;
    }
  });

  updateUserProfileUI();
}

function bindEvents() {
  imageInput.addEventListener('change', async (event) => {
    const incoming = [...event.target.files].filter((file) => file.type.startsWith('image/'));
    state.files.push(...incoming);
    await renderImages();
    imageInput.value = '';
  });

  $('#clearImagesButton').addEventListener('click', async () => {
    state.files = [];
    await renderImages();
    setStatus(getTranslation('statusClearImages'), 'success');
  });

  $('#uploadImagesButton').addEventListener('click', uploadImagesToChatGPT);
  $('#buildCardsButton').addEventListener('click', buildPromptCards);
  $('#runSequenceButton').addEventListener('click', togglePipeline);
  $('#savePromptsButton').addEventListener('click', savePrompts);
  $('#clearPromptsButton').addEventListener('click', async () => {
    state.prompts = [];
    promptInput.value = '';
    renderPromptCards();
    await chrome.storage.local.remove('prompts');
    setStatus(getTranslation('statusClearPrompts'), 'success');
  });

  langSelect.addEventListener('change', async (event) => {
    await changeLanguage(event.target.value);
  });

  [aspectRatio, commonPrompt, includeReferenceRule, includeAspectRule, includeCommonPrompt, autoSendPrompt].forEach((element) => {
    element.addEventListener('input', saveSettingsFromUI);
    element.addEventListener('change', saveSettingsFromUI);
  });

  // Auth and Bypass buttons
  $('#googleSignInButton').addEventListener('click', handleGoogleSignIn);
  $('#debugBypassButton').addEventListener('click', handleDebugBypass);
  $('#signOutButton').addEventListener('click', logoutUser);

  // Upgrade button
  const upgradeBtn = $('#upgradeButton');
  if (upgradeBtn) {
    upgradeBtn.addEventListener('click', () => {
      window.open(LEMON_SQUEEZY_URL, '_blank');
    });
  }
}

function hydrateSettingsUI() {
  aspectRatio.value = state.settings.aspectRatio;
  commonPrompt.value = state.settings.commonPrompt;
  includeReferenceRule.checked = state.settings.includeReferenceRule;
  includeAspectRule.checked = state.settings.includeAspectRule;
  includeCommonPrompt.checked = state.settings.includeCommonPrompt;
  autoSendPrompt.checked = state.settings.autoSendPrompt;
}

async function saveSettingsFromUI() {
  state.settings = {
    aspectRatio: aspectRatio.value,
    commonPrompt: commonPrompt.value.trim(),
    includeReferenceRule: includeReferenceRule.checked,
    includeAspectRule: includeAspectRule.checked,
    includeCommonPrompt: includeCommonPrompt.checked,
    autoSendPrompt: autoSendPrompt.checked,
    userLanguage: langSelect.value
  };
  await chrome.storage.local.set({ settings: state.settings });
  updateSettingsPreview();
}

function updateSettingsPreview() {
  const parts = [];
  if (state.settings.includeReferenceRule) parts.push(getTranslation('previewRefRule'));
  if (state.settings.includeAspectRule && state.settings.aspectRatio) {
    parts.push(getTranslation('previewAspectRule', [state.settings.aspectRatio]));
  }
  if (state.settings.includeCommonPrompt && state.settings.commonPrompt) {
    parts.push(getTranslation('previewCommonPrompt'));
  }
  settingsPreview.textContent = parts.length
    ? getTranslation('previewPrefix', [parts.join(' · ')])
    : getTranslation('previewNone');
}

async function renderImages() {
  imagePreview.replaceChildren();
  imageCount.textContent = getTranslation('imageCountFormat', [String(state.files.length)]);

  for (const [index, file] of state.files.entries()) {
    const url = URL.createObjectURL(file);
    const tile = document.createElement('div');
    tile.className = 'image-tile';
    const img = document.createElement('img');
    img.src = url;
    img.alt = file.name;
    img.onload = () => URL.revokeObjectURL(url);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '×';
    remove.title = getTranslation('imageRemoveTitle', [file.name]);
    remove.addEventListener('click', async (event) => {
      event.preventDefault();
      state.files.splice(index, 1);
      await renderImages();
    });
    tile.append(img, remove);
    imagePreview.append(tile);
  }
}

function buildPromptCards() {
  state.prompts = promptInput.value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  renderPromptCards();
  setStatus(getTranslation('statusBuildCards', [String(state.prompts.length)]), 'success');
}

async function savePrompts() {
  buildPromptCards();
  await chrome.storage.local.set({ prompts: state.prompts });
  setStatus(getTranslation('statusSavePrompts'), 'success');
}

function renderPromptCards() {
  promptCards.replaceChildren();
  promptCount.textContent = getTranslation('promptCountFormat', [String(state.prompts.length)]);

  state.prompts.forEach((prompt, index) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'prompt-card';
    card.title = getTranslation('promptCardTitle');
    card.innerHTML = `<span class="prompt-number">${String(index + 1).padStart(2, '0')}</span><span class="prompt-text"></span>`;
    card.querySelector('.prompt-text').textContent = prompt;
    card.addEventListener('click', () => handleCardClick(prompt, index));
    promptCards.append(card);
  });
}

function getInsertMode() {
  return document.querySelector('input[name="insertMode"]:checked').value;
}

function buildFinalPrompt(scenePrompt) {
  const blocks = [scenePrompt.trim()];

  if (state.settings.includeCommonPrompt && state.settings.commonPrompt) {
    blocks.push(`[COMMON STYLE]\n${state.settings.commonPrompt}`);
  }

  if (state.settings.includeReferenceRule) {
    blocks.push('[REFERENCE RULE]\nUse the attached reference images as fixed references. Keep character identity, facial features, hairstyle, proportions, costume identity, world design, and visual style consistent.');
  }

  if (state.settings.includeAspectRule && state.settings.aspectRatio) {
    blocks.push(`[ASPECT RATIO]\nAspect ratio: ${state.settings.aspectRatio}. ${getAspectRatioInstruction(state.settings.aspectRatio)}`);
  }

  return blocks.join('\n\n');
}

function getAspectRatioInstruction(ratio) {
  const instructions = {
    '1:1': 'Create a balanced square composition.',
    '16:9': 'Create a widescreen horizontal composition.',
    '9:16': 'Create a vertical portrait composition.',
    '4:3': 'Create a standard horizontal composition.',
    '3:2': 'Create a cinematic photographic horizontal composition.'
  };
  return instructions[ratio] || '';
}

function isChatGPTUrl(url) {
  return /^https:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(url || '');
}

async function getActiveChatGPTTab() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_CHATGPT_TAB' });
  if (!response?.ok || !response.tabId) {
    throw new Error(getTranslation('statusNotChatGPT'));
  }
  return response.tabId;
}

async function insertPromptIntoChatGPT(prompt, index, overrideAutoSend = null) {
  try {
    const tabId = await getActiveChatGPTTab();
    const finalPrompt = buildFinalPrompt(prompt);
    const shouldAutoSend = overrideAutoSend !== null ? overrideAutoSend : autoSendPrompt.checked;

    const response = await sendMessageToChatGPT(tabId, {
      type: 'INSERT_PROMPT',
      prompt: finalPrompt,
      mode: getInsertMode(),
      autoSend: shouldAutoSend
    });
    if (!response?.ok) throw new Error(response?.error || getTranslation('statusNoEditor'));
    setStatus(getTranslation('statusApplyPrompt', [String(index + 1)]), 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

async function uploadImagesToChatGPT() {
  if (!state.files.length) {
    setStatus(getTranslation('statusNoImages'), 'error');
    return;
  }

  try {
    const tabId = await getActiveChatGPTTab();
    await performUploadToTab(tabId);
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

async function performUploadToTab(tabId) {
  if (!state.files.length) return;
  try {
    setStatus(getTranslation('statusPreparingImages', [String(state.files.length)]), '');
    const payload = await Promise.all(state.files.map(fileToPayload));
    const response = await sendMessageToChatGPT(tabId, {
      type: 'UPLOAD_IMAGES',
      files: payload
    });
    if (!response?.ok) throw new Error(response?.error || 'Image upload failed.');
    setStatus(getTranslation('statusUploadSuccess', [String(response.count)]), 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}



async function sendMessageToChatGPT(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    if (!String(error?.message || '').includes('Receiving end does not exist')) {
      throw error;
    }

    const injection = await chrome.runtime.sendMessage({
      type: 'ENSURE_CONTENT_SCRIPT',
      tabId
    });

    if (!injection?.ok) {
      throw new Error(injection?.error || getTranslation('statusScriptInjectFailed'));
    }

    return await chrome.tabs.sendMessage(tabId, message);
  }
}

function fileToPayload(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`${file.name} could not be read.`));
    reader.onload = () => resolve({ name: file.name, type: file.type, dataUrl: reader.result });
    reader.readAsDataURL(file);
  });
}

function setStatus(message, type = '') {
  statusText.textContent = message;
  statusText.className = type === 'success' ? 'status-success' : type === 'error' ? 'status-error' : '';

  const loginStatus = $('#loginStatus');
  if (loginStatus) {
    loginStatus.textContent = message;
    loginStatus.className = 'login-status ' + (type === 'success' ? 'status-success' : type === 'error' ? 'status-error' : '');
  }
}

/* Template Variables & Modal Helper Functions */

function getPromptVariables(prompt) {
  const regex = /\{\{([^}]+)\}\}/g;
  const matches = [];
  let match;
  while ((match = regex.exec(prompt)) !== null) {
    const varName = match[1].trim();
    if (!matches.includes(varName)) {
      matches.push(varName);
    }
  }
  return matches;
}

function replaceVariables(prompt, values) {
  let replaced = prompt;
  Object.keys(values).forEach((key) => {
    const escapedKey = key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`\\{\\{\\s*${escapedKey}\\s*\\}\\}`, 'g');
    replaced = replaced.replace(regex, values[key]);
  });
  return replaced;
}

function showVariablesModal(variables, defaultValueMap, onInsert, onCancel) {
  const modal = $('#variablesModal');
  const form = $('#variablesForm');
  form.replaceChildren();

  variables.forEach((variable) => {
    const row = document.createElement('div');
    row.className = 'variable-row';
    const label = document.createElement('label');
    label.textContent = variable;
    label.setAttribute('for', `var-${variable}`);
    
    const input = document.createElement('input');
    input.type = 'text';
    input.id = `var-${variable}`;
    input.name = variable;
    input.value = defaultValueMap[variable] || '';
    
    row.append(label, input);
    form.append(row);
  });

  modal.style.display = 'flex';
  
  const firstInput = form.querySelector('input');
  if (firstInput) firstInput.focus();

  const insertBtn = $('#modalInsertButton');
  const cancelBtn = $('#modalCancelButton');
  
  const newInsertBtn = insertBtn.cloneNode(true);
  const newCancelBtn = cancelBtn.cloneNode(true);
  insertBtn.parentNode.replaceChild(newInsertBtn, insertBtn);
  cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

  newInsertBtn.textContent = getTranslation('modalInsertBtn');
  newCancelBtn.textContent = getTranslation('modalCancelBtn');

  newInsertBtn.addEventListener('click', () => {
    const inputs = form.querySelectorAll('input');
    const values = {};
    inputs.forEach((input) => {
      values[input.name] = input.value.trim();
    });
    modal.style.display = 'none';
    onInsert(values);
  });

  newCancelBtn.addEventListener('click', () => {
    modal.style.display = 'none';
    onCancel();
  });
}

function handleCardClick(prompt, index) {
  const variables = getPromptVariables(prompt);
  if (variables.length > 0) {
    if (!state.isPro) {
      setStatus(getTranslation('proFeatureVariables'), 'error');
      return;
    }
    showVariablesModal(
      variables,
      {},
      (values) => {
        const replacedPrompt = replaceVariables(prompt, values);
        insertPromptIntoChatGPT(replacedPrompt, index);
      },
      () => {
        // Cancelled
      }
    );
  } else {
    insertPromptIntoChatGPT(prompt, index);
  }
}

/* Multi-Prompt Pipeline Runner Functions */

async function startPipeline() {
  if (state.prompts.length === 0) {
    setStatus(getTranslation('statusClearPrompts'), 'error');
    return;
  }

  try {
    pipelineState.tabId = await getActiveChatGPTTab();
  } catch (error) {
    setStatus(error.message, 'error');
    return;
  }

  pipelineState.running = true;
  pipelineState.currentIndex = 0;
  pipelineState.abort = false;
  updatePipelineUI(true);
  
  runNextPipelineStep();
}

function updatePipelineUI(running) {
  const runBtn = $('#runSequenceButton');
  if (running) {
    runBtn.textContent = getTranslation('cancelSequenceBtn');
    runBtn.className = 'secondary';
    $('#buildCardsButton').disabled = true;
    $('#clearPromptsButton').disabled = true;
    $('#savePromptsButton').disabled = true;
  } else {
    runBtn.textContent = getTranslation('runSequenceBtn');
    runBtn.className = 'secondary';
    $('#buildCardsButton').disabled = false;
    $('#clearPromptsButton').disabled = false;
    $('#savePromptsButton').disabled = false;
  }
}

function togglePipeline() {
  if (!state.isPro) {
    setStatus(getTranslation('proFeatureSequence'), 'error');
    return;
  }
  if (pipelineState.running) {
    abortPipeline();
  } else {
    startPipeline();
  }
}

function abortPipeline() {
  if (!pipelineState.running) return;
  pipelineState.abort = true;
  pipelineState.running = false;
  updatePipelineUI(false);
  setStatus(getTranslation('statusSequenceCancelled'), 'error');
}

async function runNextPipelineStep() {
  if (pipelineState.abort || !pipelineState.running) return;

  if (pipelineState.currentIndex >= state.prompts.length) {
    pipelineState.running = false;
    updatePipelineUI(false);
    setStatus(getTranslation('statusSequenceComplete'), 'success');
    return;
  }

  const prompt = state.prompts[pipelineState.currentIndex];
  setStatus(getTranslation('statusSequenceRunning', [String(pipelineState.currentIndex + 1), String(state.prompts.length)]), '');

  const variables = getPromptVariables(prompt);
  if (variables.length > 0) {
    showVariablesModal(
      variables,
      {},
      async (values) => {
        const replacedPrompt = replaceVariables(prompt, values);
        await executeStep(replacedPrompt);
      },
      () => {
        abortPipeline();
      }
    );
  } else {
    await executeStep(prompt);
  }
}

async function executeStep(promptText) {
  try {
    if (state.files.length > 0) {
      setStatus(getTranslation('statusPreparingImages', [String(state.files.length)]), '');
      const payload = await Promise.all(state.files.map(fileToPayload));
      const uploadResponse = await sendMessageToChatGPT(pipelineState.tabId, {
        type: 'UPLOAD_IMAGES',
        files: payload
      });
      if (!uploadResponse?.ok) {
        throw new Error(uploadResponse?.error || 'Failed to upload images.');
      }
      await sleep(1500);
    }

    const finalPrompt = buildFinalPrompt(promptText);
    const response = await sendMessageToChatGPT(pipelineState.tabId, {
      type: 'INSERT_PROMPT',
      prompt: finalPrompt,
      mode: getInsertMode(),
      autoSend: true // Sequences must auto-submit
    });

    if (!response?.ok) throw new Error(response?.error || 'Failed to insert prompt.');

    await waitForGenerationToComplete();

    pipelineState.currentIndex++;
    setTimeout(runNextPipelineStep, 1000);
  } catch (error) {
    setStatus(error.message, 'error');
    abortPipeline();
  }
}

async function waitForGenerationToComplete() {
  // 1. Wait for generation to START (isGenerating === true)
  // We poll every 250ms for up to 10 seconds.
  let startWaitTime = 0;
  let started = false;
  while (startWaitTime < 10000) { // 10 seconds timeout
    if (pipelineState.abort) return;
    try {
      const response = await chrome.tabs.sendMessage(pipelineState.tabId, { type: 'CHECK_GENERATING' });
      if (response?.generating) {
        started = true;
        break;
      }
    } catch (e) {
      // Ignore message errors during startup transitions
    }
    await sleep(250);
    startWaitTime += 250;
  }

  if (!started) {
    console.warn('Generation did not start within 10 seconds. Proceeding to avoid lockup.');
    return;
  }

  // 2. Wait for generation to COMPLETE (isGenerating === false)
  // We require 3 consecutive false checks (1.5 seconds) to confirm it is actually idle,
  // preventing premature triggers during DALL-E tool-call transitions.
  let falseConsecutiveCount = 0;
  while (true) {
    if (pipelineState.abort) return;
    try {
      const response = await chrome.tabs.sendMessage(pipelineState.tabId, { type: 'CHECK_GENERATING' });
      if (!response?.generating) {
        falseConsecutiveCount++;
        if (falseConsecutiveCount >= 3) {
          break;
        }
      } else {
        falseConsecutiveCount = 0;
      }
    } catch (e) {
      // Handle potential disconnected port errors if page is refreshing
      break;
    }
    await sleep(500);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* Authentication and Pro License Lock Functions */

async function handleGoogleSignIn() {
  if (!supabaseClient) {
    setStatus('Supabase client not initialized. Please configure SUPABASE_URL and SUPABASE_ANON_KEY.', 'error');
    return;
  }
  setStatus('Initiating Google Sign-In...', '');

  try {
    const { data, error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: chrome.identity.getRedirectURL(),
        queryParams: {
          access_type: 'offline',
          prompt: 'consent'
        }
      }
    });

    if (error) throw error;
    if (!data?.url) throw new Error('Failed to retrieve OAuth URL.');

    console.log('Generated OAuth URL:', data.url);

    chrome.identity.launchWebAuthFlow({
      url: data.url,
      interactive: true
    }, async (redirectUrl) => {
      if (chrome.runtime.lastError || !redirectUrl) {
        const errMsg = chrome.runtime.lastError ? chrome.runtime.lastError.message : 'No redirect URL';
        console.warn('OAuth flow error/cancel:', errMsg);
        setStatus(`Google Login cancelled or failed: ${errMsg}`, 'error');
        return;
      }

      try {
        const url = new URL(redirectUrl);
        const hash = url.hash.substring(1);
        const params = new URLSearchParams(hash);
        
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');

        if (accessToken && refreshToken) {
          setStatus('Verifying session...', '');
          const { data: sessionData, error: sessionError } = await supabaseClient.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          });

          if (sessionError) throw sessionError;

          const user = sessionData.user;
          setStatus('Checking subscription status...', '');

          const { data: profile, error: profileError } = await supabaseClient
            .from('profiles')
            .select('name, email, is_pro, ends_at')
            .eq('id', user.id)
            .single();

          if (profileError) throw profileError;

          const hasPro = profile.is_pro && (profile.ends_at === null || new Date(profile.ends_at) > new Date());
          
          if (hasPro) {
            await loginUser(profile.name || user.email, user.email, true);
          } else {
            await loginUser(profile?.name || user.email, user.email, false);
          }
        }
      } catch (err) {
        setStatus(err.message, 'error');
      }
    });
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

async function handleDebugBypass() {
  await loginUser('Admin Tester', 'admin@chatgpttester.com', true);
}

async function loginUser(name, email, isPro) {
  state.isPro = isPro;
  state.user = { name, email };
  await chrome.storage.local.set({ isPro, user: state.user });

  $('#loginScreen').style.display = 'none';
  $('.app-shell').style.display = 'block';
  updateUserProfileUI();
  setStatus(getTranslation('statusDefault'), '');
}

async function logoutUser() {
  state.isPro = false;
  state.user = null;
  await chrome.storage.local.remove(['isPro', 'user']);

  if (supabaseClient) {
    await supabaseClient.auth.signOut();
  }

  $('#loginScreen').style.display = 'flex';
  $('.app-shell').style.display = 'none';
  updateUserProfileUI();
}

function updateUserProfileUI() {
  const footerProfile = $('#footerProfile');
  const userProfile = $('#userProfile');
  const proBadge = $('#proBadge');
  const upgradeBtn = $('#upgradeButton');
  const runSeqBtn = $('#runSequenceButton');

  if (state.user) {
    userProfile.textContent = `${state.user.name} (${state.user.email})`;
    footerProfile.style.display = 'flex';

    if (state.isPro) {
      proBadge.style.display = 'inline-block';
      upgradeBtn.style.display = 'none';
      runSeqBtn.textContent = getTranslation('runSequenceBtn');
    } else {
      proBadge.style.display = 'none';
      upgradeBtn.style.display = 'inline-block';
      runSeqBtn.textContent = '🔒 ' + getTranslation('runSequenceBtn');
    }
  } else {
    footerProfile.style.display = 'none';
    proBadge.style.display = 'none';
    upgradeBtn.style.display = 'none';
  }
}
