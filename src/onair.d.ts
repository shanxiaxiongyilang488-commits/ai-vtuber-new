declare module '@aituber-onair/core' {
  export const AITuberOnAirCoreEvent: {
    ASSISTANT_RESPONSE: string;
    ERROR: string;
  };

  export class AITuberOnAirCore {
    constructor(...args: unknown[]);
    once(event: string, listener: (data: any) => void): void;
    processChat(message: string): void;
  }
}
