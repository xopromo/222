# Video Editing with Claude Haiku

Это модуль для работы с видеомонтажом через Claude Haiku модель. Интегрируется с проектом [video-use](https://github.com/browser-use/video-use).

## Почему Haiku?

- **Быстро**: Haiku в 2-3x быстрее Sonnet
- **Дешево**: ~3x дешевле в цене
- **Хватает**: Для анализа видео/транскриптов достаточно
- **Масштабируется**: Идеально для обработки множества видео

## Возможности

### 1. Анализ транскриптов

Определяет в видео:
- Слова-паразиты (`ум`, `ээ`, `типа`, `знаете`)
- Длинные паузы (> 2 сек)
- Неправильные начала фраз
- Зоны для цветокоррекции

```python
from app.services.video_processor import VideoProcessor

processor = VideoProcessor()
result = processor.analyze_video(transcript)
# → {'fillers': [...], 'pauses': [...], 'segments': [...]}
```

### 2. Генерация плана монтажа

Автоматически создает инструкции для:
- Удаления паразитов (`remove_fillers`)
- Создания субтитров (`add_subtitles`)
- Цветокоррекции (`color_grade`)
- Обработки звука (`audio_fade`)

```python
task = VideoEditTask(
    video_path="/videos/interview.mp4",
    task_type="remove_fillers",
    description="Удалить все паразиты"
)
plan = processor.generate_edit_plan(task)
```

### 3. Оценка времени обработки

Быстро оценивает, сколько времени займет монтаж каждого видео.

```python
estimate = processor.estimate_edit_time(video_duration_seconds=600)
# → {'remove_fillers_minutes': 2, 'total_minutes': 8, ...}
```

## Установка

```bash
# Добавить зависимость
pip install anthropic

# Или через requirements
pip install -r requirements.txt
```

## Быстрый старт

### Запустить демо

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
python examples/video_editing_haiku_demo.py
```

Демо показывает:
1. Анализ транскрипта
2. Генерацию планов монтажа
3. Оценку времени обработки

### Запустить тесты

```bash
# Unit-тесты (не требуют API)
pytest tests/test_video_processor.py -v

# Integration-тесты (требуют API)
pytest tests/test_video_processor.py -v -m integration
```

## Примеры использования

### Пример 1: Удаление паразитов

```python
from app.services.video_processor import VideoProcessor, VideoEditTask

processor = VideoProcessor()

task = VideoEditTask(
    video_path="/videos/interview.mp4",
    task_type="remove_fillers",
    description="Удалить все ums, uhs и длинные паузы"
)

plan = processor.generate_edit_plan(task)
print(plan)
# Output:
# 1. Remove 'um' at 0:15
# 2. Remove 'uh' at 0:45
# 3. Trim 3s pause at 1:30
# ...
```

### Пример 2: Анализ транскрипта

```python
transcript = """
Так, um, сегодня мы говорим о видеомонтаже.
Это, ээ, очень важный навык.
[пауза 3 секунды]
Знаете, давайте начнём.
"""

result = processor.analyze_video(transcript)

if result['fillers']:
    print(f"Найдено {len(result['fillers'])} паразитов:")
    for f in result['fillers']:
        print(f"  - {f['word']} в {f['time']}")

if result['pauses']:
    print(f"Найдено {len(result['pauses'])} длинных пауз")
```

### Пример 3: Оценка времени

```python
# Видео длиной 20 минут (1200 сек)
estimate = processor.estimate_edit_time(1200)

print(f"Общее время обработки: {estimate['total_minutes']} минут")
print(f"  - Удаление паразитов: {estimate['remove_fillers_minutes']} мин")
print(f"  - Субтитры: {estimate['add_subtitles_minutes']} мин")
print(f"  - Цветокоррекция: {estimate['color_grade_minutes']} мин")
```

## Структура файлов

```
222/
├── app/services/video_processor.py    # Основной модуль
├── tests/test_video_processor.py      # Тесты (можно удалить)
├── examples/
│   └── video_editing_haiku_demo.py   # Демо (можно удалить)
└── VIDEO_EDITING.md                   # Эта документация
```

## Быстрое удаление

Если это больше не нужно, просто удалите:

```bash
# Удалить модуль
rm app/services/video_processor.py

# Удалить тесты
rm tests/test_video_processor.py

# Удалить демо
rm examples/video_editing_haiku_demo.py

# Удалить документацию
rm VIDEO_EDITING.md

# Удалить зависимость из requirements.txt
# (удалить строку "anthropic==0.41.0")
```

## Интеграция с video-use

Этот модуль может использоваться как backend для интерпретации команд пользователя и генерации инструкций для video-use.

```python
# Примерный workflow
processor = VideoProcessor()
user_request = "Удали все паузы и добавь субтитры"

# 1. Анализировать видео
analysis = processor.analyze_video(transcript)

# 2. Создать план на основе анализа
task = VideoEditTask(
    video_path=video_path,
    task_type="remove_fillers",
    description=user_request
)
plan = processor.generate_edit_plan(task)

# 3. Передать план в video-use через CLI
# subprocess.run(['python', 'video-use/editor.py', plan])
```

## API Reference

### VideoProcessor

```python
processor = VideoProcessor(api_key="sk-ant-...")
```

**Методы:**

- `analyze_video(transcript: str) → dict` — Анализ транскрипта
- `generate_edit_plan(task: VideoEditTask) → str` — Генерация плана
- `estimate_edit_time(video_duration_seconds: int) → dict` — Оценка времени

### VideoEditTask

```python
task = VideoEditTask(
    video_path: str,           # Путь к видео
    task_type: str,            # remove_fillers | add_subtitles | color_grade | audio_fade
    description: str,          # Описание задачи
    parameters: dict | None    # Дополнительные параметры
)
```

## Поддержка

- 📖 [video-use документация](https://github.com/browser-use/video-use)
- 🤖 [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-python)
- 📧 Вопросы в issues репо

## Лицензия

MIT (как основной проект)
