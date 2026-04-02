import { json } from '@sveltejs/kit';

export async function POST({ request }) {
  console.log("🔥 API HIT");

  const body = await request.json();
  console.log("受け取った:", body);

  return json({
    message: "API OK",
    topic: body.topic
  });
}