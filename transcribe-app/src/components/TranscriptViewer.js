import React from 'react';

function TranscriptViewer({ transcript }) {
  const downloadJSON = () => {
    const element = document.createElement('a');
    const file = new Blob([JSON.stringify(transcript, null, 2)], { type: 'application/json' });
    element.href = URL.createObjectURL(file);
    element.download = `transcript-${Date.now()}.json`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const downloadSRT = () => {
    if (!transcript.segments) {
      alert('SRT формат требует временных меток');
      return;
    }

    let srtContent = '';
    transcript.segments.forEach((segment, index) => {
      const start = formatTime(segment.start);
      const end = formatTime(segment.end);
      srtContent += `${index + 1}\n${start} --> ${end}\n${segment.text}\n\n`;
    });

    const element = document.createElement('a');
    const file = new Blob([srtContent], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `transcript-${Date.now()}.srt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const downloadTXT = () => {
    const element = document.createElement('a');
    const file = new Blob([transcript.text], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `transcript-${Date.now()}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(transcript.text).then(() => {
      alert('✅ Текст скопирован в буфер обмена');
    });
  };

  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  };

  return (
    <div className="transcript-viewer">
      <h3>✅ Транскрипция готова!</h3>
      <div className="transcript-text">{transcript.text}</div>
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
