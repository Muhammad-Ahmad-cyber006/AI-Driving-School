//Default configuration
const DEFAULT_CONFIG = {
  carCanvasWidth: 300,
  networkCanvasWidth: 500,
  laneCount: 4,
  populationSize: 150,
  mutationAmount: 0.12,
  carWidth: 30,
  carHeight: 50,
  trafficBaseSpeed: 2.6,
  trafficSpeedVariance: 0.8,
  aiMaxSpeed: 5,
  stagnationSeconds: 5,
  waveSpacing: 220,
  laneJitter: 40,
  lookaheadDistance: 3200,
  cleanupBehindDistance: 1200,
  minLaneWidthFactor: 2.2,
};

const SETTINGS_STORAGE_KEY = "carSimSettings";
const BRAIN_STORAGE_KEY = "bestBrain";
const GENERATION_STORAGE_KEY = "generation";

//Safe localStorage wrapper
const storage = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      console.warn("Could not write to localStorage.");
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      console.warn("Could not clear localStorage.");
    }
  },
};

//Load saved settings or use defaults
function loadConfig() {
  const raw = storage.get(SETTINGS_STORAGE_KEY);
  if (!raw) return { ...DEFAULT_CONFIG };
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

const CONFIG = loadConfig();
//Set stagnation limit based on config
Car.stagnationFramesLimit = Math.round(CONFIG.stagnationSeconds * 60);

const carCanvas = document.getElementById("carCanvas");
carCanvas.width = computeCarCanvasWidth();
const networkCanvas = document.getElementById("networkCanvas");
networkCanvas.width = CONFIG.networkCanvasWidth;

const carCtx = carCanvas.getContext("2d");
const networkCtx = networkCanvas.getContext("2d");

const road = new Road(
  carCanvas.width / 2,
  carCanvas.width * 0.86,
  CONFIG.laneCount,
);
const startLane = Math.floor(CONFIG.laneCount / 2);

//Compute canvas width based on lane count
function computeCarCanvasWidth() {
  const minLaneWidth = CONFIG.carWidth * CONFIG.minLaneWidthFactor;
  const minRoadWidth = CONFIG.laneCount * minLaneWidth;
  const minCanvasWidth = Math.ceil(minRoadWidth / 0.86);
  return Math.max(CONFIG.carCanvasWidth, minCanvasWidth);
}

const cars = generateCars(CONFIG.populationSize);
let bestCar = cars[0];

//Load saved brain if compatible
const savedBrainRaw = storage.get(BRAIN_STORAGE_KEY);
const savedBrain = savedBrainRaw ? JSON.parse(savedBrainRaw) : null;
const brainIsUsable =
  savedBrain && isBrainCompatible(savedBrain, cars[0].brain);

if (savedBrain && !brainIsUsable) {
  console.warn(
    "Saved brain doesn't match the current network shape - starting fresh.",
  );
  storage.remove(BRAIN_STORAGE_KEY);
}

if (brainIsUsable) {
  for (let i = 0; i < cars.length; i++) {
    cars[i].brain = JSON.parse(JSON.stringify(savedBrain));
    if (i !== 0) {
      NeuralNetwork.mutate(cars[i].brain, CONFIG.mutationAmount);
    }
  }
}

let traffic = [];
let nextWaveY = cars[0].y - 220;
ensureTrafficAhead();

//Track generation count
const generation = brainIsUsable
  ? Number(storage.get(GENERATION_STORAGE_KEY) || 0) + 1
  : 1;
storage.set(GENERATION_STORAGE_KEY, generation);

//Setup event listeners
resizeCanvases();
window.addEventListener("resize", resizeCanvases);
setupSettingsPanel();

//Start animation loop
requestAnimationFrame(animate);

//Check if saved brain matches current network
function isBrainCompatible(savedBrain, referenceBrain) {
  if (
    !savedBrain?.levels ||
    savedBrain.levels.length !== referenceBrain.levels.length
  ) {
    return false;
  }
  return savedBrain.levels.every((level, i) => {
    const ref = referenceBrain.levels[i];
    return (
      level?.inputs?.length === ref.inputs.length &&
      level?.outputs?.length === ref.outputs.length
    );
  });
}

//Save best brain to localStorage
function save() {
  storage.set(BRAIN_STORAGE_KEY, JSON.stringify(bestCar.brain));
  flashStatus("Saved current best brain.");
}

//Discard saved brain
function discard() {
  storage.remove(BRAIN_STORAGE_KEY);
  storage.remove(GENERATION_STORAGE_KEY);
  flashStatus("Discarded - reload to start fresh.");
}

//Show temporary status message
function flashStatus(message) {
  const el = document.getElementById("statusMessage");
  if (!el) return;
  el.textContent = message;
  clearTimeout(flashStatus._timer);
  flashStatus._timer = setTimeout(() => (el.textContent = ""), 2200);
}

//Generate population of AI cars
function generateCars(n) {
  const result = [];
  for (let i = 0; i < n; i++) {
    result.push(
      new Car(
        road.getLaneCenter(startLane),
        100,
        CONFIG.carWidth,
        CONFIG.carHeight,
        "AI",
        CONFIG.aiMaxSpeed,
      ),
    );
  }
  return result;
}

//Spawn a wave of traffic cars
function spawnTrafficWave() {
  const laneIndexes = Array.from({ length: CONFIG.laneCount }, (_, i) => i);

  //Randomly leave 1-2 lanes open
  const openLaneCount =
    Math.random() < 0.75 ? 1 : Math.min(2, CONFIG.laneCount - 1);
  const openLanes = new Set();
  while (openLanes.size < openLaneCount) {
    openLanes.add(laneIndexes[Math.floor(Math.random() * laneIndexes.length)]);
  }

  //Create traffic cars in occupied lanes
  laneIndexes.forEach((lane) => {
    if (openLanes.has(lane)) return;

    const speed =
      CONFIG.trafficBaseSpeed +
      (Math.random() * 2 - 1) * CONFIG.trafficSpeedVariance;
    const yJitter = (Math.random() * 2 - 1) * CONFIG.laneJitter;

    traffic.push(
      new Car(
        road.getLaneCenter(lane),
        nextWaveY + yJitter,
        CONFIG.carWidth,
        CONFIG.carHeight,
        "DUMMY",
        Math.max(0.6, speed),
        getRandomColor(),
      ),
    );
  });

  nextWaveY -= CONFIG.waveSpacing;
}

//Ensure traffic is generated ahead of best car
function ensureTrafficAhead() {
  while (nextWaveY > bestCar.y - CONFIG.lookaheadDistance) {
    spawnTrafficWave();
  }
  //Remove traffic far behind
  traffic = traffic.filter(
    (car) => car.y < bestCar.y + CONFIG.cleanupBehindDistance,
  );
}

//Resize canvases to window height
function resizeCanvases() {
  carCanvas.height = window.innerHeight;
  networkCanvas.height = window.innerHeight;
}

//Main animation loop
function animate(time) {
  //Update traffic
  for (let i = 0; i < traffic.length; i++) {
    traffic[i].update(road.borders, []);
  }
  //Update AI cars
  for (let i = 0; i < cars.length; i++) {
    cars[i].update(road.borders, traffic);
  }

  //Find best car (furthest up the road)
  bestCar = cars.reduce((best, car) => (car.y < best.y ? car : best), cars[0]);

  ensureTrafficAhead();

  //Clear canvases
  carCtx.clearRect(0, 0, carCanvas.width, carCanvas.height);
  networkCtx.clearRect(0, 0, networkCanvas.width, networkCanvas.height);

  //Draw road and cars
  carCtx.save();
  carCtx.translate(0, -bestCar.y + carCanvas.height * 0.7);

  road.draw(carCtx);
  for (let i = 0; i < traffic.length; i++) {
    traffic[i].draw(carCtx);
  }
  //Draw all cars semi-transparent
  carCtx.globalAlpha = 0.2;
  for (let i = 0; i < cars.length; i++) {
    cars[i].draw(carCtx);
  }
  carCtx.globalAlpha = 1;
  //Draw best car with sensor
  bestCar.draw(carCtx, true);

  carCtx.restore();

  //Draw network visualization
  networkCtx.lineDashOffset = -time / 50;
  Visualizer.drawNetwork(networkCtx, bestCar.brain);

  updateStats();

  requestAnimationFrame(animate);
}

//Update on-screen stats
function updateStats() {
  const el = document.getElementById("stats");
  if (!el) return;
  const aliveCount = cars.filter((c) => !c.damaged).length;
  const distance = Math.max(0, Math.round(100 - bestCar.y));
  el.innerHTML =
    `Generation <b>${generation}</b> &nbsp;|&nbsp; ` +
    `Alive <b>${aliveCount}/${cars.length}</b> &nbsp;|&nbsp; ` +
    `Distance <b>${distance}m</b> &nbsp;|&nbsp; ` +
    `Traffic <b>${traffic.length}</b>`;
}

//Setup settings panel
function setupSettingsPanel() {
  const form = document.getElementById("settingsForm");
  if (!form) return;

  //Set form values from config
  form.population.value = CONFIG.populationSize;
  form.mutation.value = CONFIG.mutationAmount;
  form.laneCount.value = CONFIG.laneCount;
  form.stagnation.value = CONFIG.stagnationSeconds;

  //Handle form submission
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const next = {
      populationSize: clamp(
        Number(form.population.value) || DEFAULT_CONFIG.populationSize,
        10,
        500,
      ),
      mutationAmount: clamp(
        Number(form.mutation.value) || DEFAULT_CONFIG.mutationAmount,
        0,
        1,
      ),
      laneCount: clamp(
        Number(form.laneCount.value) || DEFAULT_CONFIG.laneCount,
        2,
        6,
      ),
      stagnationSeconds: clamp(
        Number(form.stagnation.value) || DEFAULT_CONFIG.stagnationSeconds,
        1,
        30,
      ),
    };
    storage.set(SETTINGS_STORAGE_KEY, JSON.stringify(next));
    location.reload();
  });

  //Reset settings button
  const resetButton = document.getElementById("resetSettings");
  if (resetButton) {
    resetButton.addEventListener("click", () => {
      storage.remove(SETTINGS_STORAGE_KEY);
      location.reload();
    });
  }
}
