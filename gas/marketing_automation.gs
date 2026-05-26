// ============================================================
//  Автоматизация маркетингового анализа через Groq API
// ============================================================

var SETTINGS_SHEET   = 'Настройки';
var ANALYSIS_SHEET   = 'Анализ';
var ALL_HYPO_SHEET   = 'Все гипотезы (15)';
var LAUNCH_SHEET     = 'Подготовка к запуску';
var CHECKLIST_SHEET  = 'Чеклист';

var GROQ_API_URL     = 'https://api.groq.com/openai/v1/chat/completions';
var GROQ_MODEL       = 'llama-3.3-70b-versatile';

// ─── Меню ────────────────────────────────────────────────────
function onOpen() {
  SpreadsheetApp.getActiveSpreadsheet()
    .addMenu('Автоматизация маркетинга', [
      { name: 'Запустить анализ проекта', functionName: 'runMarketingAnalysis' },
      { name: '─────────────────', functionName: 'noop' },
      { name: 'Создать шаблон листов', functionName: 'initSheets' }
    ]);
}

function noop() {}

// ─── Точка входа ─────────────────────────────────────────────
function runMarketingAnalysis() {
  var ui = SpreadsheetApp.getUi();

  try {
    // Сбрасываем чеклист в начале
    resetChecklist_();

    // Шаг 1 — читаем настройки
    Logger.log('=== [1/6] Читаем настройки ===');
    var settings = readSettings_();
    if (!settings.apiKey) {
      ui.alert('Ошибка', 'API-ключ Groq не заполнен в ячейке B2 листа «Настройки»', ui.ButtonSet.OK);
      return;
    }
    if (!settings.folderId) {
      ui.alert('Ошибка', 'ID папки Google Drive не заполнен в ячейке B3 листа «Настройки»', ui.ButtonSet.OK);
      return;
    }
    updateChecklist_(1, '✅ Настройки прочитаны');

    // Шаг 2 — собираем контекст из Google Drive
    Logger.log('=== [2/6] Читаем файлы из Google Drive ===');
    var projectContext = collectDriveContext_(settings.folderId);
    if (!projectContext || projectContext.trim().length === 0) {
      ui.alert('Ошибка', 'Папка пуста или не содержит читаемых файлов. Проверьте ID папки.', ui.ButtonSet.OK);
      return;
    }
    Logger.log('Собрано символов контекста: ' + projectContext.length);
    updateChecklist_(2, '✅ Файлы прочитаны (' + projectContext.length + ' символов)');

    // Шаг 3 — запрос 1: анализ продукта и ЦА
    Logger.log('=== [3/6] Запрос 1 — Анализ продукта и ЦА ===');
    updateChecklist_(3, '⏳ Запрос к Groq: анализ продукта и ЦА...');
    var analysisJson = callGroqApi_(settings.apiKey, buildPrompt1_(projectContext));
    writeAnalysisSheet_(analysisJson);
    updateChecklist_(3, '✅ Анализ продукта и ЦА записан в лист «Анализ»');

    // Шаг 4 — запрос 2: генерация 15 заходов
    Logger.log('Пауза 35 сек перед запросом 2...');
    updateChecklist_(4, '⏳ Пауза 35 сек (лимит Groq)...');
    Utilities.sleep(35000);
    Logger.log('=== [4/6] Запрос 2 — Генерация 15 рекламных заходов ===');
    updateChecklist_(4, '⏳ Запрос к Groq: генерация 15 заходов...');
    var allHypothesesJson = callGroqApi_(settings.apiKey, buildPrompt2a_(analysisJson));
    var count15 = (allHypothesesJson.hypotheses || []).length;
    Logger.log('Получено заходов: ' + count15);
    writeAllHypothesesSheet_(allHypothesesJson);
    updateChecklist_(4, '✅ Все ' + count15 + ' заходов записаны в лист «Все гипотезы (15)»');

    // Шаг 5 — запрос 3: отбор 10 лучших
    Logger.log('Пауза 35 сек перед запросом 3...');
    updateChecklist_(5, '⏳ Пауза 35 сек (лимит Groq)...');
    Utilities.sleep(35000);
    Logger.log('=== [5/6] Запрос 3 — Отбор 10 лучших заходов ===');
    updateChecklist_(5, '⏳ Запрос к Groq: отбор 10 лучших...');
    var top10Json = callGroqApi_(settings.apiKey, buildPrompt2b_(allHypothesesJson), 3500);
    writeLaunchSheet_(top10Json);
    updateChecklist_(5, '✅ 10 лучших заходов записаны в лист «Подготовка к запуску»');

    // Финал
    updateChecklist_(6, '✅ Готово! Анализ завершён успешно.');
    Logger.log('=== [6/6] Готово ===');
    ui.alert(
      'Успех',
      'Анализ завершён.\n\n' +
      '• «Анализ» — продукт и 3 сегмента ЦА\n' +
      '• «Все гипотезы (15)» — все варианты по колонкам\n' +
      '• «Подготовка к запуску» — 10 лучших гипотез\n' +
      '• «Чеклист» — статус каждого шага',
      ui.ButtonSet.OK
    );

  } catch (e) {
    Logger.log('ОШИБКА: ' + e.message);
    updateChecklist_(0, '❌ Ошибка: ' + e.message);
    ui.alert('Ошибка выполнения', e.message, ui.ButtonSet.OK);
  }
}

