/* Kranghand Design: load with defer BEFORE the shared assistant.js. */
document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('fwAssistant');
  if (!root) return;
  const language = (document.documentElement.lang || 'en').slice(0, 2).toLowerCase();
  const translations = {
    en: {
      welcome: "Hello! 👋 I'm Nadia's virtual design assistant.",
      intro: "Tell me about your space. I can explain design services and help you send an enquiry to Nadia.",
      title: "Design Assistant", online: "Online",
      startTitle: "Let's get started?",
      startText: "Leave your email so Nadia can contact you about your project.",
      continue: "Continue", placeholder: "your@email.com", input: "Describe your space…",
      hint: "Ask about interior design", powered: "Virtual design assistant",
      welcomeBack: "Welcome back! How can I help with your space?",
      chatStart: "Great! Tell me a little about the space you want to design.",
      emailError: "Please enter a valid email.",
      busy: "The assistant is busy. Please try again shortly.",
      error: "Could not get a response. Please try again.",
      sent: "Enquiry sent ✓", open: "Open chat", close: "Close chat"
    },
    nl: {
      welcome: "Hallo! 👋 Ik ben de virtuele ontwerp­assistent van Nadia.",
      intro: "Vertel me over je ruimte. Ik kan je informeren over interieurontwerp en je aanvraag doorgeven aan Nadia.",
      title: "Interieurassistent", online: "Online",
      startTitle: "Zullen we beginnen?",
      startText: "Laat je e-mailadres achter zodat Nadia contact met je kan opnemen.",
      continue: "Verder", placeholder: "jouw@email.nl", input: "Vertel over je ruimte…",
      hint: "Vraag naar interieuradvies", powered: "Virtuele interieurassistent",
      welcomeBack: "Welkom terug! Waarmee kan ik helpen?",
      chatStart: "Leuk! Vertel eens over de ruimte die je wilt laten ontwerpen.",
      emailError: "Vul een geldig e-mailadres in.",
      busy: "De assistent is even bezet. Probeer het straks opnieuw.",
      error: "Er is iets misgegaan. Probeer het opnieuw.",
      sent: "Aanvraag verzonden ✓", open: "Chat openen", close: "Chat sluiten"
    },
    ru: {
      welcome: "Здравствуйте! 👋 Я виртуальный помощник дизайнера Нади.",
      intro: "Расскажите о своём интерьере. Я помогу разобраться в услугах и передать ваш запрос Наде.",
      title: "Помощник дизайнера", online: "На связи",
      startTitle: "Начнём?",
      startText: "Оставьте email, чтобы Надя могла связаться с вами по поводу проекта.",
      continue: "Продолжить", placeholder: "ваш@email.com", input: "Расскажите о помещении…",
      hint: "Спросите про дизайн интерьера", powered: "Виртуальный помощник",
      welcomeBack: "С возвращением! Чем могу помочь?",
      chatStart: "Отлично! Расскажите, какое помещение вы хотите оформить.",
      emailError: "Введите корректный email.",
      busy: "Ассистент сейчас занят. Попробуйте немного позже.",
      error: "Не удалось получить ответ. Попробуйте ещё раз.",
      sent: "Заявка отправлена ✓", open: "Открыть чат", close: "Закрыть чат"
    }
  };
  const t = translations[language] || translations.en;
  const setText = (selector, value) => {
    const element = root.querySelector(selector);
    if (element) element.textContent = value;
  };
  setText('.fw-assistant-profile-text strong', t.title);
  setText('.fw-assistant-profile-text span', t.online);
  setText('.fw-assistant-welcome .fw-assistant-message p:first-child', t.welcome);
  setText('.fw-assistant-welcome .fw-assistant-message p:nth-child(2)', t.intro);
  setText('.fw-assistant-email-card > div:nth-child(2) strong', t.startTitle);
  setText('.fw-assistant-email-card > div:nth-child(2) p', t.startText);
  const emailButton = root.querySelector('.fw-assistant-email-form button');
  if (emailButton && emailButton.firstChild) emailButton.firstChild.textContent = t.continue + ' ';
  const email = root.querySelector('.fw-assistant-email-form input');
  if (email) email.placeholder = t.placeholder;
  const input = root.querySelector('#fwAssistantInput');
  if (input) {
    input.placeholder = t.input;
    input.setAttribute('aria-label', t.input);
  }
  setText('.fw-assistant-hint', t.hint);
  setText('.fw-assistant-powered', t.powered);
  const closeButton = root.querySelector('.fw-assistant-close');
  if (closeButton) closeButton.setAttribute('aria-label', t.close);
  const trigger = root.querySelector('#fwAssistantTrigger');
  if (trigger) trigger.setAttribute('aria-label', t.open);
  const send = root.querySelector('.fw-assistant-send');
  if (send) send.setAttribute('aria-label', t.continue);
  const dialog = root.querySelector('#fwAssistantWindow');
  if (dialog) dialog.setAttribute('aria-label', t.title);
  Object.assign(root.dataset, {
    textWelcomeBack: t.welcomeBack, textChatStart: t.chatStart,
    textEmailError: t.emailError, textBusy: t.busy, textRequestError: t.error,
    textHandoffSent: t.sent, textOpenChat: t.open, textCloseChat: t.close
  });
});
