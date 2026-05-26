// ============================================================
//  Автоматизация маркетингового анализа
//  Groq (анализ) + Gemini (PDF, фото, видео, аудио)
// ============================================================

var SETTINGS_SHEET  = 'Настройки';
var ANALYSIS_SHEET  = 'Анализ';
var ALL_HYPO_SHEET  = 'Все гипотезы (15)';
var LAUNCH_SHEET    = 'Подготовка к запуску';
var CHECKLIST_SHEET = 'Чеклист';

var GROQ_API_URL    = 'https://api.groq.com/openai/v1/chat/completions';
var GROQ_MODEL      = 'llama-3.3-70b-versatile';

var GEMINI_API_URL    = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
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
      { name: 'Запустить анализ проекта',  functionName: 'runMarketingAnalysis' },
      { name: '─────────────────',         functionName: 'noop' },
      { name: 'Создать шаблон листов',     functionName: 'initSheets' }
    ]);
}
function noop() {}

// ─── Точка входа ─────────────────────────────────────────────
function runMarketingAnalysis() {
  var ui = SpreadsheetApp.getUi();
  try {
    resetChecklist_();

    // Шаг 1 — настройки
    Logger.log('=== [1/6] Настройки ===');
    var settings = readSettings_();
    if (!settings.groqKey)  { ui.alert('Ошибка', 'Нет API-ключа Groq (ячейка B2)',  ui.ButtonSet.OK); return; }
    if (!settings.folderId) { ui.alert('Ошибка', 'Нет ID папки Drive (ячейка B3)',   ui.ButtonSet.OK); return; }
    updateChecklist_(1, '✅ Настройки прочитаны' + (settings.geminiKey ? ' (Gemini ✓)' : ' (Gemini — нет ключа)'));

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
    var statusMsg = '✅ Файлов прочитано: ' + result.filesRead + ' | символов: ' + context.length;
    if (skipped.length)  statusMsg += '\n⚠️ Пропущено (Gemini недоступен): ' + skipped.join(', ');
    if (!geminiOk && settings.geminiKey) statusMsg += '\n⚠️ Gemini лимит исчерпан — медиафайлы пропущены';
    updateChecklist_(2, statusMsg);

    // Шаг 3 — анализ продукта и ЦА
    Logger.log('=== [3/6] Запрос 1 — Анализ ===');
    updateChecklist_(3, '⏳ Groq: анализ продукта и ЦА...');
    var analysisJson = callGroqApi_(settings.groqKey, buildPrompt1_(context));
    writeAnalysisSheet_(analysisJson);
    updateChecklist_(3, '✅ Анализ записан в лист «Анализ»');

    // Шаг 4 — 15 заходов
    Logger.log('Пауза 35 сек...'); updateChecklist_(4, '⏳ Пауза 35 сек (лимит Groq)...');
    Utilities.sleep(35000);
    Logger.log('=== [4/6] Запрос 2 — 15 заходов ===');
    updateChecklist_(4, '⏳ Groq: генерация 15 заходов...');
    var allHypo = callGroqApi_(settings.groqKey, buildPrompt2a_(analysisJson));
    writeAllHypothesesSheet_(allHypo);
    updateChecklist_(4, '✅ ' + (allHypo.hypotheses||[]).length + ' заходов → лист «Все гипотезы (15)»');

    // Шаг 5 — отбор 10 лучших
    Logger.log('Пауза 35 сек...'); updateChecklist_(5, '⏳ Пауза 35 сек (лимит Groq)...');
    Utilities.sleep(35000);
    Logger.log('=== [5/6] Запрос 3 — Топ 10 ===');
    updateChecklist_(5, '⏳ Groq: отбор 10 лучших заходов...');
    var top10 = callGroqApi_(settings.groqKey, buildPrompt2b_(allHypo), 3500);
    writeLaunchSheet_(top10);
    updateChecklist_(5, '✅ 10 лучших → лист «Подготовка к запуску»');

    updateChecklist_(6, '✅ Готово! Анализ завершён успешно.');
    ui.alert('Успех',
      'Анализ завершён!\n\n' +
      '• «Анализ» — продукт и сегменты ЦА\n' +
      '• «Все гипотезы (15)» — все варианты заходов\n' +
      '• «Подготовка к запуску» — топ 10\n' +
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

  var maxImg = parseInt(sheet.getRange('B7').getValue());
  return {
    groqKey:           (sheet.getRange('B2').getValue() + '').trim(),
    folderId:          (sheet.getRange('B3').getValue() + '').trim(),
    geminiKey:         (sheet.getRange('B4').getValue() + '').trim(),
    blacklist:         parseNameList_(sheet.getRange('B5').getValue()),
    whitelist:         parseNameList_(sheet.getRange('B6').getValue()),
    maxImagesPerFolder: isNaN(maxImg) || maxImg <= 0 ? 10 : maxImg
  };
}

function parseNameList_(raw) {
  if (!raw) return [];
  return (raw + '').split(',').map(function(s) { return s.trim().toLowerCase(); }).filter(Boolean);
}

// ─── Сбор файлов из Google Drive ─────────────────────────────
function collectDriveContext_(settings) {
  var folder;
  try {
    folder = DriveApp.getFolderById(settings.folderId);
  } catch (e) {
    throw new Error('Не удалось открыть папку Drive (ID: ' + settings.folderId + '). Проверьте ID и доступ.');
  }

  var state = {
    geminiAvailable: !!settings.geminiKey,
    skipped: [],
    filesRead: 0
  };

  var parts = processFolder_(folder, settings, state, 0);
  return {
    context:    parts.join('\n\n'),
    skipped:    state.skipped,
    filesRead:  state.filesRead,
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

      if (!state.geminiAvailable) {
        Logger.log(indent + '⚠️ Gemini недоступен, пропуск: ' + fname);
        state.skipped.push(fname);
        continue;
      }

      Logger.log(indent + '🤖 Gemini (' + geminiType + '): ' + fname);
      var extracted = transcribeWithGemini_(settings.geminiKey, file, mime, fname, state);
      if (extracted) { parts.push('--- ' + fname + ' (' + geminiType + ') ---\n' + extracted); state.filesRead++; }
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

    var subParts = processFolder_(sub, settings, state, depth + 1);
    parts = parts.concat(subParts);
  }

  return parts;
}

// ─── Gemini: расшифровка медиафайла ──────────────────────────
function transcribeWithGemini_(geminiKey, file, mimeType, fileName, state) {
  try {
    var blob      = file.getBlob();
    var fileBytes = blob.getBytes();
    var fileSize  = fileBytes.length;

    var prompt = [
      'Это маркетинговый материал проекта. Выполни:',
      '1. Если есть текст (PDF, слайды) — извлеки его полностью.',
      '2. Если есть речь (видео, аудио) — транскрибируй полностью.',
      '3. Если изображение — опиши текст на экране, офферы, заголовки, ключевые смыслы.',
      '4. Выдели боли аудитории, офферы, результаты, цитаты.',
      'Имя файла: ' + fileName
    ].join('\n');

    var requestBody;

    if (fileSize <= MAX_INLINE_BYTES) {
      // Inline — для файлов ≤ 15 МБ
      requestBody = {
        contents: [{ parts: [
          { inline_data: { mime_type: mimeType, data: Utilities.base64Encode(fileBytes) } },
          { text: prompt }
        ]}],
        generationConfig: { temperature: 0.1, maxOutputTokens: 4096 }
      };
    } else {
      // File API — для больших файлов (видео и т.д.)
      Logger.log('    Файл > 15 МБ, загружаем через Gemini File API...');
      var fileUri = uploadFileToGemini_(geminiKey, blob, mimeType, fileName);
      if (!fileUri) return null;
      requestBody = {
        contents: [{ parts: [
          { file_data: { mime_type: mimeType, file_uri: fileUri } },
          { text: prompt }
        ]}],
        generationConfig: { temperature: 0.1, maxOutputTokens: 4096 }
      };
    }

    var response = UrlFetchApp.fetch(GEMINI_API_URL + '?key=' + geminiKey, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(requestBody),
      muteHttpExceptions: true
    });

    var code = response.getResponseCode();
    var body = response.getContentText();

    if (code === 429 || code === 503) {
      Logger.log('    Gemini лимит исчерпан (HTTP ' + code + '): ' + fileName);
      state.geminiAvailable = false;
      state.skipped.push(fileName);
      return null;
    }
    if (code !== 200) {
      Logger.log('    Gemini ошибка ' + code + ' (' + fileName + '): ' + body.substring(0, 200));
      return null;
    }

    var parsed = JSON.parse(body);
    return parsed.candidates[0].content.parts[0].text;

  } catch (e) {
    Logger.log('    Ошибка Gemini (' + fileName + '): ' + e.message);
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

// ─── Запрос к Groq API ────────────────────────────────────────
function callGroqApi_(apiKey, messages, maxTokens) {
  var payload = JSON.stringify({
    model: GROQ_MODEL,
    messages: messages,
    response_format: { type: 'json_object' },
    temperature: 0.7,
    max_tokens: maxTokens || 4096
  });

  var response = UrlFetchApp.fetch(GROQ_API_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + apiKey },
    payload: payload,
    muteHttpExceptions: true
  });

  var code = response.getResponseCode();
  var body = response.getContentText();

  if (code !== 200) {
    var errMsg = 'Groq API вернул ошибку ' + code;
    try {
      var e = JSON.parse(body);
      if (e.error && e.error.message) errMsg += ':\n' + e.error.message;
    } catch (_) {}
    throw new Error(errMsg);
  }

  return JSON.parse(JSON.parse(body).choices[0].message.content);
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
    'Из 15 заходов выбери 10 лучших для старта таргета.',
    'Критерии: отклик у холодной аудитории, разнообразие сегментов, конкретность хука.',
    'Верни 10 заходов в формате JSON, сохранив ВСЕ поля оригинала без изменений:',
    JSON.stringify({ hypotheses: [{
      segment_id: 1, segment_name: '...', segment_description: '...',
      hook: '...', key_message: '...', structure: '...', emotions_triggers: '...', headline_ideas: '...'
    }]}, null, 2),
    '(Ровно 10 объектов)'
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user',   content: '15 заходов:\n\n' + list + '\n\nВыбери 10 лучших для запуска таргета.' }
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

function writeAllHypothesesSheet_(data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ALL_HYPO_SHEET);
  if (!sheet) throw new Error('Лист «Все гипотезы (15)» не найден.');
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
  });
}

