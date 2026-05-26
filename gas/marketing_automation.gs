// ============================================================
//  Автоматизация маркетингового анализа через Groq API
//  Размести этот код в редакторе Apps Script твоей таблицы
// ============================================================

// ─── Константы ───────────────────────────────────────────────
var SETTINGS_SHEET   = 'Настройки';
var ANALYSIS_SHEET   = 'Анализ';
var LAUNCH_SHEET     = 'Подготовка к запуску';

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

    // Шаг 2 — собираем контекст из Google Drive
    Logger.log('=== [2/6] Читаем файлы из Google Drive ===');
    var projectContext = collectDriveContext_(settings.folderId);
    if (!projectContext || projectContext.trim().length === 0) {
      ui.alert('Ошибка', 'Папка пуста или не содержит читаемых файлов. Проверьте ID папки.', ui.ButtonSet.OK);
      return;
    }
    Logger.log('Собрано символов контекста: ' + projectContext.length);

    // Шаг 3 — запрос 1: анализ продукта и ЦА
    Logger.log('=== [3/6] Запрос 1 — Анализ продукта и ЦА ===');
    var analysisJson = callGroqApi_(settings.apiKey, buildPrompt1_(projectContext));
    Logger.log('Ответ Запроса 1 получен, записываем в лист «Анализ»');
    writeAnalysisSheet_(analysisJson);

    // Шаг 4 — запрос 2: генерация 15 заходов (по 5 на каждый сегмент)
    Logger.log('Пауза 20 сек перед запросом 2 (лимит TPM Groq)...');
    Utilities.sleep(20000);
    Logger.log('=== [4/6] Запрос 2 — Генерация 15 рекламных заходов ===');
    var allHypothesesJson = callGroqApi_(settings.apiKey, buildPrompt2a_(analysisJson));
    Logger.log('Ответ Запроса 2 получен: ' + (allHypothesesJson.hypotheses || []).length + ' заходов');

    // Шаг 5 — запрос 3: отбор 10 лучших заходов из 15
    Logger.log('Пауза 20 сек перед запросом 3 (лимит TPM Groq)...');
    Utilities.sleep(20000);
    Logger.log('=== [5/6] Запрос 3 — Отбор 10 лучших заходов ===');
    var top10Json = callGroqApi_(settings.apiKey, buildPrompt2b_(allHypothesesJson));
    Logger.log('Ответ Запроса 3 получен, записываем в лист «Подготовка к запуску»');
    writeLaunchSheet_(top10Json);

    Logger.log('=== [6/6] Готово ===');
    ui.alert('Успех', 'Анализ завершён.\n• Лист «Анализ» — продукт и сегменты ЦА\n• Лист «Подготовка к запуску» — 10 лучших рекламных гипотез', ui.ButtonSet.OK);

  } catch (e) {
    Logger.log('ОШИБКА: ' + e.message);
    ui.alert('Ошибка выполнения', e.message, ui.ButtonSet.OK);
  }
}

