// Legal RAG Chatbot - Frontend JavaScript Application

class LegalChatbot {
    constructor() {
        this.apiBase = '/api';
        this.conversations = [];
        this.isTyping = false;
        this.init();
    }

    init() {
        this.bindEvents();
        this.checkSystemStatus();
        this.hideWelcomeMessage();
    }

    bindEvents() {
        // Chat form submission
        document.getElementById('chat-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.sendMessage();
        });

        // Enter key in input
        document.getElementById('user-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Auto-resize textarea
        const input = document.getElementById('user-input');
        input.addEventListener('input', () => {
            input.style.height = 'auto';
            input.style.height = input.scrollHeight + 'px';
        });
    }

    hideWelcomeMessage() {
        // Hide welcome message when user starts typing
        const input = document.getElementById('user-input');
        input.addEventListener('focus', () => {
            const welcomeMsg = document.querySelector('.welcome-message');
            if (welcomeMsg && this.conversations.length === 0) {
                setTimeout(() => {
                    welcomeMsg.style.opacity = '0.3';
                }, 100);
            }
        });

        input.addEventListener('blur', () => {
            const welcomeMsg = document.querySelector('.welcome-message');
            if (welcomeMsg && this.conversations.length === 0) {
                welcomeMsg.style.opacity = '1';
            }
        });
    }

