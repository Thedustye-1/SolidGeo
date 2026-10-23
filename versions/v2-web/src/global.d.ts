export {};

declare global {
  interface Window {
    solidgeo?: {
      isElectron: boolean;
      platform: string;
      getVersion: () => Promise<string>;
      setDirty: (value: boolean) => void;
      forceClose: () => Promise<boolean>;
      onCloseRequested: (callback: () => void) => () => void;
      minimize: () => Promise<void>;
      toggleMaximize: () => Promise<boolean>;
      close: () => Promise<void>;
      isMaximized: () => Promise<boolean>;
      onMaximizedChanged: (callback: (value: boolean) => void) => () => void;
      saveFile: (options: {
        title?: string;
        defaultPath?: string;
        filters?: Array<{ name: string; extensions: string[] }>;
        data: string;
        encoding?: 'utf8' | 'base64';
      }) => Promise<{ canceled: boolean; filePath?: string }>;
      openFile: (options: {
        title?: string;
        filters?: Array<{ name: string; extensions: string[] }>;
      }) => Promise<{ canceled: boolean; filePath?: string; data?: string }>;
    };
  }
}