function writeLaunchSheet_(data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LAUNCH_SHEET);
  if (!sheet) throw new Error('Лист «Подготовка к запуску» не найден.');
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
  });
}

// ─── Чеклист ─────────────────────────────────────────────────
function resetChecklist_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CHECKLIST_SHEET);
  if (!sheet) return;
  var last = sheet.getLastRow();
  if (last > 7) sheet.deleteRows(8, last - 7);
  sheet.getRange(2, 1, 6, 3).setValues([
    [1, 'Читаем настройки (API-ключи, ID папки)',          '⬜ Ожидание'],
    [2, 'Читаем файлы (текст + Gemini для медиа)',          '⬜ Ожидание'],
    [3, 'Запрос 1 (Groq): анализ продукта и ЦА',           '⬜ Ожидание'],
    [4, 'Запрос 2 (Groq): генерация 15 заходов',            '⬜ Ожидание'],
    [5, 'Запрос 3 (Groq): отбор 10 лучших заходов',         '⬜ Ожидание'],
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
    sheet.getRange(row, 3).setBackground(bg).setFontColor(fc);
  }
  SpreadsheetApp.flush();
}

// ─── Инициализация листов ─────────────────────────────────────
function initSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  createSettingsSheet_(ss);
  createChecklistSheet_(ss);
  createAnalysisSheet_(ss);
  createAllHypothesesSheet_(ss);
  createLaunchSheet_(ss);
  SpreadsheetApp.getUi().alert('Готово',
    'Шаблон создан.\n\nЗаполните лист «Настройки»:\n' +
    '• B2 — API-ключ Groq (обязательно)\n' +
    '• B3 — ID папки Google Drive (обязательно)\n' +
    '• B4 — API-ключ Gemini (для PDF, фото, видео)\n' +
    '• B5 — Чёрный список папок (необязательно)\n' +
    '• B6 — Белый список папок (необязательно)\n' +
    '• B7 — Макс. фото из одной папки (по умолчанию 10)',
    SpreadsheetApp.getUi().ButtonSet.OK);
}

