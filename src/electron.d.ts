export {};

declare global {
  interface Window {
    electron: {
      storeGet: (key: string) => Promise<any>;
      storeSet: (key: string, value: any) => Promise<void>;
      storeExport: () => Promise<Record<string, any>>;
      attachments: {
        pick: () => Promise<string[]>;
        verify: (path: string) => Promise<any>;
        embed: (path: string) => Promise<any>;
      };
      openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
    };
  }
}
