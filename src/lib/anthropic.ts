
import { SYSTEM_PROMPT } from '../config'

export type Msg = {
  role: 'user' | 'assistant'
  content: any
}

export type AskHandlers = {
  onText: (delta: string) => void
  onTool: (name: string) => void
}

let controller: AbortController | null = null
let cancelled = false

export async function ask(
  history: Msg[],
  handlers: AskHandlers,
): Promise<{ text: string; tools: string[] }> {
  controller = new AbortController()
  cancelled = false

  let text = ''

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.map((m) => ({
      role: m.role,
      content: typeof m.content === 'string'
        ? m.content
        : Array.isArray(m.content)
          ? m.content.map((b: any) => b.text || '').join('\n')
          : String(m.content),
    })),
  ]

  try {
    const response = await fetch('http://127.0.0.1:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'qwen2.5:3b',
        messages,
        stream: true,
      }),
    })

    if (!response.ok || !response.body) {
      throw new Error('Ollama connection failed')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { value, done } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) continue

        const data = JSON.parse(line)
        const delta = data.message?.content || ''

        if (delta) {
          text += delta
          handlers.onText(delta)
        }
      }
    }

    return { text: text.trim(), tools: [] }
  } catch (error) {
    if (cancelled) return { text: text.trim(), tools: [] }
    throw error
  } finally {
    controller = null
  }
}

export function cancel(): void {
  cancelled = true
  controller?.abort()
}

export function connectedLabels(): string[] {
  return ['OLLAMA QWEN LOCAL']
}
