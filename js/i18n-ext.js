(function () {
  'use strict';
  var CL = window.CL;
  CL.i18n.add('ru', {
    "set.appearance": "Оформление", "set.theme": "Тема", "theme.auto": "Как на телефоне", "theme.light": "Светлая", "theme.dark": "Тёмная", "set.themeHint": "Тема не зависит от настроек телефона, если выбрать светлую или тёмную.",
    "set.a11y": "Доступность", "a11y.hint": "Цвета и размер текста для дальтоников и слабовидящих.", "a11y.colors": "Цветовая схема", "a11y.none": "Обычные цвета", "a11y.cb": "Для дальтоников (синий и оранжевый)", "a11y.contrast": "Высокая контрастность", "a11y.large": "Крупный текст",
    "acc.resetText": "Введите почту, на неё придёт код. Затем задайте новый пароль.",
    "acc.sendCode": "Отправить код на почту", "acc.sendAgain": "Отправить код ещё раз",
    "acc.resetSent": "Код отправлен. Введите его и новый пароль.",
    "acc.resetBtn": "Сменить пароль", "acc.resetNeedCode": "Сначала получите код на почту.",
    "acc.resetWarn": "Данные на этом телефоне остаются. Общие данные семьи вернут вам другие участники, когда откроют приложение. Если вы один в семье, общие заметки и события начнутся заново.",
    "acc.err.nomail": "На сервере не настроена почта, смена пароля по письму недоступна.",
    "home.sceneNoDev": "Сначала подключите устройства — потом сможете выбрать, что включать в сценарии.",
    "as.sceneCreated": "Создал сценарий «{n}», устройств: {c}.", "as.sceneCreateName": "Как назвать сценарий? Например: «создай сценарий Вечер: выключи свет, включи розетку».", "as.sceneCreateNone": "Не нашёл подходящих устройств. Скажите, например: «создай сценарий Вечер: выключи свет, включи розетку».",
    "notes.respond": "Откликнуться", "notes.respEdit": "Изменить отклик", "notes.respHint": "Все в семье увидят ваш ответ под заметкой.", "notes.respText": "Ваш ответ", "notes.respPh": "Например: я заберу", "notes.respSend": "Отправить", "notes.respUndo": "Убрать отклик",
    "nt.title": "Новое в семье", "nt.read": "Прочитано", "nt.allow": "Разрешить уведомления", "nt.many": "Новое в семье: {c}",
    "nt.note.new": "{n} добавил(а) заметку «{t}»", "nt.note.edit": "{n} изменил(а) заметку «{t}»", "nt.note.resp": "{n} откликнулся(ась) на заметку «{t}»",
    "nt.event.new": "{n} добавил(а) событие «{t}»", "nt.event.edit": "{n} изменил(а) событие «{t}»", "nt.event.resp": "{n} откликнулся(ась) на событие «{t}»",
    "set.privacy": "Политика конфиденциальности",
    "ya.scenes": "Сценарии Алисы", "ya.scenesHint": "Из «Дома с Алисой». Запускаются у всех в семье с главного аккаунта.", "ya.noCtl": "Яндекс не даёт управлять этим устройством напрямую. Создайте в «Доме с Алисой» сценарий (например, «Включить ТВ»), он появится здесь кнопкой.",
    "acc.keyNote": "Ключи шифрования создаются на телефоне. Сервер хранит только зашифрованные общие данные и прочитать их не может."
  });
  CL.i18n.add('en', {
    "set.appearance": "Appearance", "set.theme": "Theme", "theme.auto": "Same as phone", "theme.light": "Light", "theme.dark": "Dark", "set.themeHint": "Choose light or dark so the theme does not depend on the phone settings.",
    "set.a11y": "Accessibility", "a11y.hint": "Colors and text size for color-blind and low-vision users.", "a11y.colors": "Color scheme", "a11y.none": "Standard colors", "a11y.cb": "Color-blind friendly (blue and orange)", "a11y.contrast": "High contrast", "a11y.large": "Large text",
    "acc.resetText": "Enter your email and we will send a code. Then set a new password.",
    "acc.sendCode": "Send code to email", "acc.sendAgain": "Send the code again",
    "acc.resetSent": "Code sent. Enter it with a new password.",
    "acc.resetBtn": "Change password", "acc.resetNeedCode": "Get the code by email first.",
    "acc.resetWarn": "Data on this phone stays. Shared family data will be returned by other members when they open the app. If you are alone in the family, shared notes and events start over.",
    "acc.err.nomail": "Email is not configured on the server, password reset by email is unavailable.",
    "home.sceneNoDev": "Connect devices first, then you can choose what the scene switches.",
    "as.sceneCreated": "Created scene “{n}” with {c} device(s).", "as.sceneCreateName": "What should the scene be called? For example: “create scene Evening: turn off the light, turn on the socket”.", "as.sceneCreateNone": "I did not find matching devices. Try: “create scene Evening: turn off the light, turn on the socket”.",
    "notes.respond": "Respond", "notes.respEdit": "Edit response", "notes.respHint": "Everyone in the family will see your reply under the note.", "notes.respText": "Your reply", "notes.respPh": "For example: I will pick it up", "notes.respSend": "Send", "notes.respUndo": "Remove response",
    "nt.title": "New in the family", "nt.read": "Mark as read", "nt.allow": "Allow notifications", "nt.many": "New in the family: {c}",
    "nt.note.new": "{n} added a note “{t}”", "nt.note.edit": "{n} changed the note “{t}”", "nt.note.resp": "{n} responded to the note “{t}”",
    "nt.event.new": "{n} added an event “{t}”", "nt.event.edit": "{n} changed the event “{t}”", "nt.event.resp": "{n} responded to the event “{t}”",
    "set.privacy": "Privacy policy",
    "ya.scenes": "Alice scenarios", "ya.scenesHint": "From Yandex Smart Home. They run for everyone in the family from the main account.", "ya.noCtl": "Yandex does not allow direct control of this device. Create a scenario in Yandex Smart Home (for example “Turn on TV”), and it will appear here as a button.",
    "acc.keyNote": "Encryption keys are created on your phone. The server stores only encrypted shared data and cannot read it."
  });
})();
