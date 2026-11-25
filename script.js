// ============================================================
// 1. НАСТРОЙКИ — вставьте свои ключи
// ============================================================

const CONFIG = {
    // OpenWeatherMap (https://openweathermap.org/api)
    weatherApiKey: 'ВАШ_КЛЮЧ_OPENWEATHERMAP',
    defaultCity: 'Moscow', // город по умолчанию, если не удалось распознать

    // Home Assistant (http://ваш-ха:8123)
    haUrl: 'http://homeassistant.local:8123',
    haToken: 'ВАШ_LONG_LIVED_ACCESS_TOKEN',

    // Нейросеть: 'deepseek' или 'openai'
    llmProvider: 'deepseek',
    deepseekApiKey: 'ВАШ_КЛЮЧ_DEEPSEEK',
    openaiApiKey: 'ВАШ_КЛЮЧ_OPENAI',
    // Модель для DeepSeek (например, 'deepseek-chat') или OpenAI (например, 'gpt-4o-mini')
    llmModel: 'deepseek-chat',

    // ElevenLabs (https://elevenlabs.io)
    elevenLabsApiKey: 'ВАШ_КЛЮЧ_ELEVENLABS',
    elevenLabsVoiceId: '21m00Tcm4TlvDq8ikWAM', // стандартный голос Rachel

    // Yandex SpeechKit (https://cloud.yandex.ru/services/speechkit)
    yandexApiKey: 'ВАШ_IAM_ИЛИ_API_КЛЮЧ',
    yandexFolderId: 'ВАШ_FOLDER_ID', // нужен для некоторых эндпоинтов
    yandexVoice: 'filipp', // доступные голоса: filipp, alena, ermil и др.

    // Режим непрерывного диалога
    continuousMode: true,
};

// ============================================================
// 2. БАЗОВЫЕ ЭЛЕМЕНТЫ И РАСПОЗНАВАНИЕ
// ============================================================

const micBtn = document.getElementById('micBtn');
const statusEl = document.getElementById('status');
const transcriptEl = document.getElementById('transcript');
const responseEl = document.getElementById('response');

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SpeechRecognition) {
    statusEl.textContent = '❌ Браузер не поддерживает распознавание речи. Используйте Chrome или Edge.';
    micBtn.disabled = true;
    throw new Error('SpeechRecognition not supported');
}

const recognition = new SpeechRecognition();
recognition.lang = 'ru-RU';
recognition.continuous = CONFIG.continuousMode;
recognition.interimResults = true;

// Флаг, который говорит: «диалог должен продолжаться»
// (отдельно от isListening, чтобы корректно перезапускать после таймаута браузера)
let isRecognitionExpectedToRun = false;
let isSpeaking = false; // чтобы не слушать самих себя

// История диалога для нейросети
const conversationHistory = [];

// ============================================================
// 3. ОЗВУЧКА (TTS) — БРАУЗЕР / ELEVENLABS / YANDEX
// ============================================================

function getSelectedTTS() {
    const checked = document.querySelector('input[name="tts"]:checked');
    return checked ? checked.value : 'browser';
}

// --- 3.1. Браузерный TTS ---
function speakBrowser(text) {
    return new Promise((resolve) => {
        speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ru-RU';
        utterance.rate = 1;
        utterance.pitch = 1;

        const voices = speechSynthesis.getVoices();
        const ruVoice = voices.find(v => v.lang.startsWith('ru'));
        if (ruVoice) utterance.voice = ruVoice;

        utterance.onend = resolve;
        utterance.onerror = resolve;
        speechSynthesis.speak(utterance);
    });
}