function createSettingsSheet_(ss) {
  var sheet = ss.getSheetByName(SETTINGS_SHEET);
  if (!sheet) sheet = ss.insertSheet(SETTINGS_SHEET);
  sheet.clearContents();

  sheet.getRange(1, 1, 8, 2).setValues([
    ['Параметр',                            'Значение'],
    ['API-ключ Groq',                        ''],
    ['ID папки Google Drive',                ''],
    ['API-ключ Gemini (для PDF/фото/видео)', ''],
    ['Чёрный список папок (через запятую)',  ''],
    ['Белый список папок (через запятую)',   ''],
    ['Макс. фото из одной папки',            10],
    ['',                                     '']
  ]);

  sheet.getRange(1, 1, 1, 2).setBackground('#4A90D9').setFontColor('#FFFFFF').setFontWeight('bold');
  sheet.getRange(2, 1, 6, 1).setFontWeight('bold');
  sheet.setColumnWidth(1, 270);
  sheet.setColumnWidth(2, 420);

  sheet.getRange(9, 1).setValue('Подсказки:').setFontWeight('bold');
  [
    ['Groq API-ключ:', 'console.groq.com → API Keys → Create API Key'],
    ['Gemini API-ключ:', 'aistudio.google.com → Get API Key (бесплатно)'],
    ['ID папки Drive:', 'URL папки: .../folders/ВОТ_ЭТО_ID'],
    ['Чёрный список:', 'Фото спикера, Архив, Личное  (папки, которые НЕ читать)'],
    ['Белый список:', 'Кастдевы, Посадочные  (если пусто — читать все папки)'],
    ['Макс. фото:', 'По умолчанию 10. Защита от папок с фотосессиями спикера.']
  ].forEach(function(row, i) {
    sheet.getRange(10 + i, 1).setValue(row[0]).setFontColor('#888888').setFontStyle('italic');
    sheet.getRange(10 + i, 2).setValue(row[1]).setFontColor('#888888').setFontStyle('italic');
  });
}

