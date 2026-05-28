// ============================================================
//  Автоматизация маркетингового анализа
//  LLM-пул: Groq → Cerebras → Mistral (авто-переключение при 429)
//  Gemini (PDF, фото, видео, аудио)
//  Гипотезы: мульти-модель с чекбоксами в настройках
// ============================================================

var SETTINGS_SHEET  = 'Настройки';
var ANALYSIS_SHEET  = 'Анализ';
var CHECKLIST_SHEET = 'Чеклист';
// Имена листов гипотез — динамические: 'Гипотезы — [модель]' и 'Лучшие — [модель]'

// Пул LLM-провайдеров — используются по порядку, переключение при 429
var LLM_PROVIDERS = [
  { name: 'Groq',     url: 'https://api.groq.com/openai/v1/chat/completions',   model: 'llama-3.3-70b-versatile', keyProp: 'groqKey',     pauseMs: 62000 },
  { name: 'Cerebras', url: 'https://api.cerebras.ai/v1/chat/completions',        model: 'llama3.3-70b',            keyProp: 'cerebrasKey', pauseMs: 5000  },
  { name: 'Mistral',  url: 'https://api.mistral.ai/v1/chat/completions',         model: 'mistral-small-latest',    keyProp: 'mistralKey',  pauseMs: 5000  }
];

// Каталог моделей для генерации гипотез — порядок = порядок строк в листе Настройки
// apiFormat: 'openai' | 'anthropic' | 'responses'
var MODEL_CATALOG = [
  { id: 'gemini-2.5-flash',  label: 'Gemini 2.5 Flash',     provider: 'kieai',    apiFormat: 'openai',    url: 'https://api.kie.ai/gemini-2.5-flash/v1/chat/completions', hint: '~$0.001 / запуск' },
  { id: 'gemini-3.1-pro',    label: 'Gemini 3.1 Pro',       provider: 'kieai',    apiFormat: 'openai',    url: 'https://api.kie.ai/gemini-3.1-pro/v1/chat/completions',   hint: '~$0.024 / запуск' },
  { id: 'claude-haiku-4-5',  label: 'Claude Haiku 4.5',     provider: 'kieai',    apiFormat: 'anthropic', url: 'https://api.kie.ai/claude/v1/messages',                   hint: '~$0.011 / запуск' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6',    provider: 'kieai',    apiFormat: 'anthropic', url: 'https://api.kie.ai/claude/v1/messages',                   hint: '~$0.039 / запуск' },
  { id: 'claude-opus-4-5',   label: 'Claude Opus 4.5',      provider: 'kieai',    apiFormat: 'anthropic', url: 'https://api.kie.ai/claude/v1/messages',                   hint: '~$0.195 / запуск' },
  { id: 'gpt-5-5',           label: 'GPT-5.5',              provider: 'kieai',    apiFormat: 'responses', url: 'https://api.kie.ai/codex/v1/responses',                   hint: '~$0.025 / запуск' },
  { id: 'groq',              label: 'Groq / Llama 3.3',     provider: 'groq',     apiFormat: 'openai',    url: null,                                                      hint: 'бесплатно'         },
  { id: 'cerebras',          label: 'Cerebras / Llama 3.3', provider: 'cerebras', apiFormat: 'openai',    url: null,                                                      hint: 'бесплатно'         },
  { id: 'mistral',           label: 'Mistral Small',        provider: 'mistral',  apiFormat: 'openai',    url: null,                                                      hint: 'бесплатно'         }
];
// Строка первого чекбокса в листе Настройки
var MODEL_ROW_START = 15;

var GEMINI_API_URL    = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
var GEMINI_UPLOAD_URL = 'https://generativelanguage.googleapis.com/upload/v1beta/files';

// Файлы ≤ 15 МБ отправляем inline, больше — через File API
var MAX_INLINE_BYTES = 15 * 1024 * 1024;

// Типы файлов, которые умеет читать Gemini (не Google/текст)
var GEMINI_MIMES = {
  'image/jpeg': 'image',    'image/jpg': 'image',   'image/png': 'image',
  'image/gif':  'image',    'image/webp': 'image',  'image/heic': 'image',
  'image/heif': 'image',
  'application/pdf': 'document',
  'video/mp4': 'video',     'video/mpeg': 'video',  'video/quicktime': 'video',
  'video/x-msvideo': 'video', 'video/webm': 'video', 'video/3gpp': 'video',
  'audio/mpeg': 'audio',    'audio/mp4': 'audio',   'audio/wav': 'audio',
  'audio/aac':  'audio',    'audio/flac': 'audio',  'audio/ogg': 'audio'
};

// ─── Меню ────────────────────────────────────────────────────
function onOpen() {
  SpreadsheetApp.getActiveSpreadsheet()
    .addMenu('Автоматизация маркетинга', [
      { name: 'Запустить анализ проекта',        functionName: 'runMarketingAnalysis' },
      { name: '─────────────────',               functionName: 'noop' },
      { name: 'Тест: распознать одно видео',     functionName: 'testKieAiVideo' },
      { name: '· · · · · · · · ·',              functionName: 'noop' },
      { name: 'Создать шаблон листов',           functionName: 'initSheets' }
    ]);
}
function noop() {}

// ─── Тест: одно видео через kie.ai ───────────────────────────
function testKieAiVideo() {
  var ui    = SpreadsheetApp.getUi();
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var settingsSheet = ss.getSheetByName(SETTINGS_SHEET);
  if (!settingsSheet) { ui.alert('Сначала создай шаблон листов'); return; }

  var savedKey    = (settingsSheet.getRange('B11').getValue() + '').trim();
  var savedFileId = (settingsSheet.getRange('B12').getValue() + '').trim();

  var keyPrompt = savedKey
    ? 'Сохранённый ключ (ячейка B11 листа «Настройки»):\n' + savedKey + '\n\nВведи новый ключ или оставь поле пустым, чтобы использовать сохранённый:'
    : 'Вставь API-ключ kie.ai (сохранится в B11 листа «Настройки»):';
  var keyResp = ui.prompt('Тест kie.ai — ключ', keyPrompt, ui.ButtonSet.OK_CANCEL);
  if (keyResp.getSelectedButton() !== ui.Button.OK) return;
  var kieKey = keyResp.getResponseText().trim() || savedKey;
  if (!kieKey) { ui.alert('Ключ не введён'); return; }
  settingsSheet.getRange('B11').setValue(kieKey);

  var idPrompt = savedFileId
    ? 'Сохранённый файл (ячейка B12 листа «Настройки»):\n' + savedFileId + '\n\nВведи новый ID/ссылку или оставь поле пустым, чтобы использовать сохранённый:'
    : 'Вставь ID или ссылку на видеофайл из Google Drive (сохранится в B12):';
  var idResp = ui.prompt('Тест kie.ai — файл', idPrompt, ui.ButtonSet.OK_CANCEL);
  if (idResp.getSelectedButton() !== ui.Button.OK) return;
  var fileId = (idResp.getResponseText().trim() || savedFileId).replace(/.*\/d\/([a-zA-Z0-9_-]+).*/, '$1');
  if (!fileId) { ui.alert('ID не введён'); return; }
  settingsSheet.getRange('B12').setValue(fileId);

  // Пишем логи в Чеклист (строки 9+)
  var logSheet = ss.getSheetByName(CHECKLIST_SHEET);
  if (!logSheet) { ui.alert('Сначала создай шаблон листов'); return; }
  var lastRow = logSheet.getLastRow();
  if (lastRow >= 9) logSheet.deleteRows(9, lastRow - 8);
  logSheet.getRange(9, 1, 1, 3).setValues([['-', '── Тест kie.ai ──', '']]);
  logSheet.getRange(9, 1, 1, 3).setBackground('#263238').setFontColor('#ECEFF1').setFontWeight('bold');

  function log_(msg, ok) {
    var r = logSheet.getLastRow() + 1;
    logSheet.getRange(r, 1, 1, 3).setValues([['-', 'Тест', msg]]);
    var bg = ok === true ? '#C8E6C9' : ok === false ? '#FFCDD2' : '#FFF9C4';
    var fc = ok === true ? '#1B5E20' : ok === false ? '#B71C1C' : '#333333';
    logSheet.getRange(r, 2, 1, 2).setBackground(bg).setFontColor(fc).setWrap(true);
    logSheet.setRowHeight(r, 36);
    SpreadsheetApp.flush();
  }

  try {
    log_('⏳ Получаем информацию о файле...');
    var file     = DriveApp.getFileById(fileId);
    var fileName = file.getName();
    var mimeType = file.getMimeType();
    var fileSize = file.getSize();
    var sizeMb   = (fileSize / 1024 / 1024).toFixed(1);
    log_('📁 ' + fileName + '  |  ' + sizeMb + ' МБ  |  ' + mimeType, true);

    if (fileSize > 40 * 1024 * 1024) {
      log_('❌ Файл ' + sizeMb + ' МБ — слишком большой для GAS (лимит 6 мин).\nРешение: сделайте файл публичным ("Все, у кого есть ссылка") и вставьте прямую ссылку вместо ID.', false);
      ui.alert('Файл слишком большой (' + sizeMb + ' МБ)', 'GAS не успевает загрузить его за 6 минут.\n\nРешение:\n1. Поделитесь файлом → "Все, у кого есть ссылка"\n2. Повторите тест, вставив полную ссылку вместо ID', ui.ButtonSet.OK);
      return;
    }

    log_('⏳ Загружаем файл из Drive (' + sizeMb + ' МБ)...');
    var bytes  = file.getBlob().getBytes();
    log_('⏳ Кодируем в base64...');
    var base64  = Utilities.base64Encode(bytes);
    var dataUrl = 'data:' + mimeType + ';base64,' + base64;
    log_('✅ Готово. Размер запроса: ' + (dataUrl.length / 1024 / 1024).toFixed(1) + ' МБ. Отправляем в kie.ai...', true);

    var payload = JSON.stringify({
      model: 'gemini-2.5-flash',
      stream: false,
      messages: [{ role: 'user', content: [
        { type: 'image_url', image_url: { url: dataUrl } },
        { type: 'text', text: 'Транскрибируй это видео полностью. Если есть речь — запиши дословно. Имя файла: ' + fileName }
      ]}]
    });

    var response = UrlFetchApp.fetch('https://api.kie.ai/gemini-2.5-flash/v1/chat/completions', {
      method: 'post', contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + kieKey },
      payload: payload, muteHttpExceptions: true
    });

    var code = response.getResponseCode();
    var body = response.getContentText();

    if (code !== 200) {
      log_('❌ HTTP ' + code + ': ' + body.substring(0, 300), false);
      ui.alert('Ошибка HTTP ' + code, body.substring(0, 500), ui.ButtonSet.OK);
      return;
    }

    var parsed     = JSON.parse(body);
    var text       = parsed.choices[0].message.content || '(пусто)';
    var usage      = parsed.usage || {};
    var tokensIn   = usage.prompt_tokens    || 0;
    var tokensOut  = usage.completion_tokens || 0;
    var tokensTotal = usage.total_tokens    || (tokensIn + tokensOut);
    var preview    = text.substring(0, 300);

    log_('✅ Ответ получен!', true);
    log_('📊 Токены: вход ' + tokensIn + '  |  выход ' + tokensOut + '  |  итого ' + tokensTotal, true);
    log_('📝 Транскрипция:\n«' + preview + (text.length > 300 ? '...»' : '»'), true);
    log_('💡 Стоимость: kie.ai → Usage', true);

    ui.alert('✅ Тест завершён! Смотри логи в листе «Чеклист» (строки ниже шага 6).');

  } catch (e) {
    log_('❌ Ошибка: ' + e.message, false);
    ui.alert('Ошибка', e.message, ui.ButtonSet.OK);
  }
}

