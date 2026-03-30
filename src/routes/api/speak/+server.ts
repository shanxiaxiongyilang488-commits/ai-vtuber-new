import { json } from '@sveltejs/kit'

export async function POST({ request }) {
  const { text, voiceId } = await request.json()

  const apiKey = process.env.ELEVENLABS_API_KEY

  if (!apiKey) {
    return json({ error: 'No API key' }, { status: 500 })
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.8
        }
      })
    }
  )

  if (!response.ok) {
    return json({ error: 'TTS failed' }, { status: 500 })
  }

  const audioBuffer = await response.arrayBuffer()

  return new Response(audioBuffer, {
    headers: {
      'Content-Type': 'audio/mpeg'
    }
  })
}