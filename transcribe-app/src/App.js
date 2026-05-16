import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import VideoUploader from './components/VideoUploader';
import ModelSelector from './components/ModelSelector';
import TranscriptViewer from './components/TranscriptViewer';
import History from './components/History';
import { useHistory } from './hooks/useHistory';
import { pipeline } from '@xenova/transformers';

function App() {
  const [activeTab, setActiveTab] = useState('transcribe');
  const [selectedModel, setSelectedModel] = useState('base');
  const [videoFile, setVideoFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const { addToHistory, history, clearHistory } = useHistory();

  useEffect(() => {
    console.log('🎙️ Transcribe App v1.1.0 - Real Whisper in Browser');
    console.log('📅 Last updated: 2026-05-16');
    console.log('✨ Features: Real Whisper transcription, All model sizes (tiny→large), Offline processing');
  }, []);

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
      setProgress(5);
      setProgress(10);

      // Шаг 1: Инициализируем Whisper модель
      const modelName = `Xenova/whisper-${selectedModel}`;
      setProgress(15);

      const transcriber = await pipeline('automatic-speech-recognition', modelName);
      setProgress(40);

      // Шаг 2: Извлекаем аудио из видео
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const arrayBuffer = await videoFile.arrayBuffer();

      try {
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        setProgress(60);

        // Конвертируем в моно PCM для Whisper
        const offlineContext = new OfflineAudioContext(1, audioBuffer.length, audioBuffer.sampleRate);
        const source = offlineContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(offlineContext.destination);
        source.start(0);

        const monoAudioBuffer = await offlineContext.startRendering();
        setProgress(75);

        // Шаг 3: Запускаем транскрибацию с реальным Whisper
        const result = await transcriber(monoAudioBuffer);
        setProgress(95);

        // Формируем результат
        const transcript = {
          text: result.text || '',
          segments: result.chunks || [],
          language: 'ru',
          duration: audioBuffer.duration,
          model: selectedModel
        };

        setProgress(100);
        setTranscript(transcript);

        // Добавляем в историю
        addToHistory({
          filename: videoFile.name,
          model: selectedModel,
          timestamp: new Date().toLocaleString('ru-RU'),
          transcript: transcript.text
        });

      } catch (audioError) {
        throw new Error('Не удалось обработать аудио из видео. Попробуйте другой файл.');
      }

    } catch (err) {
      setError(err.message || 'Ошибка при транскрибации');
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
        <p>
          📊 v1.1.0 • Обновлено: 16 мая 2026 •
          <span title="Реальный Whisper в браузере | Transformers.js" style={{cursor: 'help'}}>
            ✨ Whisper актуален
          </span>
        </p>
      </footer>
    </div>
  );
}

export default App;
