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
var LLM_PROVIDERS = [
  { name: 'Groq',     url: 'https://api.groq.com/openai/v1/chat/completions',   model: 'llama-3.3-70b-versatile', keyProp: 'groqKey',     pauseMs: 62000 },
  { name: 'Groq 2',   url: 'https://api.groq.com/openai/v1/chat/completions',   model: 'llama-3.3-70b-versatile', keyProp: 'groqKey2',    pauseMs: 62000 },
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
var MODEL_ROW_START = 16;

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

var PER_FILE_COMPRESS_ = 25000; // сжимать через Gemini файлы длиннее этого порога

var RUN_COSTS_    = [];
var RUN_START_MS_ = 0;
var STATE_SHEET_  = 'МктСтейт';
var MAX_CYCLES_   = 10;
var MAX_RUN_MS_   = 270000;
function timeIsLow_() { return (new Date().getTime() - RUN_START_MS_) > MAX_RUN_MS_; }
function recordCost_() {}

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

// ─── Только сжатие контекста → кэш (для больших папок > 4M символов) ─
function runCompressOnly() {
  var ui = SpreadsheetApp.getUi();
  try {
    var settings = readSettings_();
    if (!settings.sources || settings.sources.length === 0) {
      ui.alert('Ошибка', 'Не указан ни один источник (B3)', ui.ButtonSet.OK); return;
    }
    if (!settings.geminiKey) {
      ui.alert('Ошибка', 'Не указан ключ Gemini (B4) — он нужен для сжатия', ui.ButtonSet.OK); return;
    }

    var ss       = SpreadsheetApp.getActiveSpreadsheet();
    var cacheKey = computeCacheKey_(settings);

    // Проверяем — вдруг кэш уже есть
    if (loadContextCache_(ss, cacheKey)) {
      var ans = ui.alert('Кэш уже существует',
        'Лист «Кэш» уже содержит сжатый контекст для текущих источников.\nПересжать заново?',
        ui.ButtonSet.YES_NO);
      if (ans !== ui.Button.YES) return;
    }

    ui.alert('Запуск сжатия',
      'Скрипт прочитает все файлы и сожмёт их через Gemini.\n' +
      'Для больших папок (4M+ символов) это занимает 4–6 минут.\n\n' +
      'Закройте это окно и не закрывайте браузер до завершения.',
      ui.ButtonSet.OK);

    Logger.log('=== Компрессия контекста ===');
    var sheet = ss.getSheetByName(CHECKLIST_SHEET);
    function log_(msg) {
      if (sheet) { sheet.getRange(8, 3).setValue(msg); SpreadsheetApp.flush(); }
      Logger.log(msg);
    }

    log_('⏳ Читаем файлы...');
    var result = collectDriveContext_(settings);
    var context = result.context;
    if (!context || !context.trim()) {
      ui.alert('Ошибка', 'Нет читаемых файлов.', ui.ButtonSet.OK); return;
    }
    log_('✅ Файлов: ' + result.filesRead + ' | ' + Math.round(context.length / 1000) + 'k симв. Запускаем Gemini...');

    var nChunks = Math.ceil(context.length / 3000000);
    log_('⏳ Gemini: сжимаем (' + nChunks + ' запрос(а))...');
    var compressed = compressContextWithGemini_(context, settings.geminiKey, settings.kieaiKey);

    saveContextCache_(ss, cacheKey, compressed);
    log_('✅ Кэш сохранён: ' + Math.round(compressed.length / 1000) + 'k симв. Теперь запускайте «Запустить анализ проекта».');

    ui.alert('Готово',
      'Контекст сжат и сохранён в лист «Кэш».\n\n' +
      'Исходный: ' + Math.round(context.length / 1000) + 'k симв.\n' +
      'Сжатый: ' + Math.round(compressed.length / 1000) + 'k симв.\n\n' +
      'Теперь запускайте «Запустить анализ проекта» — шаг 2 будет мгновенным.',
      ui.ButtonSet.OK);

  } catch (e) {
    Logger.log('ОШИБКА компрессии: ' + e.message);
    ui.alert('Ошибка сжатия', e.message, ui.ButtonSet.OK);
  }
}

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

// ─── Точка входа (поддерживает автоперезапуск при таймауте) ───
function runMarketingAnalysis() {
  RUN_START_MS_ = new Date().getTime();
  var state = _loadState_();

  if (state) {
    // Автоматический перезапуск по триггеру
    state.cycleCount = (state.cycleCount || 1) + 1;
    if (state.cycleCount > MAX_CYCLES_) {
      _clearState_();
      updateChecklist_(0, '❌ Превышено максимальное число автоперезапусков (' + MAX_CYCLES_ + '). Проверьте ошибки и запустите вручную.');
      return;
    }
    Logger.log('🔄 Автоперезапуск #' + state.cycleCount + ' | фаза: ' + state.phase);
    updateChecklist_(2, '🔄 Автоперезапуск #' + state.cycleCount + ' | фаза: ' + state.phase + '...');
    _resumeRun_(state);
  } else {
    _startFreshRun_();
  }
}

// ─── Свежий запуск (инициирован пользователем) ────────────────
function _startFreshRun_() {
  var ui = SpreadsheetApp.getUi();
  try {
    resetChecklist_();
    RUN_COSTS_ = [];

    var settings = readSettings_();
    var hasLlm = settings.groqKey || settings.groqKey2 || settings.cerebrasKey || settings.mistralKey;
    if (!hasLlm) { ui.alert('Ошибка', 'Не указан ни один LLM-ключ (B2/B9/B10/B13)', ui.ButtonSet.OK); return; }
    if (!settings.sources || !settings.sources.length) { ui.alert('Ошибка', 'Не указан источник (B3)', ui.ButtonSet.OK); return; }
    if (!settings.selectedModels || !settings.selectedModels.length) { ui.alert('Ошибка', 'Не выбрана ни одна модель (Настройки, строки 15+)', ui.ButtonSet.OK); return; }

    var llmKeys = LLM_PROVIDERS.filter(function(p) { return !!settings[p.keyProp]; }).map(function(p) { return p.name; });
    updateChecklist_(1, '✅ Настройки прочитаны | LLM: ' + (llmKeys.join(', ') || '—') + (settings.geminiKey ? ' | Gemini ✓' : ''));

    var ss       = SpreadsheetApp.getActiveSpreadsheet();
    var cacheKey = computeCacheKey_(settings);
    var cached   = loadContextCache_(ss, cacheKey);

    if (cached) {
      updateChecklist_(2, '📦 Контекст из кэша: ' + Math.round(cached.length / 1000) + 'k симв.\nДля пересборки из файлов — удалите лист «Кэш».');
      _phaseAnalyze_(settings, cacheKey, [], {}, 1);
      return;
    }

    updateChecklist_(2, '⏳ Сканируем источники...');
    var result  = collectDriveContext_(settings);
    var context = result.context;
    if (!context || !context.trim()) { ui.alert('Ошибка', 'Нет читаемых файлов.', ui.ButtonSet.OK); return; }

    var status2 = '✅ Файлов: ' + result.filesFound + ' | обработано: ' + result.filesRead + ' | ' + Math.round(context.length / 1000) + 'k симв.';
    if (result.mediaLogs && result.mediaLogs.length) status2 += '\n🤖 Gemini (' + result.mediaLogs.length + '):\n' + result.mediaLogs.join('\n');
    if (result.skipped   && result.skipped.length)   status2 += '\n⚠️ Пропущено: ' + result.skipped.join(', ');
    updateChecklist_(2, status2);

    if (context.length <= 80000 || !settings.geminiKey) {
      if (context.length > 80000) {
        context = context.substring(0, 80000) + '\n[⚠️ Обрезано — нет ключа Gemini в B4]';
        updateChecklist_(2, status2 + '\n⚠️ Обрезано до 80k (нет ключа Gemini в B4)');
      }
      saveContextCache_(ss, cacheKey, context);
      _phaseAnalyze_(settings, cacheKey, [], {}, 1);
      return;
    }

    var totalChunks = Math.ceil(context.length / 3000000);
    updateChecklist_(2, status2 + '\n\n⏳ Контекст ' + Math.round(context.length / 1000) + 'k симв. — начинаем сжатие (' + totalChunks + ' частей)...');

    _saveRawToState_(context);
    _phaseCompress_({
      phase:          'compress',
      cacheKey:       cacheKey,
      chunksDone:     0,
      totalChunks:    totalChunks,
      settingsPacked: _packSettingIds_(settings),
      cycleCount:     1,
      status2:        status2,
      costsJson:      '[]'
    }, settings);

  } catch (e) {
    _clearState_();
    Logger.log('ОШИБКА (fresh): ' + e.message);
    updateChecklist_(0, '❌ ' + e.message);
    ui.alert('Ошибка', e.message, ui.ButtonSet.OK);
  }
}

// ─── Продолжение после автоперезапуска ────────────────────────
function _resumeRun_(state) {
  var settings = _unpackSettings_(state.settingsPacked);
  try { RUN_COSTS_ = JSON.parse(state.costsJson || '[]'); } catch (_) { RUN_COSTS_ = []; }
  try {
    if (state.phase === 'compress') {
      _phaseCompress_(state, settings);
    } else if (state.phase === 'analyze') {
      _phaseAnalyze_(settings, state.cacheKey, state.completedModelIds || [], state.exhausted || {}, state.cycleCount);
    } else {
      _clearState_();
      updateChecklist_(0, '❌ Неизвестная фаза «' + state.phase + '». Запустите вручную.');
    }
  } catch (e) {
    _clearState_();
    Logger.log('ОШИБКА (resume, фаза ' + state.phase + '): ' + e.message);
    updateChecklist_(0, '❌ Ошибка при автоперезапуске: ' + e.message);
  }
}

// ─── Фаза сжатия: чанк за чанком, с сохранением прогресса ────
function _phaseCompress_(state, settings) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var rawText = _loadRawFromState_();
  if (!rawText) {
    _clearState_();
    updateChecklist_(0, '❌ Не удалось загрузить сырой контекст из листа МктСтейт.');
    return;
  }

  var CHUNK_SIZE = 3000000;
  var parts = [];
  for (var i = 0; i < rawText.length; i += CHUNK_SIZE) parts.push(rawText.substring(i, i + CHUNK_SIZE));
  var totalChunks = parts.length;
  var chunksDone  = state.chunksDone || 0;

  if (chunksDone === 0) _initPartialCache_(ss, state.cacheKey);

  for (var c = chunksDone; c < totalChunks; c++) {
    if (timeIsLow_()) {
      state.chunksDone = c;
      state.costsJson  = JSON.stringify(RUN_COSTS_);
      _saveState_(state);
      updateChecklist_(2, (state.status2 || '') + '\n\n⏳ Сжато ' + c + '/' + totalChunks + ' частей. Прогресс сохранён.\n▶ Нажмите «Запустить анализ» ещё раз — продолжим с этого места.');
      return;
    }

    updateChecklist_(2, (state.status2 || '') + '\n\n⏳ Gemini: часть ' + (c + 1) + '/' + totalChunks + '...');
    if (c > 0) Utilities.sleep(5000);

    var summary = _compressOneChunk_(parts[c], c, totalChunks, settings);
    _appendSummaryToCache_(ss, summary);
    Logger.log('✅ Chunk ' + (c + 1) + '/' + totalChunks + ' → ' + Math.round(summary.length / 1000) + 'k симв.');
  }

  _finalizePartialCache_(ss, state.cacheKey);

  var compressed = loadContextCache_(ss, state.cacheKey);
  var sz = compressed ? Math.round(compressed.length / 1000) : 0;
  updateChecklist_(2, (state.status2 || '') + '\n\n✅ Gemini сжал ' + totalChunks + ' частей → ' + sz + 'k симв. Сохранено в кэш.');

  if (timeIsLow_()) {
    _saveState_({ phase: 'analyze', cacheKey: state.cacheKey, completedModelIds: [], exhausted: {}, settingsPacked: state.settingsPacked, cycleCount: state.cycleCount, costsJson: JSON.stringify(RUN_COSTS_) });
    updateChecklist_(3, '⏳ Прогресс сохранён.\n▶ Нажмите «Запустить анализ» ещё раз — продолжим с шага 3.');
    return;
  }

  _phaseAnalyze_(settings, state.cacheKey, [], {}, state.cycleCount);
}

