'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const store = require('./store');

/**
 * Send a message to Claude with extended thinking enabled.
 *
 * Returns { reply: string, thinking: string|null }
 *   - reply   → the final text response shown to the user
 *   - thinking → Claude's internal reasoning (thinking block text), or null
 */
async function sendMessage(systemPrompt, history, userMessage, attachments = []) {
  const apiKey = store.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    throw new Error('Anthropic API key not configured. Please add it in Settings.');
  }

  const client = new Anthropic({ apiKey });

  // Build user content — text + image attachments
  const userContent = [];

  for (const att of attachments) {
    if (att.type.startsWith('image/') && att.dataUrl) {
      const base64Data = att.dataUrl.split(',')[1];
      userContent.push({
        type: 'image',
        source: { type: 'base64', media_type: att.type, data: base64Data },
      });
    } else if (att.name) {
      userContent.push({ type: 'text', text: `[Attached file: ${att.name}]` });
    }
  }

  if (userMessage) {
    userContent.push({ type: 'text', text: userMessage });
  }

  const messages = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    {
      role: 'user',
      content:
        userContent.length === 1 && userContent[0].type === 'text'
          ? userContent[0].text
          : userContent,
    },
  ];

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 16000,
    thinking: {
      type: 'enabled',
      budget_tokens: 10000,
    },
    system: systemPrompt,
    messages,
  });

  // Separate thinking blocks from text blocks
  let thinking = null;
  let reply = '';

  for (const block of response.content) {
    if (block.type === 'thinking') {
      thinking = block.thinking || null;
    } else if (block.type === 'text') {
      reply += block.text;
    }
  }

  return { reply: reply.trim(), thinking };
}

module.exports = { sendMessage };
