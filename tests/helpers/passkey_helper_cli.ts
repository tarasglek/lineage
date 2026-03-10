import { ensurePasskeyHelperBuilt } from "./passkey_helper_build.ts";

async function runHelper(command: string, payload: unknown) {
  const binary = await ensurePasskeyHelperBuilt();
  const proc = new Deno.Command(binary.pathname, {
    args: [command],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  });
  const child = proc.spawn();
  const writer = child.stdin.getWriter();
  await writer.write(new TextEncoder().encode(JSON.stringify(payload)));
  await writer.close();

  const output = await child.output();
  if (!output.success) {
    throw new Error(new TextDecoder().decode(output.stderr) || `${command} failed`);
  }
  return JSON.parse(new TextDecoder().decode(output.stdout));
}

export function runRegisterResponse(payload: unknown) {
  return runHelper("register-response", payload);
}

export function runLoginResponse(payload: unknown) {
  return runHelper("login-response", payload);
}