// ─── Точка входа ─────────────────────────────────────────────
function runMarketingAnalysis() {
  var ui = SpreadsheetApp.getUi();
  try {
    resetChecklist_();

    // Шаг 1 — настройки
    Logger.log('=== [1/6] Настройки ===');
    var settings = readSettings_();
    var hasLlm = settings.groqKey || settings.cerebrasKey || settings.mistralKey;
    if (!hasLlm) { ui.alert('Ошибка', 'Не указан ни один LLM-ключ (Groq B2, Cerebras B9, Mistral B10)', ui.ButtonSet.OK); return; }
    if (!settings.sources || settings.sources.length === 0) { ui.alert('Ошибка', 'Не указан ни один источник (ячейка B3)', ui.ButtonSet.OK); return; }
    var llmInfo = ['Groq','Cerebras','Mistral'].filter(function(n) { return settings[n.toLowerCase()+'Key'] || (n==='Groq'&&settings.groqKey); }).join('+');
    var llmKeys = LLM_PROVIDERS.filter(function(p){return !!settings[p.keyProp];}).map(function(p){return p.name;});
    updateChecklist_(1, '✅ Настройки прочитаны | LLM: ' + (llmKeys.join(', ')||'—') + (settings.geminiKey ? ' | Gemini ✓' : ''));

    // Шаг 2 — сбор файлов
    Logger.log('=== [2/6] Читаем файлы ===');
    updateChecklist_(2, '⏳ Сканируем папку...');
    var result   = collectDriveContext_(settings);
    var context  = result.context;
    var skipped  = result.skipped;
    var geminiOk = result.geminiUsed;
    if (!context || !context.trim()) {
      ui.alert('Ошибка', 'Нет читаемых файлов в папке.', ui.ButtonSet.OK); return;
    }
    var statusMsg = '✅ Обнаружено файлов: ' + result.filesFound + ' | обработано: ' + result.filesRead + ' | символов контекста: ' + context.length;
    if (result.mediaLogs && result.mediaLogs.length) {
      statusMsg += '\n\n🤖 Gemini расшифровал (' + result.mediaLogs.length + '):\n' + result.mediaLogs.join('\n');
    }
    if (skipped.length)  statusMsg += '\n\n⚠️ Пропущено (Gemini недоступен): ' + skipped.join(', ');
    if (!geminiOk && settings.geminiKey) statusMsg += '\n⚠️ Gemini лимит исчерпан — медиафайлы пропущены';

    // Обрезаем контекст до лимита Groq (~128k токенов ≈ 380k символов)
    var MAX_CONTEXT = 40000;
    if (context.length > MAX_CONTEXT) {
      // Обрезаем по границе последнего документа, чтобы не резать на полуслове
      var trimmed = context.substring(0, MAX_CONTEXT);
      var lastBoundary = trimmed.lastIndexOf('\n--- ');
      if (lastBoundary > MAX_CONTEXT * 0.7) trimmed = trimmed.substring(0, lastBoundary);
      context = trimmed + '\n\n[⚠️ Контекст обрезан: использовано ' + context.length + ' символов из ' + MAX_CONTEXT + ' допустимых]';
      statusMsg += '\n\n⚠️ Контекст обрезан до ' + MAX_CONTEXT + ' символов (лимит Groq 128k токенов). Исходный размер: ' + result.context.length;
    }

    updateChecklist_(2, statusMsg);

    // Шаг 3 — анализ продукта и ЦА
    var exhausted = {}; // провайдеры, исчерпавшие лимит
    Logger.log('=== [3/6] Запрос 1 — Анализ ===');
    updateChecklist_(3, '⏳ LLM: анализ продукта и ЦА...');
    var r1 = callLlmApi_(settings, buildPrompt1_(context), 8192, exhausted);
    writeAnalysisSheet_(r1.result);
    updateChecklist_(3, '✅ Анализ записан в лист «Анализ» [' + r1.provider + ']');

    // Шаги 4+5 — цикл по выбранным моделям
    var models = settings.selectedModels;
    if (!models || models.length === 0) {
      ui.alert('Ошибка', 'Не выбрана ни одна модель для генерации гипотез.\nОтметьте хотя бы одну в листе «Настройки» (строки 15+).', ui.ButtonSet.OK);
      return;
    }
    Logger.log('=== [4-5/6] Генерация гипотез (' + models.length + ' моделей) ===');
    updateChecklist_(4, '⏳ Генерация заходов · 0 / ' + models.length + ' моделей...');
    updateChecklist_(5, '⏳ Ожидание...');

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var completedSheets = [];

    for (var mi = 0; mi < models.length; mi++) {
      var model = models[mi];
      var mLabel = model.label;
      var hypoSheet  = 'Гипотезы — ' + mLabel;
      var launchSheet = 'Лучшие — ' + mLabel;

      try {
        // Пауза между моделями (не перед первой)
        if (mi > 0) Utilities.sleep(model.provider === 'groq' ? 62000 : 3000);

        updateChecklist_(4, '⏳ [' + (mi+1) + '/' + models.length + '] ' + mLabel + ': генерация 15 заходов...');
        var r2 = callModelApi_(settings, model, buildPrompt2a_(r1.result), 8192);
        writeHypothesesSheet_(hypoSheet, r2, ss);

        var pause45 = model.provider === 'groq' ? 62000 : 3000;
        Utilities.sleep(pause45);

        updateChecklist_(5, '⏳ [' + (mi+1) + '/' + models.length + '] ' + mLabel + ': отбор 10 лучших...');
        var r3 = callModelApi_(settings, model, buildPrompt2b_(r2), 3500);
        writeLaunchSheet_(launchSheet, r3, ss);

        completedSheets.push(mLabel);
        appendChecklistLog_('✅ ' + mLabel + ' → «' + hypoSheet + '» + «' + launchSheet + '»', true);
        updateChecklist_(4, '✅ Заходы: ' + completedSheets.length + ' / ' + models.length + ' моделей готово');

      } catch (modelErr) {
        Logger.log('Ошибка модели ' + mLabel + ': ' + modelErr.message);
        appendChecklistLog_('❌ ' + mLabel + ': ' + modelErr.message, false);
      }
    }

    if (completedSheets.length === 0) throw new Error('Все выбранные модели вернули ошибки. Проверьте ключи и лимиты.');

    updateChecklist_(5, '✅ Отбор завершён для ' + completedSheets.length + ' моделей');
    updateChecklist_(6, '✅ Готово! Создано ' + (completedSheets.length * 2) + ' листов.');
    ui.alert('Успех',
      'Анализ завершён!\n\n' +
      '• «Анализ» — продукт и сегменты ЦА\n' +
      completedSheets.map(function(l) {
        return '• «Гипотезы — ' + l + '» + «Лучшие — ' + l + '»';
      }).join('\n') + '\n' +
      '• «Чеклист» — статус каждого шага',
      ui.ButtonSet.OK);

  } catch (e) {
    Logger.log('ОШИБКА: ' + e.message);
    updateChecklist_(0, '❌ ' + e.message);
    ui.alert('Ошибка выполнения', e.message, ui.ButtonSet.OK);
  }
}

