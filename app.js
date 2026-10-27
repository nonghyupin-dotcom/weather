// app.js – 화면 동작 (목록 그리기, 일정 추가)

let taskClient = null;
let savingTask = false;
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
    taskClient = createTaskClient();
    const { data, error } = await taskClient.from('wx_tasks')
      .select('id,title,region,kind,owner').order('id', { ascending: true });
    if (error) throw error;
    if (!Array.isArray(data) || !data.every(isTask)) throw new Error('잘못된 일정 데이터');
    tasks = data;
    tasksReady = true;
    status.textContent = data.length ? '' : '등록된 일정이 없습니다. 새 일정을 추가해 주세요.';
  } catch (error) {
    status.textContent = '일정을 불러오지 못했습니다. config.js의 주소·공개용 키와 setup.sql 실행 여부를 확인한 뒤 새로고침해 주세요.';
  }
  renderTasks();
}

function createTaskClient() {
  if (typeof SUPABASE_URL !== 'string' || !SUPABASE_URL
      || typeof SUPABASE_PUBLIC_KEY !== 'string' || !SUPABASE_PUBLIC_KEY) {
    throw new Error('Supabase 설정 필요');
  }
  // 공개용 publishable 키 또는 기존 anon 키만 사용한다.
  let publicKey = /^sb_publishable_[A-Za-z0-9_-]+$/.test(SUPABASE_PUBLIC_KEY);
  if (!publicKey) {
    try {
      const payload = SUPABASE_PUBLIC_KEY.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      publicKey = JSON.parse(atob(payload)).role === 'anon';
    } catch (error) {
      publicKey = false;
    }
  }
  if (!publicKey || new URL(SUPABASE_URL).protocol !== 'https:') {
    throw new Error('주소 또는 공개용 키 확인 필요');
  }
  if (!window.supabase?.createClient) throw new Error('supabase-js 로딩 실패');
  return window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
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

async function addTask(e) {
  e.preventDefault();
  const message = document.getElementById('msgBox');
  if (savingTask) return;
  if (!tasksReady) {
    message.textContent = 'Supabase 연결과 일정 로딩이 완료된 뒤 추가해 주세요.';
    return;
  }
  const t = {
    title: document.getElementById('titleInput').value.trim(),
    region: document.getElementById('regionInput').value,
    kind: document.getElementById('kindInput').value,
    owner: document.getElementById('ownerInput').value.trim(),
  };
  if (!isTask(t)) {
    message.textContent = '일정·담당을 입력하고 지역과 구분을 선택해 주세요.';
    return;
  }
  const form = e.target;
  const button = document.getElementById('addTaskButton');
  savingTask = true;
  button.disabled = true;
  message.textContent = '일정을 저장하는 중입니다.';
  try {
    const { data, error } = await taskClient.from('wx_tasks').insert(t)
      .select('id,title,region,kind,owner').single();
    if (error) throw error;
    if (!isTask(data)) throw new Error('잘못된 저장 응답');
    tasks.push(data);
    form.reset();
    renderTasks();
    document.getElementById('taskStatus').textContent = '';
    message.textContent = '일정을 Supabase에 저장했습니다.';
  } catch (error) {
    message.textContent = '일정 저장을 확인하지 못했습니다. 입력 내용은 유지했습니다. 새로고침해 목록을 확인한 뒤 다시 시도해 주세요.';
  } finally {
    savingTask = false;
    button.disabled = false;
  }
}

function downloadJudgment() {
  const rows = Array.from(document.getElementById('taskList').rows,
    (row) => Array.from(row.cells, (cell) => cell.textContent));
  const markdown = createJudgmentMarkdown(todayText, rows, testWind);
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = '현장일정_판단_' + todayText + '.md';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
document.getElementById('downloadJudgment').addEventListener('click', downloadJudgment);
loadTasks();
renderTasks();
loadWeather();
