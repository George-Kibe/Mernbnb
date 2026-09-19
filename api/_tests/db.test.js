import { describe, it, expect, vi } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { createDatabase } = require("../_src/db");

const logger = { info: vi.fn() };
const fakeMongoose = (connect) => ({ connect, connection: { readyState: 1 }, disconnect: vi.fn().mockResolvedValue() });

describe("createDatabase", () => {
    it("rejects without a URL", async () => {
        await expect(createDatabase(undefined, logger).connect()).rejects.toThrow("MONGO_URL is not set.");
    });

    it("connects once and reuses the connection", async () => {
        const connect = vi.fn().mockResolvedValue();
        const db = createDatabase("mongodb://x", logger, { connection: fakeMongoose(connect) });
        await db.connect();
        await db.connect();
        expect(connect).toHaveBeenCalledTimes(1);
        expect(connect).toHaveBeenCalledWith("mongodb://x", { serverSelectionTimeoutMS: 5000 });
        expect(db.isConnected()).toBe(true);
    });

    it("retries after a failed attempt", async () => {
        const connect = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce();
        const db = createDatabase("mongodb://x", logger, { connection: fakeMongoose(connect) });
        await expect(db.connect()).rejects.toThrow("down");
        await db.connect();
        expect(connect).toHaveBeenCalledTimes(2);
    });

    it("middleware passes a 503 on failure and continues on success", async () => {
        const failing = createDatabase("mongodb://x", logger, { connection: fakeMongoose(vi.fn().mockRejectedValue(new Error("down"))) });
        const next = vi.fn();
        await failing.requireConnection({ log: { error: vi.fn() } }, {}, next);
        expect(next.mock.calls[0][0]).toMatchObject({ status: 503 });
        const ok = createDatabase("mongodb://x", logger, { connection: fakeMongoose(vi.fn().mockResolvedValue()) });
        const next2 = vi.fn();
        await ok.requireConnection({}, {}, next2);
        expect(next2).toHaveBeenCalledWith();
    });

    it("disconnects", async () => {
        const conn = fakeMongoose(vi.fn());
        await createDatabase("mongodb://x", logger, { connection: conn }).disconnect();
        expect(conn.disconnect).toHaveBeenCalled();
    });
});
