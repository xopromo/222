import { useState, useEffect } from 'react';

export function useHistory() {
  const [history, setHistory] = useState([]);

  // Загрузить историю при монтировании
  useEffect(() => {
    const saved = localStorage.getItem('transcription-history');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error('Ошибка загрузки истории:', e);
      }
    }
  }, []);

  // Сохранить историю при изменении
  useEffect(() => {
    localStorage.setItem('transcription-history', JSON.stringify(history));
  }, [history]);

  const addToHistory = (item) => {
    setHistory([item, ...history].slice(0, 50)); // Хранить максимум 50 записей
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('transcription-history');
  };

  return {
    history,
    addToHistory,
    clearHistory
  };
}
