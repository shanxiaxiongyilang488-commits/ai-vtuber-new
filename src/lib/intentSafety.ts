/**
 * A costly video route requires both an explicit video medium and an explicit
 * creation/editing action. Generic words such as "生成" or "試聴" are not enough.
 */
export function hasExplicitVideoActionRequest(value: string): boolean {
	const text = value.normalize('NFKC');
	const mentionsVideo = /動画|映像|アニメ(?:ーション)?|video|movie/iu.test(text);
	const requestsAction = /作って|作成して|生成して|動画化して|アニメ化して|編集して|修正して|直して|変更して|調整して|再生成して|短くして|長くして|差し替えて|にしてほしい|にして/iu.test(text);
	const negatesAction = /(?:動画|映像|アニメ).{0,16}(?:作らない|生成しない|編集しない|変更しない|不要|いらない)/iu.test(text);
	return mentionsVideo && requestsAction && !negatesAction;
}