// ─── Настройки ───────────────────────────────────────────────
function readSettings_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SETTINGS_SHEET);
  if (!sheet) throw new Error('Лист «Настройки» не найден. Запустите «Создать шаблон листов».');

  var maxImg      = parseInt(sheet.getRange('B7').getValue());
  var followLinks = (sheet.getRange('B8').getValue() + '').trim().toLowerCase();

  // B3 — источники: несколько строк (Alt+Enter) или через запятую
  var rawSources = sheet.getRange('B3').getValue() + '';
  var sources    = rawSources.split(/[\n,]+/).map(function(s) { return s.trim(); }).filter(Boolean);

  // Читаем чекбоксы моделей (строки MODEL_ROW_START и далее)
  var selectedModels = [];
  MODEL_CATALOG.forEach(function(m, i) {
    if (sheet.getRange(MODEL_ROW_START + i, 2).getValue() === true) {
      selectedModels.push(m);
    }
  });

  return {
    groqKey:            (sheet.getRange('B2').getValue() + '').trim(),
    sources:            sources,
    geminiKey:          (sheet.getRange('B4').getValue() + '').trim(),
    blacklist:          parseNameList_(sheet.getRange('B5').getValue()),
    whitelist:          parseNameList_(sheet.getRange('B6').getValue()),
    maxImagesPerFolder: isNaN(maxImg) || maxImg <= 0 ? 10 : maxImg,
    followLinks:        followLinks !== 'нет' && followLinks !== 'no' && followLinks !== 'false',
    cerebrasKey:        (sheet.getRange('B9').getValue() + '').trim(),
    mistralKey:         (sheet.getRange('B10').getValue() + '').trim(),
    kieaiKey:           (sheet.getRange('B11').getValue() + '').trim(),
    selectedModels:     selectedModels
  };
}

function parseNameList_(raw) {
  if (!raw) return [];
  return (raw + '').split(',').map(function(s) { return s.trim().toLowerCase(); }).filter(Boolean);
}

// ─── Определение типа источника по URL или ID ─────────────────
function classifySource_(source) {
  // Google Drive папка (URL)
  var folderUrl = source.match(/drive\.google\.com\/(?:drive\/)?(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]+)/);
  if (folderUrl) return { type: 'folder', id: folderUrl[1], label: 'папка Drive' };

  // Google Doc
  var docUrl = source.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (docUrl) return { type: 'gdoc', id: docUrl[1], label: 'Google Doc' };

  // Google Sheet
  var sheetUrl = source.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (sheetUrl) return { type: 'gsheet', id: sheetUrl[1], label: 'Google Sheet' };

  // Google Slides
  var slidesUrl = source.match(/docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/);
  if (slidesUrl) return { type: 'gslides', id: slidesUrl[1], label: 'Google Slides' };

  // Google Drive файл (прямая ссылка)
  var driveFile = source.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([a-zA-Z0-9_-]+)/);
  if (driveFile) return { type: 'gdrive_file', id: driveFile[1], label: 'файл Drive' };

  // Внешний URL
  if (/^https?:\/\//i.test(source)) return { type: 'url', url: source, label: 'внешний URL' };

  // Иначе — считаем ID папки (обратная совместимость)
  if (/^[a-zA-Z0-9_-]{15,}$/.test(source)) return { type: 'folder', id: source, label: 'папка Drive (ID)' };

  return null;
}

// ─── Обработка одного источника ──────────────────────────────
function processSource_(source, settings, state) {
  var classified = classifySource_(source);
  if (!classified) {
    Logger.log('⚠️ Не удалось определить тип источника: ' + source);
    return [];
  }

  Logger.log('📌 Источник [' + classified.label + ']: ' + source);

  try {
    switch (classified.type) {

      case 'folder':
        return processFolder_(DriveApp.getFolderById(classified.id), settings, state, 0);

      case 'gdoc': {
        state.filesFound++;
        var text = DocumentApp.openById(classified.id).getBody().getText();
        if (!text.trim()) return [];
        state.filesRead++;
        return ['--- Google Doc: ' + source + ' ---\n' + text];
      }

      case 'gsheet': {
        state.filesFound++;
        var parts = [];
        var sheetText = extractSheetText_(classified.id);
        if (sheetText.trim()) {
          parts.push('--- Google Sheet: ' + source + ' ---\n' + sheetText);
          state.filesRead++;
        }
        if (settings.followLinks) {
          parts = parts.concat(followLinksInSheet_(classified.id, settings, state));
        }
        return parts;
      }

      case 'gslides': {
        state.filesFound++;
        var slideText = extractSlidesText_(classified.id);
        if (!slideText.trim()) return [];
        state.filesRead++;
        return ['--- Google Slides: ' + source + ' ---\n' + slideText];
      }

      case 'gdrive_file': {
        state.filesFound++;
        var file = DriveApp.getFileById(classified.id);
        var mime = file.getMimeType();
        var fname = file.getName();

        if (mime === MimeType.GOOGLE_DOCS)
          return processSource_('https://docs.google.com/document/d/' + classified.id, settings, state);
        if (mime === MimeType.GOOGLE_SHEETS)
          return processSource_('https://docs.google.com/spreadsheets/d/' + classified.id, settings, state);
        if (mime === MimeType.GOOGLE_SLIDES)
          return processSource_('https://docs.google.com/presentation/d/' + classified.id, settings, state);
        if (mime === MimeType.PLAIN_TEXT || mime === 'text/csv') {
          var t = file.getBlob().getDataAsString('UTF-8');
          if (!t.trim()) return [];
          state.filesRead++;
          return ['--- ' + fname + ' ---\n' + t];
        }
        if (GEMINI_MIMES[mime] && state.geminiAvailable && settings.geminiKey) {
          if (state.geminiCallCount > 0) Utilities.sleep(5000);
          state.geminiCallCount = (state.geminiCallCount || 0) + 1;
          var gt = transcribeWithGemini_(settings.geminiKey, file, mime, fname, state);
          if (!gt) return [];
          state.filesRead++;
          var gType = GEMINI_MIMES[mime];
          var gIcon = gType === 'video' ? '🎬' : gType === 'audio' ? '🎙️' : gType === 'document' ? '📑' : '🖼️';
          var gPreview = gt.replace(/\s+/g, ' ').trim().substring(0, 120);
          state.mediaLogs.push(gIcon + ' ' + fname + '\n    «' + gPreview + (gt.length > 120 ? '...»' : '»'));
          return ['--- ' + fname + ' (Drive-файл) ---\n' + gt];
        }
        Logger.log('  ⏭️ Неподдерживаемый формат Drive-файла: ' + mime);
        return [];
      }

      case 'url': {
        var result = fetchUrlContent_(classified.url, settings, state);
        if (!result) return [];
        state.filesRead++;
        return [result];
      }
    }
  } catch (e) {
    Logger.log('  ❌ Ошибка источника [' + classified.label + ']: ' + e.message);
    return [];
  }
  return [];
}

// ─── Сбор файлов из всех источников ──────────────────────────
function collectDriveContext_(settings) {
  if (!settings.sources || settings.sources.length === 0) {
    throw new Error('Не указан ни один источник в ячейке B3 листа «Настройки».');
  }

  var state = {
    geminiAvailable: !!settings.geminiKey,
    skipped:         [],
    filesRead:       0,
    filesFound:      0,
    mediaLogs:       [],
    geminiCallCount: 0,
    followedUrls:    {}
  };

  var allParts = [];
  settings.sources.forEach(function(src, idx) {
    updateChecklist_(2, '⏳ Источник ' + (idx + 1) + '/' + settings.sources.length + ': сканируем...');
    var parts = processSource_(src, settings, state);
    allParts   = allParts.concat(parts);
    updateChecklist_(2, '⏳ Обнаружено: ' + state.filesFound + ' | обработано: ' + state.filesRead);
  });

  return {
    context:    allParts.join('\n\n'),
    skipped:    state.skipped,
    filesRead:  state.filesRead,
    filesFound: state.filesFound,
    mediaLogs:  state.mediaLogs,
    geminiUsed: state.geminiAvailable || !settings.geminiKey
  };
}