// ─── Фаза анализа: шаги 3-5 с автоперезапуском ───────────────
function _phaseAnalyze_(settings, cacheKey, completedModelIds, exhausted, cycleCount) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var context = loadContextCache_(ss, cacheKey);
  if (!context) {
    _clearState_();
    updateChecklist_(0, '❌ Кэш контекста утерян (ключ ' + cacheKey + '). Запустите заново.');
    return;
  }

  // Шаг 3 — анализ продукта (если ещё не выполнен)
  var savedAnalysis = _loadAnalysis_();
  var analysisData;

  if (!savedAnalysis) {
    updateChecklist_(3, '⏳ LLM: анализ продукта и ЦА...');
    var r1 = callLlmApi_(settings, buildPrompt1_(context), 8192, exhausted);
    writeAnalysisSheet_(r1.result);
    analysisData = r1.result;
    updateChecklist_(3, '✅ Анализ записан в лист «Анализ» [' + r1.provider + ']');
    _saveAnalysis_(analysisData);

    if (timeIsLow_()) {
      _saveState_({ phase: 'analyze', cacheKey: cacheKey, completedModelIds: completedModelIds, exhausted: exhausted, settingsPacked: _packSettingIds_(settings), cycleCount: cycleCount, costsJson: JSON.stringify(RUN_COSTS_) });
      updateChecklist_(4, '⏳ Прогресс сохранён.\n▶ Нажмите «Запустить анализ» ещё раз — продолжим с генерации заходов.');
      return;
    }
  } else {
    analysisData = savedAnalysis;
  }

  // Шаги 4-5 — цикл по выбранным моделям
  var models    = settings.selectedModels;
  var remaining = models.filter(function(m) { return completedModelIds.indexOf(m.id) < 0; });

  updateChecklist_(4, '⏳ Заходы: ' + completedModelIds.length + ' / ' + models.length + ' готово...');
  updateChecklist_(5, '⏳ Ожидание...');

  for (var mi = 0; mi < remaining.length; mi++) {
    if (timeIsLow_()) {
      _saveState_({ phase: 'analyze', cacheKey: cacheKey, completedModelIds: completedModelIds, exhausted: exhausted, settingsPacked: _packSettingIds_(settings), cycleCount: cycleCount, costsJson: JSON.stringify(RUN_COSTS_) });
      updateChecklist_(4, '⏳ [' + completedModelIds.length + '/' + models.length + '] Прогресс сохранён.\n▶ Нажмите «Запустить анализ» ещё раз — продолжим.');
      return;
    }

    var model  = remaining[mi];
    var mLabel = model.label;

    try {
      if (mi > 0 || completedModelIds.length > 0) Utilities.sleep(model.provider === 'groq' ? 62000 : 3000);

      updateChecklist_(4, '⏳ [' + (completedModelIds.length + mi + 1) + '/' + models.length + '] ' + mLabel + ': 15 заходов...');
      var r2 = callModelApi_(settings, model, buildPrompt2a_(analysisData), 5500);
      writeHypothesesSheet_('Гипотезы — ' + mLabel, r2, ss);

      Utilities.sleep(model.provider === 'groq' ? 62000 : 3000);

      updateChecklist_(5, '⏳ [' + (completedModelIds.length + mi + 1) + '/' + models.length + '] ' + mLabel + ': отбор 10...');
      var r3 = callModelApi_(settings, model, buildPrompt2b_(r2), 3500);
      writeLaunchSheet_('Лучшие — ' + mLabel, r3, ss);

      completedModelIds.push(model.id);
      appendChecklistLog_('✅ ' + mLabel + ' → «Гипотезы» + «Лучшие»', true);
      updateChecklist_(4, '✅ Заходы: ' + completedModelIds.length + ' / ' + models.length);

    } catch (modelErr) {
      Logger.log('Ошибка модели ' + mLabel + ': ' + modelErr.message);
      appendChecklistLog_('❌ ' + mLabel + ': ' + modelErr.message, false);
      completedModelIds.push(model.id); // пропустить при следующем цикле
    }
  }

  // Всё готово
  _clearState_();

  var doneCount = models.filter(function(m) { return completedModelIds.indexOf(m.id) >= 0; }).length;
  if (doneCount === 0) {
    updateChecklist_(0, '❌ Все выбранные модели вернули ошибки. Проверьте ключи и лимиты.');
    return;
  }

  updateChecklist_(5, '✅ Отбор завершён для ' + doneCount + ' моделей');
  updateChecklist_(6, '✅ Готово! Создано ' + (doneCount * 2) + ' листов.');
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
    groqKey2:           (sheet.getRange('B13').getValue() + '').trim(),
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
        text = _compressFileText_(text, 'Google Doc: ' + source, settings, state);
        return ['--- Google Doc: ' + source + ' ---\n' + text];
      }

      case 'gsheet': {
        state.filesFound++;
        var parts = [];
        var sheetText = extractSheetText_(classified.id);
        if (sheetText.trim()) {
          sheetText = _compressFileText_(sheetText, 'Google Sheet: ' + source, settings, state);
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
        slideText = _compressFileText_(slideText, 'Google Slides: ' + source, settings, state);
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
          t = _compressFileText_(t, fname, settings, state);
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
        if (text.trim()) {
          text = _compressFileText_(text, fname, settings, state);
          parts.push('--- ' + fname + ' ---\n' + text); state.filesRead++;
        }
      } catch (e) { Logger.log(indent + 'Ошибка: ' + e.message); }
      continue;
    }

    // Google Таблица
    if (mime === MimeType.GOOGLE_SHEETS) {
      Logger.log(indent + '📊 ' + fname);
      try {
        var sheetText = extractSheetText_(file.getId());
        if (sheetText.trim()) {
          sheetText = _compressFileText_(sheetText, fname, settings, state);
          parts.push('--- ' + fname + ' ---\n' + sheetText); state.filesRead++;
        }
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
        if (slideText.trim()) {
          slideText = _compressFileText_(slideText, fname, settings, state);
          parts.push('--- ' + fname + ' ---\n' + slideText); state.filesRead++;
        }
      } catch (e) { Logger.log(indent + 'Ошибка: ' + e.message); }
      continue;
    }

    // Текст / CSV
    if (mime === MimeType.PLAIN_TEXT || mime === 'text/csv' || fname.match(/\.(txt|csv)$/i)) {
      Logger.log(indent + '📝 ' + fname);
      try {
        var t = file.getBlob().getDataAsString('UTF-8');
        if (t.trim()) {
          t = _compressFileText_(t, fname, settings, state);
          parts.push('--- ' + fname + ' ---\n' + t); state.filesRead++;
        }
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
    var cand = parsed.candidates && parsed.candidates[0];
    if (!cand || !cand.content || !cand.content.parts || !cand.content.parts[0]) {
      var fb = parsed.promptFeedback || parsed.error || {};
      Logger.log('    Gemini пустой ответ (' + fileName + '): ' + JSON.stringify(fb).substring(0, 120));
      state.skipped.push(fileName + ' (Gemini: пустой ответ)');
      return null;
    }
    return cand.content.parts[0].text;

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
        var parsed0 = JSON.parse(body);
        var content = parsed0.choices[0].message.content;
        var u0 = parsed0.usage || {};
        recordCost_('Анализ (шаг 3)', p.name, p.model, u0.prompt_tokens || 0, u0.completion_tokens || 0);
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

      // Извлекаем текст и токены в зависимости от формата ответа
      var tokIn = 0, tokOut = 0;
      if (model.apiFormat === 'anthropic') {
        if (!parsed.content || !parsed.content[0]) {
          var h = parsed.error ? (parsed.error.message || JSON.stringify(parsed.error)) : (parsed.msg || body.substring(0, 200));
          throw new Error('[' + model.label + '] ' + h);
        }
        rawText = parsed.content[0].text;
        var ua = parsed.usage || {};
        tokIn = ua.input_tokens || 0; tokOut = ua.output_tokens || 0;

      } else if (model.apiFormat === 'responses') {
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
        var ur = parsed.usage || {};
        tokIn = ur.input_tokens || ur.prompt_tokens || 0; tokOut = ur.output_tokens || ur.completion_tokens || 0;

      } else {
        if (!parsed.choices || !parsed.choices[0]) {
          var h3 = parsed.msg || (parsed.error && (parsed.error.message || JSON.stringify(parsed.error))) || body.substring(0, 200);
          throw new Error('[' + model.label + '] ' + h3);
        }
        rawText = parsed.choices[0].message.content;
        var uo = parsed.usage || {};
        tokIn = uo.prompt_tokens || 0; tokOut = uo.completion_tokens || 0;
      }

      recordCost_(model.label, model.label, model.id, tokIn, tokOut);
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

// ─── Кэш сжатого контекста (лист «Кэш» в той же таблице) ─────
// Ключ = MD5 от списка источников (B3). Изменились источники → новый ключ → пересборка.
// Для ручного сброса — просто удалите лист «Кэш».

function computeCacheKey_(settings) {
  var data  = settings.sources.slice().sort().join('|');
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, data);
  return bytes.map(function(b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('').substring(0, 16);
}

function loadContextCache_(ss, key) {
  var sheet = ss.getSheetByName('Кэш');
  if (!sheet) return null;
  if ((sheet.getRange(1, 1).getValue() + '').trim() !== key) return null;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var text = values.map(function(r) { return r[0] + ''; }).join('');
  return text || null;
}

function saveContextCache_(ss, key, context) {
  var sheet = ss.getSheetByName('Кэш');
  if (!sheet) { sheet = ss.insertSheet('Кэш'); sheet.hideSheet(); }
  sheet.clearContents();
  // Строка 1: мета-данные
  sheet.getRange(1, 1).setValue(key);
  sheet.getRange(1, 2).setValue(new Date().toISOString());
  sheet.getRange(1, 3).setValue(Math.round(context.length / 1000) + 'k симв.');
  // Строки 2+: контекст кусками по 45k символов (лимит ячейки Google Sheets — 50k)
  var CHUNK = 45000;
  var row   = 2;
  for (var i = 0; i < context.length; i += CHUNK) {
    sheet.getRange(row++, 1).setValue(context.substring(i, i + CHUNK));
  }
  SpreadsheetApp.flush();
  Logger.log('💾 Кэш сохранён: ' + Math.round(context.length / 1000) + 'k симв., ' + (row - 2) + ' строк');
}

// ─── Сжатие большого контекста через Gemini ──────────────────
// Gemini принимает до ~4M символов; мы бьём на куски по 3M и просим извлечь маркетинг-суть
function compressContextWithGemini_(fullContext, geminiKey, kieaiKey) {
  var CHUNK_SIZE = 3000000;
  var parts = [];
  for (var i = 0; i < fullContext.length; i += CHUNK_SIZE) {
    parts.push(fullContext.substring(i, i + CHUNK_SIZE));
  }
  Logger.log('🔍 Gemini сжимает контекст: ' + parts.length + ' части(ей), ' + Math.round(fullContext.length / 1000) + 'k симв.');

  var summaries = [];
  for (var c = 0; c < parts.length; c++) {
    if (c > 0) Utilities.sleep(5000);
    Logger.log('  Часть ' + (c + 1) + '/' + parts.length + ' (' + Math.round(parts[c].length / 1000) + 'k симв.)...');

    var prompt = [
      'Ты — ассистент маркетолога. Из этих материалов проекта извлеки и структурируй ВСЁ важное:',
      '',
      '1. ПРОДУКТ: название (дословно), оффер с посадочной, формат, цена, преимущества, методика, результаты',
      '2. ЦЕЛЕВАЯ АУДИТОРИЯ: боли с цитатами, потребности языком ЦА, возражения, описания сегментов',
      '3. СПИКЕР: имя, опыт (лет), достижения, регалии, цифры',
      '4. КАСТДЕВЫ И ИНТЕРВЬЮ: ключевые цитаты клиентов, инсайты, боли их словами',
      '5. КЕЙСЫ: конкретные результаты учеников с цифрами',
      '6. ПРОЧЕЕ: уникальные смыслы, формулировки с лендинга, конкурентные преимущества',
      '',
      'Пиши плотно — каждое слово должно нести смысл. Сохрани цитаты, цифры, названия.',
      'Часть ' + (c + 1) + ' из ' + parts.length + ':',
      '',
      parts[c]
    ].join('\n');

    var resp = UrlFetchApp.fetch(GEMINI_API_URL + '?key=' + geminiKey, {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 8192 }
      }),
      muteHttpExceptions: true, deadline: 120
    });

    var code = resp.getResponseCode();
    if (code === 200) {
      var pf = JSON.parse(resp.getContentText());
      var um = pf.usageMetadata || {};
      recordCost_('Сжатие контекста', 'Gemini (free)', 'gemini-free', um.promptTokenCount || 0, um.candidatesTokenCount || 0);
      var cand = pf.candidates && pf.candidates[0];
      var text = (cand && cand.content && cand.content.parts && cand.content.parts[0])
        ? cand.content.parts[0].text
        : null;
      if (!text) {
        // Gemini заблокировал ответ (safety filter) — берём обрезку
        Logger.log('  ⚠️ Gemini вернул пустой ответ для части ' + (c + 1) + ' (блокировка или пустой контент)');
        summaries.push('[Часть ' + (c + 1) + ' — пропущена Gemini]\n' + parts[c].substring(0, 15000));
      } else {
        summaries.push('[Экстракт ' + (c + 1) + '/' + parts.length + ']\n' + text);
        Logger.log('  ✅ ' + text.length + ' симв.');
      }
    // code === 200 закрыт выше
    } else if ((code === 429 || code === 503) && kieaiKey) {
      // Фоллбэк на kie.ai Gemini 2.5 Flash при исчерпании бесплатного лимита
      Logger.log('  ⚠️ Gemini free ' + code + ' — пробуем kie.ai Gemini 2.5 Flash...');
      var kieResp = UrlFetchApp.fetch('https://api.kie.ai/gemini-2.5-flash/v1/chat/completions', {
        method: 'post', contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + kieaiKey },
        payload: JSON.stringify({ model: 'gemini-2.5-flash', messages: [{ role: 'user', content: prompt }], temperature: 0.1, max_tokens: 8192 }),
        muteHttpExceptions: true, deadline: 120
      });
      if (kieResp.getResponseCode() === 200) {
        var kp = JSON.parse(kieResp.getContentText());
        var ktext = kp.choices[0].message.content;
        var ku = kp.usage || {};
        recordCost_('Сжатие контекста (kie.ai)', 'kie.ai Gemini', 'gemini-2.5-flash', ku.prompt_tokens || 0, ku.completion_tokens || 0);
        summaries.push('[Экстракт ' + (c + 1) + '/' + parts.length + ' via kie.ai]\n' + ktext);
        Logger.log('  ✅ kie.ai: ' + ktext.length + ' симв.');
      } else {
        Logger.log('  ❌ kie.ai тоже не ответил: ' + kieResp.getResponseCode());
        summaries.push('[Часть ' + (c + 1) + ' — обрезано]\n' + parts[c].substring(0, 15000));
      }
    } else {
      Logger.log('  ❌ Gemini ' + code + ': ' + resp.getContentText().substring(0, 150));
      summaries.push('[Часть ' + (c + 1) + ' — обрезано]\n' + parts[c].substring(0, 15000));
    }
  }

  return summaries.join('\n\n');
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
    'ВАЖНО: каждое поле — кратко и ёмко, не более 2-3 предложений.',
    'Верни ТОЛЬКО валидный JSON (15 объектов), без текста до или после:',
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

  // Строки 1-13: основные настройки
  sheet.getRange(1, 1, 13, 2).setValues([
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
    ['API-ключ Groq 2 (второй аккаунт)',             ''],
  ]);
  sheet.getRange(1, 1, 1, 3).setBackground('#4A90D9').setFontColor('#FFFFFF').setFontWeight('bold');
  sheet.getRange(2, 1, 12, 1).setFontWeight('bold');
  sheet.getRange(3, 2).setWrap(true);
  sheet.setRowHeight(3, 100);
  sheet.setColumnWidth(1, 280);
  sheet.setColumnWidth(2, 380);
  sheet.setColumnWidth(3, 200);

  // Строка 14: заголовок секции моделей
  sheet.getRange(14, 1).setValue('▼ Модели для гипотез (шаги 4–5)');
  sheet.getRange(14, 2).setValue('Вкл?');
  sheet.getRange(14, 3).setValue('Стоимость / запуск');
  sheet.getRange(14, 1, 1, 3).setBackground('#37474F').setFontColor('#FFFFFF').setFontWeight('bold');

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
    ['Groq:',         'console.groq.com → API Keys  (бесплатно 100k токенов/день, B2 + B13 — два разных аккаунта)'],
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

