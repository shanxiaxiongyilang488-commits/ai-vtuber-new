# Shared RunPod Pod for Irodori voice

This installs the Irodori HTTP sidecar into the same persistent RTX 4090 Pod used by
ComfyUI / MiniMax H3. The GPU does not need to stay running: the AI VTuber settings
page can start and stop the Pod, and successful voice requests reset an idle-stop
timer.

## One-time setup

1. Push the `feature/emotion-growth-system` branch to GitHub.
2. In the Pod configuration, expose HTTP port `8791` in addition to ComfyUI port
   `8188`. The voice URL will be
   `https://POD_ID-8791.proxy.runpod.net`.
3. Start the Pod and open its JupyterLab Terminal.
4. Paste the following as **one line**:

   ```bash
   curl -fsSL https://raw.githubusercontent.com/shanxiaxiongyilang488-commits/ai-vtuber-new/feature/emotion-growth-system/runpod/pod/setup-irodori-voice.sh | bash
   ```

5. Restart the Pod once. The installer adds a small ComfyUI custom node that starts
   the voice sidecar automatically whenever the Pod starts.
6. Display the generated shared token:

   ```bash
   cat /workspace/ai-vtuber-voice/token
   ```

## AI VTuber settings

Under **API Settings > RunPod Voice & Video** set:

- Voice Pod Priority: on
- Shared Pod ID: the RunPod Pod ID
- Voice Pod URL: blank (automatic) or the `8791` proxy URL
- Voice Pod Token: value printed in step 6
- Pod Idle Auto-stop: `30` minutes (or another preferred value)
- Keep the existing Serverless Voice Endpoint ID as a fallback

Save the settings, press **Pod: Start**, then **Pod: Check** after the service has
started. `Voice: Generate & Play Test` confirms synthesis. Use **Pod: Stop** when
finished; stopped Pods incur no GPU runtime charge, though persistent storage remains
billable.

## Notes

- Chat model selection and chat processing are not changed.
- Voice requests are serialized so Irodori cannot run twice on the same GPU.
- Before automatic shutdown, the app checks ComfyUI's queue and postpones the stop
  while an H3 job is running or pending.
- The in-app idle timer belongs to the running AI VTuber process. Use the explicit
  Stop button as the final safeguard before closing the app.
