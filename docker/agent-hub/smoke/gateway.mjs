import http from 'node:http';

// Deterministic local wire fixture. It exercises real CLIs without provider credentials.
let sequence = 0;
const requests = [];
const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString();
  const body = raw ? JSON.parse(raw) : {};
  const json = (value) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(value));
  };
  if (req.url === '/__smoke/requests') return json(requests);
  if (req.url === '/v1/auth') return json({ token: 'smoke-token' });
  if (req.url === '/v1/sessions') return json({ sessions: [] });
  if (req.url?.includes('count_tokens')) return json({ input_tokens: 8 });
  if (!req.url?.includes('/messages') && !req.url?.includes('/responses')) {
    res.statusCode = 404;
    return json({ error: 'Unsupported smoke endpoint' });
  }
  const id = `smoke_${++sequence}`;
  const text = `SMOKE_OK_${body.model}`;
  requests.push({ path: req.url, model: body.model, stream: body.stream });
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
  const send = (type, payload) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...payload })}\n\n`);
  if (req.url.includes('/messages')) {
    send('message_start', {
      message: {
        id,
        type: 'message',
        role: 'assistant',
        model: body.model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 8, output_tokens: 0 },
      },
    });
    send('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
    send('content_block_delta', { index: 0, delta: { type: 'text_delta', text } });
    send('content_block_stop', { index: 0 });
    send('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 8 } });
    send('message_stop', {});
  } else {
    const input = Array.isArray(body.input) ? body.input : [];
    const userIndex = input.findLastIndex((item) => item.role === 'user');
    const outputIndex = input.findLastIndex((item) => item.type === 'function_call_output');
    const requestTool = userIndex > outputIndex && JSON.stringify(input[userIndex]).includes('SMOKE_RUN_TOOL');
    if (requestTool) {
      const call = {
        id: `fc_${id}`,
        type: 'function_call',
        call_id: `call_${id}`,
        name: 'exec_command',
        arguments: JSON.stringify({ cmd: 'printf SMOKE_TOOL_OK', max_output_tokens: 100 }),
        status: 'completed',
      };
      send('response.created', { response: { id, object: 'response', status: 'in_progress', output: [] } });
      send('response.output_item.added', { output_index: 0, item: { ...call, status: 'in_progress', arguments: '' } });
      send('response.function_call_arguments.delta', { item_id: call.id, output_index: 0, delta: call.arguments });
      send('response.function_call_arguments.done', { item_id: call.id, output_index: 0, arguments: call.arguments });
      send('response.output_item.done', { output_index: 0, item: call });
      send('response.completed', {
        response: {
          id,
          object: 'response',
          status: 'completed',
          output: [call],
          usage: { input_tokens: 8, output_tokens: 8, total_tokens: 16 },
        },
      });
      return res.end();
    }
    const item = {
      id: `msg_${id}`,
      type: 'message',
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'output_text', text, annotations: [] }],
    };
    const response = {
      id,
      object: 'response',
      created_at: Math.floor(Date.now() / 1000),
      model: body.model,
      status: 'in_progress',
      output: [],
    };
    send('response.created', { response });
    send('response.output_item.added', { output_index: 0, item: { ...item, status: 'in_progress', content: [] } });
    send('response.content_part.added', {
      item_id: item.id,
      output_index: 0,
      content_index: 0,
      part: { type: 'output_text', text: '', annotations: [] },
    });
    send('response.output_text.delta', { item_id: item.id, output_index: 0, content_index: 0, delta: text });
    send('response.output_text.done', { item_id: item.id, output_index: 0, content_index: 0, text });
    send('response.content_part.done', { item_id: item.id, output_index: 0, content_index: 0, part: item.content[0] });
    send('response.output_item.done', { output_index: 0, item });
    send('response.completed', {
      response: {
        ...response,
        status: 'completed',
        output: [item],
        usage: { input_tokens: 8, output_tokens: 8, total_tokens: 16 },
      },
    });
  }
  res.end();
});
server.listen(19091, '127.0.0.1');
