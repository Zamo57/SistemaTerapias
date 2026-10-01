import { spawnSync, spawn } from "node:child_process";
const network = "centro-terapias-local";
const check = spawnSync("docker", ["network", "inspect", network], {
  stdio: "ignore",
  windowsHide: true,
});
if (check.status !== 0) {
  const created = spawnSync(
    "docker",
    [
      "network",
      "create",
      "-o",
      "com.docker.network.bridge.host_binding_ipv4=127.0.0.1",
      network,
    ],
    { stdio: "ignore", windowsHide: true },
  );
  if (created.status !== 0)
    throw new Error("Docker no está disponible. Iniciá Docker Desktop.");
}
const child = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["supabase", "start", "--network-id", network, "--exclude", "vector,logflare"],
  { shell: process.platform === "win32", windowsHide: true },
);
const filter = (line) =>
  !/(sb_secret_|sb_publishable_|eyJ|Secret|Publishable|anon key|service_role key|JWT secret|password|DB_URL|postgresql:\/\/)/i.test(
    line,
  );
for (const stream of [child.stdout, child.stderr]) {
  let buffer = "";
  stream.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) if (filter(line)) console.log(line);
  });
  stream.on("end", () => {
    if (buffer && filter(buffer)) console.log(buffer);
  });
}
child.on("exit", (code) => process.exit(code || 0));
