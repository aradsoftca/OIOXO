declare module 'wawoff2' {
  export function compress(buffer: Uint8Array): Promise<Uint8Array>;
  export function decompress(buffer: Uint8Array): Promise<Uint8Array>;
}

// The raw Emscripten bindings (lib/convert/formats/woff2.ts waits for their runtime itself).
declare module 'wawoff2/build/compress_binding.js' {
  const em: { calledRun?: boolean; onRuntimeInitialized?: () => void; compress: (b: Uint8Array) => Uint8Array | false };
  export default em;
}
declare module 'wawoff2/build/decompress_binding.js' {
  const em: { calledRun?: boolean; onRuntimeInitialized?: () => void; decompress: (b: Uint8Array) => Uint8Array | false };
  export default em;
}
