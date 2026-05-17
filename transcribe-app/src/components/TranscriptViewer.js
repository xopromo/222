import React, { useState, useRef, useEffect } from 'react';
import { improveTranscript } from '../utils/aiApi';
import './TranscriptViewer.css';

function TranscriptViewer({ transcript }) {
  const [improved, setImproved] = useState(null);
  const [isImproving, setIsImproving] = useState(false);
  const [improveError, setImproveError] = useState(null);
  const [activeView, setActiveView] = useState('original');
  const [showMinimized, setShowMinimized] = useState(false);

  const currentText = activeView === 'improved' && improved ? improved.text : transcript.text;

  const handleImprove = () => {
    setIsImproving(true);
    setImproveError(null);
    setShowMinimized(true);

    improveTranscript(transcript.text).then(
      (result) => {
        setImproved(result);
        setIsImproving(false);
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
    navigator.clipboard.writeText(currentText).then(() => alert('✅ Скопирован'));
  };

  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(ms).padStart(3,'0')}`;
  };

  if (isImproving && showMinimized && !improved) {
    return (
      <div className="transcript-viewer">
        <div className="transcript-header">
          <h3>✅ Транскрипция готова</h3>
        </div>
        <div className="transcript-content-compact">
          <div className="transcript-text">{transcript.text}</div>
          <div className="improving-banner">
            <div className="improving-spinner"></div>
            <span>AI улучшает текст в фоне...</span>
            <button className="expand-btn" onClick={() => setShowMinimized(false)}>↓</button>
          </div>
          <div className="actions-compact">
            <button className="action-btn json" onClick={downloadJSON} title="JSON">📄</button>
            <button className="action-btn srt" onClick={downloadSRT} title="SRT">🎬</button>
            <button className="action-btn txt" onClick={downloadTXT} title="TXT">📄</button>
            <button className="action-btn copy" onClick={copyToClipboard} title="Copy">📋</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="transcript-viewer">
      <div className="transcript-header">
        <h3>✅ Транскрипция готова</h3>
        {improved && (
          <div className="view-tabs">
            <button
              className={`tab-btn ${activeView === 'original' ? 'active' : ''}`}
              onClick={() => setActiveView('original')}
            >
              📝 Оригинал
            </button>
            <button
              className={`tab-btn ${activeView === 'improved' ? 'active' : ''}`}
              onClick={() => setActiveView('improved')}
            >
              ✨ AI ({improved.api})
            </button>
          </div>
        )}
      </div>

      <div className="transcript-content">
        <div className="transcript-text">{currentText}</div>
      </div>

      <div className="transcript-footer">
        {!isImproving && !improved && (
          <button className="improve-btn" onClick={handleImprove}>
            <span className="improve-icon">✨</span>
            <span>Улучшить через AI</span>
          </button>
        )}

        {improveError && (
          <div className="error-inline">❌ {improveError}</div>
        )}

        <div className="actions-full">
          <button className="action-btn json" onClick={downloadJSON} title="Download JSON">
            <span>📄</span>
            <span className="label">JSON</span>
          </button>
          <button className="action-btn srt" onClick={downloadSRT} title="Download SRT">
            <span>🎬</span>
            <span className="label">SRT</span>
          </button>
          <button className="action-btn txt" onClick={downloadTXT} title="Download TXT">
            <span>📄</span>
            <span className="label">TXT</span>
          </button>
          <button className="action-btn copy" onClick={copyToClipboard} title="Copy to Clipboard">
            <span>📋</span>
            <span className="label">Copy</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default TranscriptViewer;
