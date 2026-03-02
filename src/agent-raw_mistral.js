import { execSync } from 'child_process';

const SYSTEM_PROMPT = `You are a coding assistant with access to bash commands. 
You can help with any programming task by executing bash commands.

When you need to run a command, use the sh tool with the command.

I will execute the command and return the result. You can then respond based on the output.
Be concise and practical. Focus on solving the user's problem efficiently.`;

const messages = [];

const chat = async () => {
  const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'codestral-2508',
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      tools: [
        {
          type: 'function',
          function: {
            name: 'sh',
            parameters: { type: 'object', properties: { c: { type: 'string' } } },
          },
        },
      ],
    }),
  });
  return (await res.json()).choices[0].message;
};

// Each stdin chunk is one user turn (multi-line paste remains one turn).
for await (const line of process.stdin) {
  // Keep calling Mistral until the turn ends with plain text (no tool calls).
  for (messages.push({ role: 'user', content: line + '' }); ; ) {
    const msg = await chat();
    // Store the full assistant message (preserves tool_calls when present).
    messages.push(msg);

    if (!msg.tool_calls?.length) {
      // End of turn: print assistant text and emit next prompt marker.
      process.stdout.write(msg.content + '\n> ');
      break;
    }

    for (const { id, function: { arguments: args } } of msg.tool_calls) {
      const { c } = JSON.parse(args);
      messages.push({
        role: 'tool',
        tool_call_id: id,
        // ';:' forces a zero exit status so execSync never throws on bad commands.
        content: execSync(c + ';:') + '',
      });
    }
  }
}
