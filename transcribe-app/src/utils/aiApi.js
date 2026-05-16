const KEYS = {
  mistral: '1Xl3lcBIS5TTV0bkHEvmhTwnIM6AJ3VY',
  cerebras: 'csk-wn5mpv6jp5yy5phkc65xfwwt8t8rrthxrfxd4trcfttx5hck',
  gemini: 'AIzaSyDemJMre4p3BFlWyiXCc9aK_XdVnOcOagk'
};

async function callMistral(prompt) {
  const key = localStorage.getItem('mistralKey') || KEYS.mistral;
  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model: 'mistral-small-latest',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 4000
    })
  });
  if (!response.ok) throw new Error(`Mistral: ${response.status}`);
  const data = await response.json();
  return data.choices[0].message.content;
}

async function callCerebras(prompt) {
  const key = localStorage.getItem('cerebrasKey') || KEYS.cerebras;
  const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model: 'llama-3.1-70b',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 4000
    })
  });
  if (!response.ok) throw new Error(`Cerebras: ${response.status}`);
  const data = await response.json();
  return data.choices[0].message.content;
}

async function callGemini(prompt) {
  const key = localStorage.getItem('geminiKey') || KEYS.gemini;
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 4000 }
      })
    }
  );
  if (!response.ok) throw new Error(`Gemini: ${response.status}`);
  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
}

export async function improveTranscript(rawText) {
  const prompt = `Это автоматическая транскрипция речи на русском языке, сделанная через Whisper. Она содержит ошибки распознавания, неправильные слова, пропуски и плохую пунктуацию.

Твоя задача:
1. Исправь ошибки транскрипции, восстанови слова по контексту
2. Убери явные повторения одной и той же фразы
3. Добавь правильную пунктуацию и абзацы по смыслу
4. Сохрани оригинальный смысл, стиль и все детали речи
5. Верни ТОЛЬКО исправленный текст, без пояснений и комментариев

Текст для исправления:
${rawText}`;

  const apis = [
    { name: 'Cerebras', fn: callCerebras },
    { name: 'Mistral', fn: callMistral },
    { name: 'Gemini', fn: callGemini }
  ];

  let lastError;
  for (const api of apis) {
    try {
      console.log(`🤖 Пробую ${api.name}...`);
      const result = await api.fn(prompt);
      console.log(`✅ ${api.name} ответил`);
      return { text: result, api: api.name };
    } catch (err) {
      console.warn(`❌ ${api.name} не ответил:`, err.message);
      lastError = err;
    }
  }
  throw new Error(`Все API недоступны. Последняя ошибка: ${lastError?.message}`);
}
