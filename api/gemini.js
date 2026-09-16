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
    // Convert Anthropic-style messages to Gemini format
    const contents = [];

    // Add system prompt as first user message if present
    if (system) {
      contents.push({
        role: 'user',
        parts: [{ text: `[SYSTEM INSTRUCTIONS - Follow these throughout the conversation]\n${system}` }]
      });
      contents.push({
        role: 'model',
        parts: [{ text: 'Understood! I will follow these instructions throughout our conversation.' }]
      });
    }

    // Convert messages
    for (const msg of messages) {
      const role = msg.role === 'assistant' ? 'model' : 'user';
      let parts = [];

      if (typeof msg.content === 'string') {
        parts = [{ text: msg.content }];
      } else if (Array.isArray(msg.content)) {
        // Handle multimodal (text + image)
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

      contents.push({ role, parts });
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: {
            maxOutputTokens: max_tokens || 1500,
            temperature: 0.7
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'Gemini API error' });
    }

    // Convert Gemini response to Anthropic-style format so frontend code works unchanged
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return res.status(200).json({
      content: [{ type: 'text', text }]
    });

  } catch (error) {
    return res.status(500).json({ error: 'Failed to reach Gemini API: ' + error.message });
  }
}
