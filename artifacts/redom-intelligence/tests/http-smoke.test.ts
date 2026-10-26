import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  return (server.address() as AddressInfo).port;
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function waitForHealth(baseUrl: string, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 8_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error("API process exited before becoming healthy.");
    try {
      const response = await fetch(`${baseUrl}/health/live`);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`API did not become healthy: ${String(lastError)}`);
}

test("HTTP API authenticates services and proxies only the configured model", { timeout: 20_000 }, async () => {
  const inferenceKey = "inference-secret-012345678901234567890123";
  const serviceKey = "service-secret-012345678901234567890123456789";
  const modelServer = createServer(async (req, res) => {
    if (req.headers.authorization !== `Bearer ${inferenceKey}`) {
      res.writeHead(401).end();
      return;
    }
    if (req.method === "GET" && req.url === "/v1/models") {
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({
        object: "list",
        data: [{ id: "redom-test", object: "model", owned_by: "mock" }],
      }));
      return;
    }
    if (req.method !== "POST" || req.url !== "/v1/chat/completions") {
      res.writeHead(404).end();
      return;
    }
    let raw = "";
    for await (const chunk of req) raw += chunk.toString();
    const request = JSON.parse(raw) as { model: string };
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({
      id: "mock-completion",
      object: "chat.completion",
      model: request.model,
      choices: [{ index: 0, message: { role: "assistant", content: "ReDom inference integration passed." }, finish_reason: "stop" }],
      usage: { prompt_tokens: 4, completion_tokens: 6, total_tokens: 10 },
    }));
  });

  let apiChild: ChildProcess | undefined;
  try {
    const modelPort = await listen(modelServer);
    const portProbe = createServer();
    const apiPort = await listen(portProbe);
    await closeServer(portProbe);

    apiChild = spawn(process.execPath, ["dist/src/server.js"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(apiPort),
        SERVICE_API_KEYS: serviceKey,
        INFERENCE_BASE_URL: `http://127.0.0.1:${modelPort}`,
        INFERENCE_API_KEY: inferenceKey,
        INFERENCE_MODEL: "redom-test",
        RATE_LIMIT_PER_MINUTE: "60",
      },
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    apiChild.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    const baseUrl = `http://127.0.0.1:${apiPort}`;
    await waitForHealth(baseUrl, apiChild).catch((error) => {
      throw new Error(`${error instanceof Error ? error.message : String(error)} ${stderr}`);
    });

    const live = await fetch(`${baseUrl}/health/live`);
    assert.equal(live.status, 200);
    assert.equal((await live.json() as { status: string }).status, "ok");

    const ready = await fetch(`${baseUrl}/health/ready`);
    assert.equal(ready.status, 200);

    const unauthorized = await fetch(`${baseUrl}/v1/models`);
    assert.equal(unauthorized.status, 401);

    const authHeaders = { authorization: `Bearer ${serviceKey}` };
    const models = await fetch(`${baseUrl}/v1/models`, { headers: authHeaders });
    assert.equal(models.status, 200);
    assert.equal(((await models.json() as { data: Array<{ id: string }> }).data[0])?.id, "redom-test");

    const invalidModel = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ model: "not-allowed", messages: [{ role: "user", content: "hello" }] }),
    });
    assert.equal(invalidModel.status, 400);

    const completion = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ model: "redom-test", messages: [{ role: "user", content: "hello" }], max_tokens: 64 }),
    });
    assert.equal(completion.status, 200);
    const payload = await completion.json() as { choices: Array<{ message: { content: string } }> };
    assert.equal(payload.choices[0]?.message.content, "ReDom inference integration passed.");
  } finally {
    if (apiChild && apiChild.exitCode === null) {
      apiChild.kill("SIGTERM");
      await Promise.race([once(apiChild, "exit"), new Promise((resolve) => setTimeout(resolve, 2_000))]);
      if (apiChild.exitCode === null) apiChild.kill("SIGKILL");
    }
    await closeServer(modelServer);
  }
});
