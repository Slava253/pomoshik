// ============================================================
// 1. НАСТРОЙКИ
// ============================================================
const CONFIG = {
    // --- Нейросеть (DeepSeek/OpenAI) ---
    llmProvider: 'deepseek',
    deepseekApiKey: 'ВАШ_НОВЫЙ_КЛЮЧ_DEEPSEEK', // СРОЧНО замените на новый ключ!
    llmModel: 'deepseek-chat',

    // --- Home Assistant ---
    haUrl: 'http://localhost:8123',
    haToken: 'ВАШ_LONG_LIVED_ACCESS_TOKEN',

    // --- Яндекс.Станция (Home Assistant entity_id) ---
    // Узнать можно в HA: Инструменты разработчика -> Состояния -> найти media_player.yandex_station...
    yandexStationEntity: 'media_player.yandex_station_mini', 

    // --- TTS (опционально) ---
    elevenLabsApiKey: 'ВАШ_КЛЮЧ_ELEVENLABS',
    elevenLabsVoiceId: '21m00Tcm4TlvDq8ikWAM',
    yandexApiKey: 'ВАШ_КЛЮЧ_YANDEX_SPEECHKIT',
    yandexFolderId: 'ВАШ_FOLDER_ID',
    yandexVoice: 'filipp',
};

// ============================================================
// 2. БАЗОВЫЕ ЭЛЕМЕНТЫ
// ============================================================
const micBtn = document.getElementById('micBtn');
const statusEl = document.getElementById('status');
const transcriptEl = document.getElementById('transcript');
const responseEl = document.getElementById('response');

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SpeechRecognition) {
    statusEl.textContent = '❌ Браузер не поддерживает распознавание речи.';
    micBtn.disabled = true;
    throw new Error('SpeechRecognition not supported');
}

const recognition = new SpeechRecognition();
recognition.lang = 'ru-RU';
recognition.continuous = true; // Важно для непрерывного диалога
recognition.interimResults = true;

let isRecognitionExpectedToRun = false;
let isSpeaking = false;
const conversationHistory = [];

// ============================================================
// 3. ОЗВУЧКА (TTS) — БРАУЗЕР / ELEVENLABS / YANDEX
// ============================================================
function getSelectedTTS() {
    return document.querySelector('input[name="tts"]:checked')?.value || 'browser';
}

function speakBrowser(text) {
    return new Promise((resolve) => {
        speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ru-RU';
        const ruVoice = speechSynthesis.getVoices().find(v => v.lang.startsWith('ru'));
        if (ruVoice) utterance.voice = ruVoice;
        utterance.onend = resolve;
        utterance.onerror = resolve;
        speechSynthesis.speak(utterance);
    });
}

async function speakElevenLabs(text) { /* ... (код из предыдущего ответа) ... */ }
async function speakYandex(text) { /* ... (код из предыдущего ответа) ... */ }

async function speak(text) {
    isSpeaking = true;
    responseEl.textContent = '🤖 ' + text;
    const provider = getSelectedTTS();
    if (provider === 'elevenlabs') await speakElevenLabs(text);
    else if (provider === 'yandex') await speakYandex(text);
    else await speakBrowser(text);
    isSpeaking = false;
}

// ============================================================
// 4. HOME ASSISTANT — УПРАВЛЕНИЕ ЯНДЕКС.СТАНЦИЕЙ
// ============================================================

