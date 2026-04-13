import React, { useState, useEffect } from 'react';
import { render, Box, Text, Spacer } from 'ink';
import fs from 'node:fs';

import { STATS_FILE_PATH } from './agent-stats-lib.js';

const POLL_MS = 600;

const statsFilePath = process.argv[2] ?? STATS_FILE_PATH;
const CONTEXT_BAR_WIDTH = 20;

const readStatsFile = () => {
  try {
    return JSON.parse(fs.readFileSync(statsFilePath, 'utf8'));
  } catch {
    return null;
  }
};

const fmt = (n) => (n == null ? '—' : n.toLocaleString());

const contextBar = (percent) => {
  if (percent == null) return null;
  const filled = Math.round((parseFloat(percent) / 100) * CONTEXT_BAR_WIDTH);
  const bar = '█'.repeat(filled) + '░'.repeat(CONTEXT_BAR_WIDTH - filled);
  const color =
    filled >= CONTEXT_BAR_WIDTH * 0.9 ? 'red' : filled >= CONTEXT_BAR_WIDTH * 0.6 ? 'yellow' : 'green';
  return { bar, color };
};

const roleColor = (role) =>
  ({ system: 'magenta', user: 'cyan', assistant: 'green' }[role] ?? 'yellow');

const Divider = () => <Text dimColor>{'─'.repeat(60)}</Text>;

const CallCard = ({ call, isLast }) => {
  const bar = contextBar(call.contextPercent);

  return (
    <Box flexDirection="column" marginBottom={isLast ? 0 : 1}>
      <Box>
        <Text bold>Call #{call.index + 1}</Text>
        <Spacer />
        <Text dimColor>{new Date(call.timestamp).toLocaleTimeString()}</Text>
      </Box>

      <Box>
        <Box flexDirection="column" width={16}>
          <Text dimColor>Prompt</Text>
          <Text color="yellow">{fmt(call.promptTokens)}</Text>
        </Box>
        <Box flexDirection="column" width={16}>
          <Text dimColor>Output</Text>
          <Text color="green">{fmt(call.outputTokens)}</Text>
        </Box>
        <Box flexDirection="column" width={16}>
          <Text dimColor>Total</Text>
          <Text color="white">{fmt(call.totalTokens)}</Text>
        </Box>
      </Box>

      {bar && (
        <Box>
          <Text dimColor>Context  </Text>
          <Text color={bar.color}>{bar.bar}</Text>
          <Text>  {call.contextPercent}% of {fmt(call.contextWindowTokens)}</Text>
        </Box>
      )}

      <Box flexDirection="column" marginTop={1}>
        {call.inputMessages.map((msg) => (
          <Box key={msg.index}>
            <Box width={12}>
              <Text color={roleColor(msg.role)}>{msg.role}</Text>
            </Box>
            <Box width={14} justifyContent="flex-end">
              <Text dimColor>
                {msg.estimatedInputTokens == null ? '—' : `~${msg.estimatedInputTokens.toLocaleString()}`} tk{'  '}
              </Text>
            </Box>
            <Text wrap="truncate" dimColor>{msg.summary}</Text>
          </Box>
        ))}
        {call.responseSummary && (
          <Box marginTop={1}>
            <Box width={12}>
              <Text color="green">↳ response</Text>
            </Box>
            <Box width={14} justifyContent="flex-end">
              <Text dimColor>{fmt(call.outputTokens)} tk{'  '}</Text>
            </Box>
            <Text wrap="truncate">{call.responseSummary}</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
};

const StatsViewer = () => {
  const [data, setData] = useState(readStatsFile);

  useEffect(() => {
    const interval = setInterval(() => {
      const fresh = readStatsFile();
      if (fresh) setData(fresh);
    }, POLL_MS);
    return () => clearInterval(interval);
  }, []);

  const calls = data?.calls ?? [];

  return (
    <Box borderStyle="round" borderColor="cyan" flexDirection="column" paddingX={1} paddingY={0}>
      {/* Header */}
      <Box>
        <Text bold color="cyan">Token Usage Monitor</Text>
        <Spacer />
        {data
          ? <Text color="green">● LIVE</Text>
          : <Text color="yellow" dimColor>◌ Waiting for stats file…</Text>}
      </Box>

      <Divider />

      {/* Per-call cards */}
      {!data && (
        <Box flexDirection="column" paddingY={1}>
          <Text dimColor>Watching {statsFilePath}</Text>
          <Text dimColor>Start the agent to see live stats.</Text>
        </Box>
      )}

      {calls.map((call, i) => (
        <Box key={call.index} flexDirection="column" marginTop={1}>
          <CallCard call={call} isLast={i === calls.length - 1} />
          {i < calls.length - 1 && <Box marginTop={1}><Divider /></Box>}
        </Box>
      ))}

      {/* Session totals */}
      {data && (
        <>
          <Divider />
          <Box gap={2}>
            <Text dimColor>{data.model}</Text>
            <Spacer />
            <Text dimColor>in </Text><Text color="yellow">{fmt(data.session.promptTokens)}</Text>
            <Text dimColor>  out </Text><Text color="green">{fmt(data.session.outputTokens)}</Text>
            <Text dimColor>  total </Text><Text bold>{fmt(data.session.totalTokens)}</Text>
          </Box>
        </>
      )}
    </Box>
  );
};

render(<StatsViewer />);
