import React from 'react';

function ModelSelector({ selectedModel, onModelChange, models, disabled }) {
  return (
    <div className="model-selector">
      <h3>🧠 Выберите модель Whisper</h3>
      <div className="model-options">
        {Object.entries(models).map(([key, model]) => (
          <div
            key={key}
            className={`model-option ${selectedModel === key ? 'selected' : ''}`}
            onClick={() => !disabled && onModelChange(key)}
            style={{ opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
          >
            <div className="model-name">{key.toUpperCase()}</div>
            <div className="model-details">
              <div>📦 {model.size}</div>
              <div>⚡ {model.speed}</div>
              <div>🎯 {model.accuracy}</div>
            </div>
          </div>
        ))}
      </div>
      <p style={{ marginTop: '1rem', color: '#666', fontSize: '0.9rem' }}>
        {selectedModel === 'tiny' && '💡 Tiny: Самая быстрая, но менее точная. Хорошо для быстрого первичного результата.'}
        {selectedModel === 'base' && '💡 Base: Оптимальный баланс между скоростью и точностью. Рекомендуется.'}
        {selectedModel === 'small' && '💡 Small: Более точная, немного медленнее. Хорошо для важных видео.'}
        {selectedModel === 'medium' && '💡 Medium: Очень точная, но требует времени. Для максимальной точности.'}
        {selectedModel === 'large' && '💡 Large: Максимальная точность, но самая медленная. Для критичных документов.'}
      </p>
    </div>
  );
}

export default ModelSelector;
