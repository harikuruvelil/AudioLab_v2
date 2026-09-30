import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const template = await readFile("public/sw.js", "utf8");
function worker() {
  const events = {},
    stores = new Map(),
    fetched = [],
    precached = [],
    messages = [],
    scope = "https://example.test/AudioLab_v2/";
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        async addAll(urls) {
          for (const request of urls) {
            precached.push(request);
            entries.set(request.url, `installed:${request.url}`);
          }
        },
        async match(request) {
          return entries.get(
            typeof request === "string" ? request : request.url,
          );
        },
        async put(request, response) {
          entries.set(
            typeof request === "string" ? request : request.url,
            response,
          );
        },
      };
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name) {
      return stores.delete(name);
    },
  };
  const self = {
    registration: { scope },
    location: { origin: "https://example.test" },
    addEventListener(name, listener) {
      events[name] = listener;
    },
    clients: {
      async claim() {},
      async matchAll() {
        return [
          {
            url: scope,
            postMessage(message) {
              messages.push({ v2: message });
            },
          },
          {
            url: "https://example.test/AudioLab_iOS/",
            postMessage(message) {
              messages.push({ v1: message });
            },
          },
        ];
      },
    },
    async skipWaiting() {},
  };
  const fetch = async (request) => {
    fetched.push(request.url);
    return {
      ok: true,
      clone() {
        return this;
      },
    };
  };
  vm.runInNewContext(
    template
      .replace("__VERSION__", "test")
      .replace("/* SHELL_FILES */ []", JSON.stringify(["./assets/main.js"]))
      .replace(
        '/* INDEX_HTML */ ""',
        JSON.stringify('<html><script src="./assets/main.js"></script></html>'),
      ),
    { self, caches, fetch, URL, Request, Response },
  );
  return { events, stores, fetched, precached, messages, scope };
}
async function life(worker, name, data = {}) {
  let result;
  worker.events[name]({
    ...data,
    waitUntil(promise) {
      result = promise;
    },
  });
  await result;
}
async function request(worker, url, mode = "cors") {
  let result;
  worker.events.fetch({
    request: { url, mode, method: "GET" },
    respondWith(promise) {
      result = promise;
    },
  });
  return result ? await result : undefined;
}

test("offline worker serves a coherent installed HTML and asset without network", async () => {
  const w = worker();
  await life(w, "install");
  assert.equal(
    await (await request(w, w.scope, "navigate")).text(),
    '<html><script src="./assets/main.js"></script></html>',
  );
  assert.equal(
    await request(w, `${w.scope}assets/main.js`),
    `installed:${w.scope}assets/main.js`,
  );
  assert.equal(w.fetched.length, 0);
});
test("installation binds HTML to the built release and reloads cached public assets", async () => {
  const w = worker();
  await life(w, "install");
  assert.ok(w.precached.every((request) => request.cache === "reload"));
  assert.ok(
    w.precached.every((request) => !request.url.endsWith("index.html")),
  );
  assert.equal(
    await (await request(w, w.scope, "navigate")).text(),
    '<html><script src="./assets/main.js"></script></html>',
  );
  assert.equal(w.fetched.length, 0);
});
test("offline worker never intercepts or deletes original-site resources", async () => {
  const w = worker();
  w.stores.set("original-v1-shell", new Map());
  w.stores.set("audiolab-v2-shell-old1", new Map());
  w.stores.set("audiolab-v2-shell-old2", new Map());
  await life(w, "install");
  await life(w, "activate");
  assert.ok(w.stores.has("original-v1-shell"));
  assert.equal(
    await request(
      w,
      "https://example.test/AudioLab_iOS/index.html",
      "navigate",
    ),
    undefined,
  );
  await life(w, "message", {
    data: { type: "APPLY_UPDATE" },
    source: {
      url: w.scope,
      postMessage(message) {
        w.messages.push({ v2: message });
      },
    },
  });
  assert.equal(w.messages.length, 1);
  assert.ok(w.messages[0].v2);
});
test("reverb downloads once and serves subsequent requests from its own cache", async () => {
  const w = worker(),
    url = `${w.scope}irs/auditorium.wav`;
  await request(w, url);
  await request(w, url);
  assert.equal(w.fetched.length, 1);
  assert.ok(w.stores.has("audiolab-v2-rooms"));
});
