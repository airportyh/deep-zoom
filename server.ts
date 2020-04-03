import * as express from "express";
import { promises as fs } from "fs";
import * as path from "path";
import * as cors from "cors";
const { getPreview } = require("./get-first-bytes");

const BASE_PATH = "/Users/airportyh/Home";
const app = express();
app.use(cors());

const port = 3000;

app.get("/entry", async (req, resp) => {
    try {
        const requestPath = req.query && req.query.path;
        if (!requestPath) {
            resp.status(400);
            resp.end("Please provide a 'path' parameter.");
            return;
        }
        const aPath = path.join(BASE_PATH, requestPath);
        const stat = await fs.stat(aPath);
        const basename = path.basename(aPath);
        if (stat.isDirectory()) {
            resp.json({
                type: "directory",
                name: basename
            });
        } else if (stat.isFile()) {
            resp.json({
                type: "file",
                name: basename
            });
        } else {
            resp.status(500);
            resp.json({ error: `${path} is not a file or directory.` });
        }
    } catch (e) {
        resp.status(500);
        resp.json({ error: e.message });
    }
});

app.get("/listdir", async (req, resp) => {
    try {
        const requestPath = req.query && req.query.path;
        if (!requestPath) {
            resp.status(400);
            resp.end("Please provide a 'path' parameter.");
            return;
        }
        const aPath = path.join(BASE_PATH, requestPath);
        const entries = await fs.readdir(aPath);
        const responses = [];
        for (let entry of entries) {
            const entryPath = path.join(aPath, entry);
            const stat = await fs.stat(entryPath);
            const type = stat.isDirectory() ? "directory" : stat.isFile() ? "file" : "unknown";
            if (type === "unknown") {
                continue;
            }
            responses.push({
                entry,
                type
            });
        }
        resp.json(responses);
    } catch (e) {
        resp.status(500);
        resp.json({ error: e.message });
    }
});

app.get("/preview", async (req, resp) => {
    try {
        const requestPath = req.query && req.query.path;
        if (!requestPath) {
            resp.status(400);
            resp.end("Please provide a 'path' parameter.");
            return;
        }
        const aPath = path.join(BASE_PATH, requestPath);
        const preview = await getPreview(aPath, 4000);
        resp.json({ preview });
    } catch (e) {
        resp.status(500);
        resp.json({ error: e.message });
    }
});

app.listen(port);
console.log(`Listening on port ${port}.`);