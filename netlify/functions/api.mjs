import { Readable } from "node:stream";
import { handleApiRequest } from "../../api-handler.mjs";

class NetlifyResponse {
  constructor(resolve) {
    this.resolve = resolve;
    this.statusCode = 200;
    this.headers = {};
  }

  writeHead(statusCode, headers = {}) {
    this.statusCode = statusCode;
    this.headers = headers;
  }

  end(body = "") {
    this.resolve({
      statusCode: this.statusCode,
      headers: this.headers,
      body
    });
  }
}

export async function handler(event) {
  const request = Readable.from(event.body ? [event.body] : []);
  request.method = event.httpMethod;
  request.url = event.rawUrl || event.path;
  request.headers = Object.fromEntries(
    Object.entries(event.headers || {}).map(([key, value]) => [key.toLowerCase(), value])
  );

  return new Promise((resolve) => {
    const response = new NetlifyResponse(resolve);
    handleApiRequest(request, response, "/.netlify/functions/api");
  });
}