// ─── Настройки ───────────────────────────────────────────────
function readSettings_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SETTINGS_SHEET);
  if (!sheet) throw new Error('Лист «Настройки» не найден. Запустите «Создать шаблон листов» из меню.');
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

  // Google Docs
  var docs = folder.getFilesByType(MimeType.GOOGLE_DOCS);
  while (docs.hasNext()) {
    var file = docs.next();
    Logger.log('  Читаем Google Doc: ' + file.getName());
    var text = DocumentApp.openById(file.getId()).getBody().getText();
    parts.push('--- ' + file.getName() + ' ---\n' + text);
  }

  // Простые текстовые / CSV файлы
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
function callGroqApi_(apiKey, messages) {
  var payload = JSON.stringify({
    model: GROQ_MODEL,
    messages: messages,
    response_format: { type: 'json_object' },
    temperature: 0.7,
    max_tokens: 4096
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
    'СТРУКТУРА ЗАДАЧИ:',
    'Ты заполняешь таблицу из двух блоков:',
    '1. Блок продукта',
    '2. Блок ЦА (3 сегмента)',
    '',
    'ПРАВИЛА БЛОКА ПРОДУКТА:',
    '1. Что продаём? — название ДОСЛОВНО с посадочной или из брифа. НЕ переформулировать.',
    '2. О чём продукт? — ниша и кратко суть.',
    '3. Формат — берётся с посадочной (марафон / курс / программа и т.д.).',
    '4. Оффер — ОБЯЗАТЕЛЬНО сначала дословный оффер с первого экрана посадочной, затем можно предложить улучшенную версию (пометить отдельно).',
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
    'ЛЕСТНИЦА ХАНТА (уровни осознанности):',
    '0 — не знает о проблеме (аудитория не понимает, что проблема существует)',
    '1 — знает о проблеме, но не ищет решение',
    '2 — знает о проблеме и ищет решение, но не знает о продукте',
    '3 — знает о продукте, но ещё не выбрал',
    '4 — сравнивает продукты между собой',
    '5 — готов купить, нужен лишь финальный импульс',
    '',
    'Верни ТОЛЬКО валидный JSON без комментариев и лишних пробелов по следующей схеме:',
    JSON.stringify({
      product_block: {
        title: 'Дословное название продукта',
        description: 'Ниша и краткая суть продукта',
        format: 'Формат (курс / марафон / вебинар и т.д.)',
        offer: 'Дословный оффер с первого экрана \\n\\n Улучшенный оффер',
        advantages: 'Преимущества перед альтернативами на основе данных ЦА',
        methodology: 'Конкретный механизм результата без магии и абстракций',
        landing_page_analysis: 'Уровень по лестнице Ханта + краткий портрет ЦА: пол, возраст, занятие',
        speaker: 'Только сухие факты: имя, опыт, достижения'
      },
      audience_segments: [
        {
          segment_id: 1,
          description: 'Описание сегмента: возраст, пол, образ жизни, интересы',
          awareness_level: 3,
          pains: 'Боли сегмента реальными формулировками ЦА',
          needs: 'Потребности сегмента языком ЦА',
          objections: 'Реалистичные возражения языком ЦА',
          solutions: 'Боль 1 -> Решение 1\\nБоль 2 -> Решение 2',
          result: 'Подробный конкретный результат',
          result_of_result: 'Изменение жизни / состояния',
          segment_offer: 'Оффер под сегмент для рекламы'
        },
        { segment_id: 2, description: '...', awareness_level: 2, pains: '...', needs: '...', objections: '...', solutions: '...', result: '...', result_of_result: '...', segment_offer: '...' },
        { segment_id: 3, description: '...', awareness_level: 1, pains: '...', needs: '...', objections: '...', solutions: '...', result: '...', result_of_result: '...', segment_offer: '...' }
      ]
    }, null, 2)
  ].join('\n');

  var user = 'Вот материалы проекта:\n\n' + context;

  return [
    { role: 'system', content: system },
    { role: 'user',   content: user }
  ];
}

// ─── Промпт 2a: генерация 15 заходов (по 5 на каждый сегмент) ─
function buildPrompt2a_(analysisData) {
  var segmentsText = analysisData.audience_segments.map(function(seg) {
    return [
      'Сегмент ' + seg.segment_id + ' — ' + seg.description,
      'Боли: ' + seg.pains,
      'Потребности: ' + seg.needs,
      'Возражения: ' + seg.objections,
      'Результат: ' + seg.result,
      'Оффер под сегмент: ' + seg.segment_offer
    ].join('\n');
  }).join('\n\n');

  var productLine = [
    'Продукт: ' + analysisData.product_block.title + ' (' + analysisData.product_block.format + ')',
    'Оффер: ' + analysisData.product_block.offer,
    'Преимущества: ' + analysisData.product_block.advantages,
    'Методика: ' + analysisData.product_block.methodology
  ].join('\n');

  var system = [
    'Ты — профессиональный маркетолог и копирайтер в нише онлайн-образования (осознанность, психология, медитация, курсы для мужского и личного развития).',
    'Твоя задача — строго на основе предоставленных данных, без выдумок и интерпретаций, написать 15 вариантов креативных цепляющих заходов (первый абзац) промопостов для таргетированной рекламы ВКонтакте.',
    '',
    'ЗАДАЧА:',
    'Напиши по 5 заходов для каждого из 3 сегментов ЦА (итого 15 заходов).',
    '',
    'ТРЕБОВАНИЯ К КАЖДОМУ ЗАХОДУ:',
    '— Используй разные механики привлечения внимания: через боли, через выгоды, через закрытие возражений, эмоциональные заходы, кейс, провокационный вопрос',
    '— Каждый заход должен вызывать желание развернуть пост полностью и дочитать до конца',
    '— Заголовки — цепляющие, конкретные, без воды',
    '— Опирайся на реальный язык ЦА из описания сегментов',
    '',
    'ДЛЯ КАЖДОГО ЗАХОДА ПРОПИШИ:',
    '1. Заход / хук (первый абзац поста)',
    '2. Ключевое сообщение (суть будущего поста)',
    '3. Структура и содержание поста (краткий план — о чём будет пост)',
    '4. Эмоции и триггеры вовлечения',
    '5. Идеи заголовков или хуков',
    '',
    'СХЕМА JSON (верни ТОЛЬКО валидный JSON, без комментариев):',
    JSON.stringify({
      hypotheses: [
        {
          segment_id: 1,
          segment_name: 'Сегмент 1',
          segment_description: 'Краткое описание сегмента',
          promo_hypothesis: 'Заход: [текст хука]\n\nКлючевое сообщение: [суть]\n\nСтруктура и содержание: [план поста]\n\nЭмоции и триггеры: [список]\n\nИдеи заголовков: [варианты]'
        }
      ]
    }, null, 2),
    '(Всего 15 объектов в массиве hypotheses — по 5 на каждый из 3 сегментов)'
  ].join('\n');

  var user = [
    'Таблица анализа проекта:',
    '',
    productLine,
    '',
    'Сегменты ЦА:',
    '',
    segmentsText
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user',   content: user }
  ];
}

// ─── Промпт 2b: отбор 10 лучших из 15 ───────────────────────
function buildPrompt2b_(allHypothesesData) {
  var hypothesesText = (allHypothesesData.hypotheses || []).map(function(h, i) {
    return [
      '--- Гипотеза ' + (i + 1) + ' (Сегмент ' + h.segment_id + ': ' + h.segment_name + ') ---',
      h.promo_hypothesis
    ].join('\n');
  }).join('\n\n');

  var system = [
    'Ты — эксперт по таргетированной рекламе ВКонтакте.',
    'Тебе предоставлено 15 рекламных заходов для промопостов.',
    '',
    'ЗАДАЧА:',
    'Выбери 10 самых удачных и "горячих" заходов для таргета — те, с которых лучше начинать запуск.',
    'Критерии отбора:',
    '— Максимальный отклик у холодной аудитории',
    '— Разнообразие механик и сегментов (не все 10 из одного сегмента)',
    '— Конкретность и цепляемость хука',
    '— Чёткое ключевое сообщение',
    '',
    'Верни выбранные 10 заходов в том же формате JSON, сохранив все поля без изменений:',
    JSON.stringify({
      hypotheses: [
        {
          segment_id: 1,
          segment_name: 'Сегмент 1',
          segment_description: 'Краткое описание сегмента',
          promo_hypothesis: 'Заход: ...\n\nКлючевое сообщение: ...\n\nСтруктура и содержание: ...\n\nЭмоции и триггеры: ...\n\nИдеи заголовков: ...'
        }
      ]
    }, null, 2),
    '(Ровно 10 объектов в массиве hypotheses)'
  ].join('\n');

  var user = [
    'Вот 15 рекламных заходов:',
    '',
    hypothesesText,
    '',
    'Выбери 10 самых удачных и горячих заходов для таргета, с которых лучше начинать запуск.'
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user',   content: user }
  ];
}

// ─── Запись листа «Анализ» ────────────────────────────────────
function writeAnalysisSheet_(data) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(ANALYSIS_SHEET);
  if (!sheet) throw new Error('Лист «' + ANALYSIS_SHEET + '» не найден. Запустите «Создать шаблон листов».');

  var pb = data.product_block;

  // Заголовки продукта (строка 1) — пишем один раз при инициализации, здесь не трогаем
  // Очищаем строку данных продукта
  sheet.getRange(2, 1, 1, 8).clearContent();
  sheet.getRange(2, 1).setValue(pb.title);
  sheet.getRange(2, 2).setValue(pb.description);
  sheet.getRange(2, 3).setValue(pb.format);
  sheet.getRange(2, 4).setValue(pb.offer);
  sheet.getRange(2, 5).setValue(pb.advantages);
  sheet.getRange(2, 6).setValue(pb.methodology);
  sheet.getRange(2, 7).setValue(pb.landing_page_analysis);
  sheet.getRange(2, 8).setValue(pb.speaker);

  // Очищаем строки сегментов ЦА
  sheet.getRange(5, 1, 3, 9).clearContent();
  var segments = data.audience_segments || [];
  segments.slice(0, 3).forEach(function(seg, i) {
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

// ─── Запись листа «Подготовка к запуску» ─────────────────────
function writeLaunchSheet_(data) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(LAUNCH_SHEET);
  if (!sheet) throw new Error('Лист «' + LAUNCH_SHEET + '» не найден. Запустите «Создать шаблон листов».');

  // Очищаем старые данные (строки 2+)
  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) sheet.getRange(2, 1, lastRow - 1, 3).clearContent();

  var items = (data.hypotheses || []).slice(0, 10);
  items.forEach(function(h, i) {
    var row = 2 + i;
    sheet.getRange(row, 1).setValue(h.segment_name || 'Сегмент ' + h.segment_id);
    sheet.getRange(row, 2).setValue(h.segment_description);
    sheet.getRange(row, 3).setValue(h.promo_hypothesis);
  });

  Logger.log('Лист «Подготовка к запуску» обновлён: ' + items.length + ' гипотез.');
}

// ─── Инициализация шаблона листов ────────────────────────────
function initSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  createSettingsSheet_(ss);
  createAnalysisSheet_(ss);
  createLaunchSheet_(ss);

  ui.alert('Готово', 'Шаблон листов создан.\n\n1. Откройте лист «Настройки»\n2. Вставьте API-ключ Groq в B2\n3. Вставьте ID папки Google Drive в B3\n4. Добавьте файлы проекта в папку\n5. Нажмите «Запустить анализ проекта»', ui.ButtonSet.OK);
}

