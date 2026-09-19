const express = require("express");
const { notFound } = require("../errors");

// Keys made by storage.newPhotoKey: places/<user id>/<uuid>.<ext>
const PHOTO_KEY = /^places\/[a-f0-9]{24}\/[0-9a-f-]{36}\.(jpg|png|webp|avif|gif)$/;
// Signed URLs stay valid for at least an hour after they are handed out.
const REDIRECT_CACHE = "public, max-age=1800, s-maxage=1800";

// Stable, public addresses for listing photos (/api/photos/<key>), for search
// engines, sitemaps and link previews: the bucket is private and signed URLs
// expire, so this redirects to a fresh signed URL.
const createPhotosRouter = ({ storage }) => {
    const router = express.Router();

    router.get("/*key", async (req, res) => {
        const key = req.params.key.join("/");
        if (!PHOTO_KEY.test(key)) throw notFound("That photo doesn't exist.");
        res.set("Cache-Control", REDIRECT_CACHE).redirect(302, await storage.photoUrl(key));
    });

    return router;
};

module.exports = { createPhotosRouter, PHOTO_KEY };
