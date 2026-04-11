export type AndroidPhraseSet = {
  internalLogs: string[]
  logicCore: string[]
  cpu: string[]
  sensor: string[]
  battery: string[]
}

export type EmotionalMapping = {
  joy: string
  embarrassment: string
  sadness: string
  anger: string
}

export type EndingStyle = {
  enableReturnToPod: boolean
  frequency: 'low' | 'medium' | 'high'
  lines: string[]
}

export type PersonaStyle = {
  displayName: string
  type: 'android'
  speechStyle: string
  summary: string
  coreTraits: string[]
  forbidden: string[]
  robotBehaviors: string[]
  androidPhrases: AndroidPhraseSet
  emotionalMapping: EmotionalMapping
  endingStyle: EndingStyle
  learningRule?: string
}
