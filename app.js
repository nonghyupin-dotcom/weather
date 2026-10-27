// app.js – 화면 동작 (목록 그리기, 일정 추가)

let baseTasks = [];
let addedTasks = [];
let tasksReady = false;
let tasks = [];
let weatherByRegion = {};
const testWind = new URLSearchParams(window.location.search).get('test') === 'wind';

async function loadWeather() {
  const status = document.getElementById('weatherStatus');
  const testNotice = testWind ? ' · 강풍 시험 중: 풍속 12m/s 적용' : '';
  status.textContent = '오늘 날씨를 불러오는 중입니다.' + testNotice;
  const failedRegions = [];

  await Promise.all(Object.keys(REGIONS).map(async (region) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(buildWeatherUrl(region), { signal: controller.signal });
      if (!response.ok) throw new Error('날씨 요청 실패');
      weatherByRegion[region] = parseWeather(await response.json(), testWind);
    } catch (error) {
      failedRegions.push(region);
    } finally {
      clearTimeout(timeout);
      renderTasks();
    }
  }));

  status.textContent = failedRegions.length
    ? '날씨를 가져오지 못한 지역: ' + failedRegions.join(' · ') + '. 새로고침해 다시 시도하세요.' + testNotice
    : '오늘 날씨 (한국 시간) · 최고 기온 / 최대 풍속 / 최대 강수확률' + testNotice;
}

function isTask(task) {
  return task && typeof task.title === 'string' && task.title.trim()
    && typeof task.owner === 'string' && task.owner.trim()
    && Object.hasOwn(REGIONS, task.region) && ['야외', '고소', '실내'].includes(task.kind);
}

async function loadTasks() {
  const status = document.getElementById('taskStatus');
  status.textContent = '일정을 불러오는 중입니다.';
  try {
    const response = await fetch('data/tasks.json');
    if (!response.ok) throw new Error('일정 요청 실패');
    const data = await response.json();
    if (!Array.isArray(data) || !data.every(isTask)) throw new Error('잘못된 일정 데이터');
    baseTasks = data;
    status.textContent = '';
  } catch (error) {
    status.textContent = window.location.protocol === 'file:'
      ? '배포주소로열어주세요'
      : '기본 일정을 불러오지 못했습니다. 새로고침해 다시 시도하세요.';
  }

  // JSON을 먼저 읽고, 화면에서 추가했던 일정만 브라우저 저장소에서 합친다.
  try {
    const saved = JSON.parse(localStorage.getItem('wx_added') || '[]');
    if (!Array.isArray(saved) || !saved.every(isTask)) throw new Error('잘못된 저장 일정');
    addedTasks = saved;
  } catch (error) {
    document.getElementById('msgBox').textContent = '브라우저에 저장된 일정을 읽을 수 없습니다.';
  }
  tasks = baseTasks.concat(addedTasks);
  tasksReady = true;
  renderTasks();
}

function weatherText(w) {
  return w ? w.tempMax + '℃ · ' + w.windMax + 'm/s · ' + w.rainProb + '%' : '-';
}

function renderTasks() {
  const body = document.getElementById('taskList');
  body.innerHTML = '';
  for (const t of tasks) {
    const w = weatherByRegion[t.region];
    const r = judge(t.kind, w);
    const tr = document.createElement('tr');
    for (const v of [t.title, t.region, t.kind, t.owner, weatherText(w)]) {
      const td = document.createElement('td');
      td.textContent = v;
      tr.appendChild(td);
    }
    const td = document.createElement('td');
    td.textContent = r.text;
    td.className = r.level;
    tr.appendChild(td);
    body.appendChild(tr);
  }
}

function addTask(e) {
  e.preventDefault();
  const message = document.getElementById('msgBox');
  if (!tasksReady) {
    message.textContent = '일정을 불러온 뒤 추가해 주세요.';
    return;
  }
  const t = {
    title: document.getElementById('titleInput').value.trim(),
    region: document.getElementById('regionInput').value,
    kind: document.getElementById('kindInput').value,
    owner: document.getElementById('ownerInput').value.trim(),
  };
  if (!t.title || !t.owner) return;
  addedTasks.push(t);
  message.textContent = '';
  try {
    localStorage.setItem('wx_added', JSON.stringify(addedTasks));
  } catch (error) {
    message.textContent = '일정은 추가했지만 브라우저에 저장하지 못했습니다. 새로고침하면 사라집니다.';
  }
  e.target.reset();
  tasks = baseTasks.concat(addedTasks);
  renderTasks();
}

const today = new Date();
const todayText = [
  today.getFullYear(),
  String(today.getMonth() + 1).padStart(2, '0'),
  String(today.getDate()).padStart(2, '0'),
].join('-');
const todayDate = document.getElementById('todayDate');
todayDate.textContent = todayText;
todayDate.dateTime = todayText;

document.getElementById('taskForm').addEventListener('submit', addTask);
loadTasks();
renderTasks();
loadWeather();
