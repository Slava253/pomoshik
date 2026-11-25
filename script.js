// ==================== ИНИЦИАЛИЗАЦИЯ ====================
const micBtn    = document.getElementById('micBtn');
const statusEl  = document.getElementById('status');
const transcriptEl = document.getElementById('transcript');
const responseEl   = document.getElementById('response');

// Проверка поддержки API
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SpeechRecognition) {
    statusEl.textContent = '❌ Ваш браузер не поддерживает распознавание речи. Используйте Chrome или Edge.';
    micBtn.disabled = true;
}

const recognition = new SpeechRecognition();
recognition.lang = 'ru-RU';        // язык распознавания
recognition.continuous = false;    // слушать одну фразу
recognition.interimResults = true; // показывать промежуточный текст

let isListening = false;

// ==================== ОЗВУЧКА ====================
function speak(text) {
    return new Promise((resolve) => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ru-RU';
        utterance.rate = 1;
        utterance.pitch = 1;

        // Попробуем выбрать русский голос
        const voices = speechSynthesis.getVoices();
        const ruVoice = voices.find(v => v.lang.startsWith('ru'));
        if (ruVoice) utterance.voice = ruVoice;

        utterance.onend = resolve;
        utterance.onerror = resolve;

        responseEl.textContent = '🤖 ' + text;
        speechSynthesis.speak(utterance);
    });
}

// ==================== ОБРАБОТКА КОМАНД ====================
function getTimeString() {
    const now = new Date();
    return now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function getDateString() {
    const now = new Date();
    return now.toLocaleDateString('ru-RU', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
}

async function handleCommand(text) {
    const cmd = text.toLowerCase().trim();
    let reply = '';

    if (cmd.includes('привет') || cmd.includes('здравствуй')) {
        reply = 'Привет! Чем могу помочь?';
    } 
    else if (cmd.includes('как тебя зовут') || cmd.includes('твоё имя')) {
        reply = 'Меня зовут Голосовой помощник. Приятно познакомиться!';
    } 
    else if (cmd.includes('время') || cmd.includes('который час')) {
        reply = `Сейчас ${getTimeString()}`;
    } 
    else if (cmd.includes('дата') || cmd.includes('какое сегодня число')) {
        reply = `Сегодня ${getDateString()}`;
    } 
    else if (cmd.includes('как дела')) {
        reply = 'Всё отлично! Готов помогать дальше.';
    } 
    else if (cmd.includes('спасибо')) {
        reply = 'Всегда пожалуйста!';
    } 
    else if (cmd.includes('пока') || cmd.includes('до свидания')) {
        reply = 'До встречи!';
    } 
    else if (cmd.includes('открой ютуб') || cmd.includes('открой youtube')) {
        reply = 'Открываю YouTube';
        window.open('https://youtube.com', '_blank');
    } 
    else if (cmd.includes('открой гугл') || cmd.includes('открой google')) {
        reply = 'Открываю Google';
        window.open('https://google.com', '_blank');
    } 
    else if (cmd.includes('поиск') || cmd.includes('найди')) {
        const query = cmd.replace(/поиск(и)?|найди/g, '').trim();
        if (query) {
            reply = `Ищу: ${query}`;
            window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, '_blank');
        } else {
            reply = 'Что именно найти?';
        }
    } 
    else if (cmd.includes('шутку') || cmd.includes('пошути')) {
        const jokes = [
            'Программист ставит на ночь два стакана: один с водой — если захочет пить, другой пустой — если не захочет.',
            'Почему программисты путают Хэллоуин и Рождество? Потому что Oct 31 == Dec 25.',
            '— Как называется боязнь программистов? — Кодофобия.'
        ];
        reply = jokes[Math.floor(Math.random() * jokes.length)];
    } 
    else {
        reply = 'Извините, я не понял команду. Попробуйте: "который час", "какая дата", "найди погоду".';
    }

    await speak(reply);
}

// ==================== УПРАВЛЕНИЕ СЛУШАНИЕМ ====================
function startListening() {
    if (!SpeechRecognition) return;

    transcriptEl.textContent = '';
    responseEl.textContent = '';
    recognition.start();
}

micBtn.addEventListener('click', () => {
    if (isListening) {
        recognition.stop();
    } else {
        speechSynthesis.cancel(); // остановить текущую озвучку
        startListening();
    }
});

// ==================== СОБЫТИЯ РАСПОЗНАВАНИЯ ====================
recognition.onstart = () => {
    isListening = true;
    micBtn.classList.add('listening');
    statusEl.textContent = '🎤 Слушаю...';
};

recognition.onresult = (event) => {
    let interim = '';
    let final = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += t;
        else interim += t;
    }

    transcriptEl.textContent = '🗣 ' + (final || interim);

    if (final) {
        statusEl.textContent = '✅ Распознано';
        handleCommand(final);
    }
};

recognition.onerror = (event) => {
    console.error('Ошибка:', event.error);
    const messages = {
        'no-speech': 'Не расслышал. Попробуйте ещё раз.',
        'audio-capture': 'Не найден микрофон.',
        'not-allowed': 'Разрешение на микрофон не выдано.',
        'network': 'Проблемы с сетью.'
    };
    statusEl.textContent = '⚠️ ' + (messages[event.error] || event.error);
};

recognition.onend = () => {
    isListening = false;
    micBtn.classList.remove('listening');
    if (statusEl.textContent === '🎤 Слушаю...') {
        statusEl.textContent = 'Нажмите на кнопку и говорите';
    }
};

// Подгружаем голоса (в Chrome они грузятся асинхронно)
speechSynthesis.onvoiceschanged = () => {
    speechSynthesis.getVoices();
};
