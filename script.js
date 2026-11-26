// ============================================================
// 1. НАСТРОЙКИ — ВСТАВЬТЕ СВОИ КЛЮЧИ
// ============================================================
const CONFIG = {
    // ---------- OpenWeatherMap ----------
    weatherApiKey: '4b31256732a1ff6a0b3d80ee3dbe6f32',
    defaultCity: 'Sevastopol',

    // ---------- DeepSeek ----------
    // ВАЖНО: старый ключ sk-417d... скомпрометирован — создайте НОВЫЙ
    deepseekApiKey: 'sk-330d6470bef1442e96ce381659946fe6',
    deepseekModel: 'deepseek-chat',

    // ---------- Home Assistant ----------
    haUrl: 'http://localhost:8123',
    haToken: 'ВСТАВЬТЕ_ТОКЕН',

    // ---------- Яндекс.Станция ----------
    yandexStationEntity: 'media_player.yandex_station_mini',

    // ---------- Новости (RSS) ----------
    rssUrl: 'https://lenta.ru/rss/news',
};

const PERSONAS = {
    normal: 'Ты — голосовой помощник. Отвечай кратко, дружелюбно и по делу. Без markdown и списков — ответ может быть озвучен.',
    joker: 'Ты — весёлый голосовой помощник. Отвечай с юмором, шутками, но по делу. Кратко. Без markdown.',
    scientist: 'Ты — голосовой помощник-учёный. Отвечай точно, добавляй факты и объяснения. Кратко. Без markdown.',
    sarcastic: 'Ты — голосовой помощник с сарказмом. Отвечай иронично, но полезно. Кратко. Без markdown.',
    philosopher: 'Ты — голосовой помощник-философ. Отвечай мудро, с размышлениями. Кратко. Без markdown.',
};

// ============================================================
// 2. DOM
// ============================================================
const $ = id => document.getElementById(id);
const micBtn = $('micBtn'), statusEl = $('status'), transcriptEl = $('transcript'),
      responseEl = $('response'), textInput = $('textInput'), sendBtn = $('sendBtn'),
      voiceSelect = $('voiceSelect'), volumeRange = $('volumeRange'),
      themeBtn = $('themeBtn'), personaSelect = $('personaSelect'),
      historyBtn = $('historyBtn'), historyPanel = $('historyPanel'), historyList = $('historyList'),
      clearHistoryBtn = $('clearHistoryBtn'),
      copyBtn = $('copyBtn'), todoBtn = $('todoBtn'), todoPanel = $('todoPanel'),
      todoInput = $('todoInput'), todoAddBtn = $('todoAddBtn'), todoListEl = $('todoList'),
      clearBtn = $('clearBtn'), wakeBtn = $('wakeBtn'),
      timerEl = $('timer'),
      profileBtn = $('profileBtn'), profilePanel = $('profilePanel'),
      nameInput = $('nameInput'), saveNameBtn = $('saveNameBtn'),
      logoutBtn = $('logoutBtn'), profileHint = $('profileHint');

// ============================================================
// 3. СОСТОЯНИЕ
// ============================================================
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isRecognitionExpectedToRun = false;
let isSpeaking = false;
let lastAssistantReply = '';

let conversationHistory = loadFromStorage('convHistory', []);
let todos = loadFromStorage('todos', []);
let userName = localStorage.getItem('userName') || '';
let currentTimer = null;
let timerInterval = null;
let cachedWeather = null;
let cachedWeatherTime = 0;

const WEATHER_CACHE_MS = 10 * 60 * 1000;

// ============================================================
// 4. ХРАНИЛИЩЕ
// ============================================================
function loadFromStorage(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; }
    catch { return fallback; }
}
function saveToStorage(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}
function saveUserName(name) {
    userName = name.trim();
    localStorage.setItem('userName', userName);
    updateGreeting();
}
function updateGreeting() {
    const h1 = document.querySelector('h1');
    if (userName) {
        h1.textContent = `Привет, ${userName}!`;
        profileHint.textContent = `Вы вошли как ${userName}. Нейросеть обращается к вам по имени.`;
        nameInput.value = userName;
        document.body.classList.remove('logged-out');
    } else {
        h1.textContent = 'Голосовой помощник';
        profileHint.textContent = 'Имя сохраняется только в вашем браузере. Нейросеть будет к вам обращаться по имени.';
        nameInput.value = '';
        document.body.classList.add('logged-out');
    }
}