// ─── Чеклист ─────────────────────────────────────────────────
function resetChecklist_() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CHECKLIST_SHEET);
  if (!sheet) return;

  // Удаляем лишние строки (ошибки от предыдущих запусков)
  var lastRow = sheet.getLastRow();
  if (lastRow > 7) sheet.deleteRows(8, lastRow - 7);

  var steps = [
    [1, 'Читаем настройки (API-ключ, ID папки)', '⬜ Ожидание'],
    [2, 'Читаем файлы из Google Drive',           '⬜ Ожидание'],
    [3, 'Запрос 1: анализ продукта и ЦА',         '⬜ Ожидание'],
    [4, 'Запрос 2: генерация 15 заходов',          '⬜ Ожидание'],
    [5, 'Запрос 3: отбор 10 лучших заходов',       '⬜ Ожидание'],
    [6, 'Финал',                                   '⬜ Ожидание']
  ];

  sheet.getRange(2, 1, steps.length, 3).setValues(steps);
  sheet.getRange(2, 3, steps.length, 1).setBackground('#F5F5F5').setFontColor('#888888');
  SpreadsheetApp.flush();
}

function updateChecklist_(stepNum, status) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CHECKLIST_SHEET);
  if (!sheet) return;

  // Строки данных начинаются с 2-й (1-я — заголовок), шаги 1–6 → строки 2–7
  // Шаг 0 — служебный для записи ошибки в последнюю строку
  if (stepNum === 0) {
    var last = sheet.getLastRow();
    sheet.getRange(last + 1, 1, 1, 3).setValues([['-', 'Ошибка выполнения', status]]);
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

// ─── Настройки ───────────────────────────────────────────────
function readSettings_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SETTINGS_SHEET);
  if (!sheet) throw new Error('Лист «Настройки» не найден. Запустите «Создать шаблон листов».');
  return {
    apiKey:   (sheet.getRange('B2').getValue() + '').trim(),
    folderId: (sheet.getRange('B3').getValue() + '').trim()
  };
}

