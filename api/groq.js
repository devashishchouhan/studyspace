export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Groq API key not configured' });
  }

  const { model, messages, system, max_tokens } = req.body;

  try {
    const groqMessages = [];
    if (system) groqMessages.push({ role: 'system', content: system });
    for (const msg of messages) {
      const content = typeof msg.content === 'string' ? msg.content : msg.content?.find?.(b => b.type === 'text')?.text || '';
      if (content) groqMessages.push({ role: msg.role, content });
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model || 'llama-3.1-70b-versatile',
        messages: groqMessages,
        max_tokens: max_tokens || 1500,
        temperature: 0.7
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'Groq API error' });
    }

    // Return in Anthropic-compatible format so frontend works unchanged
    const text = data.choices?.[0]?.message?.content || '';
    return res.status(200).json({ content: [{ type: 'text', text }] });

  } catch (error) {
    return res.status(500).json({ error: 'Failed: ' + error.message });
  }
}
