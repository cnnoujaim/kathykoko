// Kathy Koko Dashboard
(function () {
  const API = '';

  // ---- Navigation ----
  // Chat is always visible. Nav buttons switch the right panel view.
  const navBtns = document.querySelectorAll('.nav-btn');
  const panelViews = document.querySelectorAll('.panel-view');

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      navBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Chat nav just focuses the chat input (it's always visible)
      if (tab === 'chat') {
        document.getElementById('chat-input').focus();
        return;
      }

      // Switch right panel view
      panelViews.forEach(v => v.classList.remove('active'));
      const target = document.getElementById('view-' + tab);
      if (target) target.classList.add('active');

      // Load data
      if (tab === 'tasks') loadTasks();
      if (tab === 'calendar') loadCalendar();
      if (tab === 'status') loadKillswitch();
    });
  });

  // ---- Chat ----
  const chatMessages = document.getElementById('chat-messages');
  const chatInput = document.getElementById('chat-input');
  const chatSend = document.getElementById('chat-send');

  function addChatBubble(text, type, time) {
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble ' + type;
    const timeStr = time ? new Date(time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
    bubble.innerHTML = escapeHtml(text) + (timeStr ? '<span class="time">' + timeStr + '</span>' : '');
    chatMessages.appendChild(bubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return bubble;
  }

  function showTyping() {
    const el = document.createElement('div');
    el.className = 'typing-indicator';
    el.id = 'typing';
    el.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
    chatMessages.appendChild(el);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function hideTyping() {
    const el = document.getElementById('typing');
    if (el) el.remove();
  }

  async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;

    chatInput.value = '';
    chatSend.disabled = true;

    addChatBubble(text, 'sent', new Date().toISOString());
    showTyping();

    try {
      const res = await fetch(API + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      hideTyping();

      if (data.response) {
        addChatBubble(data.response, 'received', data.timestamp);
      } else if (data.error) {
        addChatBubble('Error: ' + data.error, 'received', new Date().toISOString());
      }

      // Auto-refresh tasks panel if a task was just created
      if (data.messageType === 'task' || data.messageType === 'action' || data.messageType === 'email_scan') {
        loadTasks();
      }
    } catch (err) {
      hideTyping();
      addChatBubble('Failed to reach Kathy. Check your connection.', 'received', new Date().toISOString());
    }

    chatSend.disabled = false;
    chatInput.focus();
  }

  chatSend.addEventListener('click', sendMessage);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Load recent messages on startup
  async function loadMessages() {
    try {
      const res = await fetch(API + '/api/messages?limit=30');
      const data = await res.json();
      chatMessages.innerHTML = '';

      if (data.messages && data.messages.length > 0) {
        const msgs = data.messages.reverse();
        msgs.forEach(msg => {
          const type = msg.direction === 'inbound' ? 'sent' : 'received';
          addChatBubble(msg.body, type, msg.created_at);
        });
      } else {
        addChatBubble("Hey! I'm Kathy, your Chief of Staff. What's on your mind?", 'received', new Date().toISOString());
      }
    } catch {
      addChatBubble("Hey! I'm Kathy, your Chief of Staff. What's on your mind?", 'received', new Date().toISOString());
    }
  }

  // ---- Tasks ----
  const taskList = document.getElementById('task-list');
  let currentFilter = 'all';

  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentFilter = pill.dataset.filter;
      loadTasks();
    });
  });

  async function loadTasks() {
    taskList.innerHTML = '<div class="loading">Loading tasks...</div>';

    try {
      let url = API + '/api/tasks';
      if (currentFilter !== 'all') {
        url += '?category=' + currentFilter;
      }

      const res = await fetch(url);
      const data = await res.json();

      if (!data.tasks || data.tasks.length === 0) {
        taskList.innerHTML = '<div class="empty-state"><div class="icon">&#9745;</div>No tasks yet. Chat with Kathy to add some!</div>';
        return;
      }

      taskList.innerHTML = '';

      // Sort: pending/active first, deferred, then completed
      const statusOrder = { pending: 0, active: 0, clarification_needed: 1, deferred: 2, completed: 3, rejected: 4 };
      const sorted = data.tasks.sort((a, b) => {
        const sa = statusOrder[a.status] ?? 5;
        const sb = statusOrder[b.status] ?? 5;
        if (sa !== sb) return sa - sb;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      sorted.forEach(task => {
        const card = document.createElement('div');
        const statusClass = task.status === 'completed' ? ' completed' : task.status === 'deferred' ? ' deferred' : '';
        card.className = 'task-card' + statusClass;

        const dueStr = task.due_date
          ? new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : '';

        const priorityBadge = (task.priority === 'urgent' || task.priority === 'high')
          ? '<span class="task-badge ' + task.priority + '">' + task.priority + '</span>'
          : '';

        const deferredBadge = task.status === 'deferred'
          ? '<span class="task-badge deferred">deferred</span>'
          : '';

        const description = task.description
          ? '<div class="task-description">' + escapeHtml(task.description) + '</div>'
          : '';

        card.innerHTML =
          '<div class="task-check" data-id="' + task.id + '" data-status="' + task.status + '"></div>' +
          '<div class="task-info">' +
            '<div class="task-title">' + escapeHtml(task.parsed_title || task.raw_text) + '</div>' +
            description +
            '<div class="task-meta">' +
              '<span class="task-badge ' + task.category + '">' + task.category + '</span>' +
              priorityBadge +
              deferredBadge +
              (dueStr ? '<span class="task-due">' + dueStr + '</span>' : '') +
              (task.estimated_hours ? '<span class="task-due">' + task.estimated_hours + 'h</span>' : '') +
            '</div>' +
          '</div>' +
          '<button class="task-delete" data-id="' + task.id + '" title="Delete">&times;</button>';

        taskList.appendChild(card);
      });

      // Bind handlers
      taskList.querySelectorAll('.task-check').forEach(el => {
        el.addEventListener('click', () => toggleTask(el.dataset.id, el.dataset.status));
      });

      taskList.querySelectorAll('.task-delete').forEach(el => {
        el.addEventListener('click', () => deleteTask(el.dataset.id));
      });
    } catch {
      taskList.innerHTML = '<div class="empty-state">Failed to load tasks</div>';
    }
  }

  async function toggleTask(id, currentStatus) {
    const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';
    try {
      await fetch(API + '/api/tasks/' + id + '/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      loadTasks();
    } catch { /* ignore */ }
  }

  async function deleteTask(id) {
    try {
      await fetch(API + '/api/tasks/' + id, { method: 'DELETE' });
      loadTasks();
    } catch { /* ignore */ }
  }

  // ---- Calendar ----
  const calendarList = document.getElementById('calendar-list');

  async function loadCalendar() {
    calendarList.innerHTML = '<div class="loading">Loading calendar...</div>';

    try {
      const res = await fetch(API + '/api/calendar?days=7');
      const data = await res.json();

      if (!data.events || data.events.length === 0) {
        calendarList.innerHTML = '<div class="empty-state"><div class="icon">&#128197;</div>No upcoming events</div>';
        return;
      }

      const grouped = {};
      data.events.forEach(event => {
        const date = new Date(event.start_time).toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
        });
        if (!grouped[date]) grouped[date] = [];
        grouped[date].push(event);
      });

      calendarList.innerHTML = '';

      Object.entries(grouped).forEach(([date, events]) => {
        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-day';

        let html = '<div class="calendar-day-header">' + date + '</div>';
        events.forEach(event => {
          const time = new Date(event.start_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
          const type = event.event_type || 'personal';
          html +=
            '<div class="calendar-event">' +
              '<div class="event-type-dot ' + type + '"></div>' +
              '<span class="event-time">' + time + '</span>' +
              '<span class="event-title">' + escapeHtml(event.title || 'Untitled') + '</span>' +
            '</div>';
        });

        dayEl.innerHTML = html;
        calendarList.appendChild(dayEl);
      });
    } catch {
      calendarList.innerHTML = '<div class="empty-state">Failed to load calendar</div>';
    }
  }

  // ---- Killswitch / Status ----
  async function loadKillswitch() {
    try {
      const res = await fetch(API + '/api/killswitch');
      const data = await res.json();

      const hours = data.currentHours || 0;
      const remaining = data.remainingHours || 40;
      const pct = Math.min((hours / 40) * 100, 100);

      // Main status panel
      const bar = document.getElementById('killswitch-bar');
      bar.style.width = pct + '%';

      if (hours < 25) bar.style.background = 'linear-gradient(90deg, var(--baby-blue), var(--periwinkle))';
      else if (hours < 35) bar.style.background = 'var(--high)';
      else bar.style.background = 'var(--urgent)';

      document.getElementById('killswitch-label').innerHTML =
        hours.toFixed(1) + 'h <span>/ 40h (' + remaining.toFixed(1) + 'h remaining)</span>';

      const statusInfo = document.getElementById('status-info');
      statusInfo.innerHTML =
        '<div class="status-item"><h3>Killswitch Active</h3><div class="value">' +
          (data.isActive ? 'YES - Lyra tasks deferred' : 'No') +
        '</div></div>' +
        '<div class="status-item"><h3>Week Start</h3><div class="value">' +
          (data.weekStartDate || 'N/A') +
        '</div></div>';

      // Sidebar mini widget
      updateSidebarHours(hours, remaining, pct);
    } catch {
      document.getElementById('killswitch-label').textContent = 'Unable to load';
    }
  }

  function updateSidebarHours(hours, remaining, pct) {
    const fill = document.getElementById('sidebar-hours-fill');
    const text = document.getElementById('sidebar-hours-text');
    if (fill) {
      fill.style.width = pct + '%';
      if (hours >= 35) fill.style.background = 'var(--urgent)';
      else if (hours >= 25) fill.style.background = 'var(--high)';
    }
    if (text) {
      text.textContent = hours.toFixed(1) + ' / 40h';
    }
  }

  // ---- Utilities ----
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ---- Init ----
  loadMessages();
  loadTasks(); // Pre-load tasks in right panel
  // Load sidebar killswitch
  fetch(API + '/api/killswitch')
    .then(r => r.json())
    .then(data => {
      const hours = data.currentHours || 0;
      const remaining = data.remainingHours || 40;
      const pct = Math.min((hours / 40) * 100, 100);
      updateSidebarHours(hours, remaining, pct);
    })
    .catch(() => {});
})();
