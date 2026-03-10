const repoRoot = new URL("../../", import.meta.url);
const helperDir = new URL("../../tools/passkey-test-helper/", import.meta.url);
const binDir = new URL("../../tools/.bin/", import.meta.url);
const binPath = new URL("../../tools/.bin/passkey-test-helper", import.meta.url);

export function getPasskeyHelperPaths() {
  return { repoRoot, helperDir, binDir, binPath };
}

export async function ensurePasskeyHelperBuilt() {
  const { helperDir, binDir, binPath } = getPasskeyHelperPaths();
  const mainGo = new URL("cmd/passkey-test-helper/main.go", helperDir);

  try {
    await Deno.stat(mainGo);
  } catch {
    throw new Error(`missing helper source at ${mainGo.pathname}`);
  }

  await Deno.mkdir(binDir, { recursive: true });
  const command = new Deno.Command("go", {
    args: ["build", "-o", binPath.pathname, "./cmd/passkey-test-helper"],
    cwd: helperDir.pathname,
    stdout: "piped",
    stderr: "piped",
  });
  const result = await command.output();
  if (!result.success) {
    throw new Error(new TextDecoder().decode(result.stderr) || "go build failed");
  }

  return binPath;
}
