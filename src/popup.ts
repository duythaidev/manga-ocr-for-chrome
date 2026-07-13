const apiKeyInput = document.getElementById('deepl-api-key') as HTMLInputElement | null;
const displayModeSelect = document.getElementById('display-mode') as HTMLSelectElement | null;
const floatingButtonToggle = document.getElementById('show-floating-button') as HTMLInputElement | null;
const settingsStatus = document.getElementById('settings-status') as HTMLDivElement | null;
const saveButton = document.getElementById('save-settings') as HTMLButtonElement | null;

const loadSettings = async () => {
  const settings = await chrome.storage.local.get(['deeplApiKey', 'displayMode', 'showFloatingButton']);
  if (apiKeyInput) {
    apiKeyInput.value = (settings.deeplApiKey as string) || '';
  }
  if (displayModeSelect) {
    displayModeSelect.value = (settings.displayMode as 'overlay' | 'sidepanel') || 'overlay';
  }
  if (floatingButtonToggle) {
    floatingButtonToggle.checked = settings.showFloatingButton !== false;
  }
};

const saveSettings = async () => {
  const payload = {
    deepLApiKey: apiKeyInput?.value ?? '',
    displayMode: (displayModeSelect?.value as 'overlay' | 'sidepanel') || 'overlay',
    showFloatingButton: floatingButtonToggle?.checked ?? true
  };

  await chrome.storage.local.set({
    deeplApiKey: payload.deepLApiKey,
    displayMode: payload.displayMode,
    showFloatingButton: payload.showFloatingButton
  });

  await chrome.runtime.sendMessage({ type: 'SettingsSave', payload });

  if (settingsStatus) {
    settingsStatus.textContent = 'Settings saved.';
  }
};

saveButton?.addEventListener('click', () => {
  void saveSettings();
});

void loadSettings();
