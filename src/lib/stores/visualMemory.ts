import { get, writable } from 'svelte/store';

export type VisualMemory = {
	id: string;
	imageId: string;
	characterName: string;
	title: string;
	summary: string;
	tags: string[];
	createdAt: string;
	thumbnail: string;
};

export const visualMemory = writable<VisualMemory[]>([]);

export function searchVisualMemory(query: string): VisualMemory[] {
	const normalizedQuery = query.trim().toLocaleLowerCase();
	const memories = get(visualMemory);
	if (!normalizedQuery) return memories.slice(-5).reverse();

	return memories
		.filter((memory) => {
			const searchableText = [
				memory.title,
				memory.characterName,
				memory.tags.join(' '),
				memory.summary,
			].join(' ').toLocaleLowerCase();

			return searchableText.includes(normalizedQuery);
		})
		.slice(0, 5);
}
