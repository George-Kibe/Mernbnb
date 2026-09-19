// One in-memory MongoDB for the whole run; each test file uses its own database.
import { MongoMemoryServer } from "mongodb-memory-server";

export default async function setup({ provide }) {
    const server = await MongoMemoryServer.create();
    provide("mongoUri", server.getUri());
    return async () => {
        await server.stop();
    };
}