    async sendMessage() {
        const input = document.getElementById('user-input');
        const message = input.value.trim();

        if (!message || this.isTyping) return;

        // Clear input and disable send button
        input.value = '';
        input.style.height = 'auto';
        this.setTypingState(true);

        // Hide welcome message if this is the first message
        const welcomeMsg = document.querySelector('.welcome-message');
        if (welcomeMsg && this.conversations.length === 0) {
            welcomeMsg.style.display = 'none';
        }

        // Add user message to chat
        this.addMessage(message, 'user');

        // Show loading overlay
        this.showLoading();

        try {
            const response = await fetch(`${this.apiBase}/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ query: message })
            });

            const result = await response.json();
            
            this.hideLoading();

            if (result.success) {
                this.addBotResponse(result);
                this.conversations.push({
                    query: message,
                    response: result.response,
                    timestamp: result.timestamp
                });
                this.updateConversationCount();
            } else {
                this.addMessage(result.error || 'Sorry, I encountered an error processing your request.', 'bot', true);
            }
        } catch (error) {
            console.error('Chat error:', error);
            this.hideLoading();
            this.addMessage('Sorry, I\'m having trouble connecting to the server. Please try again.', 'bot', true);
        } finally {
            this.setTypingState(false);
        }
    }

    addMessage(content, sender, isError = false) {
        const messagesContainer = document.getElementById('chat-messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}`;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        if (isError) {
            contentDiv.classList.add('text-danger');
            content = `<i class="fas fa-exclamation-triangle"></i> ${content}`;
        }

        contentDiv.innerHTML = this.formatMessage(content);
        messageDiv.appendChild(contentDiv);

        // Add timestamp
        const metaDiv = document.createElement('div');
        metaDiv.className = 'message-meta';
        metaDiv.innerHTML = `<i class="fas fa-clock"></i> ${new Date().toLocaleTimeString()}`;
        contentDiv.appendChild(metaDiv);

        messagesContainer.appendChild(messageDiv);
        this.scrollToBottom();
    }

    addBotResponse(result) {
        const messagesContainer = document.getElementById('chat-messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message bot';

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        // Main response content
        const responseDiv = document.createElement('div');
        responseDiv.innerHTML = this.formatMessage(result.response);
        contentDiv.appendChild(responseDiv);

        // Legal sections if available
        if (result.legal_sections && result.legal_sections.length > 0) {
            const sectionsDiv = document.createElement('div');
            sectionsDiv.className = 'legal-sections';
            sectionsDiv.innerHTML = '<h6><i class="fas fa-bookmark"></i> Legal Sections:</h6>';
            
            const sectionsContainer = document.createElement('div');
            result.legal_sections.forEach(section => {
                const badge = document.createElement('span');
                badge.className = 'badge section-badge';
                badge.textContent = section;
                sectionsContainer.appendChild(badge);
            });
            sectionsDiv.appendChild(sectionsContainer);
            contentDiv.appendChild(sectionsDiv);
        }

        // Message metadata
        const metaDiv = document.createElement('div');
        metaDiv.className = 'message-meta';
        
        const confidenceColor = result.confidence_score > 0.8 ? 'success' : 
                               result.confidence_score > 0.6 ? 'warning' : 'secondary';
        
        metaDiv.innerHTML = `
            <span><i class="fas fa-clock"></i> ${new Date().toLocaleTimeString()}</span>
            <span class="badge bg-${confidenceColor} confidence-badge">
                ${Math.round(result.confidence_score * 100)}% confidence
            </span>
            <span><i class="fas fa-brain"></i> ${result.intent.replace('_', ' ').toUpperCase()}</span>
        `;
        
        contentDiv.appendChild(metaDiv);
        messageDiv.appendChild(contentDiv);
        messagesContainer.appendChild(messageDiv);
        
        this.scrollToBottom();
    }

    formatMessage(content) {
        // Convert markdown-like formatting to HTML
        content = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        content = content.replace(/\*(.*?)\*/g, '<em>$1</em>');
        content = content.replace(/\n/g, '<br>');
        
        // Format legal sections
        content = content.replace(/(Section \d+[A-Z]?|Article \d+|Part [IVX]+)/g, 
                                '<span class="badge bg-info">$1</span>');
        
        return content;
    }

    scrollToBottom() {
        const messagesContainer = document.getElementById('chat-messages');
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    setTypingState(isTyping) {
        this.isTyping = isTyping;
        const sendBtn = document.getElementById('send-btn');
        const input = document.getElementById('user-input');

        if (isTyping) {
            sendBtn.disabled = true;
            sendBtn.innerHTML = '<div class="spinner-border spinner-border-sm" role="status"></div>';
            input.disabled = true;
        } else {
            sendBtn.disabled = false;
            sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
            input.disabled = false;
            input.focus();
        }
    }

    showLoading() {
        document.getElementById('loading-overlay').style.display = 'flex';
    }

    hideLoading() {
        document.getElementById('loading-overlay').style.display = 'none';
    }

    async checkSystemStatus() {
        try {
            const response = await fetch(`${this.apiBase}/status`);
            const result = await response.json();
            
            if (result.success) {
                this.updateSystemStatus(result.status);
            } else {
                this.updateSystemStatus({ initialized: false });
            }
        } catch (error) {
            console.error('Status check error:', error);
            this.updateSystemStatus({ initialized: false });
        }
    }

    updateSystemStatus(status) {
        const statusElement = document.getElementById('system-status');
        const statusDetail = document.getElementById('system-status-detail');
        const docCount = document.getElementById('doc-count');

        if (status.initialized) {
            statusElement.innerHTML = '<i class="fas fa-circle status-online"></i> Online';
            statusElement.className = 'text-success';
            statusDetail.innerHTML = '<span class="status-online">Ready</span>';
            docCount.textContent = status.vector_db_documents || 0;
        } else {
            statusElement.innerHTML = '<i class="fas fa-circle status-offline"></i> Offline';
            statusElement.className = 'text-danger';
            statusDetail.innerHTML = '<span class="status-offline">Not Ready</span>';
            docCount.textContent = 'N/A';
        }
    }

    updateConversationCount() {
        document.getElementById('conversation-count').textContent = this.conversations.length;
    }
}

// Utility Functions
function sendExample(button) {
    const message = button.textContent.trim();
    const input = document.getElementById('user-input');
    input.value = message;
    input.focus();
    
    // Auto-send after a short delay
    setTimeout(() => {
        chatbot.sendMessage();
    }, 500);
}

function sendCategoryExample(category) {
    const examples = {
        'criminal_law': 'What are the types of criminal offenses?',
        'civil_law': 'How to file a civil suit for property dispute?',
        'constitutional_law': 'What are fundamental rights under the Constitution?',
        'family_law': 'What are the grounds for divorce?',
        'corporate_law': 'What are the requirements for company formation?'
    };
    
    const input = document.getElementById('user-input');
    input.value = examples[category] || 'Tell me about this legal area';
    input.focus();
}

function clearChat() {
    if (confirm('Are you sure you want to clear the chat history?')) {
        const messagesContainer = document.getElementById('chat-messages');
        messagesContainer.innerHTML = `
            <div class="welcome-message">
                <div class="text-center py-5">
                    <i class="fas fa-balance-scale fa-3x text-primary mb-3"></i>
                    <h3>Welcome to Legal RAG Assistant</h3>
                    <p class="lead text-muted">Ask me any legal questions and I'll provide relevant information with citations from legal documents.</p>
                </div>
            </div>
        `;
        chatbot.conversations = [];
        chatbot.updateConversationCount();
    }
}

function exportChat() {
    if (chatbot.conversations.length === 0) {
        alert('No conversations to export.');
        return;
    }

    const content = chatbot.conversations.map(conv => 
        `Q: ${conv.query}\nA: ${conv.response}\nTime: ${conv.timestamp}\n\n---\n\n`
    ).join('');

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `legal_chat_${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
}

async function showHistory() {
    const modal = new bootstrap.Modal(document.getElementById('historyModal'));
    const content = document.getElementById('history-content');
    
    content.innerHTML = 'Loading history...';
    modal.show();

    try {
        const response = await fetch('/api/history');
        const result = await response.json();
        
        if (result.success && result.history.length > 0) {
            content.innerHTML = result.history.map(item => `
                <div class="history-item">
                    <div class="history-query">${item.query}</div>
                    <div class="history-response">${item.response.substring(0, 200)}...</div>
                    <div class="history-meta">
                        <span><i class="fas fa-clock"></i> ${new Date(item.timestamp).toLocaleString()}</span>
                        <span><i class="fas fa-tachometer-alt"></i> ${(item.processing_time || 0).toFixed(2)}s</span>
                    </div>
                </div>
            `).join('');
        } else {
            content.innerHTML = '<p class="text-muted">No conversation history available.</p>';
        }
    } catch (error) {
        console.error('History fetch error:', error);
        content.innerHTML = '<p class="text-danger">Error loading history.</p>';
    }
}

async function showStatus() {
    const modal = new bootstrap.Modal(document.getElementById('statusModal'));
    const content = document.getElementById('status-content');
    
    content.innerHTML = 'Loading status...';
    modal.show();

    try {
        const response = await fetch('/api/status');
        const result = await response.json();
        
        if (result.success) {
            const status = result.status;
            content.innerHTML = `
                <div class="row">
                    <div class="col-sm-6">
                        <strong>System Status:</strong>
                    </div>
                    <div class="col-sm-6">
                        <span class="badge bg-${status.initialized ? 'success' : 'danger'}">
                            ${status.initialized ? 'Initialized' : 'Not Initialized'}
                        </span>
                    </div>
                </div>
                <hr>
                <div class="row">
                    <div class="col-sm-6">
                        <strong>Vector Database:</strong>
                    </div>
                    <div class="col-sm-6">
                        ${status.vector_db_documents} documents
                    </div>
                </div>
                <hr>
                <div class="row">
                    <div class="col-sm-6">
                        <strong>Conversations:</strong>
                    </div>
                    <div class="col-sm-6">
                        ${status.total_conversations}
                    </div>
                </div>
                <hr>
                <div class="row">
                    <div class="col-sm-6">
                        <strong>Model:</strong>
                    </div>
                    <div class="col-sm-6">
                        BAAI/bge-small-en-v1.5
                    </div>
                </div>
            `;
        } else {
            content.innerHTML = '<p class="text-danger">Error loading system status.</p>';
        }
    } catch (error) {
        console.error('Status fetch error:', error);
        content.innerHTML = '<p class="text-danger">Error connecting to server.</p>';
    }
}

// Initialize the chatbot when page loads
let chatbot;
document.addEventListener('DOMContentLoaded', function() {
    chatbot = new LegalChatbot();
    
    // Show a brief loading message
    setTimeout(() => {
        const statusElement = document.getElementById('system-status');
        if (statusElement.textContent === 'Initializing...') {
            statusElement.innerHTML = '<i class="fas fa-circle status-warning"></i> Checking...';
        }
    }, 2000);
});

// Handle page visibility changes
document.addEventListener('visibilitychange', function() {
    if (!document.hidden && chatbot) {
        chatbot.checkSystemStatus();
    }
});