// ─── Рекурсивный обход папки ──────────────────────────────────
function processFolder_(folder, settings, state, depth) {
  var parts     = [];
  var imageCount = 0;
  var name      = folder.getName();

  Logger.log('  '.repeat(depth) + '📁 ' + name);

  // ── файлы ─────────────────────────────────────────────────
  var files = folder.getFiles();
  while (files.hasNext()) {
    var file     = files.next();
    var mime     = file.getMimeType();
    var fname    = file.getName();
    var indent   = '  '.repeat(depth + 1);

    state.filesFound++;

    // Google Документ
    if (mime === MimeType.GOOGLE_DOCS) {
      Logger.log(indent + '📄 ' + fname);
      try {
        var text = DocumentApp.openById(file.getId()).getBody().getText();
        if (text.trim()) { parts.push('--- ' + fname + ' ---\n' + text); state.filesRead++; }
      } catch (e) { Logger.log(indent + 'Ошибка: ' + e.message); }
      continue;
    }

    // Google Таблица
    if (mime === MimeType.GOOGLE_SHEETS) {
      Logger.log(indent + '📊 ' + fname);
      try {
        var sheetText = extractSheetText_(file.getId());
        if (sheetText.trim()) { parts.push('--- ' + fname + ' ---\n' + sheetText); state.filesRead++; }
        // Переходим по ссылкам из таблицы
        if (settings.followLinks) {
          var linkedParts = followLinksInSheet_(file.getId(), settings, state);
          parts = parts.concat(linkedParts);
        }
      } catch (e) { Logger.log(indent + 'Ошибка: ' + e.message); }
      continue;
    }

    // Google Презентация
    if (mime === MimeType.GOOGLE_SLIDES) {
      Logger.log(indent + '📑 ' + fname);
      try {
        var slideText = extractSlidesText_(file.getId());
        if (slideText.trim()) { parts.push('--- ' + fname + ' ---\n' + slideText); state.filesRead++; }
      } catch (e) { Logger.log(indent + 'Ошибка: ' + e.message); }
      continue;
    }

    // Текст / CSV
    if (mime === MimeType.PLAIN_TEXT || mime === 'text/csv' || fname.match(/\.(txt|csv)$/i)) {
      Logger.log(indent + '📝 ' + fname);
      try {
        var t = file.getBlob().getDataAsString('UTF-8');
        if (t.trim()) { parts.push('--- ' + fname + ' ---\n' + t); state.filesRead++; }
      } catch (e) { Logger.log(indent + 'Ошибка: ' + e.message); }
      continue;
    }

    // Медиафайлы (Gemini) ─────────────────────────────────────
    var geminiType = GEMINI_MIMES[mime];
    if (geminiType) {
      // Лимит изображений на папку
      if (geminiType === 'image') {
        if (imageCount >= settings.maxImagesPerFolder) {
          Logger.log(indent + '🚫 Лимит фото (' + settings.maxImagesPerFolder + '): ' + fname);
          continue;
        }
        imageCount++;
      }
      // Лимит видео/аудио на всю сессию (защита от перерасхода Gemini)
      if (geminiType === 'video' || geminiType === 'audio') {
        if ((state.videoCount || 0) >= (settings.maxVideosTotal || 10)) {
          Logger.log(indent + '🚫 Лимит видео/аудио (' + (settings.maxVideosTotal || 10) + '): ' + fname);
          continue;
        }
        state.videoCount = (state.videoCount || 0) + 1;
      }

      if (!state.geminiAvailable) {
        Logger.log(indent + '⚠️ Gemini недоступен, пропуск: ' + fname);
        state.skipped.push(fname);
        continue;
      }

      Logger.log(indent + '🤖 Gemini (' + geminiType + '): ' + fname);
      if (state.geminiCallCount > 0) Utilities.sleep(4000); // пауза между вызовами Gemini (15 RPM = 4 сек)
      state.geminiCallCount = (state.geminiCallCount || 0) + 1;
      var extracted = transcribeWithGemini_(settings.geminiKey, file, mime, fname, state);
      if (extracted) {
        parts.push('--- ' + fname + ' (' + geminiType + ') ---\n' + extracted);
        state.filesRead++;
        var icon = geminiType === 'video' ? '🎬' : geminiType === 'audio' ? '🎙️' : geminiType === 'document' ? '📑' : '🖼️';
        var preview = extracted.replace(/\s+/g, ' ').trim().substring(0, 120);
        state.mediaLogs.push(icon + ' ' + fname + '\n    «' + preview + (extracted.length > 120 ? '...»' : '»'));
      }
      continue;
    }

    // Неизвестный формат — пропускаем молча
    Logger.log(indent + '⏭️ Неизвестный формат: ' + fname + ' (' + mime + ')');
  }

  // ── подпапки ──────────────────────────────────────────────
  var subfolders = folder.getFolders();
  while (subfolders.hasNext()) {
    var sub        = subfolders.next();
    var subName    = sub.getName();
    var subLower   = subName.toLowerCase();
    var indent2    = '  '.repeat(depth + 1);

    // Чёрный список — на всех уровнях
    if (settings.blacklist.length && settings.blacklist.indexOf(subLower) >= 0) {
      Logger.log(indent2 + '🚫 Чёрный список: ' + subName);
      continue;
    }

    // Белый список — только прямые подпапки корневой папки (depth === 0)
    if (depth === 0 && settings.whitelist.length && settings.whitelist.indexOf(subLower) < 0) {
      Logger.log(indent2 + '⏭️ Не в белом списке: ' + subName);
      continue;
    }

    if (depth >= 5) { Logger.log(indent2 + '⚠️ Макс. глубина папок (5), пропускаем: ' + subName); continue; }
    var subParts = processFolder_(sub, settings, state, depth + 1);
    parts = parts.concat(subParts);
  }

  return parts;
}

// ─── Gemini: расшифровка медиафайла ──────────────────────────
function transcribeWithGemini_(geminiKey, file, mimeType, fileName, state) {
  try {
    var geminiType = GEMINI_MIMES[mimeType] || 'unknown';
    var blob       = file.getBlob();

    var prompt = [
      'Это маркетинговый материал проекта. Выполни:',
      '1. Если есть текст (PDF, слайды) — извлеки его полностью.',
      '2. Если есть речь (видео, аудио) — транскрибируй полностью.',
      '3. Если изображение — опиши текст на экране, офферы, заголовки, ключевые смыслы.',
      '4. Выдели боли аудитории, офферы, результаты, цитаты.',
      'Имя файла: ' + fileName
    ].join('\n');

    var requestBody;

    // Видео и аудио — всегда через File API (могут быть большими)
    if (geminiType === 'video' || geminiType === 'audio') {
      Logger.log('    Загружаем ' + geminiType + ' через Gemini File API: ' + fileName);
      var fileUri = uploadFileToGemini_(geminiKey, blob, mimeType, fileName);
      if (!fileUri) {
        state.skipped.push(fileName + ' (ошибка загрузки File API)');
        return null;
      }
      requestBody = {
        contents: [{ parts: [
          { file_data: { mime_type: mimeType, file_uri: fileUri } },
          { text: prompt }
        ]}],
        generationConfig: { temperature: 0.1, maxOutputTokens: 4096 }
      };
    } else {
      // Изображения и PDF — inline если ≤15 МБ, иначе File API
      var fileBytes = blob.getBytes();
      var fileSize  = fileBytes.length;
      if (fileSize <= MAX_INLINE_BYTES) {
        requestBody = {
          contents: [{ parts: [
            { inline_data: { mime_type: mimeType, data: Utilities.base64Encode(fileBytes) } },
            { text: prompt }
          ]}],
          generationConfig: { temperature: 0.1, maxOutputTokens: 4096 }
        };
      } else {
        Logger.log('    Файл > 15 МБ, загружаем через Gemini File API...');
        var fileUri2 = uploadFileToGemini_(geminiKey, blob, mimeType, fileName);
        if (!fileUri2) {
          state.skipped.push(fileName + ' (ошибка загрузки File API)');
          return null;
        }
        requestBody = {
          contents: [{ parts: [
            { file_data: { mime_type: mimeType, file_uri: fileUri2 } },
            { text: prompt }
          ]}],
          generationConfig: { temperature: 0.1, maxOutputTokens: 4096 }
        };
      }
    }

    var response, code, body;
    response = UrlFetchApp.fetch(GEMINI_API_URL + '?key=' + geminiKey, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(requestBody),
      muteHttpExceptions: true
    });
    code = response.getResponseCode();
    body = response.getContentText();

    if (code === 429 || code === 503) {
      // Квотная ошибка — этот файл не обработан, но следующие всё равно попробуем
      var quotaMsg = '';
      try { quotaMsg = JSON.parse(body).error.message || ''; } catch (_) {}
      Logger.log('    Gemini 429 исчерпан после всех попыток: ' + fileName + ' | ' + quotaMsg);
      state.skipped.push(fileName + ' (429: ' + (quotaMsg || 'rate limit') + ')');
      return null;
    }
    if (code !== 200) {
      var errDetail = '';
      try { errDetail = JSON.parse(body).error.message || ''; } catch (_) {}
      Logger.log('    Gemini ошибка ' + code + ' (' + fileName + '): ' + errDetail);
      state.skipped.push(fileName + ' (Gemini ' + code + (errDetail ? ': ' + errDetail.substring(0, 60) : '') + ')');
      // Только при критических ошибках (невалидный ключ) отключаем Gemini совсем
      if (code === 400 || code === 401 || code === 403) state.geminiAvailable = false;
      return null;
    }

    var parsed = JSON.parse(body);
    return parsed.candidates[0].content.parts[0].text;

  } catch (e) {
    Logger.log('    Ошибка Gemini (' + fileName + '): ' + e.message);
    state.skipped.push(fileName + ' (исключение: ' + e.message.substring(0, 80) + ')');
    return null;
  }
}

