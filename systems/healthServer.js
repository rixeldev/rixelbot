import { createServer } from "node:http"

export function parsePort(value = process.env.PORT) {
  const port = value === undefined ? 3000 : Number(value)

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535")
  }

  return port
}

function respond(response, status, body, headers = {}) {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
    "content-type": "text/plain; charset=utf-8",
    "x-content-type-options": "nosniff",
    ...headers,
  })
  response.end(body)
}

export function startHealthServer({
  isReady,
  port = parsePort(),
} = {}) {
  if (typeof isReady !== "function") {
    throw new TypeError("isReady must be a function")
  }

  const server = createServer((request, response) => {
    const pathname = (request.url || "").split("?", 1)[0]

    if (pathname !== "/health") {
      respond(response, 404, "not found")
      return
    }

    if (request.method !== "GET") {
      respond(response, 405, "method not allowed", { allow: "GET" })
      return
    }

    const ready = isReady()
    respond(response, ready ? 200 : 503, ready ? "ok" : "unavailable")
  })

  server.headersTimeout = 10_000
  server.requestTimeout = 15_000
  server.keepAliveTimeout = 5_000
  server.maxHeadersCount = 50

  return new Promise((resolve, reject) => {
    const onError = (error) => reject(error)

    server.once("error", onError)
    server.listen(port, "0.0.0.0", () => {
      server.off("error", onError)
      server.on("error", (error) => {
        console.error("HTTP health server error:", error)
      })
      resolve(server)
    })
  })
}
