/**
 * A minimal router for Node's built-in http module.
 * Supports path params (":id") and a chain of middleware/handlers per
 * route, Express-style (call next() to continue to the next handler)
 */
export class Router {
  constructor() {
    this.routes = []; // { method, pattern: RegExp, keys: string[], handlers: [] }
  }

  #register(method, routePath, handlers) {
    const keys = [];
    const pattern = new RegExp(
      "^" +
        routePath
          .replace(/\/:([^/]+)/g, (_, key) => {
            keys.push(key);
            return "/([^/]+)";
          })
          .replace(/\/$/, "") +
        "/?$"
    );
    this.routes.push({ method, pattern, keys, handlers });
  }

  get(path, ...handlers) {
    this.#register("GET", path, handlers);
  }
  post(path, ...handlers) {
    this.#register("POST", path, handlers);
  }
  patch(path, ...handlers) {
    this.#register("PATCH", path, handlers);
  }
  put(path, ...handlers) {
    this.#register("PUT", path, handlers);
  }
  delete(path, ...handlers) {
    this.#register("DELETE", path, handlers);
  }

  /**
   * Attempts to match and run a route for this request.
   * Returns true if a matching route was found (regardless of what it
   * did with the response), false if the caller should respond 404.
   */
  async handle(req, res, pathname) {
    for (const route of this.routes) {
      if (route.method !== req.method) continue;
      const match = route.pattern.exec(pathname);
      if (!match) continue;

      req.params = {};
      route.keys.forEach((key, i) => {
        req.params[key] = decodeURIComponent(match[i + 1]);
      });

      await this.#runChain(route.handlers, req, res);
      return true;
    }
    return false;
  }

  async #runChain(handlers, req, res) {
    let index = 0;
    const next = async (err) => {
      if (err) throw err;
      if (res.writableEnded) return;
      const handler = handlers[index++];
      if (!handler) return;
      await handler(req, res, next);
    };

    try {
      await next();
    } catch (err) {
      console.error(err);
      if (!res.writableEnded) {
        res.writeHead(err.statusCode || 500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.publicMessage || "Internal server error" }));
      }
    }
  }
}