// ============================================================
// 5. ТЕМА
// ============================================================
const savedTheme = localStorage.getItem('theme') || (() => {
    const h = new Date().getHours();
    return (h >= 7 && h < 20) ? 'light' : 'dark';
})();
document.body.setAttribute('data-theme', savedTheme);
themeBtn.textContent = savedTheme === 'dark' ? '🌙' : '☀️';

themeBtn.addEventListener('click', () => {
    const cur = document.body.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    themeBtn.textContent = next === 'dark' ? '🌙' : '☀️';
});

// ============================================================
// 6. РАСПОЗНАВАНИЕ РЕЧИ
// ============================================================
if (!SpeechRecognition) {
    statusEl.textContent = '❌ Браузер не поддерживает распознавание. Можно писать текстом.';
    micBtn.disabled = true;
} else {
    recognition = new SpeechRecognition();
    recognition.lang = 'ru-RU';
    recognition.continuous = true;
    recognition.interimResults = true;
}

// ============================================================
// 7. TTS
// ============================================================
let ruVoices = [];
function refreshVoices() {
    const all = speechSynthesis.getVoices();
    ruVoices = all.filter(v => v.lang.startsWith('ru'));
    voiceSelect.innerHTML = '';
    if (ruVoices.length === 0) {
        voiceSelect.innerHTML = '<option>Нет русских голосов</option>';
        return;
    }
    ruVoices.forEach((v, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = `${v.name} (${v.lang})`;
        voiceSelect.appendChild(opt);
    });
    const saved = localStorage.getItem('voiceIdx');
    if (saved !== null && ruVoices[saved]) voiceSelect.value = saved;
}
speechSynthesis.onvoiceschanged = refreshVoices;
refreshVoices();

voiceSelect.addEventListener('change', () => localStorage.setItem('voiceIdx', voiceSelect.value));
volumeRange.addEventListener('input', () => localStorage.setItem('volume', volumeRange.value));
volumeRange.value = localStorage.getItem('volume') || 1;

function speakBrowser(text) {
    return new Promise((resolve) => {
        speechSynthesis.cancel();
        const doSpeak = () => {
            const u = new SpeechSynthesisUtterance(text);
            u.lang = 'ru-RU';
            u.rate = 1;
            u.volume = parseFloat(volumeRange.value);
            const idx = parseInt(voiceSelect.value, 10);
            if (!isNaN(idx) && ruVoices[idx]) u.voice = ruVoices[idx];
            else if (ruVoices[0]) u.voice = ruVoices[0];
            u.onend = resolve;
            u.onerror = resolve;
            micBtn.classList.add('speaking');
            speechSynthesis.speak(u);
        };
        if (speechSynthesis.getVoices().length === 0) {
            speechSynthesis.onvoiceschanged = () => { refreshVoices(); doSpeak(); };
        } else {
            doSpeak();
        }
    });
}

async function speak(text) {
    isSpeaking = true;
    micBtn.classList.add('speaking');
    await speakBrowser(text);
    micBtn.classList.remove('speaking');
    isSpeaking = false;
}

// ============================================================
// 8. ОТПРАВКА ОТВЕТА
// ============================================================
async function sendReply(text, mode) {
    lastAssistantReply = text;
    responseEl.textContent = '🤖 ' + text;
    addHistory('assistant', text);
    if (mode === 'voice') await speak(text);
}

