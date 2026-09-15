declare module 'mammoth/mammoth.browser' {
  export interface ConvertResult {
    value: string;
    messages: unknown[];
  }
  export interface ConvertOptions {
    arrayBuffer: ArrayBuffer;
  }
  export function convertToHtml(options: ConvertOptions): Promise<ConvertResult>;
  const _default: { convertToHtml: typeof convertToHtml };
  export default _default;
}