// ─── Сбор текста из Google Drive ─────────────────────────────
function collectDriveContext_(folderId) {
  var folder;
  try {
    folder = DriveApp.getFolderById(folderId);
  } catch (e) {
    throw new Error('Не удалось открыть папку Google Drive с ID «' + folderId + '». Проверьте ID и доступ.');
  }

  var parts = [];

  var docs = folder.getFilesByType(MimeType.GOOGLE_DOCS);
  while (docs.hasNext()) {
    var file = docs.next();
    Logger.log('  Читаем Google Doc: ' + file.getName());
    var text = DocumentApp.openById(file.getId()).getBody().getText();
    parts.push('--- ' + file.getName() + ' ---\n' + text);
  }

  var allFiles = folder.getFiles();
  while (allFiles.hasNext()) {
    var f = allFiles.next();
    var mime = f.getMimeType();
    if (mime === MimeType.PLAIN_TEXT || mime === 'text/csv' || f.getName().match(/\.(txt|csv)$/i)) {
      Logger.log('  Читаем текстовый файл: ' + f.getName());
      parts.push('--- ' + f.getName() + ' ---\n' + f.getBlob().getDataAsString('UTF-8'));
    }
  }

  return parts.join('\n\n');
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

  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + apiKey },
    payload: payload,
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(GROQ_API_URL, options);
  var code = response.getResponseCode();
  var body = response.getContentText();

  if (code !== 200) {
    Logger.log('HTTP ' + code + ': ' + body);
    var errMsg = 'Groq API вернул ошибку ' + code;
    try {
      var errJson = JSON.parse(body);
      if (errJson.error && errJson.error.message) errMsg += ':\n' + errJson.error.message;
    } catch (_) {}
    throw new Error(errMsg);
  }

  var parsed = JSON.parse(body);
  var content = parsed.choices[0].message.content;
  return JSON.parse(content);
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
    '4. Оффер — ОБЯЗАТЕЛЬНО сначала дословный оффер с первого экрана посадочной, затем улучшенная версия (пометить отдельно).',
    '5. Преимущества — основаны на данных ЦА, сравнение с альтернативами.',
    '6. Методика — механизм результата без "магии" и абстракций.',
    '7. Посадочная — уровень по лестнице Ханта + краткий портрет ЦА: пол, возраст, занятие.',
    '8. Спикер — только факты: имя, опыт, достижения. Без интерпретаций.',
    '',
    'ПРАВИЛА БЛОКА ЦА:',
    'Укажи 3 масштабируемых сегмента для таргетированной рекламы ВКонтакте с максимальной конверсией.',
    'НЕ использовать: "ученики", "подписчики", "знают спикера".',
    'Для каждого сегмента: описание (возраст, пол, образ жизни, интересы), уровень осознанности по Ханту,',
    'боли (с реальными цитатами языком ЦА), потребности (языком ЦА), возражения (реалистичные, языком ЦА),',
    'как продукт закрывает боли (формат: боль → решение), результат (подробно), результат результата, оффер под сегмент.',
    '',
    'СТРОГИЕ ЗАПРЕТЫ:',
    '— Не менять название продукта',
    '— Не менять оффер с посадочной',
    '— Не добавлять факты, которых нет в источниках',
    '— Не писать "красиво", но не по данным',
    '',
    'ЧЕК-ЛИСТ ПЕРЕД ОТВЕТОМ (проверь и исправь если нужно):',
    '✓ Название продукта = дословно?',
    '✓ Оффер с посадочной присутствует?',
    '✓ Нет выдуманных фактов?',
    '✓ Сегменты на основе данных из источников?',
    '✓ Есть цитаты ЦА в болях/потребностях?',
    '✓ Можно вставить в таблицу без правок?',
    '',
    'ЛЕСТНИЦА ХАНТА:',
    '0 — не знает о проблеме',
    '1 — знает о проблеме, но не ищет решение',
    '2 — ищет решение, но не знает о продукте',
    '3 — знает о продукте, но ещё не выбрал',
    '4 — сравнивает продукты',
    '5 — готов купить',
    '',
    'Верни ТОЛЬКО валидный JSON по схеме:',
    JSON.stringify({
      product_block: {
        title: 'Дословное название продукта',
        description: 'Ниша и краткая суть',
        format: 'Формат (курс / марафон / вебинар)',
        offer: 'Дословный оффер с первого экрана \\n\\n Улучшенный оффер',
        advantages: 'Преимущества перед альтернативами',
        methodology: 'Механизм результата без абстракций',
        landing_page_analysis: 'Уровень по Ханту + портрет ЦА: пол, возраст, занятие',
        speaker: 'Имя, опыт, достижения — только факты'
      },
      audience_segments: [
        {
          segment_id: 1,
          description: 'Возраст, пол, образ жизни, интересы',
          awareness_level: 3,
          pains: 'Боли языком ЦА (цитаты)',
          needs: 'Потребности языком ЦА',
          objections: 'Возражения языком ЦА',
          solutions: 'Боль 1 -> Решение 1\\nБоль 2 -> Решение 2',
          result: 'Конкретный результат',
          result_of_result: 'Изменение жизни / состояния',
          segment_offer: 'Оффер под сегмент для рекламы'
        },
        { segment_id: 2, description: '...', awareness_level: 2, pains: '...', needs: '...', objections: '...', solutions: '...', result: '...', result_of_result: '...', segment_offer: '...' },
        { segment_id: 3, description: '...', awareness_level: 1, pains: '...', needs: '...', objections: '...', solutions: '...', result: '...', result_of_result: '...', segment_offer: '...' }
      ]
    }, null, 2)
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user',   content: 'Вот материалы проекта:\n\n' + context }
  ];
}