// ─── Gemini File API: загрузка большого файла ────────────────
function uploadFileToGemini_(geminiKey, blob, mimeType, displayName) {
  try {
    var boundary = 'bound_' + Math.random().toString(36).slice(2);
    var metadata = JSON.stringify({ file: { display_name: displayName } });

    var headerStr  = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + metadata + '\r\n' +
                     '--' + boundary + '\r\nContent-Type: ' + mimeType + '\r\n\r\n';
    var footerStr  = '\r\n--' + boundary + '--';

    var headerBytes = Utilities.newBlob(headerStr).getBytes();
    var footerBytes = Utilities.newBlob(footerStr).getBytes();
    var fileBytes   = blob.getBytes();
    var allBytes    = headerBytes.concat(fileBytes).concat(footerBytes);

    var response = UrlFetchApp.fetch(GEMINI_UPLOAD_URL + '?uploadType=multipart&key=' + geminiKey, {
      method: 'post',
      contentType: 'multipart/related; boundary=' + boundary,
      payload: allBytes,
      muteHttpExceptions: true
    });

    if (response.getResponseCode() !== 200) {
      Logger.log('    Ошибка загрузки File API: ' + response.getContentText().substring(0, 200));
      return null;
    }
    var obj = JSON.parse(response.getContentText());
    Logger.log('    Файл загружен: ' + obj.file.uri);
    return obj.file.uri;

  } catch (e) {
    Logger.log('    Ошибка File API: ' + e.message);
    return null;
  }
}

// ─── Извлечение текста из Google Таблицы ─────────────────────
function extractSheetText_(fileId) {
  var ss    = SpreadsheetApp.openById(fileId);
  var texts = [];
  ss.getSheets().forEach(function(sheet) {
    var rows = sheet.getDataRange().getValues();
    var rowTexts = rows.map(function(row) {
      return row.filter(function(c) { return c !== '' && c !== null; }).join('\t');
    }).filter(function(r) { return r.trim() !== ''; });
    if (rowTexts.length) texts.push('[Лист: ' + sheet.getName() + ']\n' + rowTexts.join('\n'));
  });
  return texts.join('\n\n');
}

// ─── Извлечение текста из Google Презентации ─────────────────
function extractSlidesText_(fileId) {
  var presentation = SlidesApp.openById(fileId);
  var texts = [];
  presentation.getSlides().forEach(function(slide, i) {
    var slideTexts = [];
    slide.getShapes().forEach(function(shape) {
      try {
        var t = shape.getText().asString().trim();
        if (t) slideTexts.push(t);
      } catch (e) {}
    });
    if (slideTexts.length) texts.push('[Слайд ' + (i + 1) + ']\n' + slideTexts.join('\n'));
  });
  return texts.join('\n\n');
}

// ─── Переход по ссылкам из Google Таблицы ────────────────────
function followLinksInSheet_(fileId, settings, state) {
  var parts = [];
  var seen  = state.followedUrls || (state.followedUrls = {});

  try {
    var ss = SpreadsheetApp.openById(fileId);
    var urls = [];

    ss.getSheets().forEach(function(sheet) {
      sheet.getDataRange().getValues().forEach(function(row) {
        row.forEach(function(cell) {
          var matches = (cell + '').match(/https?:\/\/[^\s"'<>\)\]]+/g);
          if (matches) urls = urls.concat(matches);
        });
      });
    });

    // Дедупликация + лимит ссылок из одной таблицы
    var MAX_LINKS = 20;
    var unique = [];
    urls.forEach(function(url) {
      url = url.replace(/[.,;:!?]+$/, '');
      if (!seen[url] && unique.length < MAX_LINKS) { seen[url] = true; unique.push(url); }
    });
    if (urls.length > MAX_LINKS) Logger.log('    ⚠️ Ограничение: взято ' + MAX_LINKS + ' из ' + urls.length + ' ссылок');

    Logger.log('    Найдено ссылок в таблице: ' + unique.length);

    unique.forEach(function(url) {
      var result = fetchUrlContent_(url, settings, state);
      if (result) { parts.push(result); state.filesRead++; }
    });

  } catch (e) {
    Logger.log('    Ошибка при обходе ссылок: ' + e.message);
  }

  return parts;
}

// ─── Получение содержимого по URL ────────────────────────────
function fetchUrlContent_(url, settings, state) {
  Logger.log('    🔗 ' + url);

  try {
    // Google Документ
    var docMatch = url.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
    if (docMatch) {
      var text = DocumentApp.openById(docMatch[1]).getBody().getText();
      if (text.trim()) return '--- Документ по ссылке: ' + url + ' ---\n' + text;
      return null;
    }

    // Google Таблица (не рекурсируем — только читаем текст)
    var sheetMatch = url.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (sheetMatch) {
      var t = extractSheetText_(sheetMatch[1]);
      if (t.trim()) return '--- Таблица по ссылке: ' + url + ' ---\n' + t;
      return null;
    }

    // Google Презентация
    var slidesMatch = url.match(/docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/);
    if (slidesMatch) {
      var st = extractSlidesText_(slidesMatch[1]);
      if (st.trim()) return '--- Презентация по ссылке: ' + url + ' ---\n' + st;
      return null;
    }

    // Google Drive файл
    var driveMatch = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([a-zA-Z0-9_-]+)/);
    if (driveMatch) {
      var driveFile = DriveApp.getFileById(driveMatch[1]);
      var dMime = driveFile.getMimeType();
      if (GEMINI_MIMES[dMime] && state.geminiAvailable && settings.geminiKey) {
        var gt = transcribeWithGemini_(settings.geminiKey, driveFile, dMime, driveFile.getName(), state);
        if (gt) return '--- Drive-файл по ссылке: ' + url + ' ---\n' + gt;
      }
      return null;
    }

    // Внешний сайт
    var response = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GoogleBot/2.1; +http://www.google.com/bot.html)' }
    });

    if (response.getResponseCode() !== 200) {
      Logger.log('      HTTP ' + response.getResponseCode() + ' — пропуск');
      return null;
    }

    var html    = response.getContentText();
    var cleaned = stripHtml_(html);

    if (cleaned.length < 150) {
      Logger.log('      Слишком мало текста (JS-рендеринг?) — пропуск');
      return null;
    }

    // Обрезаем до разумного размера
    if (cleaned.length > 8000) cleaned = cleaned.substring(0, 8000) + '...[обрезано]';
    return '--- Страница по ссылке: ' + url + ' ---\n' + cleaned;

  } catch (e) {
    Logger.log('      Ошибка: ' + e.message);
    return null;
  }
}

