import { sleep } from "simple-sleep";
const API_BASE_URL = "http://localhost:3000/";
const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 1000;

type BoundingBox = {
    top: number;
    left: number;
    width: number;
    height: number;
};

type FontSetting = {
    size: number,
    family: string,
    weight: string
};

type FSEntryStatus = "pending" | FSEntry;

type FSEntry = FSEntryDirectory | FSEntryFile;

type FSEntryDirectory = {
    type: "directory",
    name: string,
    entries: string[]
};

type FSEntryFile = {
    type: "file",
    name: string,
    preview?: string
};

type DirectoryListingStatus = "pending" | string[];

type PreviewStatus = "pending" | { preview: string };

class TextMeasurer {
    widthTable: { [key: string]: number } = {};
    ctx: CanvasRenderingContext2D;
    constructor(ctx: CanvasRenderingContext2D) {
        this.ctx = ctx;
    }

    measureText(text: string, fontSetting: FontSetting): number {
        const fontString = `${fontSetting.weight} ${fontSetting.size}px ${fontSetting.family}`;
        let totalWidth = 0;
        for (let chr of text) {
            const chrKey = chr + fontString;
            let width = this.widthTable[chrKey];
            if (!width) {
                this.ctx.font = fontString;
                width = this.ctx.measureText(chr).width;
                this.widthTable[chrKey] = width;
            }
            totalWidth += width;
        }
        return totalWidth;
    }
}

function fitText(
    ctx: CanvasRenderingContext2D, 
    text: string, 
    fontFamily: string,
    fontWeight: string = "normal",
    box: BoundingBox,
    textMeasurer: TextMeasurer,
    lineHeight: number = 1.2
) {
    let lowerFontSize: null | number = null;
    let upperFontSize: null | number = null;
    let fontSize = 5;
    let lines = text.split("\n");
    let height, width;
    ctx.strokeRect(box.left, box.top, box.width, box.height);
    // console.log("fitText", text);
    while (true) {
        height = lines.length * fontSize * lineHeight;
        width = lines.reduce((widest, line) => {
            const lineWidth = textMeasurer.measureText(line, {
                size: fontSize,
                weight: fontWeight,
                family: fontFamily
            });
            if (widest > lineWidth) {
                return widest;
            } else {
                return lineWidth;
            }
        }, 0);
        // console.log("try font size", fontSize, "height", height, "width", width);
        
        const allFit = height <= box.height && width <= box.width;
        if (allFit) {
            lowerFontSize = fontSize;
            if (upperFontSize) {
                const newFontSize = Math.floor((upperFontSize + fontSize) / 2);
                if (newFontSize === fontSize) {
                    break;
                }
                fontSize = newFontSize;
            } else {
                fontSize *= 2;
            }
        } else {
            upperFontSize = fontSize;
            if (lowerFontSize) {
                const newFontSize = Math.floor((lowerFontSize + fontSize) / 2);
                if (newFontSize === fontSize) {
                    break;
                }
                fontSize = newFontSize;
            } else {
                fontSize = Math.floor(fontSize / 2);
            }
        }
    }
    // console.log("result font size", fontSize);
    ctx.fillStyle = "black";
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    const topOffset = (box.height - lines.length * fontSize * lineHeight) / 2;
    const leftOffset = (box.width - width) / 2;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        ctx.fillText(line, 
            leftOffset + box.left, 
            topOffset + box.top + (i + 1) * (lineHeight * fontSize)
        );
    }
}