// --- 3.2. ElevenLabs TTS ---
async function speakElevenLabs(text) {
    if (!CONFIG.elevenLabsApiKey || CONFIG.elevenLabsApiKey.startsWith('ВАШ')) {
        console.warn('ElevenLabs ключ не задан, переключаюсь на браузерный TTS');
        return speakBrowser(text);
    }

    try {
        const response = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${CONFIG.elevenLabsVoiceId}`,
            {
                method: 'POST',
                headers: {
                    'xi-api-key': CONFIG.elevenLabsApiKey,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: text,
                    model_id: 'eleven_multilingual_v2',
                    voice_settings: { stability: 0.5, similarity_boost: 0.75 },
                }),
            }
        );

        if (!response.ok) throw new Error(`ElevenLabs: ${response.status}`);

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);

        return new Promise((resolve) => {
            audio.onended = () => { URL.revokeObjectURL(audioUrl); resolve(); };
            audio.onerror = () => { URL.revokeObjectURL(audioUrl); resolve(); };
            audio.play();
        });
    } catch (err) {
        console.error('Ошибка ElevenLabs:', err);
        return speakBrowser(text); // fallback
    }
}

// --- 3.3. Yandex SpeechKit TTS ---
async function speakYandex(text) {
    if (!CONFIG.yandexApiKey || CONFIG.yandexApiKey.startsWith('ВАШ')) {
        console.warn('Yandex ключ не задан, переключаюсь на браузерный TTS');
        return speakBrowser(text);
    }

    try {
        // Эндпоинт v1 (простой, но требует folderId)
        // Для v3可能需要 другой эндпоинт, но v1 проще для демонстрации
        const params = new URLSearchParams({
            text: text,
            lang: 'ru-RU',
            voice: CONFIG.yandexVoice,
            folderId: CONFIG.yandexFolderId,
            format: 'mp3',
        });

        const response = await fetch(
            `https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize?${params.toString()}`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Api-Key ${CONFIG.yandexApiKey}`,
                    // Если используете IAM-токен, замените на `Bearer ${token}`
                },
            }
        );

        if (!response.ok) throw new Error(`Yandex TTS: ${response.status}`);

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);

        return new Promise((resolve) => {
            audio.onended = () => { URL.revokeObjectURL(audioUrl); resolve(); };
            audio.onerror = () => { URL.revokeObjectURL(audioUrl); resolve(); };
            audio.play();
        });
    } catch (err) {
        console.error('Ошибка Yandex TTS:', err);
        return speakBrowser(text);
    }
}

// Универсальная озвучка
async function speak(text) {
    isSpeaking = true;
    responseEl.textContent = '🤖 ' + text;

    const provider = getSelectedTTS();
    let promise;

    if (provider === 'elevenlabs') promise = speakElevenLabs(text);
    else if (provider === 'yandex') promise = speakYandex(text);
    else promise = speakBrowser(text);

    await promise;
    isSpeaking = false;
}

// ============================================================
// 4. ПОГОДА (OpenWeatherMap)
// ============================================================

