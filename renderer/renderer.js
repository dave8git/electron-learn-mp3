let currentSongs = [];
let currentIndex = -1;
let allSongs = [];
let currentFilter = "all";

const audioPlayer = document.getElementById('audioPlayer');
const nowPlayingDisplay = document.querySelector('.display');

function showStatus(message, type = 'success') { // wyświetla komunikaty 
    const statusDiv = document.getElementById('status'); //pobiera element o id status
    statusDiv.textContent = message; // umieszcza wiadomość (przekazana w message) w elemencie
    statusDiv.className = `status ${type}`; // dodajemy klasę // zmienia kolor tekstu
    statusDiv.style.display = 'block';

    setTimeout(() => {
        statusDiv.style.display = 'none';
    }, 3000);
}

function formatDuration(seconds) {
    if (!seconds || seconds === 0) return 'Unknown';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

/* Hide List */
const toggleButton = document.getElementById('toggleSongList');
const songList = document.getElementById('songList');
let isSongListVisible = true; // default open

toggleButton.addEventListener('click', () => {
    isSongListVisible = !isSongListVisible;
    songList.style.display = isSongListVisible ? 'block' : 'none';
    toggleButton.textContent = isSongListVisible ? 'Hide Songs' : 'Show Songs';

    const radio = document.querySelector('.radio');
    if (radio) {
        const width = radio.offsetWidth;
        const height = radio.offsetHeight;
        window.electronAPI.resizeWindow(width, height); // ✅ now two numbers
    }

    resizeWindowToContent()
});

/* -------- */

document.getElementById('uploadFiles').addEventListener('click', async () => {
    try {
        const uploadedFiles = await window.electronAPI.uploadMp3Files(); // electronAPI -- czyli tak jakby z backendu (main.js) api czytamy to co udostępnia (uploadMp3Files udostępnia tablicę piosenek)
        if (uploadedFiles.length > 0) { // w uploadedFiles będzie to co zwróci backend a tam uploadMp3Files()
            showStatus(`Uploaded ${uploadedFiles.length} file(s) successfully!`); // wykorzystanie funkcji showStatus() 
        } else {
            showStatus('No files were uploaded', 'error');
        }
    } catch (error) {
        console.error('Error uploading files:', error);
        showStatus('Error uploading files', 'error');
    }
});

function updatePlayIcon(isPlaying) {
    playBtn.innerHTML = isPlaying
        ? `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14z M14 5v14h4V5h-4z" transform="scale(-1,1) translate(-24,0)" /></svg>`
        : `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>`
}

function playSong(index) {
    if (index < 0 || index >= currentSongs.length) return;
    currentIndex = index;
    const song = currentSongs[index];
    audioPlayer.src = song.filePath;
    audioPlayer.play();
    updatePlayIcon(true);
    localStorage.setItem('lastSongIndex', index);
    localStorage.setItem('lastSongTime', 0);
    try {
        audioPlayer.play();
        nowPlayingDisplay.textContent = `Now Playing: "${song.title} by ${song.artist}`;
    } catch (err) {
        console.warn("Playback failed:", err);
    }
}

function resizeWindowToContent() {
    const radio = document.querySelector(".radio");
    if (radio) {
        const width = radio.offsetWidth;
        const height = radio.offsetHeight;
        window.electronAPI.resizeWindow(width, height);
    }
}

function displaySongs(songs) {
    const list = document.getElementById('songList');
    list.innerHTML = '';

    if (songs.length === 0) {
        list.innerHTML = '<li>No MP3 files found in the music folder.</li>'
        return;
    }

    songs.forEach((song, index) => {
        console.log('ruszylo', song);
        const li = document.createElement('li');
        li.addEventListener('click', () => {
            if (currentIndex === index && !audioPlayer.paused) {
                audioPlayer.pause();
                updatePlayIcon(false);
            } else {
                playSong(index);
            }
        });
        const songInfo = document.createElement('div');
        songInfo.className = 'song-info';

        const title = document.createElement('div');
        title.className = 'song-title';
        title.textContent = song.title;

        const details = document.createElement('div');
        details.className = 'song-details';
        details.textContent = `${song.artist} • ${song.album} • ${formatDuration(song.duration)} • ${song.year || 'Unknown Year'}`;

        songInfo.appendChild(title);
        songInfo.appendChild(details);
        /* deleteBtn */
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.textContent = 'Delete';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            deleteSong(song);
        }
        /*----------*/
        li.appendChild(songInfo).classList.add('songInfo');
        li.appendChild(deleteBtn);
        list.appendChild(li);
    });
    resizeWindowToContent();
}

function getFilteredSongs() {
    if (currentFilter === "all") return allSongs;
    return allSongs.filter(song => song.artist === currentFilter);
}

async function loadAllSongs() {
    try {
        const songs = await window.electronAPI.loadAllMp3Files();
        allSongs = songs;
        populateAuthorDropdown(songs);
        currentSongs = getFilteredSongs();
        displaySongs(getFilteredSongs());
        showStatus(`Loaded ${songs.length} songs from music folder`);
    } catch (error) {
        console.error('Error loading songs:', error);
        showStatus('Error loading songs', 'error');
    }
}

function populateAuthorDropdown(songs) {
    const authors = [...new Set(songs.map(song => song.artist))];
    authorSelect.innerHTML = `<option value="all">All Authors</option>`;
    authors.forEach(author => {
        const option = document.createElement("option");
        option.value = author;
        option.textContent = author;
        authorSelect.appendChild(option);
    });
}

async function deleteSong(song) {
    if (confirm(`Are you sure you want to delete "${song.title}"?`)) {
        const success = await window.electronAPI.deleteMp3File(song.fileName);
        if (success) {
            showStatus(`Deleted "${song.title}" successfully!`);
            loadAllSongs(); // Refresh the listb
        } else {
            showStatus(`Failed to delete "${song.title}"`, 'error');
        }
    }
}

window.electronAPI.onSongsUpdated((fileName) => {
    loadAllSongs();
})

