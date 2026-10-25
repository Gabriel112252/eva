declare module "gltf-validator" {
  const validator: {
    validateBytes(bytes: Uint8Array, options?: { maxIssues?: number; ignoredIssues?: string[]; externalResourceFunction?: (uri: string) => Promise<Uint8Array> }): Promise<unknown>;
  };
  export default validator;
}