// ─── State machine: вспомогательные функции ───────────────────

function _getStateSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(STATE_SHEET_);
  if (!sheet) { sheet = ss.insertSheet(STATE_SHEET_); sheet.hideSheet(); }
  return sheet;
}

function _saveState_(obj) {
  _getStateSheet_().getRange('A1').setValue(JSON.stringify(obj));
  SpreadsheetApp.flush();
}

function _loadState_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(STATE_SHEET_);
  if (!sheet) return null;
  var val = sheet.getRange('A1').getValue() + '';
  if (!val) return null;
  try { return JSON.parse(val); } catch (_e) { return null; }
}

function _saveAnalysis_(data) {
  var json = JSON.stringify(data);
  var sheet = _getStateSheet_();
  sheet.getRange('B1').setValue(json.substring(0, 45000));
  if (json.length > 45000) sheet.getRange('B2').setValue(json.substring(45000));
  SpreadsheetApp.flush();
}

function _loadAnalysis_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(STATE_SHEET_);
  if (!sheet) return null;
  var b1 = sheet.getRange('B1').getValue() + '';
  var b2 = sheet.getRange('B2').getValue() + '';
  var json = b1 + b2;
  if (!json) return null;
  try { return JSON.parse(json); } catch (_e) { return null; }
}

function _clearState_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(STATE_SHEET_);
  if (sheet) ss.deleteSheet(sheet);
}

