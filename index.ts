import * as FontMetrics from 'fontmetrics';
const API_BASE_URL = "http://localhost:3000/fs";

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
    
    const fontMetric = FontMetrics({
        fontFamily,
        fontWeight,
        fontSize,
        origin: "baseline"
    });
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
    const descent = fontSize * fontMetric.descent;
    lines.forEach((line, lineIdx) => {
        const onlyTextWidth = ctx.measureText(line.join("")).width;
        const availableWhiteSpace = box.width - onlyTextWidth;
        const spaceWidth = Math.min(
            availableWhiteSpace / (line.length - 1), maxSpaceWidth);
        let runningLineWidth = 0;
        line.forEach((word, wordIdx) => {
            ctx.fillText(word, 
                leftOffset + box.left + runningLineWidth, 
                topOffset + box.top + (lineIdx + 1) * (lineHeight * fontSize) - descent
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
        const words = textLine.split(/\s+/);
        for (let word of words) {
            if (line.length === 0 && ctx.measureText(word).width < box.width) {
                line.push(word);
            } else if ((ctx.measureText([...line, word].join(" ")).width + minSpaceWidth) < box.width) {
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
            ctx.measureText(line.join(" ")).width + minSpaceWidth < box.width
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
    const request = await fetch(API_BASE_URL + "?path=/");
    const rootInfo = await request.json();

    const canvas = document.createElement("canvas");
    canvas.width = 1000;
    canvas.height = 1000;
    canvas.style.transform = "scale(0.5) translate(-500px, -500px)";
    canvas.style.border = "1px solid black";

    document.body.appendChild(canvas);

    const ctx = canvas.getContext("2d");
    // ctx.textBaseline = "top";

    // console.log(rootInfo);
    fitText(ctx, "./", "Monaco", "normal", {
        top: 0, left: 0, width: 1000, height: 1000
    });
    const entries = rootInfo.entries;
    const perRow = 3;
    const columnWidth = 1000 / perRow;
    const rowHeight = 1000 / perRow;
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const rowIndex = Math.floor(i / perRow);
        const columnIndex = i % perRow;
        fitText(ctx, entry, "Monaco", "normal", {
            top: rowIndex * rowHeight,
            left: columnIndex * columnWidth,
            width: columnWidth,
            height: rowHeight
        });
    }

    // document.addEventListener("wheel", (evt) => {
    //     evt.preventDefault();
    //     console.log("wheel", evt);
    // });
    // canvas.addEventListener("pointerup", (evt) => {
    //     console.log("pointerup", evt);
    // });

    window.addEventListener("wheel", function (e) {
        e.preventDefault();
        console.log("wheel", e);
      
        // if (e.ctrlKey) {
        //   // Your zoom/scale factor
        //   scale -= e.deltaY * 0.01;
        // } else {
        //   // Your trackpad X and Y positions
        //   posX -= e.deltaX * 2;
        //   posY -= e.deltaY * 2;
        // }
      
        // render();
      }, { passive: false });
}

main().catch((err) => console.log(err.stack));