// ─── Очистка HTML от тегов ────────────────────────────────────
function stripHtml_(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#\d+;/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ─── Запрос к Groq API ────────────────────────────────────────
// ─── Вызов LLM с автофallback Groq → Cerebras → Mistral ──────
function callLlmApi_(settings, messages, maxTokens, exhausted) {
  var tried = [];
  for (var i = 0; i < LLM_PROVIDERS.length; i++) {
    var p   = LLM_PROVIDERS[i];
    var key = settings[p.keyProp];
    if (!key)               continue; // ключ не настроен
    if (exhausted[p.name])  continue; // уже исчерпан

    Logger.log('🤖 ' + p.name + ': запрос...');
    tried.push(p.name);

    var payload = JSON.stringify({
      model:           p.model,
      messages:        messages,
      response_format: { type: 'json_object' },
      temperature:     0.7,
      max_tokens:      maxTokens || 4096
    });

    var response = UrlFetchApp.fetch(p.url, {
      method:      'post',
      contentType: 'application/json',
      headers:     { Authorization: 'Bearer ' + key },
      payload:     payload,
      muteHttpExceptions: true
    });

    var code = response.getResponseCode();
    var body = response.getContentText();

    if (code === 200) {
      try {
        var content = JSON.parse(body).choices[0].message.content;
        return { result: JSON.parse(stripJsonMarkdown_(content)), provider: p.name };
      } catch (parseErr) {
        Logger.log('⚠️ ' + p.name + ' JSON обрезан или невалиден: ' + parseErr.message);
        exhausted[p.name] = true;
        continue;
      }
    }

    if (code === 429 || code === 503 || code === 413 || code === 404) {
      var limitMsg = '';
      try { limitMsg = JSON.parse(body).error.message || ''; } catch (_) {}
      var reason = code === 413 ? 'запрос слишком большой' : code === 404 ? 'модель не найдена' : 'лимит';
      Logger.log('⚠️ ' + p.name + ' ' + reason + ' (HTTP ' + code + '): ' + limitMsg.substring(0, 120));
      exhausted[p.name] = true;
      continue; // немедленно пробуем следующий провайдер
    }

    // Прочие ошибки — бросаем исключение
    var errMsg = p.name + ' API вернул ошибку ' + code;
    try { var ep = JSON.parse(body); if (ep.error && ep.error.message) errMsg += ':\n' + ep.error.message; } catch (_) {}
    throw new Error(errMsg);
  }

  // Все провайдеры исчерпаны или не настроены
  var configured = LLM_PROVIDERS.filter(function(p) { return !!settings[p.keyProp]; }).map(function(p) { return p.name; });
  if (configured.length === 0) throw new Error('Не настроен ни один LLM-ключ. Добавьте Groq (B2), Cerebras (B9) или Mistral (B10).');
  throw new Error('Все LLM-провайдеры исчерпали лимиты: ' + configured.join(', ') + '.\nПодождите до следующего дня (UTC) или добавьте ключи оставшихся провайдеров.');
}

// ─── Вызов конкретной модели (kie.ai или бесплатный LLM) ──────
function callModelApi_(settings, model, messages, maxTokens) {
  if (model.provider === 'kieai') {
    var key = settings.kieaiKey;
    if (!key) throw new Error('Не указан API-ключ kie.ai (B11) для модели ' + model.label);

    var payload, rawText;

    if (model.apiFormat === 'anthropic') {
      // Формат Anthropic: system отдельно, messages без system
      var systemText = '';
      var userMsgs = messages.filter(function(m) {
        if (m.role === 'system') { systemText = m.content; return false; }
        return true;
      });
      payload = JSON.stringify({ model: model.id, system: systemText, messages: userMsgs, max_tokens: maxTokens || 4096, stream: false });

    } else if (model.apiFormat === 'responses') {
      // Формат OpenAI Responses API: input вместо messages
      var inputMsgs = messages.map(function(m) {
        return { role: m.role, content: [{ type: 'input_text', text: m.content }] };
      });
      payload = JSON.stringify({ model: model.id, stream: false, input: inputMsgs });

    } else {
      // OpenAI-совместимый формат (Gemini)
      payload = JSON.stringify({ model: model.id, messages: messages, response_format: { type: 'json_object' }, temperature: 0.7, max_tokens: maxTokens || 4096 });
    }

    var response = UrlFetchApp.fetch(model.url, {
      method: 'post', contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + key },
      payload: payload, muteHttpExceptions: true, deadline: 55
    });
    var code = response.getResponseCode();
    var body = response.getContentText();

    if (code === 200) {
      var parsed;
      try { parsed = JSON.parse(body); } catch (_) { throw new Error('[' + model.label + '] невалидный ответ: ' + body.substring(0, 200)); }

      // Извлекаем текст в зависимости от формата ответа
      if (model.apiFormat === 'anthropic') {
        // Anthropic: {content: [{type:'text', text:'...'}]}
        if (!parsed.content || !parsed.content[0]) {
          var h = parsed.error ? (parsed.error.message || JSON.stringify(parsed.error)) : (parsed.msg || body.substring(0, 200));
          throw new Error('[' + model.label + '] ' + h);
        }
        rawText = parsed.content[0].text;

      } else if (model.apiFormat === 'responses') {
        // OpenAI Responses API: {output: [{type:'message', content:[{type:'output_text', text:'...'}]}]}
        var msgItem = null;
        if (parsed.output) {
          for (var oi = 0; oi < parsed.output.length; oi++) {
            if (parsed.output[oi].type === 'message') { msgItem = parsed.output[oi]; break; }
          }
        }
        if (!msgItem || !msgItem.content || !msgItem.content[0]) {
          var h2 = parsed.msg || (parsed.error && parsed.error.message) || body.substring(0, 200);
          throw new Error('[' + model.label + '] ' + h2);
        }
        rawText = msgItem.content[0].text;

      } else {
        // OpenAI choices формат
        if (!parsed.choices || !parsed.choices[0]) {
          var h3 = parsed.msg || (parsed.error && (parsed.error.message || JSON.stringify(parsed.error))) || body.substring(0, 200);
          throw new Error('[' + model.label + '] ' + h3);
        }
        rawText = parsed.choices[0].message.content;
      }

      try { return JSON.parse(stripJsonMarkdown_(rawText)); } catch (_) {
        throw new Error('[' + model.label + '] не JSON: «' + rawText.substring(0, 150) + '»');
      }
    }

    var errMsg = '[' + model.label + '] HTTP ' + code;
    try { var ep = JSON.parse(body); errMsg += ': ' + (ep.msg || (ep.error && ep.error.message) || body.substring(0, 150)); } catch (_) {}
    throw new Error(errMsg);
  }

  // Бесплатный провайдер — находим в LLM_PROVIDERS и вызываем напрямую
  var prov = null;
  for (var i = 0; i < LLM_PROVIDERS.length; i++) {
    if (LLM_PROVIDERS[i].name.toLowerCase() === model.provider) { prov = LLM_PROVIDERS[i]; break; }
  }
  if (!prov) throw new Error('Провайдер не найден: ' + model.provider);
  var key2 = settings[prov.keyProp];
  if (!key2) throw new Error('Не указан ключ для ' + model.label + ' (провайдер ' + prov.name + ')');
  var payload2 = JSON.stringify({ model: prov.model, messages: messages, response_format: { type: 'json_object' }, temperature: 0.7, max_tokens: maxTokens || 4096 });
  var resp2 = UrlFetchApp.fetch(prov.url, {
    method: 'post', contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + key2 },
    payload: payload2, muteHttpExceptions: true
  });
  var code2 = resp2.getResponseCode();
  var body2 = resp2.getContentText();
  if (code2 === 200) {
    var parsed2;
    try { parsed2 = JSON.parse(body2); } catch (_) { throw new Error(model.label + ': невалидный ответ: ' + body2.substring(0, 200)); }
    if (!parsed2.choices || !parsed2.choices[0]) {
      throw new Error(model.label + ': ' + (parsed2.error && parsed2.error.message ? parsed2.error.message : body2.substring(0, 200)));
    }
    try { return JSON.parse(stripJsonMarkdown_(parsed2.choices[0].message.content)); } catch (_) {
      throw new Error(model.label + ': не JSON: «' + parsed2.choices[0].message.content.substring(0, 150) + '»');
    }
  }
  var err2 = model.label + ' HTTP ' + code2;
  try { var ep2 = JSON.parse(body2); if (ep2.error && ep2.error.message) err2 += ': ' + ep2.error.message; } catch (_) {}
  throw new Error(err2);
}

// Извлекает JSON из ответа модели: ищет первую { и последнюю }, отбрасывая всё вокруг
function stripJsonMarkdown_(text) {
  var t = text.trim();
  var start = t.indexOf('{');
  var end   = t.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) return t.substring(start, end + 1);
  return t;
}

// ─── Дополнительная строка в чеклист (для прогресса по моделям) ─
function appendChecklistLog_(msg, ok) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CHECKLIST_SHEET);
  if (!sheet) return;
  var r = sheet.getLastRow() + 1;
  sheet.getRange(r, 1, 1, 3).setValues([['-', 'Модели', msg]]);
  var bg = ok === true ? '#C8E6C9' : ok === false ? '#FFCDD2' : '#FFF9C4';
  var fc = ok === true ? '#1B5E20' : ok === false ? '#B71C1C' : '#F57F17';
  sheet.getRange(r, 2, 1, 2).setBackground(bg).setFontColor(fc).setWrap(true);
  sheet.setRowHeight(r, 36);
  SpreadsheetApp.flush();
}

// ─── Промпт 1: анализ продукта и ЦА ─────────────────────────
function buildPrompt1_(context) {
  var system = [
    'Ты — профессиональный маркетолог и копирайтер с глубокой экспертизой в нише онлайн-образования.',
    'Твоя задача — на основе предоставленных данных заполнить таблицу анализа проекта.',
    '',
    'ПРАВИЛА БЛОКА ПРОДУКТА:',
    '1. Что продаём? — название ДОСЛОВНО с посадочной или из брифа. НЕ переформулировать.',
    '2. О чём продукт? — ниша и кратко суть.',
    '3. Формат — берётся с посадочной (марафон / курс / программа и т.д.).',
    '4. Оффер — ОБЯЗАТЕЛЬНО сначала дословный оффер с первого экрана, затем улучшенная версия (пометить отдельно).',
    '5. Преимущества — основаны на данных ЦА, сравнение с альтернативами.',
    '6. Методика — механизм результата без "магии" и абстракций.',
    '7. Посадочная — уровень по лестнице Ханта + краткий портрет ЦА: пол, возраст, занятие.',
    '8. Спикер — только факты: имя, опыт, достижения. Без интерпретаций.',
    '',
    'ПРАВИЛА БЛОКА ЦА:',
    'Укажи 3 масштабируемых сегмента для таргетированной рекламы ВКонтакте.',
    'НЕ использовать: "ученики", "подписчики", "знают спикера".',
    'Для каждого сегмента: описание, уровень осознанности по Ханту, боли (с цитатами ЦА),',
    'потребности (языком ЦА), возражения, как продукт закрывает (боль → решение),',
    'результат (подробно), результат результата, оффер под сегмент.',
    '',
    'СТРОГИЕ ЗАПРЕТЫ: не менять название, не менять оффер с посадочной, не выдумывать факты.',
    '',
    'ЧЕК-ЛИСТ ПЕРЕД ОТВЕТОМ:',
    '✓ Название продукта = дословно?  ✓ Оффер с посадочной присутствует?',
    '✓ Нет выдуманных фактов?  ✓ Есть цитаты ЦА в болях?  ✓ Можно вставить без правок?',
    '',
    'ЛЕСТНИЦА ХАНТА: 0-не знает о проблеме, 1-знает но не ищет, 2-ищет решение,',
    '3-знает продукт, 4-сравнивает, 5-готов купить.',
    '',
    'Верни ТОЛЬКО валидный JSON:',
    JSON.stringify({
      product_block: {
        title: '...', description: '...', format: '...', offer: '...дословный...\\n\\n...улучшенный...',
        advantages: '...', methodology: '...', landing_page_analysis: '...', speaker: '...'
      },
      audience_segments: [
        { segment_id: 1, description: '...', awareness_level: 3,
          pains: '...', needs: '...', objections: '...', solutions: 'Боль→Решение',
          result: '...', result_of_result: '...', segment_offer: '...' },
        { segment_id: 2, description: '...', awareness_level: 2,
          pains: '...', needs: '...', objections: '...', solutions: '...',
          result: '...', result_of_result: '...', segment_offer: '...' },
        { segment_id: 3, description: '...', awareness_level: 1,
          pains: '...', needs: '...', objections: '...', solutions: '...',
          result: '...', result_of_result: '...', segment_offer: '...' }
      ]
    }, null, 2)
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user',   content: 'Материалы проекта:\n\n' + context }
  ];
}

