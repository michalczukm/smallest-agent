import { execSync } from 'child_process';
import { ProxyAgent } from 'undici';

const SYSTEM_PROMPT = `You are a coding assistant with access to bash commands. 
You can help with any programming task by executing bash commands.

When you need to run a command, use the sh tool with the command.

I will execute the command and return the result. You can then respond based on the output.
Be concise and practical. Focus on solving the user's problem efficiently.`;

const messages = [];
const store = (role, content) => messages.push({ role, content });

// Node.js v20 native fetch (undici) does not respect HTTP_PROXY/HTTPS_PROXY env
// vars automatically. Explicitly wire up a ProxyAgent when running inside an
// environment that routes HTTPS through a proxy (e.g. Docker sandbox).
const dispatcher = process.env.HTTPS_PROXY
  ? new ProxyAgent(process.env.HTTPS_PROXY)
  : undefined;


const chat = async () => {
  console.log('🚀 ~ chat ~ messages:', JSON.stringify(messages, null, 2))
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    dispatcher,
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4e3,
      system: SYSTEM_PROMPT,
      messages,
      tools: [
        {
          name: 'sh',
          input_schema: { type: 'object', properties: { c: {} } },
        },
      ],
    }),
  });
  const data = await res.json();
  console.log('🚀 ~ chat ~ data:', JSON.stringify(data, null, 2))
  return data.content;
};

const runTool = ({ input }) =>
  // ';:' forces a zero exit status so execSync never throws on bad commands.
  execSync(input.c + ';:') + '';

// Each stdin chunk is one user turn (multi-line paste remains one turn).
for await (const readLine of process.stdin) {
  // Keep calling Claude until the turn ends with plain text (no tool request).
  for (store('user', readLine + ''); ; ) {
    const content = await chat();
    // Claude places the actionable block last: either tool_use or final text.
    const last = content.at(-1);
    const possibleToolResult = messages.at(-1)

    store('assistant', content);

    if (possibleToolResult && possibleToolResult.content.at(-1).type === 'tool_result') {
      process.stdout.write("🤖 [tool_result]\n " + possibleToolResult.content.at(-1).content + "\n");
    }

    if (last.type !== 'tool_use') {
      // End of turn: print assistant text and emit next prompt marker.
      process.stdout.write("🤖 " + last.text + '\n> ');
      break;
    }

    store('user', [
      {
        type: 'tool_result',
        tool_use_id: last.id,
        content: runTool(last),
      },
    ]);
  }
}
