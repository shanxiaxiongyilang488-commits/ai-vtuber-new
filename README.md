# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project
npx sv create my-app
```

To recreate this project with the same configuration:

```sh
# recreate this project
npx sv@0.13.0 create --template minimal --types ts --install npm ai-vtuber
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Irodori-TTS

This app can proxy an OpenAI-compatible Irodori-TTS server through `/api/speak`.

Expected server shape:

```sh
uv run python -m irodori_openai_tts --host 0.0.0.0 --port 8088
```

Set these in `.env`:

```sh
IRODORI_TTS_URL=http://localhost:8088
IRODORI_TTS_MODEL=irodori-tts
IRODORI_TTS_API_KEY=
```

Use `Irodori TTS` in the voice engine selector. The `voice` value is the reference voice ID exposed by the Irodori server, for example `sample` for `voices/sample.wav`; use `none` for text-only inference when the server allows it.

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.