// ─── Промпт 2a: 15 заходов ────────────────────────────────────
function buildPrompt2a_(analysisData) {
  var segs = (analysisData.audience_segments || []).map(function(s) {
    return 'Сегмент ' + s.segment_id + ': ' + s.description +
      '\nБоли: ' + s.pains + '\nПотребности: ' + s.needs +
      '\nВозражения: ' + s.objections + '\nОффер: ' + s.segment_offer;
  }).join('\n\n');

  var pb = analysisData.product_block;
  var product = 'Продукт: ' + pb.title + ' (' + pb.format + ')\nОффер: ' + pb.offer +
    '\nПреимущества: ' + pb.advantages + '\nМетодика: ' + pb.methodology;

  var system = [
    'Ты — маркетолог и копирайтер в нише онлайн-образования.',
    'Напиши 15 цепляющих заходов для промопостов ВКонтакте: по 5 на каждый из 3 сегментов.',
    'Разные механики: боль, выгода, закрытие возражения, эмоция, кейс, провокация.',
    'Каждый заход должен вызывать желание дочитать пост до конца.',
    '',
    'Каждое поле — отдельная колонка таблицы. Заполни каждое поле отдельно.',
    'Верни ТОЛЬКО валидный JSON (15 объектов):',
    JSON.stringify({ hypotheses: [{
      segment_id: 1, segment_name: 'Сегмент 1', segment_description: '...',
      hook: 'Текст захода — первый цепляющий абзац',
      key_message: 'Ключевое сообщение (одно предложение)',
      structure: 'Структура: 1. ... 2. ... 3. ...',
      emotions_triggers: 'Эмоции и триггеры: стыд, надежда...',
      headline_ideas: 'Идеи заголовков: "...", "..."'
    }]}, null, 2),
    '(Всего 15 объектов — по 5 на каждый из 3 сегментов)'
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user',   content: product + '\n\nСегменты ЦА:\n\n' + segs }
  ];
}

// ─── Промпт 2b: отбор 10 лучших ──────────────────────────────
function buildPrompt2b_(allData) {
  var list = (allData.hypotheses || []).map(function(h, i) {
    return '--- #' + (i+1) + ' Сегмент ' + h.segment_id + ' ---\n' +
      'Заход: ' + h.hook + '\nКлючевое: ' + h.key_message;
  }).join('\n\n');

  var system = [
    'Ты — эксперт по таргетированной рекламе ВКонтакте.',
    'ЗАДАЧА: из 15 заходов выбери ровно 10 лучших для старта таргета.',
    'Критерии отбора: отклик у холодной аудитории, разнообразие сегментов, конкретность хука.',
    '',
    '⚠️ КРИТИЧЕСКИ ВАЖНО: твой ответ должен быть ТОЛЬКО валидным JSON.',
    'НЕ пиши вступление, анализ, объяснения, markdown или любой текст вне JSON.',
    'Первый символ ответа = {',
    'Последний символ ответа = }',
    '',
    'Формат (ровно 10 объектов, все поля из оригинала):',
    JSON.stringify({ hypotheses: [{
      segment_id: 1, segment_name: '...', segment_description: '...',
      hook: '...', key_message: '...', structure: '...', emotions_triggers: '...', headline_ideas: '...'
    }]}, null, 2)
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user',   content: '15 заходов:\n\n' + list + '\n\nВерни JSON с 10 лучшими заходами.' }
  ];
}

// ─── Запись листов ────────────────────────────────────────────
function writeAnalysisSheet_(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(ANALYSIS_SHEET);
  if (!sheet) throw new Error('Лист «Анализ» не найден.');

  var pb = data.product_block;
  sheet.getRange(2, 1, 1, 8).clearContent();
  sheet.getRange(2, 1).setValue(pb.title);
  sheet.getRange(2, 2).setValue(pb.description);
  sheet.getRange(2, 3).setValue(pb.format);
  sheet.getRange(2, 4).setValue(pb.offer);
  sheet.getRange(2, 5).setValue(pb.advantages);
  sheet.getRange(2, 6).setValue(pb.methodology);
  sheet.getRange(2, 7).setValue(pb.landing_page_analysis);
  sheet.getRange(2, 8).setValue(pb.speaker);

  sheet.getRange(5, 1, 3, 9).clearContent();
  (data.audience_segments || []).slice(0, 3).forEach(function(seg, i) {
    var row = 5 + i;
    sheet.getRange(row, 1).setValue(seg.description);
    sheet.getRange(row, 2).setValue(seg.awareness_level);
    sheet.getRange(row, 3).setValue(seg.pains);
    sheet.getRange(row, 4).setValue(seg.needs);
    sheet.getRange(row, 5).setValue(seg.objections);
    sheet.getRange(row, 6).setValue(seg.solutions);
    sheet.getRange(row, 7).setValue(seg.result);
    sheet.getRange(row, 8).setValue(seg.result_of_result);
    sheet.getRange(row, 9).setValue(seg.segment_offer);
  });
}

function writeHypothesesSheet_(sheetName, data, ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    var h = ['Сегмент','Описание сегмента','Заход / Хук','Ключевое сообщение','Структура и содержание','Эмоции и триггеры','Идеи заголовков'];
    sheet.getRange(1,1,1,h.length).setValues([h]);
    sheet.getRange(1,1,1,h.length).setBackground('#E65100').setFontColor('#FFFFFF').setFontWeight('bold');
    [100,160,260,200,230,190,210].forEach(function(w,i) { sheet.setColumnWidth(i+1, w); });
  }
  var last = sheet.getLastRow();
  if (last >= 2) sheet.getRange(2, 1, last - 1, 7).clearContent();
  (data.hypotheses || []).forEach(function(h, i) {
    var row = 2 + i;
    sheet.getRange(row, 1).setValue(h.segment_name || 'Сегмент ' + h.segment_id);
    sheet.getRange(row, 2).setValue(h.segment_description);
    sheet.getRange(row, 3).setValue(h.hook);
    sheet.getRange(row, 4).setValue(h.key_message);
    sheet.getRange(row, 5).setValue(h.structure);
    sheet.getRange(row, 6).setValue(h.emotions_triggers);
    sheet.getRange(row, 7).setValue(h.headline_ideas);
    sheet.getRange(row, 1, 1, 7).setWrap(true).setVerticalAlignment('top');
    sheet.setRowHeight(row, 110);
  });
}

function writeLaunchSheet_(sheetName, data, ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.getRange(1,1,1,3).setValues([['Сегмент ЦА','Описание сегмента','Промо-гипотеза']]);
    sheet.getRange(1,1,1,3).setBackground('#6A1B9A').setFontColor('#FFFFFF').setFontWeight('bold');
    sheet.setColumnWidth(1,120); sheet.setColumnWidth(2,200); sheet.setColumnWidth(3,600);
  }
  var last = sheet.getLastRow();
  if (last >= 2) sheet.getRange(2, 1, last - 1, 3).clearContent();
  (data.hypotheses || []).slice(0, 10).forEach(function(h, i) {
    var combined = [
      'Заход: ' + h.hook, '',
      'Ключевое сообщение: ' + h.key_message, '',
      'Структура и содержание: ' + h.structure, '',
      'Эмоции и триггеры: ' + h.emotions_triggers, '',
      'Идеи заголовков: ' + h.headline_ideas
    ].join('\n');
    var row = 2 + i;
    sheet.getRange(row, 1).setValue(h.segment_name || 'Сегмент ' + h.segment_id);
    sheet.getRange(row, 2).setValue(h.segment_description);
    sheet.getRange(row, 3).setValue(combined);
    sheet.getRange(row, 1, 1, 3).setWrap(true).setVerticalAlignment('top');
    sheet.setRowHeight(row, 200);
  });
}

// ─── Чеклист ─────────────────────────────────────────────────
function resetChecklist_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CHECKLIST_SHEET);
  if (!sheet) return;
  var last = sheet.getLastRow();
  if (last > 7) sheet.deleteRows(8, last - 7);
  sheet.getRange(2, 1, 6, 3).setValues([
    [1, 'Читаем настройки (API-ключи, источники)',          '⬜ Ожидание'],
    [2, 'Читаем файлы (текст + Gemini для медиа)',          '⬜ Ожидание'],
    [3, 'Запрос 1: анализ продукта и ЦА',                  '⬜ Ожидание'],
    [4, 'Генерация 15 заходов (по выбранным моделям)',      '⬜ Ожидание'],
    [5, 'Отбор 10 лучших (по выбранным моделям)',           '⬜ Ожидание'],
    [6, 'Финал',                                            '⬜ Ожидание']
  ]);
  sheet.getRange(2, 3, 6, 1).setBackground('#F5F5F5').setFontColor('#888888');
  SpreadsheetApp.flush();
}

