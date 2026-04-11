<script lang="ts">
  import Avatar from '$lib/components/Avatar.svelte';

  let audioUrl = '/test.mp3';
</script>

<div style="padding: 40px;">
  <Avatar
    name="Test"
    faceSrc="/vtuber/face.png"
    mouthCloseSrc="/vtuber/mouth_close.png"
    mouthMidSrc="/vtuber/mouth_mid.png"
    mouthOpenSrc="/vtuber/mouth_open.png"
    audioSrc={audioUrl}
  />
</div>