// Сырой контекст сохраняем в столбец D листа МктСтейт (без DriveApp write)
function _saveRawToState_(text) {
  var sheet = _getStateSheet_();
  var CHUNK = 45000;
  var row = 1;
  for (var i = 0; i < text.length; i += CHUNK) {
    sheet.getRange(row++, 4).setValue(text.substring(i, i + CHUNK));
  }
  Logger.log('💾 Raw → МктСтейт: ' + Math.round(text.length / 1000) + 'k симв., ' + (row - 1) + ' ячеек');
  SpreadsheetApp.flush();
}

function _loadRawFromState_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(STATE_SHEET_);
  if (!sheet) return '';
  var parts = [];
  var row = 1;
  while (row <= 200) {
    var val = sheet.getRange(row++, 4).getValue() + '';
    if (!val) break;
    parts.push(val);
  }
  return parts.join('');
}

function _packSettingIds_(settings) {
  return {
    groqKey:            settings.groqKey,
    groqKey2:           settings.groqKey2,
    geminiKey:          settings.geminiKey,
    cerebrasKey:        settings.cerebrasKey,
    mistralKey:         settings.mistralKey,
    kieaiKey:           settings.kieaiKey,
    sources:            settings.sources,
    blacklist:          settings.blacklist,
    whitelist:          settings.whitelist,
    maxImagesPerFolder: settings.maxImagesPerFolder,
    followLinks:        settings.followLinks,
    selectedModelIds:   settings.selectedModels.map(function(m) { return m.id; })
  };
}

