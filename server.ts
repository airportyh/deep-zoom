import * as express from "express";
import * as fs from "fs";
import * as path from "path";
import * as cors from "cors";
const { getPreview } = require("./get-first-bytes");

const app = express();
app.use(cors());

const port = 3000;

app.get("/fs", async (req, resp) => {
    const requestPath = req.query && req.query.path;
    if (!requestPath) {
        resp.status(400);
        resp.end("Please provide a 'path' parameter.");
        return;
    }
    const aPath = path.join("/Users/airportyh/Home", requestPath);
    const stat = await fs.promises.stat(aPath);
    const basename = path.basename(aPath);
    if (stat.isDirectory()) {
        const entries = await fs.promises.readdir(aPath);
        resp.json({
            type: "directory",
            name: basename,
            entries
        });
    } else if (stat.isFile()) {
        const preview = await getPreview(aPath, 500);
        resp.json({
            type: "file",
            name: basename,
            preview: preview
        });
    } else {
        resp.status(500);
        resp.end(`${path} is not a file or directory.`);
    }
});

app.listen(port);
console.log(`Listening on port ${port}.`);