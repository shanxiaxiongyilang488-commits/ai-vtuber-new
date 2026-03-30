import { json } from '@sveltejs/kit'
import { ELEVENLABS_API_KEY } from '$env/static/private'

export async function POST({ request }) {
  const { text, voiceId } = await request.json()

  if (!ELEVENLABS_API_KEY) {
    return json({ error: 'No API key' }, { status: 500 })
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
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
    const err = await response.text()
    console.error('TTS失敗:', err)
    return json({ error: 'TTS failed' }, { status: 500 })
  }

  const audioBuffer = await response.arrayBuffer()

  return new Response(audioBuffer, {
    headers: {
      'Content-Type': 'audio/mpeg'
    }
  })
}