const fs = require("fs");

exports.getPreview = function getPreview(filename, bytesToRead) {
    return new Promise((accept, reject) => {
        fs.open(filename, (err, fd) => {
            if (err) {
                reject(err);
                return;
            }
            const buffer = Buffer.alloc(bytesToRead);
            fs.read(fd, buffer, 0, bytesToRead, 0, (err, count, content) => {
                if (err) {
                    reject(err);
                } else {
                    // console.log("Read", count, "bytes for", filename);
                    let preview = content.slice(0, count).toString();
                    if (count === bytesToRead) {
                        const idx = preview.lastIndexOf("\n");
                        preview = preview.substring(0, idx + 1) + "…";
                    }
                    accept(preview);
                }
            });
        });
    });
}