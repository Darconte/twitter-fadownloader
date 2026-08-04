const DEFAULTS = {
  enabled: true,
  saveAs: false,
  imageFolder: 'X-Media/images',
  videoFolder: 'X-Media/videos',
  gifFolder: 'X-Media/gifs',
  filenameTemplate: '{author}_{tweetId}_{index}',
  buttonPosition: 'left',
  preferOriginalQuality: true,
  faFloatingIcon: true,
  faImageFolder: 'FurAffinity',
  faFilenameTemplate: '{artist}_{id}'
};

const fields = {
  enabled: document.getElementById('enabled'),
  saveAs: document.getElementById('saveAs'),
  imageFolder: document.getElementById('imageFolder'),
  videoFolder: document.getElementById('videoFolder'),
  gifFolder: document.getElementById('gifFolder'),
  filenameTemplate: document.getElementById('filenameTemplate'),
  buttonPosition: document.getElementById('buttonPosition'),
  preferOriginalQuality: document.getElementById('preferOriginalQuality'),
  faFloatingIcon: document.getElementById('faFloatingIcon'),
  faImageFolder: document.getElementById('faImageFolder'),
  faFilenameTemplate: document.getElementById('faFilenameTemplate')
};

const statusEl = document.getElementById('status');
const saveBtn = document.getElementById('save');

function showStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.className = isError ? 'error' : 'success';
  setTimeout(() => {
    statusEl.textContent = '';
    statusEl.className = '';
  }, 2500);
}

function readForm() {
  return {
    enabled: fields.enabled.checked,
    saveAs: fields.saveAs.checked,
    imageFolder: fields.imageFolder.value.trim(),
    videoFolder: fields.videoFolder.value.trim(),
    gifFolder: fields.gifFolder.value.trim(),
    filenameTemplate: fields.filenameTemplate.value.trim() || DEFAULTS.filenameTemplate,
    buttonPosition: fields.buttonPosition.value,
    preferOriginalQuality: fields.preferOriginalQuality.checked,
    faFloatingIcon: fields.faFloatingIcon.checked,
    faImageFolder: fields.faImageFolder.value.trim(),
    faFilenameTemplate:
      fields.faFilenameTemplate.value.trim() || DEFAULTS.faFilenameTemplate
  };
}

function fillForm(values) {
  fields.enabled.checked = values.enabled;
  fields.saveAs.checked = values.saveAs;
  fields.imageFolder.value = values.imageFolder;
  fields.videoFolder.value = values.videoFolder;
  fields.gifFolder.value = values.gifFolder;
  fields.filenameTemplate.value = values.filenameTemplate;
  fields.buttonPosition.value = values.buttonPosition;
  fields.preferOriginalQuality.checked = values.preferOriginalQuality;
  fields.faFloatingIcon.checked = values.faFloatingIcon;
  fields.faImageFolder.value = values.faImageFolder;
  fields.faFilenameTemplate.value = values.faFilenameTemplate;
}

async function loadSettings() {
  const stored = await browser.storage.sync.get(DEFAULTS);
  fillForm({ ...DEFAULTS, ...stored });
}

saveBtn.addEventListener('click', async () => {
  try {
    const values = readForm();
    await browser.storage.sync.set(values);
    showStatus('Settings saved.');
  } catch (error) {
    showStatus(error.message || 'Failed to save settings.', true);
  }
});

loadSettings();
