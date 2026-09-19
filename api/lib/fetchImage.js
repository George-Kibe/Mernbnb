const http = require("http");
const https = require("https");
const dns = require("dns");
const net = require("net");

class FetchImageError extends Error {}

// Addresses the server must never be tricked into requesting (SSRF):
// loopback, private networks, link-local (cloud metadata), CGNAT, multicast,
// reserved ranges and NAT64. BlockList applies the IPv4 rules to IPv4-mapped
// IPv6 addresses (::ffff:a.b.c.d) itself; a ::ffff:0:0/96 rule would block
// every IPv4 address.
const blocked = new net.BlockList();
for (const [network, prefix] of [
    ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
    ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
    ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
    ["224.0.0.0", 4], ["240.0.0.0", 4],
]) blocked.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of [
    ["::", 127], ["64:ff9b::", 96], ["100::", 64], ["2001:db8::", 32],
    ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
]) blocked.addSubnet(network, prefix, "ipv6");

const isBlockedAddress = (address) =>
    blocked.check(address, net.isIPv6(address) ? "ipv6" : "ipv4");

// dns.lookup replacement that refuses to connect to blocked addresses. Doing
// the check at connect time (not before the request) defeats DNS rebinding.
const safeLookup = (hostname, options, callback) => {
    dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
        if (error) return callback(error);
        if (addresses.length === 0 || addresses.some((a) => isBlockedAddress(a.address))) {
            return callback(new FetchImageError("That link points to a private address."));
        }
        if (options.all) return callback(null, addresses);
        callback(null, addresses[0].address, addresses[0].family);
    });
};

// Identifies an image from its first bytes; the remote Content-Type is not trusted.
const sniffImageType = (buffer) => {
    const ascii = (start, end) => buffer.toString("latin1", start, end);
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
    if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
    if (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a") return "image/gif";
    if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
    if (ascii(4, 8) === "ftyp" && ["avif", "avis"].includes(ascii(8, 12))) return "image/avif";
    return null;
};

const parseLink = (link) => {
    let url;
    try {
        url = new URL(link);
    } catch {
        throw new FetchImageError("Enter a valid image link.");
    }
    if (!["http:", "https:"].includes(url.protocol)) {
        throw new FetchImageError("Only http and https links are supported.");
    }
    if (url.username || url.password) {
        throw new FetchImageError("Links with credentials are not supported.");
    }
    if (url.port && !["80", "443"].includes(url.port)) {
        throw new FetchImageError("Links must use the standard web ports.");
    }
    // IP literals skip DNS lookup entirely, so check them here.
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(host) && isBlockedAddress(host)) {
        throw new FetchImageError("That link points to a private address.");
    }
    return url;
};

const requestOnce = (url, { maxBytes, deadline }) =>
    new Promise((resolve, reject) => {
        const transport = url.protocol === "https:" ? https : http;
        const request = transport.get(url, {
            lookup: safeLookup,
            headers: { "User-Agent": "AirBuenas-ImageFetcher/1.0", Accept: "image/*" },
            timeout: Math.max(1, deadline - Date.now()),
        });
        const timer = setTimeout(
            () => request.destroy(new FetchImageError("The image took too long to download.")),
            Math.max(1, deadline - Date.now())
        );
        const fail = (error) => {
            clearTimeout(timer);
            reject(error instanceof FetchImageError ? error : new FetchImageError("Could not download that image."));
        };
        request.on("timeout", () => request.destroy(new FetchImageError("The image took too long to download.")));
        request.on("error", fail);
        request.on("response", (response) => {
            const { statusCode, headers } = response;
            if (statusCode >= 300 && statusCode < 400 && headers.location) {
                response.resume();
                clearTimeout(timer);
                resolve({ redirect: new URL(headers.location, url).toString() });
                return;
            }
            if (statusCode !== 200) {
                response.resume();
                return fail(new FetchImageError(`The link returned an error (HTTP ${statusCode}).`));
            }
            if (Number(headers["content-length"]) > maxBytes) {
                response.destroy();
                return fail(new FetchImageError("That image is larger than 10 MB."));
            }
            const chunks = [];
            let received = 0;
            response.on("data", (chunk) => {
                received += chunk.length;
                if (received > maxBytes) {
                    response.destroy();
                    request.destroy();
                    return fail(new FetchImageError("That image is larger than 10 MB."));
                }
                chunks.push(chunk);
            });
            response.on("error", fail);
            response.on("end", () => {
                clearTimeout(timer);
                resolve({ buffer: Buffer.concat(chunks) });
            });
        });
    });

// Downloads an image from a user-supplied link without exposing internal
// services. Returns { buffer, type } where type comes from the file's bytes.
const fetchImage = async (link, { maxBytes, timeoutMs = 10_000, maxRedirects = 3 } = {}) => {
    const deadline = Date.now() + timeoutMs;
    let url = parseLink(link);
    for (let hop = 0; hop <= maxRedirects; hop++) {
        const result = await requestOnce(url, { maxBytes, deadline });
        if (result.redirect) {
            url = parseLink(result.redirect);
            continue;
        }
        const type = sniffImageType(result.buffer);
        if (!type) throw new FetchImageError("That link is not a JPEG, PNG, WebP, AVIF or GIF image.");
        return { buffer: result.buffer, type };
    }
    throw new FetchImageError("That link redirects too many times.");
};

module.exports = { fetchImage, FetchImageError };