// ============================================================
// 9. HOME ASSISTANT
// ============================================================
async function haCallService(domain, service, data) {
    if (!CONFIG.haToken || CONFIG.haToken.startsWith('ВСТАВЬТЕ')) return false;
    try {
        const r = await fetch(`${CONFIG.haUrl}/api/services/${domain}/${service}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${CONFIG.haToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        return r.ok;
    } catch (e) { console.error('HA:', e); return false; }
}
async function haGetStates() {
    if (!CONFIG.haToken || CONFIG.haToken.startsWith('ВСТАВЬТЕ')) return [];
    try {
        const r = await fetch(`${CONFIG.haUrl}/api/states`, {
            headers: { 'Authorization': `Bearer ${CONFIG.haToken}` },
        });
        return r.ok ? await r.json() : [];
    } catch { return []; }
}

// ============================================================
// 10. ПОГОДА
// ============================================================
async function getWeather(city = CONFIG.defaultCity) {
    if (!CONFIG.weatherApiKey || CONFIG.weatherApiKey.startsWith('ВСТАВЬТЕ'))
        return 'Ключ OpenWeatherMap не задан.';
    const cacheKey = city.toLowerCase();
    if (cachedWeather && cachedWeather.key === cacheKey &&
        Date.now() - cachedWeatherTime < WEATHER_CACHE_MS) {
        return cachedWeather.text;
    }
    try {
        const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${CONFIG.weatherApiKey}&units=metric&lang=ru`;
        const r = await fetch(url);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        const text = `В ${d.name} сейчас ${d.weather[0].description}, ${Math.round(d.main.temp)} градусов, ощущается как ${Math.round(d.main.feels_like)}.`;
        cachedWeather = { key: cacheKey, text };
        cachedWeatherTime = Date.now();
        return text;
    } catch (e) {
        return `Не удалось получить погоду для «${city}».`;
    }
}

// ============================================================
// 11. НОВОСТИ
// ============================================================
async function getNews(limit = 5) {
    try {
        const url = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(CONFIG.rssUrl)}`;
        const r = await fetch(url);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        const items = (data.items || []).slice(0, limit);
        if (items.length === 0) return 'Новостей не нашлось.';
        return 'Главные новости: ' + items.map((it, i) => `${i + 1}. ${it.title}`).join('. ');
    } catch (e) {
        console.error(e);
        return 'Не удалось загрузить новости.';
    }
}

// ============================================================
// 12. КУРСЫ ВАЛЮТ
// ============================================================
async function getCurrency(base = 'USD', target = 'RUB') {
    try {
        const r = await fetch(`https://open.er-api.com/v6/latest/${base}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        const rate = data.rates[target];
        if (!rate) return `Курс ${base}/${target} не найден.`;
        return `1 ${base} = ${rate.toFixed(2)} ${target}.`;
    } catch (e) {
        return 'Не удалось получить курс валют.';
    }
}

// ============================================================
// 13. DEEPSEEK
// ============================================================
async function askLLM(userText) {
    if (!CONFIG.deepseekApiKey || CONFIG.deepseekApiKey.startsWith('ВСТАВЬТЕ'))
        return 'Ключ DeepSeek не задан.';

    conversationHistory.push({ role: 'user', content: userText });
    const persona = PERSONAS[personaSelect.value] || PERSONAS.normal;
    let personaText = persona;
    if (userName) {
        personaText += ` Обращайся к пользователю по имени: ${userName}. Если здороваешься — поздоровайся лично.`;
    }
    const messages = [
        { role: 'system', content: personaText },
        ...conversationHistory.slice(-10),
    ];

    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const r = await fetch('https://api.deepseek.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${CONFIG.deepseekApiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: CONFIG.deepseekModel,
                    messages,
                    temperature: 0.7,
                    max_tokens: 400,
                }),
            });
            if (r.status === 429 || r.status >= 500) {
                await new Promise(res => setTimeout(res, 2000 * (attempt + 1)));
                continue;
            }
            if (!r.ok) throw new Error(`DeepSeek ${r.status}`);
            const data = await r.json();
            const reply = data.choices[0].message.content.trim();
            conversationHistory.push({ role: 'assistant', content: reply });
            saveToStorage('convHistory', conversationHistory);
            return reply;
        } catch (e) {
            if (attempt === 2) {
                console.error('LLM error:', e);
                return 'Не удалось связаться с нейросетью.';
            }
            await new Promise(res => setTimeout(res, 1000));
        }
    }
    return 'Нейросеть временно недоступна.';
}