function _unpackSettings_(packed) {
  var ids = packed.selectedModelIds || [];
  var sel = MODEL_CATALOG.filter(function(m) { return ids.indexOf(m.id) >= 0; });
  sel.sort(function(a, b) { return ids.indexOf(a.id) - ids.indexOf(b.id); });
  return {
    groqKey:            packed.groqKey            || '',
    groqKey2:           packed.groqKey2           || '',
    geminiKey:          packed.geminiKey          || '',
    cerebrasKey:        packed.cerebrasKey        || '',
    mistralKey:         packed.mistralKey         || '',
    kieaiKey:           packed.kieaiKey           || '',
    sources:            packed.sources            || [],
    blacklist:          packed.blacklist          || [],
    whitelist:          packed.whitelist          || [],
    maxImagesPerFolder: packed.maxImagesPerFolder || 10,
    followLinks:        !!packed.followLinks,
    selectedModels:     sel
  };
}

// Инициализирует лист «Кэш» для пошагового сохранения (partial mode)
function _initPartialCache_(ss, key) {
  var sheet = ss.getSheetByName('Кэш');
  if (!sheet) { sheet = ss.insertSheet('Кэш'); sheet.hideSheet(); }
  sheet.clearContents();
  sheet.getRange(1, 1).setValue('PARTIAL:' + key);
  sheet.getRange(1, 2).setValue(new Date().toISOString());
  SpreadsheetApp.flush();
}

