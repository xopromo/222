import React, { useState, useRef } from 'react';

function VideoUploader({ onFileSelect, onGoogleDriveUrl, disabled, selectedFile }) {
  const [googleDriveUrl, setGoogleDriveUrl] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileInput = (event) => {
    const file = event.target.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && (file.type.startsWith('video/') || file.type.startsWith('audio/'))) {
      onFileSelect(file);
    }
  };

  const handleGoogleDriveSubmit = () => {
    if (googleDriveUrl.trim()) {
      onGoogleDriveUrl(googleDriveUrl);
      setGoogleDriveUrl('');
    }
  };

  return (
    <div className="video-uploader">
      <div
        className={`upload-area ${isDragging ? 'dragover' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="upload-icon">📹</div>
        <p className="upload-text">Перетащите видеофайл или нажмите для загрузки</p>
        <p className="upload-hint">MP4, WebM, Ogg, MOV - до 2GB</p>
        <input
          ref={fileInputRef}
          type="file"
          className="file-input"
          accept="video/*,audio/*"
          onChange={handleFileInput}
          disabled={disabled}
        />
      </div>

      {selectedFile && (
        <div className="selected-file">
          <span className="selected-file-name">✅ {selectedFile.name}</span>
          <span>({(selectedFile.size / 1024 / 1024).toFixed(1)} MB)</span>
        </div>
      )}

      <div className="google-drive-section">
        <h4>Или используйте ссылку Google Drive</h4>
        <input
          type="text"
          className="google-drive-input"
          placeholder="Вставьте ссылку на видео в Google Drive..."
          value={googleDriveUrl}
          onChange={(e) => setGoogleDriveUrl(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleGoogleDriveSubmit()}
          disabled={disabled}
        />
        <button
          className="google-drive-btn"
          onClick={handleGoogleDriveSubmit}
          disabled={disabled || !googleDriveUrl.trim()}
        >
          📥 Загрузить с Google Drive
        </button>
        <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.5rem' }}>
          💡 Совет: Откройте видео на Google Drive, нажмите "Поделиться" → "Общий доступ", скопируйте ссылку сюда
        </p>
      </div>
    </div>
  );
}

export default VideoUploader;