// ============================================================
// 14. КАЛЬКУЛЯТОР
// ============================================================
function safeCalc(expr) {
    expr = expr.replace(/,/g, '.')
               .replace(/[хx×]/gi, '*')
               .replace(/[:÷]/g, '/')
               .replace(/[−–—]/g, '-')
               .replace(/\^/g, '**')
               .replace(/корень из\s*/gi, 'Math.sqrt')
               .replace(/(\d+)%/g, '($1/100)')
               .replace(/\s+/g, '');

    if (!/^[\d+\-*/().Mathsqrtpow%*]+$/i.test(expr)) throw new Error('Недопустимые символы');
    if (expr.length > 100) throw new Error('Слишком длинное выражение');

    // eslint-disable-next-line no-new-func
    const result = Function('"use strict"; return (' + expr + ')')();
    if (typeof result !== 'number' || !isFinite(result)) throw new Error('Не число');
    return result;
}

function tryCalc(text) {
    let t = text.toLowerCase().trim();
    t = t.replace(/^(сколько будет|посчитай|вычисли|калькулятор|рассчитай)\s*/i, '')
         .replace(/\?+$/, '')
         .trim();

    t = t
        .replace(/\s*плюс\s*/g, '+')
        .replace(/\s*минус\s*/g, '-')
        .replace(/\s*умножить на\s*/g, '*')
        .replace(/\s*умножить\s*/g, '*')
        .replace(/\s*разделить на\s*/g, '/')
        .replace(/\s*разделить\s*/g, '/')
        .replace(/\s*делить на\s*/g, '/')
        .replace(/\s*в степени\s*/g, '**')
        .replace(/\s*корень из\s*/g, 'sqrt');

    if (!/[\d]/.test(t)) return null;
    if (!/[+\-*/^%]|sqrt/.test(t)) return null;

    try {
        const result = safeCalc(t);
        return Math.round(result * 1e10) / 1e10;
    } catch {
        return null;
    }
}

// ============================================================
// 15. ИГРЫ
// ============================================================
let guessGame = null;
let quizGame = null;

function rollDice() { return `Выпало ${Math.floor(Math.random() * 6) + 1}.`; }
function flipCoin() { return Math.random() < 0.5 ? 'Орёл!' : 'Решка!'; }
function randomJoke() {
    const jokes = [
        'Программист ставит на ночь два стакана: один с водой, другой пустой — на случай, если захочет пить, и если не захочет.',
        'Почему программисты путают Хэллоуин и Рождество? Oct 31 == Dec 25.',
        '— Как называется боязнь программистов? — Кодофобия.',
        'Муж жене: — Дорогая, я купил тебе новый телефон! — А какой? — Не знаю, но у него ещё и стиральная машинка есть.',
    ];
    return jokes[Math.floor(Math.random() * jokes.length)];
}
function randomAdvice() {
    const advice = [
        'Не бойтесь начинать сначала — это шанс сделать лучше.',
        'Улыбнитесь прохожему. Это может изменить чей-то день.',
        'Иногда лучший ответ — тишина.',
        'Маленькие шаги каждый день дают большие результаты.',
        'Отдых — это тоже работа.',
    ];
    return advice[Math.floor(Math.random() * advice.length)];
}
function startGuessGame() {
    guessGame = { secret: Math.floor(Math.random() * 100) + 1, attempts: 0 };
    return 'Я загадал число от 1 до 100. Попробуй угадать!';
}
function playGuess(n) {
    if (!guessGame) return 'Игра не начата. Скажи: «Угадай число».';
    guessGame.attempts++;
    if (n === guessGame.secret) {
        const a = guessGame.attempts;
        guessGame = null;
        return `Угадал! Это ${n}. Понадобилось ${a} попыток. 🎉`;
    }
    return n < guessGame.secret ? `Больше. (попытка ${guessGame.attempts})` : `Меньше. (попытка ${guessGame.attempts})`;
}
async function startQuiz() {
    quizGame = { score: 0, current: null };
    const q = await askLLM('Задай один короткий вопрос для викторины с 4 вариантами ответов (А, Б, В, Г). В формате: вопрос. А) ... Б) ... В) ... Г) ... Правильный ответ: X. Не раскрывай ответ сразу, просто напиши вопрос и варианты.');
    quizGame.current = q;
    return q + ' Какой твой ответ?';
}
async function answerQuiz(ans) {
    if (!quizGame || !quizGame.current) return 'Викторина не начата. Скажи: «Викторина».';
    const check = await askLLM(`Проверь ответ. Вопрос: ${quizGame.current}. Пользователь ответил: ${ans}. Ответь коротко: правильно или неправильно, и назови правильный вариант.`);
    quizGame.current = null;
    return check + ' Скажи «Викторина», чтобы играть дальше.';
}
async function tellStory() {
    return await askLLM('Расскажи короткую добрую сказку на ночь (4-6 предложений) про дракона и робота. Без markdown.');
}

