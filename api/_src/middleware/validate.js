const mongoose = require("mongoose");
const { z } = require("zod");
const { badRequest, notFound } = require("../errors");

// Validates and coerces request parts with zod schemas. Parsed values go to
// req.valid.{body,query,params} (Express 5's req.query is read-only).
const validate = (schemas) => (req, res, next) => {
    req.valid = {};
    for (const part of ["params", "query", "body"]) {
        if (!schemas[part]) continue;
        const result = schemas[part].safeParse(req[part] ?? {});
        if (!result.success) {
            const details = result.error.issues.map((issue) => ({ field: issue.path.join(".") || part, message: issue.message }));
            return next(badRequest(details[0].message, details));
        }
        req.valid[part] = result.data;
    }
    next();
};

// Route param that must be a Mongo ObjectId; anything else is a 404.
const objectIdParam = (name) => (req, res, next) => {
    if (!mongoose.isValidObjectId(req.params[name]) || !/^[a-f0-9]{24}$/i.test(req.params[name])) {
        return next(notFound());
    }
    next();
};

// JS Date silently rolls impossible dates over (2030-02-31 -> 2030-03-03), so
// require the parsed date to format back to the exact same string.
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the YYYY-MM-DD date format.")
    .refine((value) => {
        const date = new Date(`${value}T00:00:00Z`);
        return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
    }, "That date doesn't exist.");

// "2026-10-01" -> Date at UTC midnight (how booking dates are stored).
const toUtcDay = (value) => new Date(`${value}T00:00:00Z`);

module.exports = { validate, objectIdParam, dateOnly, toUtcDay };
