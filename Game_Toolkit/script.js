/* =========================================
   GAME TOOLKIT
   Main JavaScript
========================================= */


/* =========================================
   ELEMENTS
========================================= */

const navButtons = document.querySelectorAll(".nav-button");
const pageSections = document.querySelectorAll(".page-section");

const startButton = document.querySelector(".start-button");

const toolWindow = document.getElementById("tool-window");
const toolWindowTitle = document.getElementById("tool-window-title");
const toolWindowContent = document.getElementById("tool-window-content");
const closeToolButton = document.getElementById("close-tool");

const toolCards = document.querySelectorAll(".tool-card");
const openToolButtons = document.querySelectorAll(".open-tool");


/* =========================================
   NAVIGATION
========================================= */

function showSection(sectionId) {

    pageSections.forEach(section => {
        section.classList.remove("active");
    });

    navButtons.forEach(button => {
        button.classList.remove("active");
    });

    const targetSection = document.getElementById(sectionId);

    if (targetSection) {
        targetSection.classList.add("active");
    }

    const activeButton = document.querySelector(
        `.nav-button[data-section="${sectionId}"]`
    );

    if (activeButton) {
        activeButton.classList.add("active");
    }

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}


/* =========================================
   NAV BUTTON EVENTS
========================================= */

navButtons.forEach(button => {

    button.addEventListener("click", () => {

        const sectionId = button.dataset.section;

        showSection(sectionId);

    });

});


/* =========================================
   START CREATING BUTTON
========================================= */

if (startButton) {

    startButton.addEventListener("click", () => {

        showSection("create");

    });

}


/* =========================================
   TOOL DATA
========================================= */

const tools = {

    "pixel-art": {
        title: "🎨 Pixel Art Editor",
        open: window.openPixelArtEditor
    },

    "map-editor": {
        title: "🗺️ Map Editor",
        description:
            "Build maps and levels using tiles.",
        content:
            createComingSoonTool(
                "Map Editor",
                "The map editor will let you create and export game maps."
            )
    },

    "enemy-creator": {
        title: "👾 Enemy Creator",
        description:
            "Create enemies with custom statistics.",
        content:
            createComingSoonTool(
                "Enemy Creator",
                "You will be able to create enemies, health, damage, speed and abilities."
            )
    },

    "item-creator": {
        title: "🧰 Item Creator",
        description:
            "Create weapons, items and equipment.",
        content:
            createComingSoonTool(
                "Item Creator",
                "Create custom game items and export their data."
            )
    },

    "loot-generator": {
        title: "🎲 Loot Generator",
        description:
            "Generate random loot and rarity tables.",
        content:
            createComingSoonTool(
                "Loot Generator",
                "Generate common, rare, epic and legendary loot."
            )
    },

    "quest-generator": {
        title: "📜 Quest Generator",
        description:
            "Generate quests for your game.",
        content:
            createComingSoonTool(
                "Quest Generator",
                "Generate objectives, rewards and quest descriptions."
            )
    },

    "npc-generator": {
        title: "🧙 NPC Generator",
        description:
            "Create NPCs and characters.",
        content:
            createComingSoonTool(
                "NPC Generator",
                "Generate NPC names, roles, dialogue and statistics."
            )
    },

    "skill-tree": {
        title: "🌳 Skill Tree Builder",
        description:
            "Build branching skill trees.",
        content:
            createComingSoonTool(
                "Skill Tree Builder",
                "Build custom skill trees with unlockable abilities."
            )
    }

};


/* =========================================
   COMING SOON TOOL
========================================= */

function createComingSoonTool(name, description) {

    return `
        <div style="
            max-width: 650px;
            margin: 40px auto;
            text-align: center;
        ">

            <div style="
                font-size: 55px;
                margin-bottom: 20px;
            ">
                🛠️
            </div>

            <h2 style="
                margin-bottom: 12px;
            ">
                ${name}
            </h2>

            <p style="
                color: #8f99b0;
                line-height: 1.7;
                margin-bottom: 25px;
            ">
                ${description}
            </p>

            <div style="
                padding: 18px;
                border-radius: 12px;
                background: rgba(255,255,255,0.04);
                border: 1px solid rgba(255,255,255,0.08);
                color: #9ca7bd;
            ">
                🚧 Tool workspace ready.
                <br>
                We can build the actual tool here next.
            </div>

        </div>
    `;
}


