import { json, error } from '@sveltejs/kit';

export async function POST({ request }) {
  const { prompt, dialogue } = await request.json();

  const fullPrompt = `
anime style, high quality
${prompt}
speech bubble: ${dialogue}
`;

  // 👉 STUDIO側に投げる
  const res = await fetch("http://localhost:5173/api/studio/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      prompt: fullPrompt
    })
  });

  const data = await res.json();

  return json({
    image: data.image
  });
}