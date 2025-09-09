const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const mm = require('music-metadata');
const chokidar = require('chokidar');
const { pathToFileURL, fileURLToPath } = require('url');

const isDev = !app.isPackaged;
let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 560,
        transparent: true,
        frame: false,
        hasShadow: false,
        resizable: true,
        webPreferences: {
            preload: path.join(__dirname, '../preload/preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173')
        mainWindow.webContents.openDevTools()
    } else {
        mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    }
    mainWindow.setResizable(true);
}

let MUSIC_FOLDER;

async function checkForMp3Files(folderPath) {
    try {
        const files = await fs.promises.readdir(folderPath);
        return files.filter(file => file.toLowerCase().endsWith('.mp3')).length > 0;
    } catch (err) {
        return false;
    }
}

async function ensureMusicFolder() {
    const defaultFolder = path.join(require("os").homedir(), "Documents", "music_folder");

    // Check if default folder exists and has MP3 files
    if (fs.existsSync(defaultFolder)) {
        const hasMp3Files = await checkForMp3Files(defaultFolder);
        if (hasMp3Files) {
            MUSIC_FOLDER = defaultFolder;
            return { folder: MUSIC_FOLDER, hasFiles: true };
        }
    }

    // If no default folder or no MP3 files, show dialog
    const { canceled, filePaths } = await dialog.showOpenDialog({
        title: "Select location for your music folder (or where to create one)",
        properties: ["openDirectory", "createDirectory"]
    });
    
    if (canceled || filePaths.length === 0) {
        throw new Error("No folder selected, cannot continue.");
    }

    const selectedPath = filePaths[0];

    try {
        const files = await fs.promises.readdir(selectedPath);
        const mp3Files = files.filter(file => file.toLowerCase().endsWith(".mp3"));

        if (mp3Files.length > 0) {
            MUSIC_FOLDER = selectedPath;
            return { folder: MUSIC_FOLDER, hasFiles: true };
        } else {
            MUSIC_FOLDER = path.join(selectedPath, "music_folder");
            if (!fs.existsSync(MUSIC_FOLDER)) {
                fs.mkdirSync(MUSIC_FOLDER, { recursive: true });
            }
            return { folder: MUSIC_FOLDER, hasFiles: false };
        }
    } catch (err) {
        MUSIC_FOLDER = path.join(selectedPath, "music_folder");
        if (!fs.existsSync(MUSIC_FOLDER)) {
            fs.mkdirSync(MUSIC_FOLDER, { recursive: true });
        }
        return { folder: MUSIC_FOLDER, hasFiles: false };
    }
}

function startWatcher() {
    const watcher = chokidar.watch(MUSIC_FOLDER, {
        persistent: true,
        ignoreInitial: true,
        ignored: /(^|{\/\\})\../,
        depth: 0
    });

    watcher.on('add', filePath => {
        if (mainWindow) mainWindow.webContents.send('songs-updated', path.basename(filePath));
    });

    watcher.on('change', filePath => {
        if (mainWindow) mainWindow.webContents.send('songs-updated', path.basename(filePath));
    });

    watcher.on('unlink', filePath => {
        if (mainWindow) mainWindow.webContents.send('songs-updated', path.basename(filePath));
    });

}

async function safeParseFile(filePath, retries = 5, delay = 300) {
    for (let i = 0; i < retries; i++) {
        try {
            return await mm.parseFile(filePath);
        } catch (err) {
            if (err.code === 'EBUSY' || err.code === 'ENOENT') {
                await new Promise(res => setTimeout(res, delay));
            } else {
                throw err;
            }
        }
    }
    throw new Error(`Failed to pars file after ${retries} retries: ${filePath}`);
}


ipcMain.handle('load-audio', async (_, fileUrl) => {
    const filePath = fileURLToPath(fileUrl); // convert back to C:\...
    const data = await fs.promises.readFile(filePath);
    return data.toString('base64');
});

/* ipcMain  */