/* =========================================
   OPEN TOOL
========================================= */

function openTool(toolId) {

    if (toolId === "pixel-art") {
        window.openPixelArtEditor();
        return;
    }

    const tool = tools[toolId];

    // rest of the existing function...

    if (!tool) {

        openCustomTool(
            "🛠️ Game Dev Tool",
            `
                <div style="
                    text-align:center;
                    padding:50px 20px;
                ">

                    <div style="
                        font-size:50px;
                        margin-bottom:20px;
                    ">
                        🚧
                    </div>

                    <h2>Tool Ready</h2>

                    <p style="
                        color:#8f99b0;
                        margin-top:10px;
                    ">
                        This tool has not been built yet.
                    </p>

                </div>
            `
        );

        return;
    }

    openCustomTool(
        tool.title,
        tool.content
    );
}


/* =========================================
   CUSTOM TOOL WINDOW
========================================= */

function openCustomTool(title, content) {

    toolWindowTitle.textContent = title;

    toolWindowContent.innerHTML = content;

    toolWindow.classList.add("open");

    document.body.style.overflow = "hidden";
}


/* =========================================
   CLOSE TOOL
========================================= */

function closeTool() {

    toolWindow.classList.remove("open");

    document.body.style.overflow = "";

}


/* =========================================
   CLOSE BUTTON
========================================= */

if (closeToolButton) {

    closeToolButton.addEventListener(
        "click",
        closeTool
    );

}


/* =========================================
   CLICK OUTSIDE TOOL WINDOW
========================================= */

if (toolWindow) {

    toolWindow.addEventListener("click", event => {

        if (event.target === toolWindow) {

            closeTool();

        }

    });

}


/* =========================================
   ESCAPE KEY
========================================= */

document.addEventListener("keydown", event => {

    if (event.key === "Escape") {

        closeTool();

    }

});


/* =========================================
   TOOL CARDS
========================================= */

toolCards.forEach(card => {

    card.addEventListener("click", event => {

        /*
            If the user clicked the Open button,
            the button handler will deal with it.
        */

        if (
            event.target.classList.contains("open-tool")
        ) {
            return;
        }

        const toolId = card.dataset.tool;

        if (toolId) {

            openTool(toolId);

        }

    });

});


/* =========================================
   OPEN BUTTONS
========================================= */

openToolButtons.forEach(button => {

    button.addEventListener("click", event => {

        event.stopPropagation();

        const card =
            button.closest(".tool-card");

        if (!card) {
            return;
        }

        const toolName =
            card.querySelector("h3");

        const title =
            toolName
                ? toolName.textContent
                : "Game Dev Tool";

        openCustomTool(
            title,
            `
                <div style="
                    text-align:center;
                    padding:50px 20px;
                ">

                    <div style="
                        font-size:50px;
                        margin-bottom:20px;
                    ">
                        🛠️
                    </div>

                    <h2>
                        ${title}
                    </h2>

                    <p style="
                        color:#8f99b0;
                        margin-top:12px;
                        line-height:1.6;
                    ">
                        This tool workspace is ready.
                    </p>

                    <div style="
                        margin-top:25px;
                        padding:18px;
                        border-radius:12px;
                        background:rgba(255,255,255,0.04);
                        border:1px solid rgba(255,255,255,0.08);
                    ">
                        🚧 Actual tool functionality
                        will be added here.
                    </div>

                </div>
            `
        );

    });

});


/* =========================================
   KEYBOARD SHORTCUT
========================================= */

document.addEventListener("keydown", event => {

    /*
        Press H to return Home.
    */

    if (
        event.key.toLowerCase() === "h" &&
        !isTyping()
    ) {

        showSection("home");

    }

});


/* =========================================
   CHECK IF USER IS TYPING
========================================= */

function isTyping() {

    const active =
        document.activeElement;

    if (!active) {
        return false;
    }

    const tag =
        active.tagName.toLowerCase();

    return (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select"
    );

}


/* =========================================
   INITIAL PAGE
========================================= */

showSection("home");


/* =========================================
   CONSOLE MESSAGE
========================================= */

console.log(
    "%c🎮 Game Toolkit loaded!",
    "font-size:18px;font-weight:bold;"
);

console.log(
    "Game development tools are ready to build."
);