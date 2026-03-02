// 1. Simple CLI with Mistral API calls
import readline from 'node:readline';

const SYSTEM_PROMPT = `You are a coding assistant.`;
const messages = [];

const chat = async () => {
  console.log('📨 ~ chat ~ messages:', JSON.stringify(messages, null, 2));
  const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'mistral-large-2512',
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
    }),
  });

  const data = await res.json();
  console.log('🚀 ~ chat ~ response:', JSON.stringify(data, null, 2));
  return data.choices[0].message;
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

process.stdout.write('> ');

for await (const line of rl) {
  messages.push({ role: 'user', content: line });
  
  while (true) {
    const content = await chat();
    messages.push(content);

    process.stdout.write('🤖 ' + content.content + '\n> ');
    break;
  }
}
