import path from "node:path";

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    const isRelativePath = specifier.startsWith("./") || specifier.startsWith("../");
    if (!isRelativePath || path.extname(specifier)) throw error;

    for (const candidate of [`${specifier}.ts`, `${specifier}/index.ts`]) {
      try {
        return await nextResolve(candidate, context);
      } catch {
        // Try the next TypeScript source resolution form before returning the original error.
      }
    }
    throw error;
  }
}