async function getWeather(city = CONFIG.defaultCity) {
    if (!CONFIG.weatherApiKey || CONFIG.weatherApiKey.startsWith('ВАШ')) {
        return 'Ключ OpenWeatherMap не настроен.';
    }

    try {
        const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${CONFIG.weatherApiKey}&units=metric&lang=ru`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        const temp = Math.round(data.main.temp);
        const feelsLike = Math.round(data.main.feels_like);
        const description = data.weather[0].description;

        return `В ${data.name} сейчас ${description}, температура ${temp} градусов, ощущается как ${feelsLike}.`;
    } catch (err) {
        console.error('Ошибка погоды:', err);
        return 'Не удалось получить погоду. Проверьте название города.';
    }
}

// ============================================================
// 5. УМНЫЙ ДОМ (Home Assistant REST API)
// ============================================================

async function haRequest(endpoint, method = 'GET', body = null) {
    if (!CONFIG.haToken || CONFIG.haToken.startsWith('ВАШ')) {
        throw new Error('Home Assistant токен не настроен');
    }

    const options = {
        method,
        headers: {
            'Authorization': `Bearer ${CONFIG.haToken}`,
            'Content-Type': 'application/json',
        },
    };
    if (body) options.body = JSON.stringify(body);

    const response = await fetch(`${CONFIG.haUrl}/api/${endpoint}`, options);
    if (!response.ok) throw new Error(`HA API: ${response.status}`);
    return response.json();
}

async function turnOnLight(area) {
    // Простой пример: ищем свет в зоне (area) по entity_id, содержащему название
    // В реальном проекте лучше использовать area_id или список сущностей
    try {
        const states = await haRequest('states');
        const entity = states.find(
            (s) => s.entity_id.startsWith('light.') &&
                   s.entity_id.toLowerCase().includes(area.toLowerCase())
        );

        if (!entity) return `Не нашёл свет в зоне «${area}».`;

        await haRequest('services/light/turn_on', 'POST', {
            entity_id: entity.entity_id,
        });
        return `Включил свет: ${entity.attributes.friendly_name || entity.entity_id}`;
    } catch (err) {
        console.error('HA error:', err);
        return 'Не удалось управлять умным домом. Проверьте настройки.';
    }
}

async function turnOffLight(area) {
    try {
        const states = await haRequest('states');
        const entity = states.find(
            (s) => s.entity_id.startsWith('light.') &&
                   s.entity_id.toLowerCase().includes(area.toLowerCase())
        );

        if (!entity) return `Не нашёл свет в зоне «${area}».`;

        await haRequest('services/light/turn_off', 'POST', {
            entity_id: entity.entity_id,
        });
        return `Выключил свет: ${entity.attributes.friendly_name || entity.entity_id}`;
    } catch (err) {
        console.error('HA error:', err);
        return 'Не удалось управлять умным домом.';
    }
}

// ============================================================
// 6. НЕЙРОСЕТЬ (DeepSeek / OpenAI)
// ============================================================

async function askLLM(userText) {
    const provider = CONFIG.llmProvider;

    let apiKey, baseURL, model;

    if (provider === 'deepseek') {
        apiKey = CONFIG.deepseekApiKey;
        baseURL = 'https://api.deepseek.com/v1';
        model = CONFIG.llmModel || 'deepseek-chat';
    } else {
        apiKey = CONFIG.openaiApiKey;
        baseURL = 'https://api.openai.com/v1';
        model = CONFIG.llmModel || 'gpt-4o-mini';
    }

    if (!apiKey || apiKey.startsWith('ВАШ')) {
        return 'Ключ нейросети не настроен. Я могу отвечать только на простые команды.';
    }

    // Добавляем сообщение пользователя в историю
    conversationHistory.push({ role: 'user', content: userText });

    // Ограничиваем историю последними 10 сообщениями, чтобы не раздувать контекст
    const messages = [
        {
            role: 'system',
            content: 'Ты — голосовой помощник. Отвечай кратко, дружелюбно и по делу, так как твой ответ будет озвучен. Не используй списки, маркдаун и сложные конструкции.',
        },
        ...conversationHistory.slice(-10),
    ];

    try {
        const response = await fetch(`${baseURL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: model,
                messages: messages,
                temperature: 0.7,
                max_tokens: 500,
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`LLM API ${response.status}: ${errText}`);
        }

        const data = await response.json();
        const reply = data.choices[0].message.content.trim();

        conversationHistory.push({ role: 'assistant', content: reply });
        return reply;
    } catch (err) {
        console.error('Ошибка LLM:', err);
        return 'Не удалось получить ответ от нейросети. Проверьте ключ и подключение.';
    }
}

// ============================================================
// 7. ОБРАБОТКА КОМАНД
// ============================================================

