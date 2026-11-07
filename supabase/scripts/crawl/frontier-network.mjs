import { lookup } from 'node:dns/promises';
import { request as http } from 'node:http';
import { request as https } from 'node:https';
import { BlockList, isIP } from 'node:net';
import { Readable } from 'node:stream';

const forbidden = new BlockList();
for (const [address, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 3],
]) forbidden.addSubnet(address, bits, 'ipv4');
for (const [address, bits] of [['2001::', 23], ['2001:db8::', 32], ['2002::', 16]]) {
  forbidden.addSubnet(address, bits, 'ipv6');
}
const globalIPv6 = new BlockList();
globalIPv6.addSubnet('2000::', 3, 'ipv6');

export function isPublicCrawlAddress(address) {
  const family = isIP(address);
  if (family === 4) return !forbidden.check(address, 'ipv4');
  return family === 6 && globalIPv6.check(address, 'ipv6') && !forbidden.check(address, 'ipv6');
}

function resolveHost(host, signal) {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    lookup(host, { all: true }).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

// Pin the public DNS answer used by the connection. Checking an address
// before calling global fetch would let its second resolution change the IP.
export async function requestPublicPage(url, { headers, signal }) {
  const addresses = await resolveHost(url.hostname, signal);
  if (!addresses.length || addresses.some(({ address }) => !isPublicCrawlAddress(address))) {
    throw new Error('Crawl host did not resolve exclusively to public addresses');
  }
  const { address, family } = addresses.find(result => result.family === 4) ?? addresses[0];
  const transport = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = transport(url, {
      headers,
      signal,
      agent: false,
      family,
      lookup: (_host, _options, done) => done(null, address, family),
    }, response => {
      const bodyless = [204, 205, 304].includes(response.statusCode);
      try {
        if (bodyless) response.resume();
        resolve(new Response(bodyless ? null : Readable.toWeb(response), {
          status: response.statusCode,
          headers: response.headers,
        }));
      } catch (error) {
        response.destroy();
        reject(error);
      }
    });
    req.on('error', reject);
    req.end();
  });
}