async function main() {
    let viewport = {
        top: -200,
        left: -200,
        zoom: 0.7
    };
    let dragging = false;
    let dragStartX: number;
    let dragStartY: number;
    const fsEntryCache: Map<string, FSEntryStatus> = new Map();
    const dirListingCache: Map<string, DirectoryListingStatus> = new Map();
    const previewCache: Map<string, PreviewStatus> = new Map();
    const root = "./Playground";

    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    canvas.style.transform = `scale(0.5) translate(-${CANVAS_WIDTH / 2}px, -${CANVAS_HEIGHT / 2}px)`;
    canvas.style.border = "1px solid black";

    document.body.appendChild(canvas);

    const ctx = canvas.getContext("2d");
    const textMeasurer = new TextMeasurer(ctx);
    ctx.textBaseline = "bottom";

    const selfRender = () => {
        render();
        requestAnimationFrame(selfRender);
    }
    requestAnimationFrame(selfRender);

    window.addEventListener("mousedown", (e: MouseEvent) => {
        dragging = true;
        [dragStartX, dragStartY] = pointScreenToCanvas(e);
    });

    window.addEventListener("mouseup", () => {
        dragging = false;
    });

    window.addEventListener("mousemove", (e: MouseEvent) => {
        if (dragging) {
            const [pointerX, pointerY] = pointScreenToCanvas(e);
            const [worldPointerX, worldPointerY] = pointCanvasToWorld(pointerX, pointerY);
            const [worldDragStartX, worldDragStartY] = pointCanvasToWorld(dragStartX, dragStartY);
            viewport.left -= worldPointerX - worldDragStartX;
            viewport.top -= worldPointerY - worldDragStartY;
            dragStartX = pointerX;
            dragStartY = pointerY;
            // requestAnimationFrame(render);
        }
    });

    window.addEventListener("wheel", function (e: any) {
        e.preventDefault();
        const delta = e.deltaY;
        const [pointerX, pointerY] = pointScreenToCanvas(e);
        const newZoom = Math.max(0.5, viewport.zoom * (1 - delta * 0.01));

        const [worldPointerX, worldPointerY] = pointCanvasToWorld(pointerX, pointerY);
        const newLeft = - (pointerX / newZoom - worldPointerX);
        const newTop = - (pointerY / newZoom - worldPointerY);
        const newViewport = {
            top: newTop,
            left: newLeft,
            zoom: newZoom
        };
        viewport = newViewport;
        
        // console.log("x=", pointerX, "y=", pointerY, "zoomLevel=", zoomLevel);
        
        // this.requestAnimationFrame(render);
      }, { passive: false });

    function pointScreenToCanvas(e: MouseEvent): [number, number] {
        return [
            (e.clientX - canvas.offsetLeft - 1) * 2,
            (e.clientY - canvas.offsetTop - 1) * 2
        ];
    }
    
    function pointCanvasToWorld(x: number, y: number): [number, number] {
        return [
            x / viewport.zoom + viewport.left,
            y / viewport.zoom + viewport.top
        ];
    }

    function boxWorldToCanvas(box: BoundingBox): BoundingBox {
        return {
            top: (box.top - viewport.top) * viewport.zoom,
            left: (box.left - viewport.left) * viewport.zoom,
            width: box.width * viewport.zoom,
            height: box.height * viewport.zoom
        };
    }

    function render() {
        ctx.save();
        ctx.fillStyle = "while";
        ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.restore();
        fetchFsEntry(root);
        renderEntry(root, {
            top: 0,
            left: 0,
            width: CANVAS_WIDTH,
            height: CANVAS_HEIGHT
        }, 0);
    }

    function renderEntry(path: string, box: BoundingBox, level: number) {
        // check if job status is cancel, return
        const myCanvasBox = boxWorldToCanvas(box);
        const visibleWidth = Math.min(CANVAS_WIDTH, myCanvasBox.left + myCanvasBox.width) - Math.max(0, myCanvasBox.left);
        const visibleHeight = Math.min(CANVAS_HEIGHT, myCanvasBox.top + myCanvasBox.height) - Math.max(0, myCanvasBox.top);
        if (visibleWidth < 0 || visibleHeight < 0) {
            return;
        }
        const area = myCanvasBox.width * myCanvasBox.height;
        const scale = area / (CANVAS_WIDTH * CANVAS_HEIGHT);
        const parts = path.split("/");
        const name = parts[parts.length - 1];
        if (scale <= 1.2) {
            fitText(ctx, name, "Monaco", "normal", myCanvasBox, textMeasurer);
        }
        const info = getFSEntry(path);
        if (!info) {
            return;
        }
        if (info.type === "directory") {
            if (scale >= 0.5) {
                fetchDirectoryListing(path);
                const entries = getDirectoryListing(path);
                if (!entries) {
                    return;
                }
                const perRow = Math.ceil(Math.sqrt(entries.length));
                const columnWidth = box.width / perRow;
                const rowHeight = box.height / perRow;
                for (let i = 0; i < entries.length; i++) {
                    const entry = entries[i];
                    const rowIndex = Math.floor(i / perRow);
                    const columnIndex = i % perRow;
                    renderEntry(path + "/" + entry, {
                        top: box.top + rowIndex * rowHeight,
                        left: box.left + columnIndex * columnWidth,
                        width: columnWidth,
                        height: rowHeight
                    }, level + 1);
                }
            }
        } else {
            if (scale > 1.2) {
                fitText(ctx, name, "Monaco", "normal", myCanvasBox, textMeasurer);
            }
            if (scale >= 0.5) {
                fetchPreview(path);
                const preview = getPreview(path);
                if (preview) {
                    fitText(ctx, preview, "Monaco", "normal", myCanvasBox, textMeasurer);
                }
            }
        }
    }

    function getFSEntry(path: string): FSEntry | null {
        const status = fsEntryCache.get(path);
        if (status === "pending") {
            return null;
        } else {
            return status;
        }
    }

    function fetchFsEntry(path: string): void {
        if (fsEntryCache.has(path)) {
            return;
        }
        fsEntryCache.set(path, "pending");
        setTimeout(() => {
            fetch(API_BASE_URL + "entry?path=" + path)
            .then((request) => request.json())
            .then((result) => {
                fsEntryCache.set(path, result);
            });
        });
    }

    function getDirectoryListing(path: string): string[] | null {
        const status = dirListingCache.get(path);
        if (status === "pending") {
            return null;
        } else {
            return status;
        }
    }

    function fetchDirectoryListing(path: string): void {
        if (dirListingCache.has(path)) {
            return;
        }
        dirListingCache.set(path, "pending");
        setTimeout(() => {
            fetch(API_BASE_URL + "listdir?path=" + path)
            .then((request) => request.json())
            .then((entries) => {
                const entryNames = entries.map(entry => entry.entry);
                dirListingCache.set(path, entryNames);
                for (let entry of entries) {
                    const entryPath = path + "/" + entry.entry;
                    fsEntryCache.set(entryPath, entry)
                }
            });
        });
    }

    function getPreview(path: string): string | null {
        const status = previewCache.get(path);
        if (status === "pending") {
            return null;
        } else {
            return status && status.preview;
        }
    }

    function fetchPreview(path: string): void {
        if (previewCache.has(path)) {
            return;
        }
        previewCache.set(path, "pending");
        setTimeout(() => {
            fetch(API_BASE_URL + "preview?path=" + path)
            .then((request) => request.json())
            .then((preview) => {
                previewCache.set(path, preview);
            });
        });
    }
}

main().catch((err) => console.log(err.stack));