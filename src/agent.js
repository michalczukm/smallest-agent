// 4. Simple CLI with Mistral API calls and tools and client-side tool calling and memory tool
import readline from 'node:readline';
import { ProxyAgent } from 'undici';
import { execSync } from 'child_process';
import fs from 'node:fs';
import path from 'node:path';

const SYSTEM_PROMPT = `You are a coding assistant with access to bash commands and a memory. 
You can help with any programming task by executing bash commands.
Always use the "sh" tool when you need to run a command.
Use the "memorize" tool to save important information to a memory file when the user asks you to remember something.
I will execute the command or save the memory and return the result. You can then respond based on the output.
Be concise and practical. Focus on solving the user's problem efficiently.`;

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
        {
          type: 'function',
          function: {
            name: 'memorize',
            description: 'Store information in memory for later retrieval.',
            parameters: {
              type: 'object',
              properties: {
                content: {
                  type: 'string',
                  description: 'The information to be stored in memory.',
                },
              },
              required: ['content'],
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

const runShell = (input) => {
  // ';:' forces a zero exit status so execSync never throws on bad commands.
  try {
    return execSync(input + ';:') + '';
  } catch (error) {
    return error.message;
  }
};

const runMemorize = (content) => {
  try {
    const distDir = path.join(process.cwd(), 'dist');
    if (!fs.existsSync(distDir)) {
      fs.mkdirSync(distDir, { recursive: true });
    }
    const memoryFile = path.join(distDir, 'memory.md');
    fs.appendFileSync(memoryFile, content + '\n');
    return `Memory saved to ${memoryFile}`;
  } catch (error) {
    return `Failed to save memory: ${error.message}`;
  }
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

    if (!content.tool_calls?.length) {
      // End of turn: print assistant text and emit next prompt marker.
      process.stdout.write('🤖 ' + content.content + '\n> ');
      break;
    }

    for (const { id, function: { name, arguments: args } } of content.tool_calls) {
      const parsedArgs = JSON.parse(args);
      let output;

      if (name === 'sh') {
        output = runShell(parsedArgs.command);
      } else if (name === 'memorize') {
        output = runMemorize(parsedArgs.content);
      } else {
        output = `Error: Unknown tool ${name}`;
      }

      messages.push({ role: 'tool', tool_call_id: id, content: output });
    }
  }
}