// Универсальная функция вызова сервисов HA
async function haCallService(domain, service, serviceData) {
    if (!CONFIG.haToken || CONFIG.haToken.startsWith('ВАШ')) {
        console.warn('Home Assistant токен не настроен.');
        return false;
    }
    try {
        const response = await fetch(`${CONFIG.haUrl}/api/services/${domain}/${service}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${CONFIG.haToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(serviceData),
        });
        if (!response.ok) throw new Error(`HA API error: ${response.status}`);
        return true;
    } catch (err) {
        console.error('Ошибка вызова сервиса HA:', err);
        return false;
    }
}

// Отправка TTS (фразы) на Станцию
async function yandexSay(text) {
    // Ограничение облачного режима — 100 символов
    const truncatedText = text.substring(0, 100);
    return haCallService('media_player', 'play_media', {
        entity_id: CONFIG.yandexStationEntity,
        media_content_id: truncatedText,
        media_content_type: 'text' // Это стандартный тип для TTS на Станцию[reference:4]
    });
}

// Отправка голосовой команды на Станцию (как будто вы сказали Алисе)
async function yandexCommand(commandText) {
    // Сервис send_command появился в версии интеграции 3.16.0[reference:5]
    return haCallService('yandex_station', 'send_command', {
        entity_id: CONFIG.yandexStationEntity,
        text: commandText // Текст команды, например "включи мою музыку"[reference:6]
    });
}

// ============================================================
// 5. ОБРАБОТКА КОМАНД
// ============================================================
function getTimeString() { return new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); }
function getDateString() { return new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }

async function handleCommand(text) {
    const cmd = text.toLowerCase().trim();

    // --- Быстрые команды ---
    if (cmd.match(/^(привет|здравствуй)/)) return 'Привет! Чем помочь?';
    if (cmd.match(/который час|время/)) return `Сейчас ${getTimeString()}`;
    if (cmd.match(/какая дата|сегодня число/)) return `Сегодня ${getDateString()}`;
    if (cmd.includes('как дела')) return 'Всё отлично!';
    if (cmd.includes('спасибо')) return 'Всегда пожалуйста!';

    // --- Управление Яндекс.Станцией ---
    
    // 1. "Скажи <текст>" -> TTS на колонке
    const sayMatch = cmd.match(/(?:скажи|передай|объяви)\s+(.+)/i);
    if (sayMatch) {
        const phrase = sayMatch[1];
        const success = await yandexSay(phrase);
        return success ? `Передал на колонку: «${phrase}»` : 'Не удалось отправить TTS на колонку. Проверьте настройки.';
    }

    // 2. "Включи/поставь <запрос>" -> голосовая команда на колонку
    const playMatch = cmd.match(/(?:включи|поставь|запусти)\s+(.+)/i);
    if (playMatch) {
        const command = playMatch[1];
        // Если это похоже на музыку/плейлист, отправляем как команду на колонку
        const success = await yandexCommand(command);
        return success ? `Отправил команду на колонку: «${command}»` : 'Не удалось отправить команду на колонку.';
    }

    // 3. "Стоп" или "Выключи музыку" -> остановка воспроизведения
    if (cmd.match(/^(стоп|выключи музыку|останови)/)) {
        const success = await haCallService('media_player', 'media_stop', {
            entity_id: CONFIG.yandexStationEntity
        });
        return success ? 'Остановил воспроизведение на колонке.' : 'Не удалось остановить колонку.';
    }

    // 4. "Громкость 50" -> установка громкости
    const volumeMatch = cmd.match(/громкость\s+(\d+)/);
    if (volumeMatch) {
        const level = Math.min(100, Math.max(0, parseInt(volumeMatch[1], 10))) / 100;
        const success = await haCallService('media_player', 'volume_set', {
            entity_id: CONFIG.yandexStationEntity,
            volume_level: level
        });
        return success ? `Установил громкость на ${volumeMatch[1]}%.` : 'Не удалось изменить громкость.';
    }

    // --- Всё остальное -> Нейросеть ---
    return await askLLM(text);
}

// ============================================================
// 6. НЕЙРОСЕТЬ (DeepSeek/OpenAI)
// ============================================================
async function askLLM(userText) {
    const provider = CONFIG.llmProvider;
    let apiKey, baseURL, model;
    if (provider === 'deepseek') {
        apiKey = CONFIG.deepseekApiKey;
        baseURL = 'https://api.deepseek.com/v1';
        model = CONFIG.llmModel;
    } else {
        apiKey = CONFIG.openaiApiKey;
        baseURL = 'https://api.openai.com/v1';
        model = CONFIG.llmModel;
    }
    if (!apiKey || apiKey.startsWith('ВАШ')) return 'Ключ нейросети не настроен.';

    conversationHistory.push({ role: 'user', content: userText });
    const messages = [
        { role: 'system', content: 'Ты — голосовой помощник. Отвечай кратко и дружелюбно.' },
        ...conversationHistory.slice(-10),
    ];

    try {
        const response = await fetch(`${baseURL}/chat/completions`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 300 }),
        });
        if (!response.ok) throw new Error(`LLM API ${response.status}`);
        const data = await response.json();
        const reply = data.choices[0].message.content.trim();
        conversationHistory.push({ role: 'assistant', content: reply });
        return reply;
    } catch (err) {
        console.error('Ошибка LLM:', err);
        return 'Не удалось получить ответ от нейросети.';
    }
}

// ============================================================
// 7. УПРАВЛЕНИЕ СЛУШАНИЕМ (для мобильных)
// ============================================================
function forceStopAndReset() {
    isRecognitionExpectedToRun = false;
    isSpeaking = false;
    try { recognition.abort(); } catch (e) {}
    speechSynthesis.cancel();
    micBtn.classList.remove('listening');
    statusEl.textContent = 'Нажмите на кнопку и говорите';
}

function startListening() {
    forceStopAndReset();
    setTimeout(() => {
        isRecognitionExpectedToRun = true;
        transcriptEl.textContent = '';
        responseEl.textContent = '';
        try { recognition.start(); } catch (e) {
            console.warn('start() error:', e.message);
            isRecognitionExpectedToRun = false;
        }
    }, 100);
}

micBtn.addEventListener('click', () => {
    if (isRecognitionExpectedToRun || isSpeaking) forceStopAndReset();
    else startListening();
});

recognition.onstart = () => {
    micBtn.classList.add('listening');
    statusEl.textContent = '🎤 Слушаю...';
};

recognition.onresult = async (event) => {
    let final = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) final += event.results[i][0].transcript;
    }
    if (final) {
        transcriptEl.textContent = '🗣 ' + final;
        statusEl.textContent = '⏳ Думаю...';
        const reply = await handleCommand(final);
        await speak(reply);
        statusEl.textContent = isRecognitionExpectedToRun ? '🎤 Слушаю...' : 'Нажмите на кнопку';
    }
};

recognition.onerror = (event) => {
    if (['no-speech', 'aborted'].includes(event.error)) return;
    console.error('Speech error:', event.error);
};

recognition.onend = () => {
    micBtn.classList.remove('listening');
    if (isRecognitionExpectedToRun && !isSpeaking) {
        setTimeout(() => {
            if (isRecognitionExpectedToRun && !isSpeaking) {
                try { recognition.start(); } catch (e) {}
            }
        }, 150);
    }
};

speechSynthesis.onvoiceschanged = () => { speechSynthesis.getVoices(); };