// ============================================================
// 16. ТАЙМЕРЫ
// ============================================================
function parseDuration(text) {
    const m = text.match(/(\d+)\s*(сек|мин|час|ч|с|м)/i);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    const unit = m[2].toLowerCase();
    if (unit.startsWith('сек') || unit === 'с') return n * 1000;
    if (unit.startsWith('мин') || unit === 'м') return n * 60 * 1000;
    if (unit.startsWith('час') || unit === 'ч') return n * 60 * 60 * 1000;
    return null;
}

function startTimer(ms) {
    if (currentTimer) clearTimeout(currentTimer);
    if (timerInterval) clearInterval(timerInterval);
    const endsAt = Date.now() + ms;
    timerEl.style.display = 'block';
    const tick = () => {
        const left = Math.max(0, endsAt - Date.now());
        const s = Math.ceil(left / 1000);
        timerEl.textContent = `⏳ ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    };
    tick();
    timerInterval = setInterval(tick, 1000);
    currentTimer = setTimeout(async () => {
        clearInterval(timerInterval);
        timerEl.style.display = 'none';
        await speak('Время вышло!');
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.connect(g); g.connect(ctx.destination);
            o.frequency.value = 880;
            g.gain.value = 0.3;
            o.start();
            setTimeout(() => { o.stop(); ctx.close(); }, 800);
        } catch {}
    }, ms);
}

function beep(freq = 660, duration = 120) {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value = freq;
        g.gain.value = 0.08;
        o.start();
        setTimeout(() => { o.stop(); ctx.close(); }, duration);
    } catch {}
}

// ============================================================
// 17. СПИСОК ДЕЛ
// ============================================================
function renderTodos() {
    todoListEl.innerHTML = '';
    todos.forEach((t, i) => {
        const li = document.createElement('li');
        li.className = 'todo-item' + (t.done ? ' done' : '');
        li.innerHTML = `<span class="todo-text">${escapeHtml(t.text)}</span><button class="todo-del">×</button>`;
        li.querySelector('.todo-text').addEventListener('click', () => {
            todos[i].done = !todos[i].done;
            saveToStorage('todos', todos);
            renderTodos();
        });
        li.querySelector('.todo-del').addEventListener('click', () => {
            todos.splice(i, 1);
            saveToStorage('todos', todos);
            renderTodos();
        });
        todoListEl.appendChild(li);
    });
}
function addTodo(text) {
    if (!text.trim()) return;
    todos.push({ text: text.trim(), done: false });
    saveToStorage('todos', todos);
    renderTodos();
}
function speakTodos() {
    if (todos.length === 0) return 'Список дел пуст.';
    const pending = todos.filter(t => !t.done);
    if (pending.length === 0) return 'Все задачи выполнены!';
    return 'В списке: ' + pending.map((t, i) => `${i + 1}. ${t.text}`).join('. ');
}
function clearDoneTodos() {
    todos = todos.filter(t => !t.done);
    saveToStorage('todos', todos);
    renderTodos();
}

todoAddBtn.addEventListener('click', () => { addTodo(todoInput.value); todoInput.value = ''; });
todoInput.addEventListener('keydown', e => { if (e.key === 'Enter') { addTodo(todoInput.value); todoInput.value = ''; } });
renderTodos();

// ============================================================
// 18. ИСТОРИЯ
// ============================================================
function addHistory(role, text) {
    const item = document.createElement('div');
    item.className = `history-item ${role}`;
    item.textContent = (role === 'user' ? '👤 ' : '🤖 ') + text;
    historyList.appendChild(item);
}
function renderHistory() {
    historyList.innerHTML = '';
    conversationHistory.forEach(msg => {
        const item = document.createElement('div');
        item.className = `history-item ${msg.role === 'user' ? 'user' : 'assistant'}`;
        item.textContent = (msg.role === 'user' ? '👤 ' : '🤖 ') + msg.content;
        historyList.appendChild(item);
    });
}
renderHistory();

clearHistoryBtn.addEventListener('click', () => {
    conversationHistory = [];
    saveToStorage('convHistory', conversationHistory);
    historyList.innerHTML = '';
});

// ============================================================
// 19. УТИЛИТЫ
// ============================================================
function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function getTimeString() { return new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); }
function getDateString() {
    return new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// ============================================================
// 20. ОБРАБОТКА КОМАНД
// ============================================================
async function handleCommand(text) {
    const cmd = text.toLowerCase().trim();

    // --- Стоп ---
    if (cmd.match(/^(стоп|тихо|замолчи)$/)) {
        speechSynthesis.cancel();
        return 'Молчу.';
    }

    // --- Калькулятор ---
    if (cmd.match(/посчитай|сколько будет|вычисли|калькулятор|рассчитай|плюс|минус|умножить|разделить|корень из|в степени|[\d]\s*[+\-*/^%]\s*[\d]/)) {
        const result = tryCalc(cmd);
        if (result !== null) return `Получается ${result}.`;
        if (cmd.match(/посчитай|сколько будет|вычисли|калькулятор/)) {
            return 'Не смог разобрать выражение. Попробуйте, например: «Сколько будет 15 умножить на 8».';
        }
    }

    // --- Приветствие ---
    if (cmd.match(/^(привет|здравствуй|хай)/)) {
        return userName ? `Привет, ${userName}! Чем помочь?` : 'Привет! Чем помочь?';
    }
    if (cmd.match(/как меня зовут|моё имя/)) {
        return userName ? `Вас зовут ${userName}.` : 'Вы пока не представились. Откройте профиль 👤 и введите имя.';
    }
    if (cmd.match(/который час|сколько времени/)) return `Сейчас ${getTimeString()}.`;
    if (cmd.match(/какая дата|какое сегодня число/)) return `Сегодня ${getDateString()}.`;
    if (cmd.includes('как дела')) return 'Всё отлично! Готов помогать.';
    if (cmd.includes('спасибо')) return 'Всегда пожалуйста!';
    if (cmd.match(/^(пока|до свидания)/)) return 'До встречи!';
    if (cmd.match(/как тебя зовут|твоё имя/)) return 'Меня зовут Голосовой помощник.';

    // --- Погода ---
    if (cmd.match(/погод|температура/)) {
        const cityMatch = cmd.match(/(?:в|во)\s+([а-яёa-z\-]+)/i);
        const city = cityMatch ? cityMatch[1] : CONFIG.defaultCity;
        return await getWeather(city);
    }

    // --- Новости ---
    if (cmd.match(/новост|что нового/)) return await getNews(5);

    // --- Курсы ---
    if (cmd.match(/курс|валют|доллар|евро|биткоин/)) {
        if (cmd.includes('биткоин') || cmd.includes('btc')) {
            try {
                const r = await fetch('https://api.coindesk.com/v1/bpi/currentprice/RUB.json');
                if (r.ok) {
                    const d = await r.json();
                    return `Биткоин стоит ${Math.round(d.bpi.RUB.rate_float).toLocaleString('ru-RU')} рублей.`;
                }
            } catch {}
            return 'Не удалось получить курс биткоина.';
        }
        const base = cmd.includes('евро') ? 'EUR' : 'USD';
        return await getCurrency(base, 'RUB');
    }

    // --- Таймер ---
    if (cmd.match(/таймер|напомни через/)) {
        const ms = parseDuration(cmd);
        if (!ms) return 'Не понял длительность. Скажите, например: «Таймер на 5 минут».';
        startTimer(ms);
        const mins = Math.round(ms / 60000);
        return `Таймер на ${mins} ${mins === 1 ? 'минуту' : 'минут'} запущен.`;
    }

    // --- Список дел ---
    if (cmd.match(/добавь (в список|задачу|дело)/)) {
        const m = cmd.match(/добавь (?:в список|задачу|дело)[:\s]+(.+)/i);
        if (m) { addTodo(m[1]); return 'Добавил: ' + m[1]; }
        return 'Что добавить?';
    }
    if (cmd.match(/что в списке|мои дела|список дел/)) return speakTodos();
    if (cmd.match(/очисти выполненные/)) { clearDoneTodos(); return 'Убрал выполненные задачи.'; }

    // --- Игры ---
    if (cmd.match(/кубик|брось кубик/)) return rollDice();
    if (cmd.match(/монетк|брось монету/)) return flipCoin();
    if (cmd.match(/шутк|пошути/)) return randomJoke();
    if (cmd.match(/совет|посоветуй/)) return randomAdvice();
    if (cmd.match(/угадай число/)) return startGuessGame();
    if (guessGame) {
        const n = parseInt(cmd, 10);
        if (!isNaN(n) && n >= 1 && n <= 100) return playGuess(n);
    }
    if (cmd.match(/викторин/)) return await startQuiz();
    if (quizGame && quizGame.current) return await answerQuiz(text);
    if (cmd.match(/сказк/)) return await tellStory();
    if (cmd.match(/спокойной ночи/)) {
        await speak('Спокойной ночи! Отдыхай.');
        return 'Спокойной ночи!';
    }
    if (cmd.match(/переведи/)) {
        const m = text.match(/переведи[:\s]+(.+)/i);
        if (m) return await askLLM(`Переведи на английский: "${m[1]}". Ответь только переводом.`);
    }

    // --- Свет ---
    if (cmd.match(/(включи|зажги).*свет/)) {
        const area = (cmd.match(/(?:в|на|во)\s+([а-яёa-z\-]+)/i) || [])[1];
        if (!area) return 'Уточните, где включить свет.';
        const ok = await haCallService('light', 'turn_on', { area_id: area });
        return ok ? `Включаю свет: ${area}.` : 'Не удалось управлять светом.';
    }
    if (cmd.match(/(выключи|погаси).*свет/)) {
        const area = (cmd.match(/(?:в|на|во)\s+([а-яёa-z\-]+)/i) || [])[1];
        if (!area) return 'Уточните, где выключить свет.';
        const ok = await haCallService('light', 'turn_off', { area_id: area });
        return ok ? `Выключаю свет: ${area}.` : 'Не удалось управлять светом.';
    }

    // --- Открыть сайт ---
    const openMatch = cmd.match(/открой\s+(.+)/);
    if (openMatch) {
        const map = { 'ютуб': 'https://youtube.com', 'youtube': 'https://youtube.com',
                      'гугл': 'https://google.com', 'google': 'https://google.com',
                      'вк': 'https://vk.com', 'телеграм': 'https://web.telegram.org' };
        const name = openMatch[1];
        const url = map[name];
        if (url) { window.open(url, '_blank'); return `Открываю ${name}.`; }
    }

    // --- Всё остальное → DeepSeek ---
    return await askLLM(text);
}

// ============================================================
// 21. ТЕКСТОВЫЙ ВВОД
// ============================================================
async function handleTextSubmit() {
    const text = textInput.value.trim();
    if (!text) return;
    textInput.value = '';
    sendBtn.disabled = true;
    statusEl.textContent = '⏳ Думаю...';
    transcriptEl.textContent = '⌨️ ' + text;
    addHistory('user', text);

    try {
        const reply = await handleCommand(text);
        await sendReply(reply, 'text');
        statusEl.textContent = 'Нажмите на шар или напишите сообщение';
    } catch (e) {
        console.error(e);
        responseEl.textContent = '⚠️ Ошибка обработки';
    } finally {
        sendBtn.disabled = false;
        textInput.focus();
    }
}
sendBtn.addEventListener('click', handleTextSubmit);
textInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); handleTextSubmit(); }
});

// ============================================================
// 22. ГОЛОСОВОЙ РЕЖИМ
// ============================================================
function forceStopAndReset() {
    isRecognitionExpectedToRun = false;
    isSpeaking = false;
    try { recognition?.abort(); } catch {}
    speechSynthesis.cancel();
    micBtn.classList.remove('listening', 'speaking');
    statusEl.textContent = 'Нажмите на шар или напишите сообщение';
}

function startListening() {
    if (!recognition) return;
    forceStopAndReset();
    beep(660, 100);
    setTimeout(() => {
        isRecognitionExpectedToRun = true;
        transcriptEl.textContent = '';
        responseEl.textContent = '';
        try { recognition.start(); } catch (e) { console.warn(e.message); isRecognitionExpectedToRun = false; }
    }, 100);
}

micBtn.addEventListener('click', () => {
    if (isRecognitionExpectedToRun || isSpeaking) forceStopAndReset();
    else startListening();
});

if (recognition) {
    recognition.onstart = () => {
        micBtn.classList.add('listening');
        statusEl.textContent = '🎤 Слушаю...';
    };
    recognition.onresult = async (event) => {
        let finalText = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) finalText += event.results[i][0].transcript;
        }
        if (finalText) {
            beep(440, 100);
            transcriptEl.textContent = '🗣 ' + finalText;
            statusEl.textContent = '⏳ Думаю...';
            addHistory('user', finalText);
            const reply = await handleCommand(finalText);
            await sendReply(reply, 'voice');
            statusEl.textContent = isRecognitionExpectedToRun ? '🎤 Слушаю...' : 'Нажмите на шар';
        }
    };
    recognition.onerror = (e) => {
        if (['no-speech', 'aborted'].includes(e.error)) return;
        console.error('Speech:', e.error);
    };
    recognition.onend = () => {
        micBtn.classList.remove('listening');
        if (isRecognitionExpectedToRun && !isSpeaking) {
            setTimeout(() => {
                if (isRecognitionExpectedToRun && !isSpeaking) {
                    try { recognition.start(); } catch {}
                }
            }, 150);
        }
    };
}

// ============================================================
// 23. ТУЛБАР
// ============================================================
copyBtn.addEventListener('click', async () => {
    if (!lastAssistantReply) return;
    try {
        await navigator.clipboard.writeText(lastAssistantReply);
        copyBtn.textContent = '✅';
        setTimeout(() => copyBtn.textContent = '📋', 1200);
    } catch {}
});

todoBtn.addEventListener('click', () => {
    todoPanel.classList.toggle('open');
    historyPanel.classList.remove('open');
    profilePanel.classList.remove('open');
});

historyBtn.addEventListener('click', () => {
    historyPanel.classList.toggle('open');
    todoPanel.classList.remove('open');
    profilePanel.classList.remove('open');
});

clearBtn.addEventListener('click', () => {
    conversationHistory = [];
    saveToStorage('convHistory', conversationHistory);
    historyList.innerHTML = '';
    transcriptEl.textContent = '';
    responseEl.textContent = '';
    lastAssistantReply = '';
});

// Wake word
let wakeMode = false;
wakeBtn.addEventListener('click', () => {
    wakeMode = !wakeMode;
    wakeBtn.classList.toggle('active', wakeMode);
    if (wakeMode) {
        statusEl.textContent = '👂 Жду фразу «Привет, помощник»...';
        if (!isRecognitionExpectedToRun) startListening();
    } else {
        forceStopAndReset();
    }
});

// ============================================================
// 24. ПРОФИЛЬ
// ============================================================
profileBtn.addEventListener('click', () => {
    profilePanel.classList.toggle('open');
    todoPanel.classList.remove('open');
    historyPanel.classList.remove('open');
});

saveNameBtn.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (!name) {
        profileHint.textContent = 'Введите имя, чтобы сохранить.';
        return;
    }
    saveUserName(name);
    profileHint.textContent = `Готово! Теперь я зову вас ${name}.`;
    setTimeout(() => profilePanel.classList.remove('open'), 1200);
});

nameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') saveNameBtn.click();
});

logoutBtn.addEventListener('click', () => {
    if (confirm('Выйти из профиля? Имя будет удалено.')) {
        localStorage.removeItem('userName');
        saveUserName('');
    }
});

// ============================================================
// 25. PWA
// ============================================================
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
}

// ============================================================
// 26. ОФЛАЙН / ОНЛАЙН
// ============================================================
window.addEventListener('offline', () => statusEl.textContent = '📴 Нет интернета');
window.addEventListener('online', () => statusEl.textContent = 'Нажмите на шар или напишите сообщение');

// ============================================================
// 27. ПРОГРЕВ + ИНИЦИАЛИЗАЦИЯ
// ============================================================
updateGreeting();
speechSynthesis.getVoices();
refreshVoices();