function createChecklistSheet_(ss) {
  var sheet = ss.getSheetByName(CHECKLIST_SHEET);
  if (!sheet) sheet = ss.insertSheet(CHECKLIST_SHEET);
  sheet.clearContents();
  sheet.getRange(1, 1, 1, 3).setValues([['№ шага', 'Описание', 'Статус']]);
  sheet.getRange(1, 1, 1, 3).setBackground('#37474F').setFontColor('#FFFFFF').setFontWeight('bold');
  sheet.getRange(2, 1, 6, 3).setValues([
    [1, 'Читаем настройки (API-ключи, ID папки)',         '⬜ Ожидание'],
    [2, 'Читаем файлы (текст + Gemini для медиа)',         '⬜ Ожидание'],
    [3, 'Запрос 1 (Groq): анализ продукта и ЦА',          '⬜ Ожидание'],
    [4, 'Запрос 2 (Groq): генерация 15 заходов',           '⬜ Ожидание'],
    [5, 'Запрос 3 (Groq): отбор 10 лучших заходов',        '⬜ Ожидание'],
    [6, 'Финал',                                           '⬜ Ожидание']
  ]);
  sheet.getRange(2, 3, 6, 1).setBackground('#F5F5F5').setFontColor('#888888');
  sheet.setColumnWidth(1, 70); sheet.setColumnWidth(2, 340); sheet.setColumnWidth(3, 420);
  for (var r = 2; r <= 7; r++) sheet.setRowHeight(r, 40);
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

function createAllHypothesesSheet_(ss) {
  var sheet = ss.getSheetByName(ALL_HYPO_SHEET);
  if (!sheet) sheet = ss.insertSheet(ALL_HYPO_SHEET);
  sheet.clearContents();
  var h = ['Сегмент','Описание сегмента','Заход / Хук','Ключевое сообщение','Структура и содержание','Эмоции и триггеры','Идеи заголовков'];
  sheet.getRange(1,1,1,h.length).setValues([h]);
  sheet.getRange(1,1,1,h.length).setBackground('#E65100').setFontColor('#FFFFFF').setFontWeight('bold');
  for (var i = 2; i <= 16; i++) { sheet.setRowHeight(i, 110); sheet.getRange(i,1,1,7).setWrap(true); }
  [100,160,260,200,230,190,210].forEach(function(w,i) { sheet.setColumnWidth(i+1, w); });
}

function createLaunchSheet_(ss) {
  var sheet = ss.getSheetByName(LAUNCH_SHEET);
  if (!sheet) sheet = ss.insertSheet(LAUNCH_SHEET);
  sheet.clearContents();
  sheet.getRange(1,1,1,3).setValues([['Сегмент ЦА','Описание сегмента','Промо-гипотеза']]);
  sheet.getRange(1,1,1,3).setBackground('#6A1B9A').setFontColor('#FFFFFF').setFontWeight('bold');
  for (var i = 2; i <= 11; i++) { sheet.setRowHeight(i, 200); sheet.getRange(i,3).setWrap(true); }
  sheet.setColumnWidth(1,120); sheet.setColumnWidth(2,200); sheet.setColumnWidth(3,600);
}
