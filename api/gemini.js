export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Gemini API key not configured' });
  }

  const { model, messages, system, max_tokens } = req.body;
  const geminiModel = model || 'gemini-1.5-flash';

  try {
    const contents = [];

    if (system) {
      contents.push({
        role: 'user',
        parts: [{ text: `[SYSTEM INSTRUCTIONS]\n${system}` }]
      });
      contents.push({
        role: 'model',
        parts: [{ text: 'Understood! I will follow these instructions.' }]
      });
    }

    for (const msg of messages) {
      const role = msg.role === 'assistant' ? 'model' : 'user';
      let parts = [];

      if (typeof msg.content === 'string') {
        parts = [{ text: msg.content }];
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'text') {
            parts.push({ text: block.text });
          } else if (block.type === 'image') {
            parts.push({
              inline_data: {
                mime_type: block.source.media_type,
                data: block.source.data
              }
            });
          }
        }
      }

      if (parts.length > 0) contents.push({ role, parts });
    }

    // Try both auth methods — query param and header
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`;
    
    const response = await fetch(`${url}?key=${apiKey}`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents,
        generationConfig: {
          maxOutputTokens: max_tokens || 1500,
          temperature: 0.7
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Gemini error:', JSON.stringify(data));
      return res.status(response.status).json({ 
        error: data.error?.message || 'Gemini API error',
        details: data 
      });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return res.status(200).json({
      content: [{ type: 'text', text }]
    });

  } catch (error) {
    console.error('Handler error:', error);
    return res.status(500).json({ error: 'Failed to reach Gemini API: ' + error.message });
  }
}
