/**
 * Type declarations for state controller
 */

export interface StateController {
  get(key: string): any;
  set(key: string, value: any): void;
  getSnapshot(): Record<string, any>;
}

export function createStateController(initialState: Record<string, any>): StateController;
