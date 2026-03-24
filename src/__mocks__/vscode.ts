// Stub of the VS Code API used by the extension.

export enum StatusBarAlignment {
  Left = 1,
  Right = 2,
}

export enum ConfigurationTarget {
  Global = 1,
  Workspace = 2,
  WorkspaceFolder = 3,
}

export class ThemeColor {
  id: string;
  constructor(id: string) {
    this.id = id;
  }
}

export class MarkdownString {
  value: string;
  isTrusted: boolean;
  supportHtml: boolean;

  constructor(value = "", _supportThemeIcons = false) {
    this.value = value;
    this.isTrusted = false;
    this.supportHtml = false;
  }

  appendMarkdown(value: string): this {
    this.value += value;
    return this;
  }

  appendText(value: string): this {
    this.value += value;
    return this;
  }
}

function createMockStatusBarItem(): any {
  return {
    text: "",
    tooltip: undefined as string | MarkdownString | undefined,
    color: undefined,
    backgroundColor: undefined,
    command: undefined,
    name: undefined,
    show: () => {},
    hide: () => {},
    dispose: () => {},
  };
}

export const window = {
  createStatusBarItem: (_alignment?: StatusBarAlignment, _priority?: number) =>
    createMockStatusBarItem(),
  showInputBox: async (_options?: any) => undefined as string | undefined,
  showWarningMessage: async (..._args: any[]) => undefined,
  showInformationMessage: async (..._args: any[]) => undefined,
  showErrorMessage: async (..._args: any[]) => undefined,
};

const defaultConfigValues: Record<string, any> = {};

export const workspace = {
  getConfiguration: (_section?: string) => ({
    get: <T>(key: string, defaultValue?: T): T =>
      (defaultConfigValues[key] ?? defaultValue) as T,
    update: async (
      _key: string,
      _value: any,
      _target?: ConfigurationTarget
    ) => {},
  }),
  onDidChangeConfiguration: (
    _listener: (e: any) => any,
    _thisArgs?: any,
    _disposables?: any[]
  ) => ({ dispose: () => {} }),
};

export const commands = {
  executeCommand: async (..._args: any[]) => {},
  registerCommand: (_command: string, _callback: (...args: any[]) => any) => ({
    dispose: () => {},
  }),
};

export class Disposable {
  private _callOnDispose: () => void;
  constructor(callOnDispose: () => void) {
    this._callOnDispose = callOnDispose;
  }
  dispose() {
    this._callOnDispose();
  }
}
