import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_MODEL_CONTEXT_TOKENS = 256_000;
const PREVIEW_LENGTH = 60;

export const STATS_FILE_PATH = path.join(process.cwd(), 'dist', 'agent-stats.json');

const formatPercent = (value) => value.toFixed(2);

const stringifyContent = (content) => {
  if (typeof content === 'string') {
    return content;
  }

  if (content == null) {
    return '';
  }

  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
};

const summarizeMessage = (message) => {
  const contentText = stringifyContent(message.content).replace(/\s+/g, ' ').trim();
  const toolCallCount = Array.isArray(message.tool_calls) ? message.tool_calls.length : 0;

  if (contentText) {
    return contentText.slice(0, PREVIEW_LENGTH);
  }

  if (toolCallCount > 0) {
    return `${toolCallCount} tool call${toolCallCount === 1 ? '' : 's'}`;
  }

  return '[no content]';
};

const getMessageWeight = (message) => {
  const contentWeight = stringifyContent(message.content).length;
  const toolCallWeight = stringifyContent(message.tool_calls).length;
  const roleWeight = message.role?.length ?? 0;
  return Math.max(1, contentWeight + toolCallWeight + roleWeight + 4);
};

const distributeTokens = (totalTokens, weights) => {
  if (!Number.isFinite(totalTokens)) {
    return weights.map(() => null);
  }

  if (weights.length === 0) {
    return [];
  }

  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

  if (totalWeight === 0) {
    const evenShare = Math.floor(totalTokens / weights.length);
    const remainder = totalTokens % weights.length;
    return weights.map((_, index) => evenShare + (index < remainder ? 1 : 0));
  }

  const rawShares = weights.map((weight) => (totalTokens * weight) / totalWeight);
  const roundedDown = rawShares.map((value) => Math.floor(value));
  let remainder = totalTokens - roundedDown.reduce((sum, value) => sum + value, 0);

  const order = rawShares
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);

  for (const { index } of order) {
    if (remainder === 0) {
      break;
    }

    roundedDown[index] += 1;
    remainder -= 1;
  }

  return roundedDown;
};

export const summarizeUsageForRequest = ({
  requestMessages,
  usage,
  modelContextTokens = DEFAULT_MODEL_CONTEXT_TOKENS,
}) => {
  const usageAvailable =
    usage != null &&
    Number.isFinite(usage.prompt_tokens) &&
    Number.isFinite(usage.completion_tokens) &&
    Number.isFinite(usage.total_tokens);

  const promptTokens = usageAvailable ? usage.prompt_tokens : null;
  const outputTokens = usageAvailable ? usage.completion_tokens : null;
  const totalTokens = usageAvailable ? usage.total_tokens : null;
  const weights = requestMessages.map(getMessageWeight);
  const estimatedPromptTokens = usageAvailable
    ? distributeTokens(promptTokens, weights)
    : requestMessages.map(() => null);

  return {
    usageAvailable,
    promptTokens,
    outputTokens,
    totalTokens,
    contextWindowTokens: modelContextTokens,
    contextPercent:
      usageAvailable && modelContextTokens > 0
        ? formatPercent((totalTokens / modelContextTokens) * 100)
        : null,
    inputMessages: requestMessages.map((message, index) => ({
      index,
      role: message.role,
      summary: summarizeMessage(message),
      estimatedInputTokens: estimatedPromptTokens[index],
    })),
  };
};

export const createSessionUsageTracker = ({
  modelContextTokens = DEFAULT_MODEL_CONTEXT_TOKENS,
} = {}) => {
  const sessionTotals = {
    promptTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  };

  return {
    recordCall({ requestMessages, usage }) {
      const summary = summarizeUsageForRequest({
        requestMessages,
        usage,
        modelContextTokens,
      });

      if (summary.usageAvailable) {
        sessionTotals.promptTokens += summary.promptTokens;
        sessionTotals.outputTokens += summary.outputTokens;
        sessionTotals.totalTokens += summary.totalTokens;
      }

      return {
        ...summary,
        sessionTotals: {
          promptTokens: sessionTotals.promptTokens,
          outputTokens: sessionTotals.outputTokens,
          totalTokens: sessionTotals.totalTokens,
        },
      };
    },
  };
};

export const writeStatsFile = ({ model, modelContextTokens, startedAt, calls, sessionTotals }) => {
  const distDir = path.dirname(STATS_FILE_PATH);
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  const payload = {
    model,
    contextWindowTokens: modelContextTokens,
    startedAt,
    updatedAt: new Date().toISOString(),
    session: sessionTotals,
    calls,
  };

  fs.writeFileSync(STATS_FILE_PATH, JSON.stringify(payload, null, 2), 'utf8');
};

const formatTokenValue = (value) => (value == null ? 'unavailable' : String(value));

export const formatUsageReport = (summary) => {
  const lines = ['📊 Token usage'];

  lines.push(
    `   Input this request: ${formatTokenValue(summary.promptTokens)} tokens (exact metadata)`,
  );

  for (const message of summary.inputMessages) {
    lines.push(
      `   - ${message.role}: ~${formatTokenValue(message.estimatedInputTokens)} tokens | ${message.summary}`,
    );
  }

  lines.push(
    `   Output this response: ${formatTokenValue(summary.outputTokens)} tokens (exact metadata)`,
  );

  if (summary.totalTokens == null || summary.contextPercent == null) {
    lines.push('   Request total: unavailable');
  } else {
    lines.push(
      `   Request total: ${summary.totalTokens} tokens (${summary.contextPercent}% of ${summary.contextWindowTokens.toLocaleString()} context)`,
    );
  }

  lines.push(
    `   Session total: ${summary.sessionTotals.totalTokens} tokens`,
  );
  lines.push(
    `   Session input/output: ${summary.sessionTotals.promptTokens}/${summary.sessionTotals.outputTokens}`,
  );

  return lines.join('\n');
};
