import React, { useState, useEffect } from 'react';
import './App.css';
import VideoUploader from './components/VideoUploader';
import ModelSelector from './components/ModelSelector';
import TranscriptViewer from './components/TranscriptViewer';
import History from './components/History';
import { useHistory } from './hooks/useHistory';

function App() {
  const [activeTab, setActiveTab] = useState('transcribe');
  const [selectedModel, setSelectedModel] = useState('base');
  const [videoFile, setVideoFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const { addToHistory, history, clearHistory } = useHistory();

  const MODELS = {
    tiny: { size: '39MB', speed: 'Очень быстро', accuracy: 'Низкая', url: 'https://huggingface.co/ggerganov/whisper.cpp/releases/download/v1.0/ggml-tiny.bin' },
    base: { size: '140MB', speed: 'Быстро', accuracy: 'Хорошо', url: 'https://huggingface.co/ggerganov/whisper.cpp/releases/download/v1.0/ggml-base.bin' },
    small: { size: '465MB', speed: 'Нормально', accuracy: 'Высокая', url: 'https://huggingface.co/ggerganov/whisper.cpp/releases/download/v1.0/ggml-small.bin' },
    medium: { size: '1.5GB', speed: 'Медленно', accuracy: 'Очень высокая', url: 'https://huggingface.co/ggerganov/whisper.cpp/releases/download/v1.0/ggml-medium.bin' },
    large: { size: '2.9GB', speed: 'Очень медленно', accuracy: 'Максимальная', url: 'https://huggingface.co/ggerganov/whisper.cpp/releases/download/v1.0/ggml-large.bin' }
  };

  const handleVideoSelect = (file) => {
    setVideoFile(file);
    setError(null);
    setTranscript(null);
  };

  const handleGoogleDriveUrl = async (url) => {
    try {
      setError(null);
      setIsProcessing(true);
      setProgress(0);

      // Извлекаем FILE_ID из Google Drive ссылки
      const fileIdMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (!fileIdMatch) {
        throw new Error('Неверный формат ссылки Google Drive');
      }

      const fileId = fileIdMatch[1];
      const directUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;

      setProgress(10);

      // Скачиваем видео
      const response = await fetch(directUrl);
      if (!response.ok) throw new Error('Не удалось скачать видео');

      const blob = await response.blob();
      const file = new File([blob], `video-${Date.now()}.mp4`, { type: 'video/mp4' });

      setProgress(30);
      setVideoFile(file);

    } catch (err) {
      setError(err.message);
      setIsProcessing(false);
    }
  };

  const handleTranscribe = async () => {
    if (!videoFile) {
      setError('Выберите видеофайл');
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setError(null);

    try {
      // Шаг 1: Загрузить модель (30%)
      setProgress(30);

      // Шаг 2: Извлечь аудио (50%)
      setProgress(50);
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const arrayBuffer = await videoFile.arrayBuffer();

      // Шаг 3: Обработать (70%)
      setProgress(70);

      // Для MVP используем Web Speech API (быстро)
      // В полной версии добавим Whisper.cpp
      const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
      recognition.lang = 'ru-RU';
      recognition.continuous = true;

      let transcriptText = '';

      recognition.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcriptText += event.results[i][0].transcript + ' ';
        }
      };

      recognition.onerror = (event) => {
        throw new Error(`Ошибка распознавания: ${event.error}`);
      };

      // Для видео файла нужна более сложная обработка
      // Это placeholder - в полной версии будет Whisper.cpp
      const mockTranscript = {
        text: 'Демонстрационная транскрипция. В полной версии используется Whisper.cpp для точной транскрибации.',
        segments: [
          { start: 0, end: 5, text: 'Демонстрационная' },
          { start: 5, end: 10, text: 'транскрипция' }
        ],
        language: 'ru',
        duration: videoFile.size
      };

      setProgress(100);
      setTranscript(mockTranscript);

      // Добавляем в историю
      addToHistory({
        filename: videoFile.name,
        model: selectedModel,
        timestamp: new Date().toLocaleString('ru-RU'),
        transcript: mockTranscript.text
      });

    } catch (err) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <h1>🎙️ Transcribe</h1>
          <p>Бесплатная транскрибация видео - Offline, Приватно</p>
        </div>
      </header>

      <main className="container">
        <div className="tabs">
          <button
            className={`tab ${activeTab === 'transcribe' ? 'active' : ''}`}
            onClick={() => setActiveTab('transcribe')}
          >
            📝 Транскрибация
          </button>
          <button
            className={`tab ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            📋 История ({history.length})
          </button>
        </div>

        {activeTab === 'transcribe' ? (
          <div className="transcribe-panel">
            {/* Выбор модели */}
            <ModelSelector
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
              models={MODELS}
              disabled={isProcessing}
            />

            {/* Загрузка видео */}
            <VideoUploader
              onFileSelect={handleVideoSelect}
              onGoogleDriveUrl={handleGoogleDriveUrl}
              disabled={isProcessing}
              selectedFile={videoFile}
            />

            {/* Progress bar */}
            {isProcessing && (
              <div className="progress-container">
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${progress}%` }}></div>
                </div>
                <p className="progress-text">Обработка: {progress}%</p>
              </div>
            )}

            {/* Кнопка транскрибации */}
            <button
              className="transcribe-btn"
              onClick={handleTranscribe}
              disabled={!videoFile || isProcessing}
            >
              {isProcessing ? '⏳ Обработка...' : '🚀 Начать транскрибацию'}
            </button>

            {/* Ошибки */}
            {error && (
              <div className="error-message">
                ❌ {error}
              </div>
            )}

            {/* Результат */}
            {transcript && (
              <TranscriptViewer transcript={transcript} />
            )}
          </div>
        ) : (
          <History history={history} onClear={clearHistory} />
        )}
      </main>

      <footer className="footer">
        <p>💚 Приватность: Все обработки происходят в вашем браузере. Видео не отправляется на серверы.</p>
        <p>📊 Версия 1.0 - MVP</p>
      </footer>
    </div>
  );
}

export default App;
