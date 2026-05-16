import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import VideoUploader from './components/VideoUploader';
import ModelSelector from './components/ModelSelector';
import TranscriptViewer from './components/TranscriptViewer';
import History from './components/History';
import { useHistory } from './hooks/useHistory';
import { pipeline } from '@xenova/transformers';
import { BUILD_TIME } from './BUILD_TIME';

const LAST_UPDATE = new Date(BUILD_TIME);

function getUpdateTimeString() {
  const now = new Date();
  const diffMs = now - LAST_UPDATE;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'только что';
  if (diffMins < 60) return `${diffMins}м назад`;
  if (diffHours < 24) return `${diffHours}ч назад`;
  if (diffDays === 1) return 'вчера';
  return `${diffDays}д назад`;
}

function App() {
  const [activeTab, setActiveTab] = useState('transcribe');
  const [selectedModel, setSelectedModel] = useState('base');
  const [videoFile, setVideoFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [progressInfo, setProgressInfo] = useState({ stage: '', elapsed: 0, estimated: 0 });
  const [updateTime, setUpdateTime] = useState(getUpdateTimeString());
  const { addToHistory, history, clearHistory } = useHistory();
  const startTimeRef = useRef(null);
  const stageTimingsRef = useRef({});

  useEffect(() => {
    console.log('🎙️ Transcribe App v1.1.0 - Real Whisper in Browser');
    console.log('📅 Last updated: 2026-05-16 17:45 UTC');
    console.log('✨ Features: Real Whisper transcription, All model sizes (tiny→large), Offline processing');
  }, []);

  useEffect(() => {
    // Обновляем время с момента последнего обновления каждую минуту
    const timer = setInterval(() => {
      setUpdateTime(getUpdateTimeString());
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  // Load preferences from localStorage on mount
  useEffect(() => {
    const savedModel = localStorage.getItem('selected-model');
    if (savedModel) {
      setSelectedModel(savedModel);
    }

    // Load file from IndexedDB if available
    const dbRequest = indexedDB.open('transcribe-app', 1);
    dbRequest.onerror = () => console.error('IndexedDB error');
    dbRequest.onsuccess = (event) => {
      const db = event.target.result;
      const store = db.transaction('files', 'readonly').objectStore('files');
      const getRequest = store.get('last-file');
      getRequest.onsuccess = (e) => {
        if (e.target.result) {
          const file = new File([e.target.result.blob], e.target.result.name, { type: e.target.result.type });
          setVideoFile(file);
        }
      };
    };

    dbRequest.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('files')) {
        db.createObjectStore('files');
      }
    };
  }, []);

  // Save model selection to localStorage
  useEffect(() => {
    localStorage.setItem('selected-model', selectedModel);
  }, [selectedModel]);

  // Save file to IndexedDB when it changes
  useEffect(() => {
    if (videoFile) {
      const reader = new FileReader();
      reader.onload = () => {
        const dbRequest = indexedDB.open('transcribe-app', 1);
        dbRequest.onsuccess = (event) => {
          const db = event.target.result;
          const store = db.transaction('files', 'readwrite').objectStore('files');
          store.put({
            blob: reader.result,
            name: videoFile.name,
            type: videoFile.type
          }, 'last-file');
        };
      };
      reader.readAsArrayBuffer(videoFile);
    }
  }, [videoFile]);

  // Обновляем прогноз времени каждую секунду
  useEffect(() => {
    if (!isProcessing || !startTimeRef.current) return;

    const timer = setInterval(() => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      const estimated = progress > 0 ? Math.round((elapsed / progress) * 100) : 0;

      setProgressInfo(prev => ({
        ...prev,
        elapsed: Math.round(elapsed),
        estimated: Math.max(estimated, 0)
      }));
    }, 100);

    return () => clearInterval(timer);
  }, [isProcessing, progress]);

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

    startTimeRef.current = Date.now();
    setIsProcessing(true);
    setProgress(0);
    setError(null);
    stageTimingsRef.current = {};

    try {
      // Шаг 1: Загрузка модели
      setProgressInfo({ stage: '📥 Загрузка модели Whisper...', elapsed: 0, estimated: 0 });
      setProgress(5);

      const modelName = `Xenova/whisper-${selectedModel}`;
      const transcriber = await pipeline('automatic-speech-recognition', modelName);
      setProgress(35);

      // Шаг 2: Загрузка аудиобуфера
      setProgressInfo({ stage: '🎵 Загрузка видеофайла...', elapsed: 0, estimated: 0 });

      const arrayBuffer = await videoFile.arrayBuffer();
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();

      setProgress(50);
      setProgressInfo({ stage: '🔧 Декодирование аудио...', elapsed: 0, estimated: 0 });

      // Декодируем аудиобуфер
      const audioBuffer = await new Promise((resolve, reject) => {
        audioContext.decodeAudioData(
          arrayBuffer,
          (buffer) => resolve(buffer),
          (error) => {
            console.error('Decode error:', error);
            reject(new Error(`Ошибка декодирования: ${error.message || 'неподдерживаемый формат'}`));
          }
        );
      });

      setProgress(65);

      // Конвертируем AudioBuffer в Float32Array для Whisper
      setProgressInfo({ stage: '🔧 Подготовка для Whisper...', elapsed: 0, estimated: 0 });

      // Whisper требует mono Float32Array с 16kHz sampling rate
      let monoAudio;
      const sampleRate = audioBuffer.sampleRate;

      if (audioBuffer.numberOfChannels === 1) {
        // Уже моно
        monoAudio = audioBuffer.getChannelData(0);
      } else {
        // Смешиваем каналы в моно
        monoAudio = new Float32Array(audioBuffer.length);
        for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
          const channelData = audioBuffer.getChannelData(ch);
          for (let i = 0; i < audioBuffer.length; i++) {
            monoAudio[i] += channelData[i];
          }
        }
        // Нормализуем уровень после смешивания
        for (let i = 0; i < monoAudio.length; i++) {
          monoAudio[i] /= audioBuffer.numberOfChannels;
        }
      }

      // Ресемплируем к 16kHz если нужно (Whisper стандарт)
      let audioData = monoAudio;
      if (sampleRate !== 16000) {
        const ratio = 16000 / sampleRate;
        const newLength = Math.round(monoAudio.length * ratio);
        audioData = new Float32Array(newLength);

        let newIndex = 0;
        for (let i = 0; i < monoAudio.length; i++) {
          const oldIndex = i / ratio;
          const nextIndex = Math.ceil(oldIndex);

          if (nextIndex >= monoAudio.length) {
            audioData[newIndex] = monoAudio[monoAudio.length - 1];
          } else {
            // Линейная интерполяция
            const fraction = oldIndex - Math.floor(oldIndex);
            audioData[newIndex] =
              monoAudio[Math.floor(oldIndex)] * (1 - fraction) +
              monoAudio[nextIndex] * fraction;
          }
          newIndex++;
        }
      }

      setProgress(75);

      // Шаг 3: Транскрибация
      setProgressInfo({ stage: '🤖 Обработка в Whisper... (это может занять время)', elapsed: 0, estimated: 0 });

      const result = await transcriber(audioData, {
        chunk_length_s: 30,
        stride_length_s: [10, 5]
      });
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
      setProgressInfo({ stage: '✅ Готово!', elapsed: Math.round((Date.now() - startTimeRef.current) / 1000), estimated: 0 });
      setTranscript(transcript);

      // Добавляем в историю
      addToHistory({
        filename: videoFile.name,
        model: selectedModel,
        timestamp: new Date().toLocaleString('ru-RU'),
        transcript: transcript.text
      });

    } catch (err) {
      setError(err.message || 'Ошибка при транскрибации');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-badge">
          <span title="Последнее обновление кода" style={{cursor: 'help'}}>
            ⏰ {updateTime}
          </span>
        </div>
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
                <div className="progress-stage">{progressInfo.stage}</div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${progress}%` }}></div>
                </div>
                <div className="progress-stats">
                  <span className="progress-percent">{progress}%</span>
                  <span className="progress-time">
                    ⏱️ Прошло: {progressInfo.elapsed}с
                    {progressInfo.estimated > 0 && ` | Осталось: ~${Math.max(0, progressInfo.estimated - progressInfo.elapsed)}с`}
                  </span>
                </div>
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
        <p>📊 v1.1.0 • ✨ Real Whisper in Browser</p>
      </footer>
    </div>
  );
}

export default App;
