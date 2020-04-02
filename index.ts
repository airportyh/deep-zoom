import { sleep } from "simple-sleep";
const API_BASE_URL = "http://localhost:3000/fs";
const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 1000;

type BoundingBox = {
    top: number;
    left: number;
    width: number;
    height: number;
};

type FitTextResult = {
    allFit: boolean,
    lines: string[][]
}

type FSEntry = FSEntryDirectory | FSEntryFile;

type FSEntryDirectory = {
    type: "directory",
    name: string,
    entries: string[]
};

type FSEntryFile = {
    type: "file",
    name: string,
    preview: string
};

type JobStatus = {
    id: number,
    canceled: boolean
};

function fitText(
    ctx: CanvasRenderingContext2D, 
    text: string, 
    fontFamily: string,
    fontWeight: string = "normal",
    box: BoundingBox,
    lineHeight: number = 1.2
) {
    let lowerFontSize: null | number = null;
    let upperFontSize: null | number = null;
    let fontSize = 5;
    let lines;
    ctx.strokeRect(box.left, box.top, box.width, box.height);
    while (true) {
        const result = calculateTextLayout(ctx, fontSize, text, 
            fontFamily, fontWeight, box, lineHeight);
        lines = result.lines;
        if (result.allFit) {
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
    drawTextLines(ctx, fontFamily, fontWeight, fontSize, lines, lineHeight, box);
}

function drawTextLines(
    ctx: CanvasRenderingContext2D, 
    fontFamily: string,
    fontWeight: string,
    fontSize: number, 
    lines: string[][], 
    lineHeight: number,
    box: BoundingBox) {
    ctx.fillStyle = "black";
    
    const topOffset = (box.height - lines.length * fontSize * lineHeight) / 2;
    const longestLineWidth = lines.reduce((longestWidth, line) => {
        const width = ctx.measureText(line.join(" ")).width;
        if (longestWidth < width) {
            return width;
        } else {
            return longestWidth;
        }
    }, 0);
    const leftOffset = (box.width - longestLineWidth) / 2;
    const maxSpaceWidth = ctx.measureText("O").width * 2;
    lines.forEach((line, lineIdx) => {
        const onlyTextWidth = ctx.measureText(line.join("")).width;
        const availableWhiteSpace = box.width - onlyTextWidth;
        const spaceWidth = Math.min(
            availableWhiteSpace / (line.length - 1), maxSpaceWidth);
        let runningLineWidth = 0;
        line.forEach((word, wordIdx) => {
            ctx.fillText(word, 
                leftOffset + box.left + runningLineWidth, 
                topOffset + box.top + (lineIdx + 1) * 
                    (lineHeight * fontSize)
            );
            runningLineWidth += ctx.measureText(word).width + 
                spaceWidth;
        });
    });
}

function calculateTextLayout(
    ctx: CanvasRenderingContext2D, 
    fontSize: number, 
    text: string, 
    fontFamily: string,
    fontWeight: string = "normal",
    box: BoundingBox,
    lineHeight: number = 1.2
    ): FitTextResult {

    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    const minSpaceWidth = ctx.measureText("i").width;
    const textLines = text.split("\n");
    const lines: string[][] = [];
    let line: string[] = [];
    let allFit = true;
    for (let textLine of textLines) {
        const words = textLine.split(/\s+/).filter((word) => !!word);
        
        for (let word of words) {

            if (line.length === 0) {
                if (ctx.measureText(word).width < box.width) {
                    line.push(word);
                } else {
                    allFit = false;
                    break;
                }
            } else if ((ctx.measureText([...line, word].join("")).width + line.length * minSpaceWidth) < box.width) {
                line.push(word);
            } else {
                if ((lines.length + 1) * lineHeight * fontSize < box.height) {
                    lines.push(line);
                    line = [word];
                } else {
                    allFit = false;
                    break;
                }
            }
        }
        if ((lines.length + 1) * lineHeight * fontSize < box.height &&
            ctx.measureText(line.join("")).width + (line.length - 1) * minSpaceWidth < box.width
            ) {
            lines.push(line);
            line = [];
        } else {
            allFit = false;
            break;
        }
    }

    return {
        allFit,
        lines
    };
}

async function main() {
    let currentJob: JobStatus;
    let currentJobComplete: Promise<void>;
    let nextJobId: number = 1;
    let viewport = {
        top: -200,
        left: -200,
        zoom: 0.7
    };
    let dragging = false;
    let dragStartX: number;
    let dragStartY: number;
    const fsEntryCache: Map<string, Promise<FSEntry>> = new Map();
    const root = "./Playground";

    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    canvas.style.transform = `scale(0.5) translate(-${CANVAS_WIDTH / 2}px, -${CANVAS_HEIGHT / 2}px)`;
    canvas.style.border = "1px solid black";

    document.body.appendChild(canvas);

    const ctx = canvas.getContext("2d");
    ctx.textBaseline = "bottom";

    render();

    function pushJob(job: (status: JobStatus) => Promise<void>) {
        if (!currentJob) {
            currentJob = {
                id: nextJobId,
                canceled: false
            };
            nextJobId++;
            currentJobComplete = job(currentJob);
            currentJobComplete.then(() => {
                currentJob = null;
            })
        } else {
            const myCurrentJob = currentJob;
            myCurrentJob.canceled = true;
            currentJobComplete.then(() => {
                pushJob(job);
            });
        }
    }

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
            requestAnimationFrame(render);
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
        
        this.requestAnimationFrame(render);
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

    // function pointWorldToCanvas(x: number, y: number): [number, number] {
    //     return [
    //         (x - viewport.top) * viewport.zoom,
    //         (y - viewport.left) * viewport.zoom
    //     ];
    // }

    // function boxCanvasToWorld(box: BoundingBox): BoundingBox {
    //     return {
    //         top: box.top / viewport.zoom + viewport.top,
    //         left: box.left / viewport.zoom + viewport.left,
    //         width: box.width / viewport.zoom,
    //         height: box.height / viewport.zoom
    //     };
    // }

    function boxWorldToCanvas(box: BoundingBox): BoundingBox {
        return {
            top: (box.top - viewport.top) * viewport.zoom,
            left: (box.left - viewport.left) * viewport.zoom,
            width: box.width * viewport.zoom,
            height: box.height * viewport.zoom
        };
    }

    function render() {
        pushJob(doRender);
    }

    async function doRender(jobStatus: JobStatus) {
        ctx.save();
        ctx.fillStyle = "while";
        ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.restore();
        await renderEntry(root, {
            top: 0,
            left: 0,
            width: CANVAS_WIDTH,
            height: CANVAS_HEIGHT
        }, 0, jobStatus);
    }

    async function renderEntry(path: string, box: BoundingBox, level: number, jobStatus: JobStatus) {
        if (jobStatus.canceled) {
            return;
        }
        // check if job status is cancel, return
        const parts = path.split("/");
        const myCanvasBox = boxWorldToCanvas(box);
        const visibleWidth = Math.min(CANVAS_WIDTH, myCanvasBox.left + myCanvasBox.width) - Math.max(0, myCanvasBox.left);
        const visibleHeight = Math.min(CANVAS_HEIGHT, myCanvasBox.top + myCanvasBox.height) - Math.max(0, myCanvasBox.top);
        if (visibleWidth < 0 || visibleHeight < 0) {
            return;
        }
        const area = myCanvasBox.width * myCanvasBox.height;
        const scale = area / (CANVAS_WIDTH * CANVAS_HEIGHT);
        const name = path === "./" ? "./" : parts[parts.length - 1];
        if (scale <= 1.2) {
            fitText(ctx, name, "Monaco", "normal", myCanvasBox);
        }
        const info = await getFSEntryInfo(path);
        if (info.type === "directory") {
            if (scale >= 0.5) {
                const entries = info.entries;
                const perRow = Math.ceil(Math.sqrt(entries.length));
                const columnWidth = box.width / perRow;
                const rowHeight = box.height / perRow;
                for (let i = 0; i < entries.length; i++) {
                    const entry = entries[i];
                    const rowIndex = Math.floor(i / perRow);
                    const columnIndex = i % perRow;
                    await renderEntry(path + "/" + entry, {
                        top: box.top + rowIndex * rowHeight,
                        left: box.left + columnIndex * columnWidth,
                        width: columnWidth,
                        height: rowHeight
                    }, level + 1, jobStatus);
                }
            }
        } else {
            if (scale > 1.2) {
                fitText(ctx, name, "Monaco", "normal", myCanvasBox);
            }
            if (scale >= 0.5) {
                fitText(ctx, info.preview, "Monaco", "normal", myCanvasBox);
            }
        }
    }

    async function getFSEntryInfo(path: string): Promise<FSEntry> {
        if (fsEntryCache.has(path)) {
            return fsEntryCache.get(path);
        } else {
            const promise: Promise<FSEntry> = (async (): Promise<FSEntry> => {
                const request = await fetch(API_BASE_URL + "?path=" + path);
                return request.json();
            })();
            
            fsEntryCache.set(path, promise);
            return promise;
        }
    }



    
}

main().catch((err) => console.log(err.stack));