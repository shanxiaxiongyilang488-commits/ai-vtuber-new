<script lang="ts">
	import { browser } from '$app/environment';
	import '../styles.css';

	if (browser && 'serviceWorker' in navigator) {
		window.addEventListener('load', () => {
			navigator.serviceWorker.register('/service-worker.js').catch((error) => {
				console.warn('Service worker registration failed', error);
			});
		});
	}
</script>

<slot />
