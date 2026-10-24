document.addEventListener('DOMContentLoaded', () => {
    const chatLog = document.getElementById('chat-log');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');

    sendButton.addEventListener('click', sendMessage);
    userInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            sendMessage();
        }
    });

    function sendMessage() {
        const userMessage = userInput.value.trim();
        if (userMessage) {
            appendMessage('user', userMessage);
            userInput.value = '';

            fetch(`/api/ask?q=${encodeURIComponent(userMessage)}`)
                .then(response => response.json())
                .then(data => {
                    appendMessage('ai', data.answer);
                })
                .catch(error => {
                    console.error('Error:', error);
                    appendMessage('ai', 'Sorry, something went wrong.');
                });
        }
    }

    function appendMessage(sender, message) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', `${sender}-message`);
        messageElement.textContent = message;
        chatLog.appendChild(messageElement);
        chatLog.scrollTop = chatLog.scrollHeight;
    }
});