// ─── Промпт 2a: 15 заходов с разбивкой по полям ──────────────
function buildPrompt2a_(analysisData) {
  var segmentsText = analysisData.audience_segments.map(function(seg) {
    return [
      'Сегмент ' + seg.segment_id + ' — ' + seg.description,
      'Боли: ' + seg.pains,
      'Потребности: ' + seg.needs,
      'Возражения: ' + seg.objections,
      'Результат: ' + seg.result,
      'Оффер: ' + seg.segment_offer
    ].join('\n');
  }).join('\n\n');

  var productLine = [
    'Продукт: ' + analysisData.product_block.title + ' (' + analysisData.product_block.format + ')',
    'Оффер: ' + analysisData.product_block.offer,
    'Преимущества: ' + analysisData.product_block.advantages,
    'Методика: ' + analysisData.product_block.methodology
  ].join('\n');

  var system = [
    'Ты — профессиональный маркетолог и копирайтер в нише онлайн-образования.',
    'Твоя задача — строго на основе данных, без выдумок, написать 15 рекламных заходов для промопостов ВКонтакте.',
    '',
    'Напиши по 5 заходов для каждого из 3 сегментов ЦА (итого 15).',
    '',
    'ТРЕБОВАНИЯ:',
    '— Разные механики: боль, выгода, закрытие возражения, эмоция, кейс, провокационный вопрос',
    '— Вызывай желание дочитать пост до конца',
    '— Опирайся на реальный язык ЦА',
    '',
    'ВАЖНО: каждое поле JSON — отдельная колонка таблицы. Заполни каждое поле отдельно.',
    '',
    'Верни ТОЛЬКО валидный JSON по схеме:',
    JSON.stringify({
      hypotheses: [
        {
          segment_id: 1,
          segment_name: 'Сегмент 1',
          segment_description: 'Краткое описание сегмента',
          hook: 'Текст захода — первый абзац, который цепляет',
          key_message: 'Ключевое сообщение поста (одно предложение)',
          structure: 'Структура и содержание: 1. ... 2. ... 3. ...',
          emotions_triggers: 'Эмоции и триггеры: стыд, надежда, узнавание...',
          headline_ideas: 'Идеи заголовков: "...", "...", "..."'
        }
      ]
    }, null, 2),
    '(Всего 15 объектов — по 5 на каждый из 3 сегментов)'
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user',   content: 'Таблица анализа проекта:\n\n' + productLine + '\n\nСегменты ЦА:\n\n' + segmentsText }
  ];
}

// ─── Промпт 2b: отбор 10 лучших из 15 ───────────────────────
function buildPrompt2b_(allHypothesesData) {
  var hypothesesText = (allHypothesesData.hypotheses || []).map(function(h, i) {
    return [
      '--- Гипотеза ' + (i + 1) + ' (Сегмент ' + h.segment_id + ': ' + h.segment_name + ') ---',
      'Заход: ' + h.hook,
      'Ключевое сообщение: ' + h.key_message
    ].join('\n');
  }).join('\n\n');

  var system = [
    'Ты — эксперт по таргетированной рекламе ВКонтакте.',
    'Выбери 10 самых удачных и "горячих" заходов для старта таргета из предложенных 15.',
    '',
    'Критерии отбора:',
    '— Максимальный отклик у холодной аудитории',
    '— Разнообразие сегментов (не все 10 из одного)',
    '— Конкретность и цепляемость хука',
    '',
    'Верни выбранные 10 заходов в формате JSON, сохранив ВСЕ поля оригинала без изменений:',
    JSON.stringify({
      hypotheses: [
        {
          segment_id: 1,
          segment_name: 'Сегмент 1',
          segment_description: '...',
          hook: '...',
          key_message: '...',
          structure: '...',
          emotions_triggers: '...',
          headline_ideas: '...'
        }
      ]
    }, null, 2),
    '(Ровно 10 объектов)'
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user',   content: 'Вот 15 заходов:\n\n' + hypothesesText + '\n\nВыбери 10 лучших для запуска таргета.' }
  ];
}