function createSettingsSheet_(ss) {
  var sheet = ss.getSheetByName(SETTINGS_SHEET);
  if (!sheet) sheet = ss.insertSheet(SETTINGS_SHEET);
  sheet.clearContents();

  var headers = [
    ['Параметр', 'Значение'],
    ['API-ключ Groq', ''],
    ['ID папки Google Drive', '']
  ];
  sheet.getRange(1, 1, headers.length, 2).setValues(headers);

  // Форматирование заголовка
  sheet.getRange(1, 1, 1, 2)
    .setBackground('#4A90D9')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold');

  sheet.getRange(2, 1, 2, 1).setFontWeight('bold');
  sheet.setColumnWidth(1, 220);
  sheet.setColumnWidth(2, 420);

  // Подсказка
  sheet.getRange(5, 1).setValue('Как получить API-ключ Groq:');
  sheet.getRange(6, 1).setValue('1. Зайди на console.groq.com');
  sheet.getRange(7, 1).setValue('2. API Keys → Create API Key');
  sheet.getRange(8, 1).setValue('3. Скопируй ключ в ячейку B2');
  sheet.getRange(5, 1, 4, 1).setFontColor('#888888').setFontStyle('italic');

  sheet.getRange(10, 1).setValue('Как найти ID папки Google Drive:');
  sheet.getRange(11, 1).setValue('Откройте папку в браузере — ID это часть URL после /folders/');
  sheet.getRange(10, 1, 2, 1).setFontColor('#888888').setFontStyle('italic');

  Logger.log('Лист «Настройки» создан.');
}

