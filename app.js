let visualizer;
let recorder;
let isRecording = false;
let recordingBroken = false;
const PLAYERS = {};

const model = initModel();
let player = initPlayers();

btnRecord.addEventListener('click', () => {
  // Things are broken on old ios
  if (!navigator.mediaDevices) {
    recordingBroken = true;
    recordingError.hidden = false;
    btnRecord.disabled = true;
    return;
  }
  
  if (isRecording) {
    isRecording = false;
    updateRecordBtn(true);
    recorder.stop();
  } else {
    // Request permissions to record audio. Also this sometimes fails on Linux. I don't know.
    navigator.mediaDevices.getUserMedia({audio: true}).then(stream => {
      isRecording = true;
      updateRecordBtn(false);
      hideVisualizer();

      recorder = new window.MediaRecorder(stream);
       recorder.addEventListener('dataavailable', (e) => {
         updateWorkingState(btnRecord, btnUpload);
         requestAnimationFrame(() => requestAnimationFrame(() => transcribeFromFile(e.data)));
      });
      recorder.start();
    }, () => {
      recordingBroken = true;
      recordingError.hidden = false;
      btnRecord.disabled = true;
    });
  }
});

fileInput.addEventListener('change', (e) => {
  recordingError.hidden = true;
  updateWorkingState(btnUpload, btnRecord);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    transcribeFromFile(e.target.files[0]);
    fileInput.value = null;
  }));
  
  return false;
});

container.addEventListener('click', () => {
  if (player.isPlaying()) {
    stopPlayer();
  } else {
    startPlayer();
  }
});

async function transcribeFromFile(blob) {
  hideVisualizer();
  
  model.transcribeFromAudioFile(blob).then((ns) => {
    PLAYERS.soundfont.loadSamples(ns).then(() => {
      visualizer = new mm.Visualizer(ns, canvas, {
          noteRGB: '255, 255, 255', 
          activeNoteRGB: '232, 69, 164', 
          pixelsPerTimeStep: window.innerWidth < 500 ? null: 80,
      });
      resetUIState();
      showVisualizer();
    });
  });
}

function setActivePlayer(event, isSynthPlayer) {
  document.querySelector('button.player.active').classList.remove('active');
  event.target.classList.add('active');
  stopPlayer();
  player = isSynthPlayer ? PLAYERS.synth : PLAYERS.soundfont;
  startPlayer();
}

function stopPlayer() {
  player.stop();
  container.classList.remove('playing');
}

function startPlayer() {
  container.scrollLeft = 0;
  container.classList.add('playing');
  mm.Player.tone.context.resume();
  player.start(visualizer.noteSequence);
}

function updateWorkingState(active, inactive) {
  help.hidden = true;
  transcribingMessage.hidden = false;
  active.classList.add('working');
  inactive.setAttribute('disabled', true);
}

function updateRecordBtn(defaultState) {
  const el = btnRecord.firstElementChild;
  el.textContent = defaultState ? 'Record audio' : 'Stop'; 
}

function resetUIState() {
  btnUpload.classList.remove('working');
  btnUpload.removeAttribute('disabled');
  btnRecord.classList.remove('working');
  if (!recordingBroken) {
    btnRecord.removeAttribute('disabled');
  }
}

function hideVisualizer() {
  players.hidden = true;
  saveBtn.hidden = true;
  container.hidden = true;
}

function showVisualizer() {
  container.hidden = false;
  saveBtn.hidden = false;
  players.hidden = false;
  transcribingMessage.hidden = true;
  help.hidden = true;
}

function saveMidi(event) {
  event.stopImmediatePropagation();
  saveAs(new File([mm.sequenceProtoToMidi(visualizer.noteSequence)], 'transcription.mid'));
}

function initPlayers() {
  PLAYERS.synth = new mm.Player(false, {
    run: (note) => {
      const currentNotePosition = visualizer.redraw(note);

      // See if we need to scroll the container.
      const containerWidth = container.getBoundingClientRect().width;
      if (currentNotePosition > (container.scrollLeft + containerWidth)) {
        container.scrollLeft = currentNotePosition - 20;
      }
    },
    stop: () => {container.classList.remove('playing')}
  });

  PLAYERS.soundfont = new mm.SoundFontPlayer('https://storage.googleapis.com/magentadata/js/soundfonts/salamander');
  // TODO: fix this after magenta 1.1.15
  PLAYERS.soundfont.callbackObject = {
    run: (note) => {
      const currentNotePosition = visualizer.redraw(note);

      // See if we need to scroll the container.
      const containerWidth = container.getBoundingClientRect().width;
      if (currentNotePosition > (container.scrollLeft + containerWidth)) {
        container.scrollLeft = currentNotePosition - 20;
      }
    },
    stop: () => {container.classList.remove('playing')}
  };
  return PLAYERS.soundfont;
}

function initModel() {
  const model = new mm.OnsetsAndFrames('https://storage.googleapis.com/magentadata/js/checkpoints/transcription/onsets_frames_uni');
  
  model.initialize().then(() => {
    resetUIState();
    modelLoading.hidden = true;
    modelReady.hidden = false;
  });
  
  // Things are slow on Safari.
  if (window.webkitOfflineAudioContext) {
    safariWarning.hidden = false;
  }
  
  // Things are very broken on ios12.
  if (navigator.userAgent.indexOf('iPhone OS 12_0') >= 0) {
    iosError.hidden = false;
    buttons.hidden = true;
  }
  return model;
}