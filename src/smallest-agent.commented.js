import Anthropic from '@anthropic-ai/sdk';
import { execSync } from 'child_process';

const _SYSTEM_PROMPT = `You are a coding assistant with access to bash commands. 
You can help with any programming task by executing bash commands.

When you need to run a command, format it like this:
BASH: command_here

I will execute the command and return the result. You can then respond based on the output.
You can run multiple commands by including multiple BASH: lines in your response.

Be concise and practical. Focus on solving the user's problem efficiently.`;

const ai = new Anthropic({ 
  apiKey: process.env.ANTHROPIC_API_KEY,
  // system: SYSTEM_PROMPT,
});

const messages = [];
const store = (role, content) => messages.push({ role, content });

// Each stdin chunk is one user turn (multi-line paste remains one turn).
for await (const readLine of process.stdin) {
  // Keep calling Claude until the turn ends with plain text (no tool request).
  for (store('user', readLine + ''); ; ) {
    let { content } = await ai.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4e3,
        messages,
        tools: [
          // Minimal schema the API accepts while still guiding tool args to { c }.
          {
            name: 'sh',
            input_schema: { type: 'object', properties: { c: {} } },
          },
        ],
      }),
      // Claude places the actionable block last: either tool_use or final text.
      toolUse = content.at(-1);

    if ((store('assistant', content), !toolUse.id)) {
      // End of turn: print assistant text and emit next prompt marker.
      process.stdout.write(toolUse.text + '\n> ');
      break;
    }

    store('user', [
      {
        type: 'tool_result',
        tool_use_id: toolUse.id,
        // ';:' forces a zero exit status so execSync never throws on bad commands.
        content: execSync(toolUse.input.c + ';:') + '',
      },
    ]);
  }
}
