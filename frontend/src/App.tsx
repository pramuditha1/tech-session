import { useCallback, useEffect, useRef, useState } from 'react';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import './App.css';

type Role = 'user' | 'assistant';

type ChatMessage = {
  id: string;
  role: Role;
  content: string;
};

type NdjsonEvent =
  | { type: 'text'; content: string }
  | { type: 'done' }
  | { type: string; [key: string]: unknown };

const BFF_URL = import.meta.env.VITE_BFF_URL ?? 'http://localhost:3000';

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const scrollToBottom = useCallback(() => {
    const viewport = scrollViewportRef.current;
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    // focus input on first render
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    // when a response completes, put focus back into the input
    if (!isSending) {
      inputRef.current?.focus();
    }
  }, [isSending]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isSending) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
    };

    // optimistic update
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsSending(true);

    try {
      const res = await fetch(`${BFF_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!res.body) {
        throw new Error('No response body');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      let assistantId = crypto.randomUUID();
      let assistantContent = '';

      // Create placeholder assistant message so UI shows streaming text
      setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: 'assistant',
          content: '',
        },
      ]);

      // Read NDJSON line-by-line
      // Each line is JSON: { type: \"text\", content: \"...\" } or { type: \"done\" }
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (!line) continue;
          let event: NdjsonEvent;
          try {
            event = JSON.parse(line);
          } catch {
            continue;
          }

          if (event.type === 'text' && typeof event.content === 'string') {
            assistantContent += event.content;
            const contentSnapshot = assistantContent;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: contentSnapshot } : m,
              ),
            );
          }

          if (event.type === 'done') {
            break;
          }
        }
      }
    } catch (err) {
      console.error('Chat error', err);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: 'Sorry, something went wrong talking to the server.',
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="app-root">
      <div className="shell">
        <header className="shell-header">
          <div className="shell-title">
            <span className="dot" />
            <span>Agentic Todo Assistant</span>
          </div>
          <div className="shell-subtitle">
            BFF → Agent → Tools (add/list todo)
          </div>
        </header>
        <main className="shell-main">
          <ScrollArea.Root className="scroll-root">
            <ScrollArea.Viewport
              className="scroll-viewport"
              ref={scrollViewportRef}
            >
              <div className="messages">
                {messages.length === 0 && (
                  <div className="empty">
                    <p>Ask me to add or list todos.</p>
                    <p className="empty-hint">
                      Example: <code>Add a todo: buy milk</code> or{' '}
                      <code>List my todos</code>.
                    </p>
                  </div>
                )}
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`message-row message-row-${m.role}`}
                  >
                    <div className="message-avatar">
                      {m.role === 'user' ? 'U' : 'A'}
                    </div>
                    <div className="message-bubble">
                      <div className="message-role">
                        {m.role === 'user' ? 'You' : 'Assistant'}
                      </div>
                      <div className="message-content">{m.content}</div>
                    </div>
                  </div>
                ))}
                {isSending && (
                  <div className="message-row message-row-assistant typing-row">
                    <div className="message-avatar">A</div>
                    <div className="message-bubble typing-bubble">
                      <div className="message-role">Assistant</div>
                      <div className="typing-dots">
                        <span />
                        <span />
                        <span />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea.Viewport>
            <ScrollArea.Scrollbar
              className="scrollbar"
              orientation="vertical"
            >
              <ScrollArea.Thumb className="thumb" />
            </ScrollArea.Scrollbar>
          </ScrollArea.Root>
        </main>
        <footer className="shell-footer">
          <form onSubmit={sendMessage} className="input-row">
            <input
              className="input"
              placeholder="Type a message…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              ref={inputRef}
              disabled={isSending}
            />
            <button className="button" type="submit" disabled={isSending}>
              {isSending ? 'Sending…' : 'Send'}
            </button>
          </form>
          <div className="footer-note">
            Todo list is stored in memory.
          </div>
        </footer>
      </div>
    </div>
  );
}

export default App;
