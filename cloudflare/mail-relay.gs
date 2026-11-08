/**
 * Почтовый мост (необязательно). Нужен, если у вас нет своего домена и вы не хотите Brevo:
 * письма с кодами отправляются с вашей почты Gmail через Google Apps Script (~100 писем в день).
 *
 * Установка (3 минуты):
 *  1. script.google.com → Новый проект → вставьте этот файл.
 *  2. Настройки проекта → Свойства скрипта → добавьте SECRET = любая длинная случайная строка.
 *  3. Развернуть → Новое развёртывание → Веб-приложение → Выполнять от: Меня, Доступ: Все. Скопируйте адрес /exec.
 *  4. В Cloudflare (Worker → Settings → Variables and Secrets) добавьте MAIL_RELAY_URL = адрес /exec и MAIL_RELAY_SECRET = тот же SECRET.
 * Мост отправляет письма только если секрет верный и только на один адрес за раз.
 */
function doPost(e) {
  try {
    var b = JSON.parse(e.postData.contents);
    var secret = PropertiesService.getScriptProperties().getProperty('SECRET');
    if (!secret || b.secret !== secret) return out_({ ok: false, error: 'auth' });
    if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/.test(String(b.to || ''))) return out_({ ok: false, error: 'to' });
    MailApp.sendEmail({ to: String(b.to), subject: String(b.subject || '').slice(0, 200), body: String(b.text || '').slice(0, 2000), name: 'Comfortable life' });
    return out_({ ok: true });
  } catch (err) { return out_({ ok: false, error: 'fail' }); }
}
function doGet() { return out_({ ok: true, app: 'comfortable-life-mail-relay' }); }
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
