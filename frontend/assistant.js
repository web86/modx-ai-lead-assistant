document.addEventListener('DOMContentLoaded', () => {
    const assistant = document.getElementById('fwAssistant');

    if (!assistant) {
        return;
    }

    const endpoint = assistant.dataset.endpoint || '/assets/components/assistant/api/chat.php';
    const contactEndpoint = assistant.dataset.contactEndpoint || (endpoint.match(/\/chat\/?$/) ? endpoint.replace(/\/chat\/?$/, '/contact') : endpoint);
    const trigger = document.getElementById('fwAssistantTrigger');
    const windowElement = document.getElementById('fwAssistantWindow');
    const closeButton = assistant.querySelector('.fw-assistant-close');
    const emailForm = assistant.querySelector('.fw-assistant-email-form');
    const emailCard = assistant.querySelector('.fw-assistant-email-card');
    const body = document.getElementById('fwAssistantBody');
    const messages = document.getElementById('fwAssistantMessages');
    const chatForm = document.getElementById('fwAssistantChatForm');
    const chatInput = document.getElementById('fwAssistantInput');
    const sendButton = assistant.querySelector('.fw-assistant-send');

    const aiText = {
        welcomeBack:
            assistant.dataset.textWelcomeBack ||
            'Welcome back! How can I help?',

        chatStart:
            assistant.dataset.textChatStart ||
            'Great! How can I help? Tell me a little about what you need.',

        emailError:
            assistant.dataset.textEmailError ||
            'Please enter a valid email.',

        busy:
            assistant.dataset.textBusy ||
            'The service is temporarily busy. Please try again in a minute.',

        requestError:
            assistant.dataset.textRequestError ||
            'Could not get a response. Please try again.',

        handoffSent:
            assistant.dataset.textHandoffSent ||
            'Request sent ✓',

        openChat:
            assistant.dataset.textOpenChat ||
            'Open chat',

        closeChat:
            assistant.dataset.textCloseChat ||
            'Close chat'
    };

    let isReplying = false;
    let typingElement = null;

    function createConversationId() {
        if (window.crypto?.getRandomValues) {
            const bytes = new Uint8Array(18);
            window.crypto.getRandomValues(bytes);

            return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
        }

        return [
            Date.now().toString(36),
            Math.random().toString(36).slice(2),
            Math.random().toString(36).slice(2)
        ].join('_');
    }

    function getConversationId() {
        let conversationId = sessionStorage.getItem('fwAssistantConversationId');

        if (!conversationId) {
            conversationId = createConversationId();

            sessionStorage.setItem(
                'fwAssistantConversationId',
                conversationId
            );
        }

        return conversationId;
    }

    function isValidEmail(email) {
        email = String(email || '').trim();

        if (email.length < 5 || email.length > 254) {
            return false;
        }

        return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email);
    }

    function openAssistant() {
        assistant.classList.add('is-open');
        trigger.setAttribute('aria-expanded', 'true');
        trigger.setAttribute('aria-label', aiText.closeChat);
        windowElement.setAttribute('aria-hidden', 'false');
        localStorage.setItem('fwAssistantOpened', '1');

        if (assistant.classList.contains('is-chatting') && !chatInput.disabled) {
            setTimeout(() => chatInput.focus(), 350);
        }
    }

    function closeAssistant() {
        assistant.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.setAttribute('aria-label', aiText.openChat);
        windowElement.setAttribute('aria-hidden', 'true');
    }

    function toggleAssistant() {
        assistant.classList.contains('is-open') ? closeAssistant() : openAssistant();
    }

    function scrollToBottom(smooth = true) {
        requestAnimationFrame(() => {
            body.scrollTo({
                top: body.scrollHeight,
                behavior: smooth ? 'smooth' : 'auto'
            });
        });
    }

    function createAssistantAvatar() {
        const avatar = document.createElement('div');
        avatar.className = 'fw-assistant-chat-avatar';
        avatar.appendChild(document.createElement('span'));
        return avatar;
    }

    function addMessage(role, text) {
        const row = document.createElement('div');
        row.className = `fw-assistant-chat-row ${role === 'assistant' ? 'is-assistant' : 'is-user'}`;

        if (role === 'assistant') {
            row.appendChild(createAssistantAvatar());
        }

        const bubble = document.createElement('div');
        bubble.className = 'fw-assistant-chat-bubble';
        bubble.textContent = text;
        row.appendChild(bubble);
        messages.appendChild(row);
        scrollToBottom();
        return row;
    }

    function showTyping() {
        if (typingElement) {
            return;
        }

        const row = document.createElement('div');
        row.className = 'fw-assistant-chat-row is-assistant';
        row.appendChild(createAssistantAvatar());

        const bubble = document.createElement('div');
        bubble.className = 'fw-assistant-chat-bubble';

        const typing = document.createElement('div');
        typing.className = 'fw-assistant-typing';

        for (let i = 0; i < 3; i += 1) {
            typing.appendChild(document.createElement('span'));
        }

        bubble.appendChild(typing);
        row.appendChild(bubble);
        messages.appendChild(row);
        typingElement = row;
        scrollToBottom();
    }

    function hideTyping() {
        if (!typingElement) {
            return;
        }

        typingElement.remove();
        typingElement = null;
    }

    function finishChat() {
        chatInput.disabled = true;
        chatInput.placeholder = aiText.handoffSent;
        sendButton.disabled = true;
        sessionStorage.setItem('fwAssistantHandoffSent', '1');
    }

    function startChat(restored = false) {
        assistant.classList.add('is-chatting');
        emailCard.style.display = 'none';

        if (sessionStorage.getItem('fwAssistantHandoffSent') === '1') {
            finishChat();
            return;
        }

        if (restored) {
            addMessage('assistant', aiText.welcomeBack);
            return;
        }

        showTyping();

        setTimeout(() => {
            hideTyping();
            addMessage('assistant', aiText.chatStart);
            chatInput.focus();
        }, 650);
    }

    function resizeTextarea() {
        chatInput.style.height = 'auto';
        chatInput.style.height = `${Math.min(chatInput.scrollHeight, 110)}px`;
    }

    function updateSendButton() {
        sendButton.disabled = !chatInput.value.trim() || isReplying || chatInput.disabled;
    }

    async function saveContact(email) {
        const response = await fetch(contactEndpoint, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json'
            },
            body: JSON.stringify({
                action: 'contact',
                email,
                page_url: window.location.href,
                conversation_id: getConversationId()
            })
        });

        if (!response.ok) {
            throw new Error('Could not save assistant contact');
        }

        const data = await response.json();

        if (!data.ok) {
            throw new Error(data.error || 'Could not save assistant contact');
        }
    }

    async function getAssistantReply(message) {
        const email = sessionStorage.getItem('fwAssistantEmail');

        if (!email || !isValidEmail(email)) {
            throw new Error('Email is missing or invalid');
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json'
            },
            body: JSON.stringify({
                action: 'message',
                email,
                message,
                page_url: window.location.href,
                conversation_id: getConversationId()
            })
        });

        let data;

        try {
            data = await response.json();
        } catch (error) {
            throw new Error('Invalid server response');
        }

        if (!response.ok || !data.ok) {
            if (response.status === 429) {
                throw new Error('ASSISTANT_BUSY');
            }

            throw new Error(data.error || 'Assistant request failed');
        }

        if (typeof data.message !== 'string' || !data.message.trim()) {
            throw new Error('Empty assistant response');
        }

        return {
            message: data.message.trim(),
            handoffSent: data.handoff_sent === true,
            channels: data.handoff_channels || null
        };
    }

    trigger.addEventListener('click', toggleAssistant);
    closeButton.addEventListener('click', closeAssistant);

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && assistant.classList.contains('is-open')) {
            closeAssistant();
        }
    });

    emailForm.addEventListener('submit', async event => {
        event.preventDefault();

        const input = emailForm.querySelector('input[type="email"]');
        const email = input.value.trim();

        input.classList.remove('is-invalid');
        emailForm.querySelector('.fw-assistant-email-error')?.remove();

        if (!isValidEmail(email)) {
            input.classList.add('is-invalid');

            const error = document.createElement('div');
            error.className = 'fw-assistant-email-error';
            error.textContent = aiText.emailError;
            input.insertAdjacentElement('afterend', error);
            input.focus();
            return;
        }

        sessionStorage.setItem('fwAssistantEmail', email);
        sessionStorage.removeItem('fwAssistantHandoffSent');

        if (!sessionStorage.getItem('fwAssistantConversationId')) {
            sessionStorage.setItem(
                'fwAssistantConversationId',
                createConversationId()
            );
        }

        try {
            await saveContact(email);
        } catch (error) {
            console.error(error);
        }

        emailCard.classList.add('is-leaving');

        setTimeout(() => startChat(false), 250);
    });

    chatInput.addEventListener('input', () => {
        resizeTextarea();
        updateSendButton();
    });

    chatInput.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();

            if (!sendButton.disabled) {
                chatForm.requestSubmit();
            }
        }
    });

    chatForm.addEventListener('submit', async event => {
        event.preventDefault();

        const text = chatInput.value.trim();

        if (!text || isReplying || chatInput.disabled) {
            return;
        }

        addMessage('user', text);
        chatInput.value = '';
        resizeTextarea();
        isReplying = true;
        updateSendButton();
        showTyping();

        try {
            const result = await getAssistantReply(text);
            hideTyping();
            addMessage('assistant', result.message);

            if (result.handoffSent) {
                finishChat();
            }
        } catch (error) {
            hideTyping();

            if (error.message === 'ASSISTANT_BUSY') {
                addMessage('assistant', aiText.busy);
            } else {
                addMessage('assistant', aiText.requestError);
            }

            console.error(error);
        } finally {
            isReplying = false;
            updateSendButton();

            if (!chatInput.disabled) {
                chatInput.focus();
            }
        }
    });

    const savedEmail = sessionStorage.getItem('fwAssistantEmail');

    if (savedEmail && isValidEmail(savedEmail)) {
        startChat(true);
    } else if (savedEmail) {
        sessionStorage.removeItem('fwAssistantEmail');
        sessionStorage.removeItem('fwAssistantHandoffSent');
        sessionStorage.removeItem('fwAssistantConversationId');
    }

    if (!localStorage.getItem('fwAssistantOpened')) {
        setTimeout(() => {
            trigger.classList.add('fw-assistant-attention');
            setTimeout(() => trigger.classList.remove('fw-assistant-attention'), 1500);
        }, 4000);
    }
});