function getTimeString() {
    return new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function getDateString() {
    return new Date().toLocaleDateString('ru-RU', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
}

async function handleCommand(text) {
    const cmd = text.toLowerCase().trim();

    // --- Быстрые встроенные команды ---
    if (cmd.includes('привет') || cmd.includes('здравствуй')) {
        return 'Привет! Чем могу помочь?';
    }
    if (cmd.includes('как тебя зовут') || cmd.includes('твоё имя')) {
        return 'Меня зовут Голосовой помощник.';
    }
    if (cmd.match(/время|который час/)) {
        return `Сейчас ${getTimeString()}`;
    }
    if (cmd.match(/дата|какое сегодня число/)) {
        return `Сегодня ${getDateString()}`;
    }
    if (cmd.includes('как дела')) {
        return 'Всё отлично! Готов помогать.';
    }
    if (cmd.includes('спасибо')) {
        return 'Всегда пожалуйста!';
    }
    if (cmd.includes('пока') || cmd.includes('до свидания')) {
        return 'До встречи!';
    }

    // --- Погода ---
    if (cmd.match(/погод|температура/)) {
        // Пытаемся вытащить город: «погода в Москве», «какая погода в Питере»
        const cityMatch = cmd.match(/(?:в|во)\s+([а-яёa-z\-]+)/i);
        const city = cityMatch ? cityMatch[1] : CONFIG.defaultCity;
        return await getWeather(city);
    }

    // --- Умный дом: свет ---
    if (cmd.match(/(включи|зажги).*свет/)) {
        const areaMatch = cmd.match(/(?:в|на|во)\s+([а-яёa-z\-]+)/i);
        const area = areaMatch ? areaMatch[1] : '';
        if (!area) return 'Уточните, где включить свет, например: «включи свет на кухне».';
        return await turnOnLight(area);
    }
    if (cmd.match(/(выключи|погаси).*свет/)) {
        const areaMatch = cmd.match(/(?:в|на|во)\s+([а-яёa-z\-]+)/i);
        const area = areaMatch ? areaMatch[1] : '';
        if (!area) return 'Уточните, где выключить свет.';
        return await turnOffLight(area);
    }

    // --- Всё остальное → нейросеть ---
    return await askLLM(text);
}

// ============================================================
// 8. УПРАВЛЕНИЕ СЛУШАНИЕМ (с непрерывным режимом)
// ============================================================

function startListening() {
    if (isRecognitionExpectedToRun || isSpeaking) return;

    transcriptEl.textContent = '';
    responseEl.textContent = '';
    isRecognitionExpectedToRun = true;

    try {
        recognition.start();
    } catch (e) {
        // Если распознавание уже запущено (например, после таймаута), игнорируем
        console.warn('start() error:', e.message);
    }
}

function stopListening() {
    isRecognitionExpectedToRun = false;
    recognition.stop();
}

micBtn.addEventListener('click', () => {
    if (isRecognitionExpectedToRun) {
        stopListening();
    } else {
        speechSynthesis.cancel(); // остановить браузерную озвучку, если играет
        startListening();
    }
});

recognition.onstart = () => {
    micBtn.classList.add('listening');
    statusEl.textContent = '🎤 Слушаю...';
};

recognition.onresult = async (event) => {
    let interim = '';
    let final = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += t;
        else interim += t;
    }

    transcriptEl.textContent = '🗣 ' + (final || interim);

    if (final) {
        statusEl.textContent = '⏳ Думаю...';
        const reply = await handleCommand(final);
        await speak(reply);
        statusEl.textContent = isRecognitionExpectedToRun ? '🎤 Слушаю...' : 'Нажмите на кнопку и говорите';
    }
};

recognition.onerror = (event) => {
    // no-speech, network, aborted — не фатальные, ждём onend для перезапуска
    if (['no-speech', 'network', 'aborted'].includes(event.error)) {
        console.warn('Speech recognition warning:', event.error);
        return;
    }

    console.error('Speech recognition error:', event.error);
    const messages = {
        'audio-capture': 'Не найден микрофон.',
        'not-allowed': 'Разрешение на микрофон не выдано.',
    };
    statusEl.textContent = '⚠️ ' + (messages[event.error] || event.error);
};

recognition.onend = () => {
    micBtn.classList.remove('listening');

    // Если диалог должен продолжаться и мы не говорим — перезапускаем с задержкой
    if (isRecognitionExpectedToRun && !isSpeaking) {
        setTimeout(() => {
            if (isRecognitionExpectedToRun && !isSpeaking) {
                try {
                    recognition.start();
                } catch (e) {
                    console.warn('restart error:', e.message);
                }
            }
        }, 150); // 150 мс, чтобы не ловить «already started»
    } else if (!isRecognitionExpectedToRun) {
        statusEl.textContent = 'Нажмите на кнопку и говорите';
    }
};

// Подгружаем голоса браузера (в Chrome они асинхронные)
speechSynthesis.onvoiceschanged = () => { speechSynthesis.getVoices(); };