// ─── Запись листа «Анализ» ────────────────────────────────────
function writeAnalysisSheet_(data) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(ANALYSIS_SHEET);
  if (!sheet) throw new Error('Лист «' + ANALYSIS_SHEET + '» не найден. Запустите «Создать шаблон листов».');

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
  Logger.log('Лист «Анализ» обновлён.');
}

// ─── Запись листа «Все гипотезы (15)» ────────────────────────
function writeAllHypothesesSheet_(data) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(ALL_HYPO_SHEET);
  if (!sheet) throw new Error('Лист «' + ALL_HYPO_SHEET + '» не найден. Запустите «Создать шаблон листов».');

  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) sheet.getRange(2, 1, lastRow - 1, 7).clearContent();

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
  Logger.log('Лист «Все гипотезы (15)» обновлён: ' + (data.hypotheses || []).length + ' заходов.');
}

// ─── Запись листа «Подготовка к запуску» ─────────────────────
function writeLaunchSheet_(data) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(LAUNCH_SHEET);
  if (!sheet) throw new Error('Лист «' + LAUNCH_SHEET + '» не найден. Запустите «Создать шаблон листов».');

  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) sheet.getRange(2, 1, lastRow - 1, 3).clearContent();

  (data.hypotheses || []).slice(0, 10).forEach(function(h, i) {
    var row = 2 + i;
    sheet.getRange(row, 1).setValue(h.segment_name || 'Сегмент ' + h.segment_id);
    sheet.getRange(row, 2).setValue(h.segment_description);
    // Собираем все поля в одну ячейку через переносы строк
    var combined = [
      'Заход: ' + h.hook,
      '',
      'Ключевое сообщение: ' + h.key_message,
      '',
      'Структура и содержание: ' + h.structure,
      '',
      'Эмоции и триггеры: ' + h.emotions_triggers,
      '',
      'Идеи заголовков: ' + h.headline_ideas
    ].join('\n');
    sheet.getRange(row, 3).setValue(combined);
  });
  Logger.log('Лист «Подготовка к запуску» обновлён.');
}

// ─── Инициализация шаблона листов ────────────────────────────
function initSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  createSettingsSheet_(ss);
  createChecklistSheet_(ss);
  createAnalysisSheet_(ss);
  createAllHypothesesSheet_(ss);
  createLaunchSheet_(ss);

  ui.alert('Готово', 'Шаблон листов создан:\n\n• Настройки — API-ключ и ID папки\n• Чеклист — статус выполнения\n• Анализ — продукт и ЦА\n• Все гипотезы (15) — все варианты\n• Подготовка к запуску — топ 10\n\nЗаполните «Настройки» и запустите анализ.', ui.ButtonSet.OK);
}

function createSettingsSheet_(ss) {
  var sheet = ss.getSheetByName(SETTINGS_SHEET);
  if (!sheet) sheet = ss.insertSheet(SETTINGS_SHEET);
  sheet.clearContents();

  sheet.getRange(1, 1, 3, 2).setValues([
    ['Параметр', 'Значение'],
    ['API-ключ Groq', ''],
    ['ID папки Google Drive', '']
  ]);
  sheet.getRange(1, 1, 1, 2).setBackground('#4A90D9').setFontColor('#FFFFFF').setFontWeight('bold');
  sheet.getRange(2, 1, 2, 1).setFontWeight('bold');
  sheet.setColumnWidth(1, 220);
  sheet.setColumnWidth(2, 420);

  sheet.getRange(5, 1).setValue('Как получить API-ключ Groq:');
  sheet.getRange(6, 1).setValue('1. Зайди на console.groq.com');
  sheet.getRange(7, 1).setValue('2. API Keys → Create API Key');
  sheet.getRange(8, 1).setValue('3. Скопируй ключ в ячейку B2');
  sheet.getRange(5, 1, 4, 1).setFontColor('#888888').setFontStyle('italic');
  sheet.getRange(10, 1).setValue('ID папки — часть URL после /folders/');
  sheet.getRange(10, 1).setFontColor('#888888').setFontStyle('italic');
}

