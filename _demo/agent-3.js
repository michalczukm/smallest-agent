// 3. Simple CLI with Mistral API calls and tools and client-side tool calling
import readline from 'node:readline';
import { ProxyAgent } from 'undici';
import { execSync } from 'child_process';

const SYSTEM_PROMPT = `You are a coding assistant.`;
const messages = [];

const dispatcher = process.env.HTTPS_PROXY
  ? new ProxyAgent(process.env.HTTPS_PROXY)
  : undefined;

const chat = async () => {
  console.log('📨 ~ chat ~ messages:', JSON.stringify(messages, null, 2));
  const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    dispatcher,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'mistral-large-2512',
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      tools: [
        {
          type: 'function',
          function: {
            name: 'sh',
            parameters: {
              type: 'object',
              properties: { command: { type: 'string' } },
            },
          },
        },
      ],
    }),
  });

  const data = await res.json();
  console.log('🚀 ~ chat ~ response:', JSON.stringify(data, null, 2));
  return data.choices[0].message;
};

const runTool = (input) => {
  // ';:' forces a zero exit status so execSync never throws on bad commands.
  try {
    return execSync(input + ';:') + '';
  } catch (error) {
    return error.message;
  }
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

process.stdout.write('> ');

for await (const line of rl) {
  for (messages.push({ role: 'user', content: line }); ; ) {
    const content = await chat();
    messages.push(content);

    if (!content.tool_calls?.length) {
      // End of turn: print assistant text and emit next prompt marker.
      process.stdout.write('🤖 ' + content.content + '\n> ');
      break;
    }

    for (const { id, function: { arguments: args } } of content.tool_calls) {
      const { command } = JSON.parse(args);
      messages.push({ role: 'tool', tool_call_id: id, content: runTool(command) });
    }
  }
}