function createAnalysisSheet_(ss) {
  var sheet = ss.getSheetByName(ANALYSIS_SHEET);
  if (!sheet) sheet = ss.insertSheet(ANALYSIS_SHEET);
  sheet.clearContents();

  // Заголовки блока продукта
  var productHeaders = [
    'Что продаём?', 'О чём продукт?', 'Формат',
    'Оффер', 'Преимущества', 'Методика',
    'Посадочная страница', 'Спикер'
  ];
  sheet.getRange(1, 1, 1, productHeaders.length).setValues([productHeaders]);
  sheet.getRange(1, 1, 1, productHeaders.length)
    .setBackground('#2E7D32')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setWrap(true);

  // Пустая строка-разделитель (строка 3)
  sheet.getRange(3, 1).setValue('Сегменты целевой аудитории').setFontWeight('bold').setFontSize(12);

  // Заголовки блока ЦА
  var audHeaders = [
    'Описание сегмента', 'Уровень осознанности\n(0–5)',
    'Боли', 'Потребности', 'Возражения',
    'Как продукт закрывает боли', 'Результат',
    'Результат результата', 'Оффер под сегмент'
  ];
  sheet.getRange(4, 1, 1, audHeaders.length).setValues([audHeaders]);
  sheet.getRange(4, 1, 1, audHeaders.length)
    .setBackground('#1565C0')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setWrap(true);

  // Высота строк для данных
  [2, 5, 6, 7].forEach(function(r) { sheet.setRowHeight(r, 120); });

  // Ширина колонок
  var widths = [200, 120, 220, 220, 220, 250, 200, 200, 220];
  widths.forEach(function(w, i) { sheet.setColumnWidth(i + 1, w); });

  // Перенос текста в строках данных
  sheet.getRange(2, 1, 1, 8).setWrap(true);
  sheet.getRange(5, 1, 3, 9).setWrap(true);

  Logger.log('Лист «Анализ» создан.');
}

function createLaunchSheet_(ss) {
  var sheet = ss.getSheetByName(LAUNCH_SHEET);
  if (!sheet) sheet = ss.insertSheet(LAUNCH_SHEET);
  sheet.clearContents();

  var headers = ['Сегмент ЦА', 'Описание сегмента', 'Промо-гипотеза'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setBackground('#6A1B9A')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold');

  // Подготовить пустые строки с форматированием
  for (var i = 2; i <= 11; i++) {
    sheet.setRowHeight(i, 180);
    sheet.getRange(i, 3).setWrap(true);
  }

  sheet.setColumnWidth(1, 120);
  sheet.setColumnWidth(2, 200);
  sheet.setColumnWidth(3, 600);

  Logger.log('Лист «Подготовка к запуску» создан.');
}
