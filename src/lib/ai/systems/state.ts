export type EmotionType='neutral'|'joy'|'embarrassment'|'sadness'|'anger'
export type CharacterState={
 battery:number
 trust:number
 affection:number
 cpuLoad:number
 emotion:EmotionType
 shouldReturnToPod?:boolean
}
