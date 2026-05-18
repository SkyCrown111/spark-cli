/** Minimal stub for fixture tsc — replace with real Cocos types in a full project. */
declare module 'cc' {
  export const _decorator: {
    ccclass: (name: string) => ClassDecorator;
    property: (options?: unknown) => PropertyDecorator;
  };
  export class Component {
    onLoad?(): void;
    update?(_dt: number): void;
  }
  export class JsonAsset {
    json?: unknown;
  }
  export const resources: {
    load: (
      path: string,
      type: unknown,
      cb: (err: Error | null, asset: JsonAsset | null) => void,
    ) => void;
  };
  type ClassDecorator = <T extends new (...args: unknown[]) => unknown>(target: T) => T;
  type PropertyDecorator = (target: unknown, propertyKey: string) => void;
}