function updateChecklist_(stepNum, status) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CHECKLIST_SHEET);
  if (!sheet) return;
  if (stepNum === 0) {
    var last = sheet.getLastRow();
    sheet.getRange(last + 1, 1, 1, 3).setValues([['-', 'Ошибка', status]]);
    sheet.getRange(last + 1, 3).setBackground('#FFCDD2').setFontColor('#C62828');
  } else {
    var row = stepNum + 1;
    sheet.getRange(row, 3).setValue(status);
    var bg = status.indexOf('✅') === 0 ? '#C8E6C9' : status.indexOf('❌') === 0 ? '#FFCDD2' : '#FFF9C4';
    var fc = status.indexOf('✅') === 0 ? '#1B5E20' : status.indexOf('❌') === 0 ? '#C62828' : '#F57F17';
    sheet.getRange(row, 3).setBackground(bg).setFontColor(fc).setWrap(true).setVerticalAlignment('top');
    // Авторесайз строки по количеству строк текста
    var lines = status.split('\n').length;
    var minH = Math.max(40, lines * 18 + 10);
    sheet.setRowHeight(row, Math.min(minH, 400));
  }
  SpreadsheetApp.flush();
}

// ─── Инициализация листов ─────────────────────────────────────
function initSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  createSettingsSheet_(ss);
  createChecklistSheet_(ss);
  createAnalysisSheet_(ss);
  SpreadsheetApp.getUi().alert('Готово',
    'Шаблон создан.\n\nЗаполните лист «Настройки»:\n' +
    '• B2 — API-ключ Groq (основной LLM)\n' +
    '• B3 — Источники: папки Drive, ссылки, сайты\n' +
    '• B4 — API-ключ Gemini (для PDF, фото, видео)\n' +
    '• B9 — API-ключ Cerebras (резервный LLM)\n' +
    '• B10 — API-ключ Mistral (резервный LLM)\n' +
    '• B11 — API-ключ kie.ai (Claude, GPT-5, Gemini Pro)\n\n' +
    'Листы гипотез создаются автоматически при запуске анализа\n' +
    '(по одной паре «Гипотезы / Лучшие» на каждую выбранную модель).',
    SpreadsheetApp.getUi().ButtonSet.OK);
}

function createSettingsSheet_(ss) {
  var sheet = ss.getSheetByName(SETTINGS_SHEET);
  if (!sheet) sheet = ss.insertSheet(SETTINGS_SHEET);
  sheet.clearContents();

  // Строки 1-12: основные настройки
  sheet.getRange(1, 1, 12, 2).setValues([
    ['Параметр',                                    'Значение'],
    ['API-ключ Groq (основной LLM)',                 ''],
    ['Источники (по одному в строке Alt+Enter)',     ''],
    ['API-ключ Gemini (для PDF/фото/видео)',         ''],
    ['Чёрный список папок (через запятую)',          ''],
    ['Белый список папок (через запятую)',           ''],
    ['Макс. фото из одной папки',                    10],
    ['Переходить по ссылкам из таблиц (да / нет)',  'да'],
    ['API-ключ Cerebras (резервный LLM)',            ''],
    ['API-ключ Mistral (резервный LLM)',             ''],
    ['API-ключ kie.ai (все платные модели)',         ''],
    ['Последний файл для теста kie.ai (ID)',         ''],
  ]);
  sheet.getRange(1, 1, 1, 3).setBackground('#4A90D9').setFontColor('#FFFFFF').setFontWeight('bold');
  sheet.getRange(2, 1, 11, 1).setFontWeight('bold');
  sheet.getRange(3, 2).setWrap(true);
  sheet.setRowHeight(3, 100);
  sheet.setColumnWidth(1, 280);
  sheet.setColumnWidth(2, 380);
  sheet.setColumnWidth(3, 200);

  // Строка 13: заголовок секции моделей
  sheet.getRange(13, 1).setValue('▼ Модели для гипотез (шаги 4–5)');
  sheet.getRange(13, 2).setValue('Вкл?');
  sheet.getRange(13, 3).setValue('Стоимость / запуск');
  sheet.getRange(13, 1, 1, 3).setBackground('#37474F').setFontColor('#FFFFFF').setFontWeight('bold');

  // Строки MODEL_ROW_START+: чекбоксы моделей
  MODEL_CATALOG.forEach(function(m, i) {
    var row = MODEL_ROW_START + i;
    sheet.getRange(row, 1).setValue(m.label).setFontWeight('bold');
    sheet.getRange(row, 2).insertCheckboxes().setValue(i === 0); // Gemini 2.5 Flash включён по умолчанию
    sheet.getRange(row, 3).setValue(m.hint).setFontColor('#888888').setFontStyle('italic');
    // kie.ai — голубоватый фон, бесплатные — зеленоватый
    var bg = m.provider === 'kieai'
      ? (i % 2 === 0 ? '#E3F2FD' : '#BBDEFB')
      : (i % 2 === 0 ? '#E8F5E9' : '#C8E6C9');
    sheet.getRange(row, 1, 1, 3).setBackground(bg);
  });

  // Подсказки — ниже моделей
  var hintsRow = MODEL_ROW_START + MODEL_CATALOG.length + 1;
  sheet.getRange(hintsRow, 1).setValue('Подсказки:').setFontWeight('bold');
  [
    ['Groq:',         'console.groq.com → API Keys  (бесплатно 100k токенов/день)'],
    ['Cerebras:',     'cloud.cerebras.ai → API Keys  (бесплатно, быстрый)'],
    ['Mistral:',      'console.mistral.ai → API Keys  (бесплатно)'],
    ['Gemini:',       'aistudio.google.com → Get API Key  (для PDF, фото, видео)'],
    ['kie.ai:',       'kie.ai → один ключ для всех платных моделей (Claude, GPT-5, Gemini Pro)'],
    ['Источники:',    'URL папки Drive, ссылка на Google Doc, внешний сайт — по одному на строку'],
    ['Чёрный список:','Фото спикера, Архив, Личное  (папки, которые НЕ читать)'],
    ['Белый список:', 'Кастдевы, Посадочные  (если пусто — читать все папки)'],
    ['Макс. фото:',   'По умолчанию 10. Защита от папок с фотосессиями спикера.'],
    ['Ссылки:',       'да — скрипт читает Google Docs/Sheets/сайты из ячеек таблиц']
  ].forEach(function(row, i) {
    sheet.getRange(hintsRow + 1 + i, 1).setValue(row[0]).setFontColor('#888888').setFontStyle('italic');
    sheet.getRange(hintsRow + 1 + i, 2).setValue(row[1]).setFontColor('#888888').setFontStyle('italic');
  });
}

function createChecklistSheet_(ss) {
  var sheet = ss.getSheetByName(CHECKLIST_SHEET);
  if (!sheet) sheet = ss.insertSheet(CHECKLIST_SHEET);
  sheet.clearContents();
  sheet.getRange(1, 1, 1, 3).setValues([['№ шага', 'Описание', 'Статус']]);
  sheet.getRange(1, 1, 1, 3).setBackground('#37474F').setFontColor('#FFFFFF').setFontWeight('bold');
  sheet.getRange(2, 1, 6, 3).setValues([
    [1, 'Читаем настройки (API-ключи, источники)',         '⬜ Ожидание'],
    [2, 'Читаем файлы (текст + Gemini для медиа)',         '⬜ Ожидание'],
    [3, 'Запрос 1: анализ продукта и ЦА',                 '⬜ Ожидание'],
    [4, 'Генерация 15 заходов (по выбранным моделям)',     '⬜ Ожидание'],
    [5, 'Отбор 10 лучших (по выбранным моделям)',          '⬜ Ожидание'],
    [6, 'Финал',                                          '⬜ Ожидание']
  ]);
  sheet.getRange(2, 3, 6, 1).setBackground('#F5F5F5').setFontColor('#888888');
  sheet.getRange(2, 1, 6, 3).setWrap(true).setVerticalAlignment('top');
  sheet.setColumnWidth(1, 70); sheet.setColumnWidth(2, 340); sheet.setColumnWidth(3, 500);
  for (var r = 2; r <= 7; r++) sheet.setRowHeight(r, 40);
  sheet.setRowHeight(3, 80); // строка шага 2 — для логов файлов
}

function createAnalysisSheet_(ss) {
  var sheet = ss.getSheetByName(ANALYSIS_SHEET);
  if (!sheet) sheet = ss.insertSheet(ANALYSIS_SHEET);
  sheet.clearContents();

  var ph = ['Что продаём?','О чём продукт?','Формат','Оффер','Преимущества','Методика','Посадочная страница','Спикер'];
  sheet.getRange(1, 1, 1, ph.length).setValues([ph]);
  sheet.getRange(1, 1, 1, ph.length).setBackground('#2E7D32').setFontColor('#FFFFFF').setFontWeight('bold').setWrap(true);
  sheet.getRange(3, 1).setValue('Сегменты целевой аудитории').setFontWeight('bold').setFontSize(12);

  var ah = ['Описание сегмента','Уровень\nосознанности\n(0–5)','Боли','Потребности','Возражения','Как закрывает боли','Результат','Результат результата','Оффер под сегмент'];
  sheet.getRange(4, 1, 1, ah.length).setValues([ah]);
  sheet.getRange(4, 1, 1, ah.length).setBackground('#1565C0').setFontColor('#FFFFFF').setFontWeight('bold').setWrap(true);

  [2,5,6,7].forEach(function(r) { sheet.setRowHeight(r, 120); });
  [200,120,220,220,220,250,200,200,220].forEach(function(w,i) { sheet.setColumnWidth(i+1, w); });
  sheet.getRange(2,1,1,8).setWrap(true);
  sheet.getRange(5,1,3,9).setWrap(true);
}

