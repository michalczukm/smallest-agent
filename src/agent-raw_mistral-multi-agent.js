import { execSync } from 'child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { ProxyAgent } from 'undici';

// --- Configuration ---

const MAIN_MODEL = 'mistral-large-2512';
const CODING_MODEL = 'devstral-latest';

const MAIN_SYSTEM_PROMPT = `You are a helpful assistant with access to a coding specialist.
- You can help with general tasks and have access to bash commands.
- For ANY coding, programming, or software development task, you MUST delegate it to the coding agent using the "delegate_coding_task" tool.
- Do not try to write complex code yourself if it's better suited for the specialist.
- You can also save memories using "memorize".
- Be concise and practical.`;

const CODING_SYSTEM_PROMPT = `You are a specialized coding agent using the ${CODING_MODEL} model.
- You are an expert in software development.
- You can execute bash commands using the "sh" tool to run tests, list files, or manage the project.
- You should focus purely on the coding task provided.
- When you are done, return a final response describing what you did.`;

// --- Tools ---

const toolsMain = [
  {
    type: 'function',
    function: {
      name: 'sh',
      description: 'Execute a shell command',
      parameters: {
        type: 'object',
        properties: { command: { type: 'string' } },
        required: ['command'],
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
  {
    type: 'function',
    function: {
      name: 'delegate_coding_task',
      description: 'Delegate a coding task to the specialist coding agent.',
      parameters: {
        type: 'object',
        properties: {
          task: {
            type: 'string',
            description: 'The detailed coding task description.',
          },
        },
        required: ['task'],
      },
    },
  },
];

const toolsCoding = [
  {
    type: 'function',
    function: {
      name: 'sh',
      description: 'Execute a shell command',
      parameters: {
        type: 'object',
        properties: { command: { type: 'string' } },
        required: ['command'],
      },
    },
  },
];

// --- Helper Functions ---

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

// Node.js v20 native fetch (undici) does not respect HTTP_PROXY/HTTPS_PROXY env
// vars automatically. Explicitly wire up a ProxyAgent when running inside an
// environment that routes HTTPS through a proxy (e.g. Docker sandbox).
const dispatcher = process.env.HTTPS_PROXY
  ? new ProxyAgent(process.env.HTTPS_PROXY)
  : undefined;

const chat = async (model, messages, tools) => {
  const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    dispatcher,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages,
      tools: tools.length > 0 ? tools : undefined,
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`API Error: ${res.status} ${res.statusText} - ${txt}`);
  }

  const data = await res.json();
  return data.choices[0].message;
};

// --- Agents ---

// The Coding Agent Loop
const runCodingAgent = async (task) => {
  console.log(`\n👷 [Coding Agent] Starting task: "${task}"`);
  
  const messages = [
    { role: 'system', content: CODING_SYSTEM_PROMPT },
    { role: 'user', content: task }
  ];

  // Limit turns to prevent infinite loops in demo
  const MAX_TURNS = 20;
  
  for (let i = 0; i < MAX_TURNS; i++) {
    console.log(`👷 [Coding Agent] Turn ${i + 1}`);
    const response = await chat(CODING_MODEL, messages, toolsCoding);
    messages.push(response);

    if (response.content) {
      console.log(`👷 [Coding Agent] says: ${response.content}`);
    }

    if (!response.tool_calls || response.tool_calls.length === 0) {
      // Agent is done
      console.log(`👷 [Coding Agent] Finished.`);
      return response.content;
    }

    // Handle tool calls
    for (const toolCall of response.tool_calls) {
      const { name, arguments: args } = toolCall.function;
      const parsedArgs = JSON.parse(args);
      let output;

      console.log(`👷 [Coding Agent] calling tool: ${name}`);

      if (name === 'sh') {
        output = runShell(parsedArgs.command);
      } else {
        output = `Error: Unknown tool ${name}`;
      }

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: output,
      });
    }
  }
  
  return "Coding agent reached maximum turns without completing.";
};

// --- Main Loop ---

const messages = [{ role: 'system', content: MAIN_SYSTEM_PROMPT }];

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

console.log('🤖 Multi-Agent System Initialized');
process.stdout.write('> ');

for await (const line of rl) {
  messages.push({ role: 'user', content: line });

  while (true) {
    // Main Agent Turn
    const response = await chat(MAIN_MODEL, messages, toolsMain);
    messages.push(response);

    if (!response.tool_calls || response.tool_calls.length === 0) {
      process.stdout.write('🤖 ' + response.content + '\n> ');
      break;
    }

    // Handle Main Agent Tools
    for (const toolCall of response.tool_calls) {
      const { name, arguments: args } = toolCall.function;
      const parsedArgs = JSON.parse(args);
      let output;

      if (name === 'sh') {
        console.log(`🛠️  [Main Agent] Executing shell: ${parsedArgs.command}`);
        output = runShell(parsedArgs.command);
      } else if (name === 'memorize') {
        console.log(`🧠 [Main Agent] Memorizing...`);
        output = runMemorize(parsedArgs.content);
      } else if (name === 'delegate_coding_task') {
        console.log(`👉 [Main Agent] Delegating to Coding Agent...`);
        output = await runCodingAgent(parsedArgs.task);
      } else {
        output = `Error: Unknown tool ${name}`;
      }

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: output,
      });
    }
  }
}
