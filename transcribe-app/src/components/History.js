import React from 'react';

function History({ history, onClear }) {
  const handleClear = () => {
    if (window.confirm('Вы уверены? Это действие нельзя отменить.')) {
      onClear();
    }
  };

  return (
    <div className="history-panel">
      <div className="history-header">
        <h2>📋 История транскрибаций ({history.length})</h2>
        {history.length > 0 && (
          <button className="clear-history-btn" onClick={handleClear}>
            🗑️ Очистить историю
          </button>
        )}
      </div>

      {history.length === 0 ? (
        <div className="empty-history">
          <p>📭 История пуста</p>
          <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
            Транскрибируйте видео, чтобы они появились здесь
          </p>
        </div>
      ) : (
        <div className="history-list">
          {history.map((item, index) => (
            <div key={index} className="history-item">
              <div className="history-item-name">📹 {item.filename}</div>
              <div className="history-item-meta">
                <span>🧠 Модель: {item.model.toUpperCase()}</span>
                <span>📅 {item.timestamp}</span>
              </div>
              <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#666', maxHeight: '60px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {item.transcript}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default History;
