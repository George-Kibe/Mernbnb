import { setupServer } from "msw/node";

// Tests register handlers per case with server.use(...). Any request without a
// handler fails the test, so nothing ever reaches a real network.
export const server = setupServer();
