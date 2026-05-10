/**
 * Free TCP port finder.
 * Reserves a port by binding to :0 (OS-assigned), then immediately releases
 * it so the caller can start a server on it.
 */
import * as net from "net";

/**
 * Returns a free TCP port on localhost.
 * There is a short race window between closing this server and the caller
 * binding the real server — in practice this is negligible on loopback.
 */
export function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as net.AddressInfo;
      const port = address.port;
      server.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
    server.on("error", reject);
  });
}
