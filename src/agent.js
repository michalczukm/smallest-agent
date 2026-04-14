// start example
import readline from 'node:readline';

const SYSTEM_PROMPT = `You are a coding assistant.`;
const messages = [];

const chat = async () => {
  console.log('\x1b[32m📨 ~ chat ~ messages:', JSON.stringify(messages, null, 2), '\x1b[0m');
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
  console.log('\x1b[34m🚀 ~ chat ~ response:', JSON.stringify(data, null, 2), '\x1b[0m');
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
