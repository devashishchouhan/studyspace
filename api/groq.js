export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    }
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Groq API key not configured' });
  }

  const body = req.body;
  const { messages, model, max_tokens } = body || {};

  if (!messages || !messages.length) {
    return res.status(400).json({ error: 'No messages' });
  }

  try {
    const groqMessages = [];
    for (const msg of messages) {
      const content = typeof msg.content === 'string'
        ? msg.content
        : (Array.isArray(msg.content) ? msg.content.find(b => b.type === 'text')?.text : '') || '';
      if (content) groqMessages.push({ role: msg.role, content });
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model || 'openai/gpt-oss-120b',
        messages: groqMessages,
        max_tokens: max_tokens || 1500,
        temperature: 0.7
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'Groq error' });
    }

    const text = data.choices?.[0]?.message?.content || '';
    return res.status(200).json({ content: [{ type: 'text', text }] });

  } catch (error) {
    return res.status(500).json({ error: 'Failed: ' + error.message });
  }
}