// Дописывает очередную сводку чанка в конец листа «Кэш» (45k симв./ячейка)
function _appendSummaryToCache_(ss, summary) {
  var sheet = ss.getSheetByName('Кэш');
  if (!sheet) throw new Error('Лист «Кэш» не найден при дозаписи сводки');
  var CHUNK = 45000;
  var row   = sheet.getLastRow() + 1;
  for (var i = 0; i < summary.length; i += CHUNK) {
    sheet.getRange(row++, 1).setValue(summary.substring(i, i + CHUNK));
  }
  SpreadsheetApp.flush();
}

// Превращает partial-кэш в полноценный (убирает префикс «PARTIAL:»)
function _finalizePartialCache_(ss, key) {
  var sheet = ss.getSheetByName('Кэш');
  if (!sheet) return;
  sheet.getRange(1, 1).setValue(key);
  sheet.getRange(1, 3).setValue('~' + Math.round(sheet.getLastRow() * 45 / 1000) + 'k симв.');
  SpreadsheetApp.flush();
}

// Сжимает текст одного файла, если он превышает PER_FILE_COMPRESS_ символов
function _compressFileText_(text, fileName, settings, state) {
  if (text.length <= PER_FILE_COMPRESS_ || !settings.geminiKey) return text;
  Logger.log('  🗜️ Сжимаем файл (' + Math.round(text.length / 1000) + 'k → ~3k): ' + fileName);
  var compressed = _compressOneChunk_(text, 0, 1, settings);
  if (compressed) return '[Сжато из ' + Math.round(text.length / 1000) + 'k симв.]\n' + compressed;
  return text.substring(0, PER_FILE_COMPRESS_) + '\n[⚠️ Обрезано — сжатие не удалось]';
}

