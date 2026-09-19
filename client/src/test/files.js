import { JSDOM } from "jsdom";

// Vitest swaps jsdom's File/Blob for Node's, which jsdom's XMLHttpRequest can't
// send. Files that get uploaded in tests must be jsdom Files.
const { File: DomFile } = new JSDOM().window;
export const makeFile = (name, type, content = "x") => new DomFile([content], name, { type });
