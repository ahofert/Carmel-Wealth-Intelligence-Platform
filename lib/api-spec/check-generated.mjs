import { spawnSync } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(packageDir, "../..");
const tempRoot = await mkdtemp(path.join(os.tmpdir(), "api-contract-check-"));
const generatedDirs = [
  "lib/api-client-react/src/generated",
  "lib/api-zod/src/generated",
];

async function readTree(directory, root = directory) {
  const files = new Map();
  let entries;

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      return files;
    }
    throw error;
  }

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nestedFiles = await readTree(absolutePath, root);
      for (const [filePath, contents] of nestedFiles) {
        files.set(filePath, contents);
      }
    } else if (entry.isFile()) {
      files.set(
        path.relative(root, absolutePath).split(path.sep).join("/"),
        await readFile(absolutePath),
      );
    }
  }

  return files;
}

try {
  const tempCustomFetch = path.join(
    tempRoot,
    "lib/api-client-react/src/custom-fetch.ts",
  );
  await mkdir(path.dirname(tempCustomFetch), { recursive: true });
  await copyFile(
    path.join(workspaceRoot, "lib/api-client-react/src/custom-fetch.ts"),
    tempCustomFetch,
  );

  const result = spawnSync(
    "pnpm",
    ["exec", "orval", "--config", "./orval.config.ts"],
    {
      cwd: packageDir,
      encoding: "utf8",
      env: { ...process.env, ORVAL_OUTPUT_ROOT: tempRoot },
    },
  );

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Orval exited with status ${result.status ?? "unknown"}.`);
  }

  const differences = [];
  for (const generatedDir of generatedDirs) {
    const checkedIn = await readTree(path.join(workspaceRoot, generatedDir));
    const freshlyGenerated = await readTree(path.join(tempRoot, generatedDir));
    const filePaths = new Set([
      ...checkedIn.keys(),
      ...freshlyGenerated.keys(),
    ]);

    for (const filePath of filePaths) {
      const checkedInContents = checkedIn.get(filePath);
      const generatedContents = freshlyGenerated.get(filePath);
      if (
        !checkedInContents ||
        !generatedContents ||
        !checkedInContents.equals(generatedContents)
      ) {
        differences.push(`${generatedDir}/${filePath}`);
      }
    }
  }

  if (differences.length > 0) {
    console.error(
      [
        "Generated API files are out of date:",
        ...differences.map((filePath) => `  - ${filePath}`),
        "",
        "Run `pnpm --filter @workspace/api-spec run codegen` and commit the generated changes.",
      ].join("\n"),
    );
    process.exitCode = 1;
  } else {
    console.log("Generated API files are up to date.");
  }
} catch (error) {
  console.error("Could not verify generated API files:", error);
  process.exitCode = 1;
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