function createChecklistSheet_(ss) {
  var sheet = ss.getSheetByName(CHECKLIST_SHEET);
  if (!sheet) sheet = ss.insertSheet(CHECKLIST_SHEET);
  sheet.clearContents();

  sheet.getRange(1, 1, 1, 3).setValues([['№ шага', 'Описание', 'Статус']]);
  sheet.getRange(1, 1, 1, 3).setBackground('#37474F').setFontColor('#FFFFFF').setFontWeight('bold');

  sheet.getRange(2, 1, 6, 3).setValues([
    [1, 'Читаем настройки (API-ключ, ID папки)', '⬜ Ожидание'],
    [2, 'Читаем файлы из Google Drive',           '⬜ Ожидание'],
    [3, 'Запрос 1: анализ продукта и ЦА',         '⬜ Ожидание'],
    [4, 'Запрос 2: генерация 15 заходов',          '⬜ Ожидание'],
    [5, 'Запрос 3: отбор 10 лучших заходов',       '⬜ Ожидание'],
    [6, 'Финал',                                   '⬜ Ожидание']
  ]);
  sheet.getRange(2, 3, 6, 1).setBackground('#F5F5F5').setFontColor('#888888');

  sheet.setColumnWidth(1, 60);
  sheet.setColumnWidth(2, 320);
  sheet.setColumnWidth(3, 380);
  [2,3,4,5,6,7].forEach(function(r) { sheet.setRowHeight(r, 36); });
}

function createAnalysisSheet_(ss) {
  var sheet = ss.getSheetByName(ANALYSIS_SHEET);
  if (!sheet) sheet = ss.insertSheet(ANALYSIS_SHEET);
  sheet.clearContents();

  var productHeaders = ['Что продаём?', 'О чём продукт?', 'Формат', 'Оффер', 'Преимущества', 'Методика', 'Посадочная страница', 'Спикер'];
  sheet.getRange(1, 1, 1, productHeaders.length).setValues([productHeaders]);
  sheet.getRange(1, 1, 1, productHeaders.length).setBackground('#2E7D32').setFontColor('#FFFFFF').setFontWeight('bold').setWrap(true);

  sheet.getRange(3, 1).setValue('Сегменты целевой аудитории').setFontWeight('bold').setFontSize(12);

  var audHeaders = ['Описание сегмента', 'Уровень\nосознанности\n(0–5)', 'Боли', 'Потребности', 'Возражения', 'Как закрывает боли', 'Результат', 'Результат результата', 'Оффер под сегмент'];
  sheet.getRange(4, 1, 1, audHeaders.length).setValues([audHeaders]);
  sheet.getRange(4, 1, 1, audHeaders.length).setBackground('#1565C0').setFontColor('#FFFFFF').setFontWeight('bold').setWrap(true);

  [2, 5, 6, 7].forEach(function(r) { sheet.setRowHeight(r, 120); });
  [200, 120, 220, 220, 220, 250, 200, 200, 220].forEach(function(w, i) { sheet.setColumnWidth(i + 1, w); });
  sheet.getRange(2, 1, 1, 8).setWrap(true);
  sheet.getRange(5, 1, 3, 9).setWrap(true);
}

function createAllHypothesesSheet_(ss) {
  var sheet = ss.getSheetByName(ALL_HYPO_SHEET);
  if (!sheet) sheet = ss.insertSheet(ALL_HYPO_SHEET);
  sheet.clearContents();

  var headers = ['Сегмент', 'Описание сегмента', 'Заход / Хук', 'Ключевое сообщение', 'Структура и содержание', 'Эмоции и триггеры', 'Идеи заголовков'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setBackground('#E65100').setFontColor('#FFFFFF').setFontWeight('bold');

  for (var i = 2; i <= 16; i++) {
    sheet.setRowHeight(i, 100);
    sheet.getRange(i, 1, 1, 7).setWrap(true);
  }
  [100, 160, 250, 200, 220, 180, 200].forEach(function(w, i) { sheet.setColumnWidth(i + 1, w); });
}

function createLaunchSheet_(ss) {
  var sheet = ss.getSheetByName(LAUNCH_SHEET);
  if (!sheet) sheet = ss.insertSheet(LAUNCH_SHEET);
  sheet.clearContents();

  var headers = ['Сегмент ЦА', 'Описание сегмента', 'Промо-гипотеза'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setBackground('#6A1B9A').setFontColor('#FFFFFF').setFontWeight('bold');

  for (var i = 2; i <= 11; i++) {
    sheet.setRowHeight(i, 200);
    sheet.getRange(i, 3).setWrap(true);
  }
  sheet.setColumnWidth(1, 120);
  sheet.setColumnWidth(2, 200);
  sheet.setColumnWidth(3, 600);
}