ipcMain.handle('upload-mp3-files', async () => {
    if (!mainWindow) return [];

    const result = await dialog.showOpenDialog(mainWindow, { // otwiera natywny dla systemu operacyjnego dialog box do dodania plików. Dla okna mainWindow czyli nowe okno będzie modalem okna głównego.
        properties: ['openFile', 'multiSelections'], // openFile -- pozwala uploadować tylko pliki nie foldery // multiSelections -- pozwala wybierać kilka plików na raz
        filters: [{ name: 'MP3 Files', extensions: ['mp3'] }], // umożliwia wybieranie tylko plików mp3
    }); // wynik działania (47-50): {
    //                                canceled: false,
    //                                filePaths: ['C:\\Users\\You\\Music\\song1.mp3', 'C:\\Users\\You\\Music\\song2.mp3']
    //                              }

    if (result.canceled) return []; // jeżeli żadne pliki nie zostaną wybrane funkcja nie pójdzie dalej. 

    const uploadedFiles = []; // tablica będzie przechowywać nazwy plików 

    for (const filePath of result.filePaths) { // przechodzi po zwróconych/zwróconej nazwach/nazwie plików przechowywanych w result
        try {
            const fileName = path.basename(filePath); // wyciąga ze ścieżki nazwę pliku np. filePath = "C:/Users/You/Music/song1.mp3" --> fileName = "song1.mp3"
            const destinationPath = path.join(MUSIC_FOLDER, fileName); // tworzy całą ścieżkę z nazwą pliku: jeżeli MUSIC_FOLDER = "C:/App/assets/music", w rezultacie: destinationPath = "C:/App/assets/music/song1.mp3" 
            await fs.promises.copyFile(filePath, destinationPath); // czeka aż cały plik się zuploaduje i zwraca promise, po tym program idzie dalej
            // await fs.promises.copyFile(filePath, destinationPath, fs.constants.COPYFILE_EXCL); --> dodanie "fs.constants.COPYFILE_EXCL" spowoduje, że promise będzie zwracał błąd jeżeli plik będzie już w katalogu
            console.log(`Uploaded: ${fileName}`);
            uploadedFiles.push(fileName); // przechowuje nazwy plików
        } catch (err) {
            console.error(`Error uploading ${filePath}:`, err);
        }
    }
    return uploadedFiles; // funkcja zwróci do renderera tablicę z nazwami plików
});

ipcMain.handle('load-all-mp3-files', async () => {
    try {
        const files = await fs.promises.readdir(MUSIC_FOLDER);
        const mp3Files = files.filter(file => file.toLowerCase().endsWith('.mp3'));
        const metadataArray = [];

        for (const fileName of mp3Files) {
            const filePath = path.join(MUSIC_FOLDER, fileName);
            try {
                const metadata = await safeParseFile(filePath);
                metadataArray.push({
                    filePath: pathToFileURL(filePath).toString(),
                    fileName,
                    title: metadata.common.title || path.basename(fileName, '.mp3'),
                    artist: metadata.common.artist || 'Unknown Artist',
                    album: metadata.common.album || 'Unknown Album',
                    year: metadata.common.year || '',
                    duration: metadata.format.duration || 0,
                });
            } catch (err) {
                console.error(`Error reading metadata for ${fileName}:`, err);
                metadataArray.push({
                    filePath: pathToFileURL(filePath).toString(),
                    fileName,
                    title: path.basename(fileName, '.mp3'),
                    artist: 'Unknown Artist',
                    album: 'Unknown Album',
                    year: '',
                    duration: 0,
                });
            }
        }

        return metadataArray;
    } catch (err) {
        console.error('Error reading music folder:', err);
        return [];
    }
});

ipcMain.on("window-control", (_, action) => {
    if (!mainWindow) return;
    switch (action) {
        case "minimize":
            mainWindow.minimize();
            break;
        case "maximize":
            if (mainWindow.isMaximized()) {
                mainWindow.unmaximize();
            } else {
                mainWindow.maximize();
            }
            break;
        case "close":
            mainWindow.close();
            break;
    }
});

app.whenReady().then(async () => {
    try {
        await ensureMusicFolder();
        startWatcher();
        createWindow();
    } catch (err) {
        app.quit();
    }
    app.on('active', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

ipcMain.handle('delete-mp3-file', async (event, fileName) => {
    try {
        const filePath = path.join(MUSIC_FOLDER, fileName);

        if (fs.existsSync(filePath)) {
            await fs.promises.unlink(filePath);
            console.log(`Deleted: ${fileName}`);
            return true;
        }
        return false;
    } catch (err) {
        console.error(`Error deleting ${fileName}:`, err);
        return false;
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
