import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const http = require("http");
const dns = require("dns");
const { fetchImage, isBlockedAddress, sniffImageType, safeLookup } = require("../_src/lib/fetchImage");

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const GIF = Buffer.from("GIF89a....");
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPVP8 ")]);
const AVIF = Buffer.concat([Buffer.alloc(4), Buffer.from("ftypavif")]);

// A local server with one route per scenario.
let server;
let base;
beforeAll(async () => {
    server = http.createServer((req, res) => {
        const routes = {
            "/png": () => res.writeHead(200, { "Content-Type": "image/png" }).end(PNG),
            "/liar.jpg": () => res.writeHead(200, { "Content-Type": "image/jpeg" }).end("<html>not an image</html>"),
            "/big-header": () => res.writeHead(200, { "Content-Length": String(2000) }).end(Buffer.alloc(2000)),
            "/big-stream": () => { res.writeHead(200); res.write(Buffer.alloc(600)); res.end(Buffer.alloc(600)); },
            "/missing": () => res.writeHead(404).end(),
            "/redirect": () => res.writeHead(302, { Location: "/png" }).end(),
            "/loop": () => res.writeHead(302, { Location: "/loop" }).end(),
            "/to-ftp": () => res.writeHead(302, { Location: "ftp://example.com/secret" }).end(),
            "/slow": () => { res.writeHead(200); res.write(PNG.subarray(0, 4)); /* never ends */ },
            "/hang": () => { /* never responds */ },
        };
        (routes[req.url] ?? routes["/missing"])();
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => {
    server.closeAllConnections();
    server.close();
});

const local = (path, options = {}) => fetchImage(`${base}${path}`, { maxBytes: 1024, blockPrivateAddresses: false, ...options });

describe("downloading", () => {
    it("returns the bytes and the sniffed type", async () => {
        expect(await local("/png")).toEqual({ buffer: PNG, type: "image/png" });
    });
    it("follows redirects", async () => {
        expect((await local("/redirect")).type).toBe("image/png");
    });
    it.each([
        ["/liar.jpg", "not a JPEG, PNG, WebP, AVIF or GIF image"],
        ["/big-header", "larger than 10 MB"],
        ["/big-stream", "larger than 10 MB"],
        ["/missing", "HTTP 404"],
        ["/loop", "redirects too many times"],
    ])("rejects %s", async (path, message) => {
        await expect(local(path)).rejects.toThrow(message);
    });
    it("times out slow and hanging servers", async () => {
        await expect(local("/slow", { timeoutMs: 300 })).rejects.toThrow("took too long");
        await expect(local("/hang", { timeoutMs: 300 })).rejects.toThrow("took too long");
    });
    it("reports connection failures as a friendly error", async () => {
        await expect(fetchImage("http://127.0.0.1:1/x.png", { maxBytes: 10, blockPrivateAddresses: false })).rejects.toThrow("Could not download that image.");
    });
});

describe("SSRF protection", () => {
    it.each([
        ["not a url", "Enter a valid image link."],
        [undefined, "Enter a valid image link."],
        ["ftp://example.com/a.png", "Only http and https"],
        ["https://user:pw@example.com/a.png", "credentials"],
        ["http://example.com:8080/a.png", "standard web ports"],
        ["http://127.0.0.1/a.png", "private address"],
        ["http://[::1]/a.png", "private address"],
        ["http://169.254.169.254/latest/meta-data", "private address"],
        ["http://2130706433/", "private address"],
    ])("rejects %s", async (link, message) => {
        await expect(fetchImage(link, { maxBytes: 10 })).rejects.toThrow(message);
    });

    it("blocks hostnames that resolve to private addresses (checked at connect time)", async () => {
        const lookup = vi.spyOn(dns, "lookup").mockImplementation((host, options, cb) => cb(null, [{ address: "10.0.0.5", family: 4 }]));
        await expect(fetchImage("http://internal.example/a.png", { maxBytes: 10 })).rejects.toThrow("private address");
        lookup.mockRestore();
    });

    it("re-validates every redirect target", async () => {
        await expect(local("/to-ftp")).rejects.toThrow("Only http and https");
    });

    it("propagates DNS failures as a friendly error", async () => {
        const lookup = vi.spyOn(dns, "lookup").mockImplementation((host, options, cb) => cb(new Error("ENOTFOUND")));
        await expect(fetchImage("http://nowhere.example/a.png", { maxBytes: 10 })).rejects.toThrow("Could not download that image.");
        lookup.mockRestore();
    });

    it("rejects empty DNS answers", async () => {
        const lookup = vi.spyOn(dns, "lookup").mockImplementation((host, options, cb) => cb(null, []));
        await expect(fetchImage("http://empty.example/a.png", { maxBytes: 10 })).rejects.toThrow("private address");
        lookup.mockRestore();
    });

    it("passes public addresses through in both lookup callback forms", async () => {
        const lookup = vi.spyOn(dns, "lookup").mockImplementation((host, options, cb) => cb(null, [{ address: "93.184.216.34", family: 4 }]));
        const all = await new Promise((resolve) => safeLookup("public.example", { all: true }, (e, addrs) => resolve(addrs)));
        expect(all).toEqual([{ address: "93.184.216.34", family: 4 }]);
        const single = await new Promise((resolve) => safeLookup("public.example", {}, (e, addr, family) => resolve([addr, family])));
        expect(single).toEqual(["93.184.216.34", 4]);
        lookup.mockRestore();
    });
});

describe("helpers", () => {
    it.each([
        ["127.0.0.1", true], ["10.1.2.3", true], ["172.16.0.1", true], ["192.168.1.1", true], ["169.254.169.254", true],
        ["100.64.0.1", true], ["::1", true], ["fd00::1", true], ["fe80::1", true], ["::ffff:10.0.0.1", true],
        ["8.8.8.8", false], ["172.67.1.1", false], ["2606:4700::1", false], ["::ffff:8.8.8.8", false],
    ])("isBlockedAddress(%s) = %s", (ip, blocked) => {
        expect(isBlockedAddress(ip)).toBe(blocked);
    });

    it("sniffs image types from bytes", () => {
        expect(sniffImageType(PNG)).toBe("image/png");
        expect(sniffImageType(JPEG)).toBe("image/jpeg");
        expect(sniffImageType(GIF)).toBe("image/gif");
        expect(sniffImageType(WEBP)).toBe("image/webp");
        expect(sniffImageType(AVIF)).toBe("image/avif");
        expect(sniffImageType(Buffer.from("<svg"))).toBeNull();
    });
});
