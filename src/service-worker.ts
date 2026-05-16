/// <reference types="@sveltejs/kit" />
import { build, files, version } from '$service-worker';

const CACHE_NAME = `ai-vtuber-mobile-chat-${version}`;
const MOBILE_PATH_PREFIX = '/mobile-chat';
const APP_SHELL = [...build, ...files].filter(
	(path) =>
		path.startsWith('/_app/') ||
		path.startsWith('/icons/') ||
		path === '/manifest.webmanifest'
);

self.addEventListener('install', (event) => {
	event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
			)
	);
});

self.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET') return;

	const url = new URL(event.request.url);
	const shouldHandle =
		url.origin === self.location.origin &&
		(url.pathname.startsWith(MOBILE_PATH_PREFIX) ||
			url.pathname.startsWith('/_app/') ||
			url.pathname.startsWith('/icons/') ||
			url.pathname === '/manifest.webmanifest');

	if (!shouldHandle) return;

	event.respondWith(
		caches.match(event.request).then((cached) => {
			if (cached) return cached;

			return fetch(event.request).then((response) => {
				if (!response || response.status !== 200) return response;
				const copy = response.clone();
				caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
				return response;
			});
		})
	);
});