// Сжимает один чанк через Gemini (с фоллбэком на kie.ai при 429/503)
function _compressOneChunk_(chunkText, chunkIdx, totalChunks, settings) {
  var prompt = [
    'Ты — ассистент маркетолога. Из этих материалов проекта извлеки и структурируй ВСЁ важное:',
    '',
    '1. ПРОДУКТ: название (дословно), оффер с посадочной, формат, цена, преимущества, методика, результаты',
    '2. ЦЕЛЕВАЯ АУДИТОРИЯ: боли с цитатами, потребности языком ЦА, возражения, описания сегментов',
    '3. СПИКЕР: имя, опыт (лет), достижения, регалии, цифры',
    '4. КАСТДЕВЫ И ИНТЕРВЬЮ: ключевые цитаты клиентов, инсайты, боли их словами',
    '5. КЕЙСЫ: конкретные результаты учеников с цифрами',
    '6. ПРОЧЕЕ: уникальные смыслы, формулировки с лендинга, конкурентные преимущества',
    '',
    'Пиши плотно — каждое слово должно нести смысл. Сохрани цитаты, цифры, названия.',
    'Часть ' + (chunkIdx + 1) + ' из ' + totalChunks + ':',
    '',
    chunkText
  ].join('\n');

  var resp = UrlFetchApp.fetch(GEMINI_API_URL + '?key=' + settings.geminiKey, {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, maxOutputTokens: 8192 } }),
    muteHttpExceptions: true, deadline: 120
  });

  var code = resp.getResponseCode();
  if (code === 200) {
    var pf   = JSON.parse(resp.getContentText());
    var um   = pf.usageMetadata || {};
    recordCost_('Сжатие контекста', 'Gemini (free)', 'gemini-free', um.promptTokenCount || 0, um.candidatesTokenCount || 0);
    var cand = pf.candidates && pf.candidates[0];
    var text = (cand && cand.content && cand.content.parts && cand.content.parts[0]) ? cand.content.parts[0].text : null;
    if (text) return '[Экстракт ' + (chunkIdx + 1) + '/' + totalChunks + ']\n' + text;
    Logger.log('⚠️ Gemini вернул пустой ответ для части ' + (chunkIdx + 1));
  } else if ((code === 429 || code === 503) && settings.kieaiKey) {
    Logger.log('⚠️ Gemini ' + code + ' → kie.ai Gemini 2.5 Flash');
    var kr = UrlFetchApp.fetch('https://api.kie.ai/gemini-2.5-flash/v1/chat/completions', {
      method: 'post', contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + settings.kieaiKey },
      payload: JSON.stringify({ model: 'gemini-2.5-flash', messages: [{ role: 'user', content: prompt }], temperature: 0.1, max_tokens: 8192 }),
      muteHttpExceptions: true, deadline: 120
    });
    if (kr.getResponseCode() === 200) {
      var kp = JSON.parse(kr.getContentText());
      var ku = kp.usage || {};
      recordCost_('Сжатие (kie.ai)', 'kie.ai Gemini', 'gemini-2.5-flash', ku.prompt_tokens || 0, ku.completion_tokens || 0);
      var kpText = kp.choices && kp.choices[0] && kp.choices[0].message && kp.choices[0].message.content;
      if (kpText) return '[Экстракт ' + (chunkIdx + 1) + '/' + totalChunks + ' via kie.ai]\n' + kpText;
      Logger.log('❌ kie.ai вернул неожиданный формат: ' + kr.getContentText().substring(0, 150));
    }
    Logger.log('❌ kie.ai тоже не ответил: HTTP ' + kr.getResponseCode());
  } else {
    Logger.log('❌ Gemini HTTP ' + code + ': ' + resp.getContentText().substring(0, 100));
  }

  return '[Часть ' + (chunkIdx + 1) + ' — обрезано]\n' + chunkText.substring(0, 15000);
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

