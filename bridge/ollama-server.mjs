
import { WebSocketServer } from 'ws'

const PORT = 8787
const MODEL = 'qwen2.5:3b'
const OLLAMA = 'http://127.0.0.1:11434'

const SYSTEM = `You are JARVIS, a helpful personal AI assistant.
Speak clearly, intelligently and concisely.
You are running locally on the user's laptop.`

const wss = new WebSocketServer({
  host: '127.0.0.1',
  port: PORT
})

console.log(`JARVIS Ollama bridge running on ${PORT}`)

wss.on('connection', socket => {
  let history = [{ role: 'system', content: SYSTEM }]

  socket.send(JSON.stringify({
    type: 'ready',
    servers: ['ollama-local']
  }))

  socket.on('message', async raw => {
    let msg

    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return
    }

    if (msg.type !== 'ask' || !msg.text) return

    history.push({
      role: 'user',
      content: msg.text
    })

    try {
      const response = await fetch(`${OLLAMA}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: MODEL,
          messages: history,
          stream: true
        })
      })

      if (!response.ok) {
        throw new Error('Ollama API error')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let answer = ''

      while (true) {
        const { value, done } = await reader.read()

        if (done) break

        buffer += decoder.decode(value, {
          stream: true
        })

        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim()) continue

          const data = JSON.parse(line)
          const delta = data.message?.content || ''

          if (delta) {
            answer += delta

            socket.send(JSON.stringify({
              type: 'text',
              ask: msg.id,
              delta
            }))
          }
        }
      }

      history.push({
        role: 'assistant',
        content: answer
      })

      socket.send(JSON.stringify({
        type: 'done',
        ask: msg.id,
        text: answer
      }))

    } catch (error) {
      socket.send(JSON.stringify({
        type: 'error',
        ask: msg.id,
        message: error.message
      }))
    }
  })
})
