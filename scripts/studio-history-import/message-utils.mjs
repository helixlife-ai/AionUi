const PRESET_CONTEXT_LIMIT = 6000;

function textFromAgentContent(content) {
  if (typeof content === 'string') return content.trim();

  const blocks = Array.isArray(content) ? content : content && typeof content === 'object' ? [content] : [];
  return blocks
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

// Unknown legacy message shapes are non-conversational input, not fatal errors.
export function extractMessage(plain) {
  if (!plain || typeof plain !== 'object') return null;
  if (plain.role === 'user' && plain.content?.type === 'text') {
    const text = typeof plain.content.text === 'string' ? plain.content.text : '';
    return text ? { role: 'user', text } : null;
  }
  if (plain.role === 'agent' && plain.content?.type === 'output') {
    const text = textFromAgentContent(plain.content.data?.message?.content);
    return text ? { role: 'assistant', text } : null;
  }
  return null;
}

// This is deterministic truncation, not an LLM summary.
export function buildPresetContext(decoded) {
  const lines = decoded.map((item) => `${item.position === 'right' ? '用户' : '助手'}: ${item.text}`);
  const header = '【本会话历史背景】以下是用户此前与 Studio 的对话记录,请基于这些上下文回答后续问题:\n\n';
  const full = lines.join('\n\n');
  if (header.length + full.length <= PRESET_CONTEXT_LIMIT) return header + full;

  const head = (lines[0] || '').slice(0, 500);
  const tail = [];
  let budget = PRESET_CONTEXT_LIMIT - header.length - head.length - 100;
  for (let index = lines.length - 1; index >= 1 && budget > 0; index--) {
    const line = lines[index].length > 1000 ? `${lines[index].slice(0, 1000)}…` : lines[index];
    if (line.length > budget) break;
    tail.unshift(line);
    budget -= line.length + 2;
  }
  const omitted = lines.length - 1 - tail.length;
  const omitNote = omitted > 0 ? `\n\n…(中间省略 ${omitted} 条历史消息)…\n\n` : '\n\n';
  return header + head + omitNote + tail.join('\n\n');
}
