import React, { useState, useRef, useEffect } from 'react';
import { improveTranscript } from '../utils/aiApi';

function TranscriptViewer({ transcript }) {
  const [improved, setImproved] = useState(null);
  const [isImproving, setIsImproving] = useState(false);
  const [improveError, setImproveError] = useState(null);
  const [activeView, setActiveView] = useState('original');
  const [showMinimized, setShowMinimized] = useState(false);
  const improveRef = useRef(null);

  const currentText = activeView === 'improved' && improved ? improved.text : transcript.text;

  const handleImprove = () => {
    setIsImproving(true);
    setImproveError(null);
    setShowMinimized(true);

    // Запуск улучшения в фоне
    improveTranscript(transcript.text).then(
      (result) => {
        setImproved(result);
        setIsImproving(false);
        // Уведомление когда готово
        if (Notification.permission === 'granted') {
          new Notification('✨ Текст улучшен!', {
            body: `AI улучшил текст через ${result.api}`,
            icon: '✨'
          });
        }
      },
      (err) => {
        setImproveError(err.message);
        setIsImproving(false);
      }
    );
  };

  // Запросить разрешение на уведомления при монтировании
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const downloadFile = (content, filename, type) => {
    const element = document.createElement('a');
    const file = new Blob([content], { type });
    element.href = URL.createObjectURL(file);
    element.download = filename;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const downloadJSON = () => downloadFile(
    JSON.stringify({ ...transcript, improvedText: improved?.text }, null, 2),
    `transcript-${Date.now()}.json`, 'application/json'
  );

  const downloadSRT = () => {
    if (!transcript.segments?.length) { alert('SRT формат требует временных меток'); return; }
    const srtContent = transcript.segments.map((seg, i) =>
      `${i + 1}\n${formatTime(seg.start)} --> ${formatTime(seg.end)}\n${seg.text}\n`
    ).join('\n');
    downloadFile(srtContent, `transcript-${Date.now()}.srt`, 'text/plain');
  };

  const downloadTXT = () => downloadFile(currentText, `transcript-${Date.now()}.txt`, 'text/plain');

  const copyToClipboard = () => {
    navigator.clipboard.writeText(currentText).then(() => alert('✅ Текст скопирован'));
  };

  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(ms).padStart(3,'0')}`;
  };

  // Если улучшение в процессе и показано в минимизированном виде
  if (isImproving && showMinimized && !improved) {
    return (
      <div className="transcript-viewer">
        <h3>✅ Транскрипция готова!</h3>
        <div className="transcript-text">{transcript.text}</div>

        {/* Минимизированное улучшение */}
        <div ref={improveRef} style={{
          background: 'linear-gradient(135deg, #11998e, #38ef7d)',
          color: 'white', padding: '1rem', borderRadius: '8px',
          marginBottom: '1rem', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>⏳ AI улучшает текст в фоне...</span>
          <button onClick={() => setShowMinimized(false)} style={{
            background: 'rgba(255,255,255,0.3)', border: 'none', color: 'white',
            padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer'
          }}>
            ↓ Развернуть
          </button>
        </div>

        {/* Кнопки экспорта работают пока AI улучшает */}
        <div className="transcript-actions">
          <button className="export-btn export-btn-json" onClick={downloadJSON}>📄 JSON</button>
          <button className="export-btn export-btn-srt" onClick={downloadSRT}>🎬 SRT</button>
          <button className="export-btn export-btn-txt" onClick={downloadTXT}>📋 TXT</button>
          <button className="export-btn" style={{ background: '#9C27B0', color: 'white' }} onClick={copyToClipboard}>
            📋 Копировать
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="transcript-viewer">
      <h3>✅ Транскрипция готова!</h3>

      {/* Переключатель оригинал/улучшенный */}
      {improved && (
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <button
            onClick={() => setActiveView('original')}
            style={{
              padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', cursor: 'pointer',
              background: activeView === 'original' ? '#667eea' : '#e0e0e0',
              color: activeView === 'original' ? 'white' : '#333', fontWeight: '500'
            }}
          >
            📝 Оригинал (Whisper)
          </button>
          <button
            onClick={() => setActiveView('improved')}
            style={{
              padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', cursor: 'pointer',
              background: activeView === 'improved' ? '#4CAF50' : '#e0e0e0',
              color: activeView === 'improved' ? 'white' : '#333', fontWeight: '500'
            }}
          >
            ✨ Улучшенный ({improved.api})
          </button>
        </div>
      )}

      <div className="transcript-text">{currentText}</div>

      {/* Кнопка улучшения */}
      {!isImproving && !improved && (
        <button
          onClick={handleImprove}
          style={{
            width: '100%', padding: '0.9rem', marginBottom: '1rem',
            background: 'linear-gradient(135deg, #11998e, #38ef7d)',
            color: 'white', border: 'none', borderRadius: '8px',
            fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer'
          }}
        >
          ✨ Улучшить текст через AI (фон)
        </button>
      )}

      {improveError && (
        <div className="error-message" style={{ marginBottom: '1rem' }}>❌ {improveError}</div>
      )}

      {/* Экспорт */}
      <div className="transcript-actions">
        <button className="export-btn export-btn-json" onClick={downloadJSON}>
          📄 JSON
        </button>
        <button className="export-btn export-btn-srt" onClick={downloadSRT}>
          🎬 SRT
        </button>
        <button className="export-btn export-btn-txt" onClick={downloadTXT}>
          📋 TXT
        </button>
        <button className="export-btn" style={{ background: '#9C27B0', color: 'white' }} onClick={copyToClipboard}>
          📋 Копировать
        </button>
      </div>
    </div>
  );
}

export default TranscriptViewer;
