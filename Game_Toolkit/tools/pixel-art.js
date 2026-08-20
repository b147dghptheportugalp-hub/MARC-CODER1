/* =========================================
   GAME TOOLKIT
   PIXEL ART EDITOR
========================================= */

(function () {

    "use strict";


    /* =========================================
       TOOL STATE
    ========================================= */

    let canvas = null;
    let ctx = null;

    let gridSize = 16;

    let currentColor = "#ffffff";

    let tool = "pencil";

    let isDrawing = false;

    let history = [];
    let historyIndex = -1;

    let showGrid = true;


    /* =========================================
       OPEN PIXEL ART EDITOR
    ========================================= */

    window.openPixelArtEditor = function () {

        const title = "🎨 Pixel Art Editor";

        const content = `
            <div class="pixel-editor">

                <!-- TOOLBAR -->

                <div class="pixel-toolbar">

                    <div class="pixel-toolbar-group">

                        <button
                            class="pixel-tool active"
                            id="pixel-pencil"
                            title="Pencil"
                        >
                            🖌️
                        </button>

                        <button
                            class="pixel-tool"
                            id="pixel-eraser"
                            title="Eraser"
                        >
                            🧽
                        </button>

                    </div>


                    <div class="pixel-toolbar-group">

                        <label class="pixel-color-label">
                            🎨
                            <input
                                type="color"
                                id="pixel-color"
                                value="#ffffff"
                            >
                        </label>

                    </div>


                    <div class="pixel-toolbar-group">

                        <label>
                            Size
                            <select id="pixel-size">

                                <option value="8">
                                    8 × 8
                                </option>

                                <option value="16" selected>
                                    16 × 16
                                </option>

                                <option value="24">
                                    24 × 24
                                </option>

                                <option value="32">
                                    32 × 32
                                </option>

                                <option value="48">
                                    48 × 48
                                </option>

                                <option value="64">
                                    64 × 64
                                </option>

                            </select>
                        </label>

                    </div>


                    <div class="pixel-toolbar-group">

                        <button
                            id="pixel-undo"
                            title="Undo"
                        >
                            ↩️
                        </button>

                        <button
                            id="pixel-redo"
                            title="Redo"
                        >
                            ↪️
                        </button>

                    </div>


                    <div class="pixel-toolbar-group">

                        <button
                            id="pixel-clear"
                        >
                            🗑️ Clear
                        </button>

                        <button
                            id="pixel-grid"
                        >
                            🧱 Grid
                        </button>

                        <button
                            id="pixel-download"
                        >
                            📥 PNG
                        </button>

                    </div>

                </div>


                <!-- EDITOR AREA -->

                <div class="pixel-editor-area">

                    <div class="pixel-canvas-wrapper">

                        <canvas
                            id="pixel-canvas"
                            width="512"
                            height="512"
                        ></canvas>

                    </div>

                </div>


                <!-- STATUS BAR -->

                <div class="pixel-status">

                    <span id="pixel-tool-status">
                        🖌️ Pencil
                    </span>

                    <span id="pixel-size-status">
                        16 × 16
                    </span>

                    <span id="pixel-color-status">
                        #FFFFFF
                    </span>

                </div>

            </div>
        `;


        openCustomTool(title, content);

        setTimeout(() => {

            initializePixelEditor();

        }, 0);

    };


    /* =========================================
       INITIALIZE
    ========================================= */

    function initializePixelEditor() {

        canvas =
            document.getElementById(
                "pixel-canvas"
            );

        if (!canvas) {
            return;
        }

        ctx =
            canvas.getContext("2d");

        setupCanvas();

        setupControls();

        setupDrawing();

        saveHistory();

        updateStatus();

    }


    /* =========================================
       CANVAS SETUP
    ========================================= */

    function setupCanvas() {

        canvas.width = 512;

        canvas.height = 512;

        ctx.clearRect(
            0,
            0,
            canvas.width,
            canvas.height
        );

        drawGrid();

    }


    /* =========================================
       DRAW GRID
    ========================================= */

    function drawGrid() {

        if (!ctx) {
            return;
        }

        ctx.clearRect(
            0,
            0,
            canvas.width,
            canvas.height
        );

        /*
            Transparent pixel-art background.
        */

        ctx.fillStyle = "#ffffff";

        ctx.fillRect(
            0,
            0,
            canvas.width,
            canvas.height
        );

        if (!showGrid) {
            return;
        }

        const cellSize =
            canvas.width / gridSize;

        ctx.strokeStyle =
            "rgba(0,0,0,0.18)";

        ctx.lineWidth = 1;

        for (
            let x = 0;
            x <= gridSize;
            x++
        ) {

            const position =
                x * cellSize + 0.5;

            ctx.beginPath();

            ctx.moveTo(
                position,
                0
            );

            ctx.lineTo(
                position,
                canvas.height
            );

            ctx.stroke();

        }


        for (
            let y = 0;
            y <= gridSize;
            y++
        ) {

            const position =
                y * cellSize + 0.5;

            ctx.beginPath();

            ctx.moveTo(
                0,
                position
            );

            ctx.lineTo(
                canvas.width,
                position
            );

            ctx.stroke();

        }

    }


    /* =========================================
       CONTROLS
    ========================================= */

    function setupControls() {

        const pencil =
            document.getElementById(
                "pixel-pencil"
            );

        const eraser =
            document.getElementById(
                "pixel-eraser"
            );

        const color =
            document.getElementById(
                "pixel-color"
            );

        const size =
            document.getElementById(
                "pixel-size"
            );

        const undo =
            document.getElementById(
                "pixel-undo"
            );

        const redo =
            document.getElementById(
                "pixel-redo"
            );

        const clear =
            document.getElementById(
                "pixel-clear"
            );

        const grid =
            document.getElementById(
                "pixel-grid"
            );

        const download =
            document.getElementById(
                "pixel-download"
            );


        /* PENCIL */

        pencil.addEventListener(
            "click",
            function () {

                setTool("pencil");

            }
        );


        /* ERASER */

        eraser.addEventListener(
            "click",
            function () {

                setTool("eraser");

            }
        );


        /* COLOR */

        color.addEventListener(
            "input",
            function () {

                currentColor =
                    color.value;

                updateStatus();

            }
        );


        /* SIZE */

        size.addEventListener(
            "change",
            function () {

                const newSize =
                    parseInt(
                        size.value,
                        10
                    );

                resizeCanvas(
                    newSize
                );

            }
        );


        /* UNDO */

        undo.addEventListener(
            "click",
            undoAction
        );


        /* REDO */

        redo.addEventListener(
            "click",
            redoAction
        );


        /* CLEAR */

        clear.addEventListener(
            "click",
            clearCanvas
        );


        /* GRID */

        grid.addEventListener(
            "click",
            function () {

                showGrid =
                    !showGrid;

                redrawFromCurrentCanvas();

                updateStatus();

            }
        );


        /* DOWNLOAD */

        download.addEventListener(
            "click",
            downloadPNG
        );

    }


    /* =========================================
       SET TOOL
    ========================================= */

    function setTool(newTool) {

        tool = newTool;

        const pencil =
            document.getElementById(
                "pixel-pencil"
            );

        const eraser =
            document.getElementById(
                "pixel-eraser"
            );

        pencil.classList.remove(
            "active"
        );

        eraser.classList.remove(
            "active"
        );


        if (tool === "pencil") {

            pencil.classList.add(
                "active"
            );

        }


        if (tool === "eraser") {

            eraser.classList.add(
                "active"
            );

        }


        updateStatus();

    }


    /* =========================================
       DRAWING EVENTS
    ========================================= */

    function setupDrawing() {

        canvas.addEventListener(
            "mousedown",
            function (event) {

                isDrawing = true;

                drawFromPointer(
                    event
                );

            }
        );


        canvas.addEventListener(
            "mousemove",
            function (event) {

                if (!isDrawing) {
                    return;
                }

                drawFromPointer(
                    event
                );

            }
        );


        canvas.addEventListener(
            "mouseup",
            stopDrawing
        );


        canvas.addEventListener(
            "mouseleave",
            stopDrawing
        );


        canvas.addEventListener(
            "touchstart",
            function (event) {

                event.preventDefault();

                isDrawing = true;

                drawFromTouch(
                    event
                );

            },
            {
                passive: false
            }
        );


        canvas.addEventListener(
            "touchmove",
            function (event) {

                event.preventDefault();

                if (!isDrawing) {
                    return;
                }

                drawFromTouch(
                    event
                );

            },
            {
                passive: false
            }
        );


        canvas.addEventListener(
            "touchend",
            stopDrawing
        );


        window.addEventListener(
            "mouseup",
            stopDrawing
        );


        window.addEventListener(
            "touchend",
            stopDrawing
        );

    }


    /* =========================================
       STOP DRAWING
    ========================================= */

    function stopDrawing() {

        if (!isDrawing) {
            return;
        }

        isDrawing = false;

        saveHistory();

    }


    /* =========================================
       MOUSE POSITION
    ========================================= */

    function drawFromPointer(event) {

        const rect =
            canvas.getBoundingClientRect();

        const x =
            event.clientX -
            rect.left;

        const y =
            event.clientY -
            rect.top;

        drawPixel(
            x,
            y
        );

    }


    /* =========================================
       TOUCH POSITION
    ========================================= */

    function drawFromTouch(event) {

        if (
            !event.touches ||
            !event.touches.length
        ) {
            return;
        }

        const touch =
            event.touches[0];

        const rect =
            canvas.getBoundingClientRect();

        const x =
            touch.clientX -
            rect.left;

        const y =
            touch.clientY -
            rect.top;

        drawPixel(
            x,
            y
        );

    }


    /* =========================================
       DRAW PIXEL
    ========================================= */

    function drawPixel(x, y) {

        if (!ctx) {
            return;
        }

        const rect =
            canvas.getBoundingClientRect();

        const scaleX =
            canvas.width /
            rect.width;

        const scaleY =
            canvas.height /
            rect.height;

        x *= scaleX;

        y *= scaleY;


        const cellSize =
            canvas.width / gridSize;

        const cellX =
            Math.floor(
                x / cellSize
            );

        const cellY =
            Math.floor(
                y / cellSize
            );


        if (
            cellX < 0 ||
            cellY < 0 ||
            cellX >= gridSize ||
            cellY >= gridSize
        ) {
            return;
        }


        const px =
            cellX * cellSize;

        const py =
            cellY * cellSize;


        if (tool === "eraser") {

            ctx.fillStyle =
                "#ffffff";

        } else {

            ctx.fillStyle =
                currentColor;

        }


        ctx.fillRect(
            px,
            py,
            cellSize,
            cellSize
        );


        if (showGrid) {

            ctx.strokeStyle =
                "rgba(0,0,0,0.18)";

            ctx.lineWidth = 1;

            ctx.strokeRect(
                px + 0.5,
                py + 0.5,
                cellSize - 1,
                cellSize - 1
            );

        }

    }


    /* =========================================
       RESIZE CANVAS
    ========================================= */

    function resizeCanvas(newSize) {

        const oldCanvas =
            document.createElement(
                "canvas"
            );

        oldCanvas.width =
            canvas.width;

        oldCanvas.height =
            canvas.height;

        const oldCtx =
            oldCanvas.getContext(
                "2d"
            );

        oldCtx.drawImage(
            canvas,
            0,
            0
        );


        gridSize =
            newSize;


        ctx.clearRect(
            0,
            0,
            canvas.width,
            canvas.height
        );

        ctx.fillStyle =
            "#ffffff";

        ctx.fillRect(
            0,
            0,
            canvas.width,
            canvas.height
        );


        /*
            We intentionally start a fresh
            canvas when changing resolution.
        */

        drawGrid();

        history = [];

        historyIndex = -1;

        saveHistory();

        updateStatus();

    }


    /* =========================================
       CLEAR CANVAS
    ========================================= */

    function clearCanvas() {

        if (
            !confirm(
                "Clear the entire pixel art?"
            )
        ) {
            return;
        }

        ctx.fillStyle =
            "#ffffff";

        ctx.fillRect(
            0,
            0,
            canvas.width,
            canvas.height
        );

        drawGrid();

        saveHistory();

    }


    /* =========================================
       REDRAW GRID
    ========================================= */

    function redrawFromCurrentCanvas() {

        /*
            Save the actual artwork before
            drawing the grid again.
        */

        const image =
            ctx.getImageData(
                0,
                0,
                canvas.width,
                canvas.height
            );

        ctx.putImageData(
            image,
            0,
            0
        );


        if (showGrid) {

            const cellSize =
                canvas.width /
                gridSize;

            ctx.strokeStyle =
                "rgba(0,0,0,0.18)";

            ctx.lineWidth = 1;


            for (
                let x = 0;
                x <= gridSize;
                x++
            ) {

                const position =
                    x * cellSize + 0.5;

                ctx.beginPath();

                ctx.moveTo(
                    position,
                    0
                );

                ctx.lineTo(
                    position,
                    canvas.height
                );

                ctx.stroke();

            }


            for (
                let y = 0;
                y <= gridSize;
                y++
            ) {

                const position =
                    y * cellSize + 0.5;

                ctx.beginPath();

                ctx.moveTo(
                    0,
                    position
                );

                ctx.lineTo(
                    canvas.width,
                    position
                );

                ctx.stroke();

            }

        }

    }


    /* =========================================
       HISTORY
    ========================================= */

    function saveHistory() {

        if (!canvas) {
            return;
        }

        /*
            Remove redo history.
        */

        if (
            historyIndex <
            history.length - 1
        ) {

            history =
                history.slice(
                    0,
                    historyIndex + 1
                );

        }


        history.push(
            canvas.toDataURL()
        );


        /*
            Keep memory under control.
        */

        if (history.length > 50) {

            history.shift();

        }


        historyIndex =
            history.length - 1;

    }


    /* =========================================
       RESTORE HISTORY
    ========================================= */

    function restoreHistory(index) {

        if (
            index < 0 ||
            index >= history.length
        ) {
            return;
        }


        const image =
            new Image();


        image.onload =
            function () {

                ctx.clearRect(
                    0,
                    0,
                    canvas.width,
                    canvas.height
                );

                ctx.drawImage(
                    image,
                    0,
                    0
                );

                redrawFromCurrentCanvas();

            };


        image.src =
            history[index];

    }


    /* =========================================
       UNDO
    ========================================= */

    function undoAction() {

        if (
            historyIndex <= 0
        ) {
            return;
        }

        historyIndex--;

        restoreHistory(
            historyIndex
        );

    }


    /* =========================================
       REDO
    ========================================= */

    function redoAction() {

        if (
            historyIndex >=
            history.length - 1
        ) {
            return;
        }

        historyIndex++;

        restoreHistory(
            historyIndex
        );

    }


    /* =========================================
       DOWNLOAD PNG
    ========================================= */

    function downloadPNG() {

        /*
            Create a clean canvas without
            the editor grid.
        */

        const exportCanvas =
            document.createElement(
                "canvas"
            );

        exportCanvas.width =
            gridSize;

        exportCanvas.height =
            gridSize;

        const exportCtx =
            exportCanvas.getContext(
                "2d"
            );


        /*
            Sample each pixel cell.
        */

        const cellSize =
            canvas.width / gridSize;


        for (
            let y = 0;
            y < gridSize;
            y++
        ) {

            for (
                let x = 0;
                x < gridSize;
                x++
            ) {

                const pixel =
                    ctx.getImageData(
                        x * cellSize +
                        Math.floor(cellSize / 2),

                        y * cellSize +
                        Math.floor(cellSize / 2),

                        1,
                        1
                    ).data;


                exportCtx.fillStyle =
                    `rgb(
                        ${pixel[0]},
                        ${pixel[1]},
                        ${pixel[2]}
                    )`;


                exportCtx.fillRect(
                    x,
                    y,
                    1,
                    1
                );

            }

        }


        /*
            Scale the PNG for easier
            use in games.
        */

        const finalCanvas =
            document.createElement(
                "canvas"
            );

        finalCanvas.width =
            gridSize * 32;

        finalCanvas.height =
            gridSize * 32;

        const finalCtx =
            finalCanvas.getContext(
                "2d"
            );


        finalCtx.imageSmoothingEnabled =
            false;


        finalCtx.drawImage(
            exportCanvas,
            0,
            0,
            finalCanvas.width,
            finalCanvas.height
        );


        const link =
            document.createElement(
                "a"
            );

        link.download =
            `pixel-art-${gridSize}x${gridSize}.png`;

        link.href =
            finalCanvas.toDataURL(
                "image/png"
            );

        link.click();

    }


    /* =========================================
       STATUS
    ========================================= */

    function updateStatus() {

        const toolStatus =
            document.getElementById(
                "pixel-tool-status"
            );

        const sizeStatus =
            document.getElementById(
                "pixel-size-status"
            );

        const colorStatus =
            document.getElementById(
                "pixel-color-status"
            );


        if (toolStatus) {

            toolStatus.textContent =
                tool === "pencil"
                    ? "🖌️ Pencil"
                    : "🧽 Eraser";

        }


        if (sizeStatus) {

            sizeStatus.textContent =
                `${gridSize} × ${gridSize}`;

        }


        if (colorStatus) {

            colorStatus.textContent =
                currentColor.toUpperCase();

        }

    }


})();