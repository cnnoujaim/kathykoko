// Kathy Koko Dashboard
(function () {
  const API = '';
  let userCategories = [];

  // ---- Auth Check ----
  async function checkAuth() {
    try {
      const res = await fetch(API + '/auth/me');
      if (res.status === 401) {
        window.location.href = '/login.html';
        return null;
      }
      const data = await res.json();

      // Show user info in sidebar
      if (data.user) {
        const userEl = document.getElementById('sidebar-user');
        const avatarEl = document.getElementById('user-avatar');
        const nameEl = document.getElementById('user-name');
        if (data.user.avatar_url) {
          avatarEl.src = data.user.avatar_url;
          avatarEl.style.display = 'block';
        }
        nameEl.textContent = data.user.name || data.user.email;
        userEl.style.display = 'flex';
        document.getElementById('logout-btn').style.display = 'block';
      }

      // Store categories and build filter pills
      if (data.categories) {
        userCategories = data.categories;
        buildFilterPills(data.categories);
      }

      return data;
    } catch {
      window.location.href = '/login.html';
      return null;
    }
  }

  function buildFilterPills(categories) {
    const container = document.getElementById('task-filters');
    container.innerHTML = '<button class="filter-pill active" data-filter="all">All</button>';
    categories.forEach(cat => {
      const pill = document.createElement('button');
      pill.className = 'filter-pill';
      pill.dataset.filter = cat.name;
      pill.textContent = cat.name.charAt(0).toUpperCase() + cat.name.slice(1);
      if (cat.color) pill.style.borderColor = cat.color;
      container.appendChild(pill);
    });
    // Re-bind click handlers
    container.querySelectorAll('.filter-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        container.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        currentFilter = pill.dataset.filter;
        loadTasks();
      });
    });
  }

  // ---- Logout ----
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await fetch(API + '/auth/logout', { method: 'POST' });
    window.location.href = '/login.html';
  });

  // ---- Navigation ----
  const navBtns = document.querySelectorAll('.nav-btn');
  const panelViews = document.querySelectorAll('.panel-view');

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      navBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      if (tab === 'chat') {
        document.getElementById('chat-input').focus();
        return;
      }

      panelViews.forEach(v => v.classList.remove('active'));
      const target = document.getElementById('view-' + tab);
      if (target) target.classList.add('active');

      if (tab === 'tasks') loadTasks();
      if (tab === 'calendar') loadCalendar();
      if (tab === 'email') loadEmail();
      if (tab === 'goals') loadGoals();
      if (tab === 'status') loadKillswitch();
      if (tab === 'settings') loadSettings();
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

      // Auto-refresh panels based on what was just created
      if (data.messageType === 'task' || data.messageType === 'action' || data.messageType === 'email_scan') {
        loadTasks();
      }
      if (data.messageType === 'goals') {
        loadGoals();
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

  // ---- Goals ----
  async function loadGoals() {
    const content = document.getElementById('goals-content');
    content.innerHTML = '<div class="loading">Loading goals...</div>';

    try {
      const res = await fetch(API + '/api/goals');
      const data = await res.json();

      if (!data.hasGoals || data.goals.length === 0) {
        content.innerHTML =
          '<div class="goals-empty">' +
            '<div class="goals-empty-icon">&#127919;</div>' +
            '<h3>No goals set yet</h3>' +
            '<p>Chat with Kathy to set up your goals. Try saying:</p>' +
            '<p class="goals-empty-prompt">"Help me set up my goals"</p>' +
          '</div>';
        return;
      }

      // Group goals by category
      const grouped = {};
      data.goals.forEach(function (goal) {
        if (!grouped[goal.category]) grouped[goal.category] = [];
        grouped[goal.category].push(goal);
      });

      content.innerHTML = '';

      Object.entries(grouped).forEach(function (entry) {
        var category = entry[0];
        var goals = entry[1];
        var section = document.createElement('div');
        section.className = 'goals-category';

        // Find category color
        var catColor = '';
        var cat = userCategories.find(function (c) { return c.name === category; });
        if (cat && cat.color) catColor = cat.color;

        var html = '<div class="goals-category-header">' +
          (catColor ? '<span class="cat-dot" style="background:' + catColor + '"></span>' : '') +
          '<span>' + category.charAt(0).toUpperCase() + category.slice(1) + '</span>' +
          '</div>';

        goals.forEach(function (goal) {
          var pct = goal.progress.milestoneProgress;
          var dueStr = goal.target_date
            ? new Date(goal.target_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : '';
          var priorityLabel = goal.priority === 1 ? 'P1' : goal.priority === 2 ? 'P2' : 'P3';

          html += '<div class="goal-card">' +
            '<div class="goal-header">' +
              '<div class="goal-title">' + escapeHtml(goal.title) + '</div>' +
              '<span class="goal-priority p' + goal.priority + '">' + priorityLabel + '</span>' +
            '</div>' +
            (goal.description ? '<div class="goal-description">' + escapeHtml(goal.description) + '</div>' : '') +
            '<div class="goal-progress-bar"><div class="goal-progress-fill" style="width:' + pct + '%"></div></div>' +
            '<div class="goal-meta">' +
              '<span>' + pct + '% complete</span>' +
              (goal.progress.alignedTasksCompleted > 0 ? '<span>' + goal.progress.alignedTasksCompleted + ' aligned tasks done</span>' : '') +
              (dueStr ? '<span>Due ' + dueStr + '</span>' : '') +
            '</div>';

          // Milestones
          if (goal.milestones && goal.milestones.length > 0) {
            html += '<div class="goal-milestones">';
            goal.milestones.forEach(function (m) {
              html += '<div class="milestone-item' + (m.is_completed ? ' completed' : '') + '">' +
                '<div class="milestone-check" data-id="' + m.id + '"></div>' +
                '<span>' + escapeHtml(m.title) + '</span>' +
                '</div>';
            });
            html += '</div>';
          }

          // Add milestone input
          html += '<div class="milestone-add">' +
            '<input type="text" class="milestone-input" data-goal-id="' + goal.id + '" placeholder="Add milestone..." autocomplete="off">' +
            '</div>';

          // Delete button
          html += '<div class="goal-actions">' +
            '<button class="goal-delete-btn" data-id="' + goal.id + '">Delete Goal</button>' +
            '</div>';

          html += '</div>';
        });

        section.innerHTML = html;
        content.appendChild(section);
      });

      // Bind milestone toggle handlers
      content.querySelectorAll('.milestone-check').forEach(function (el) {
        el.addEventListener('click', async function () {
          await fetch(API + '/api/goals/milestones/' + el.dataset.id + '/toggle', { method: 'PATCH' });
          loadGoals();
        });
      });

      // Bind milestone add on Enter
      content.querySelectorAll('.milestone-input').forEach(function (input) {
        input.addEventListener('keydown', async function (e) {
          if (e.key === 'Enter' && input.value.trim()) {
            await fetch(API + '/api/goals/' + input.dataset.goalId + '/milestones', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title: input.value.trim() }),
            });
            loadGoals();
          }
        });
      });

      // Bind delete handlers
      content.querySelectorAll('.goal-delete-btn').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          await fetch(API + '/api/goals/' + btn.dataset.id, { method: 'DELETE' });
          loadGoals();
        });
      });
    } catch (err) {
      content.innerHTML = '<div class="empty-state">Failed to load goals</div>';
    }
  }

  // ---- Email & Drafts ----
  async function loadEmail() {
    const draftsList = document.getElementById('drafts-list');
    const todosList = document.getElementById('email-todos-list');
    draftsList.innerHTML = '<div class="loading">Loading drafts...</div>';
    todosList.innerHTML = '<div class="loading">Loading...</div>';

    // Load drafts and email todos in parallel
    try {
      const [draftsRes, todosRes] = await Promise.all([
        fetch(API + '/email/drafts'),
        fetch(API + '/api/email-todos'),
      ]);
      const draftsData = await draftsRes.json();
      const todosData = await todosRes.json();

      // Render drafts
      if (!draftsData.drafts || draftsData.drafts.length === 0) {
        draftsList.innerHTML = '<div class="empty-state">No pending drafts</div>';
      } else {
        draftsList.innerHTML = '';
        draftsData.drafts.forEach(draft => {
          const card = document.createElement('div');
          card.className = 'draft-card';

          const personaColors = { lyra: '#b8c0ff', music: '#ffd6ff', contractor: '#caffbf' };
          const personaColor = personaColors[draft.persona] || '#e0e0e0';

          card.innerHTML =
            '<div class="draft-header">' +
              '<span class="draft-from">' + escapeHtml(draft.from_address || 'Unknown') + '</span>' +
              '<span class="draft-persona" style="background:' + personaColor + '">' + draft.persona + '</span>' +
            '</div>' +
            '<div class="draft-subject">' + escapeHtml(draft.original_subject || draft.subject || 'No subject') + '</div>' +
            '<div class="draft-snippet">' + escapeHtml(draft.snippet || '') + '</div>' +
            '<div class="draft-body">' + escapeHtml(draft.body) + '</div>' +
            '<div class="draft-actions">' +
              '<button class="draft-send-btn" data-id="' + draft.id + '">Send</button>' +
              '<button class="draft-dismiss-btn" data-id="' + draft.id + '">Dismiss</button>' +
            '</div>';

          draftsList.appendChild(card);
        });

        // Bind send/dismiss handlers
        draftsList.querySelectorAll('.draft-send-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            btn.disabled = true;
            btn.textContent = 'Sending...';
            try {
              await fetch(API + '/email/send/' + btn.dataset.id, { method: 'POST' });
              loadEmail();
            } catch {
              btn.textContent = 'Failed';
              btn.disabled = false;
            }
          });
        });

        draftsList.querySelectorAll('.draft-dismiss-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            btn.disabled = true;
            try {
              await fetch(API + '/email/drafts/' + btn.dataset.id + '/dismiss', { method: 'POST' });
              loadEmail();
            } catch {
              btn.disabled = false;
            }
          });
        });
      }

      // Render email todos
      if (!todosData.tasks || todosData.tasks.length === 0) {
        todosList.innerHTML = '<div class="empty-state">No action items from email</div>';
      } else {
        todosList.innerHTML = '';
        todosData.tasks.forEach(task => {
          const item = document.createElement('div');
          item.className = 'email-todo-item';
          item.innerHTML =
            '<div class="email-todo-title">' + escapeHtml(task.parsed_title || task.description) + '</div>' +
            '<div class="email-todo-meta">' +
              '<span class="task-badge ' + (task.category || '') + '">' + (task.category || 'email') + '</span>' +
              '<span class="task-badge ' + (task.priority || '') + '">' + (task.priority || 'medium') + '</span>' +
              (task.due_date ? '<span class="task-due">' + new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + '</span>' : '') +
            '</div>';
          todosList.appendChild(item);
        });
      }
    } catch {
      draftsList.innerHTML = '<div class="empty-state">Failed to load email data</div>';
      todosList.innerHTML = '';
    }
  }

  // ---- Settings ----
  async function loadSettings() {
    try {
      const res = await fetch(API + '/auth/me');
      const data = await res.json();

      // Accounts list
      const accountsList = document.getElementById('accounts-list');
      if (data.accounts && data.accounts.length > 0) {
        accountsList.innerHTML = data.accounts.map(a =>
          '<div class="settings-item">' +
            '<span>' + escapeHtml(a.email) + '</span>' +
            '<span class="settings-badge">' + a.account_type + (a.is_primary ? ' (primary)' : '') + '</span>' +
          '</div>'
        ).join('');
      } else {
        accountsList.innerHTML = '<div class="empty-state">No accounts connected</div>';
      }

      // Categories list
      const categoriesList = document.getElementById('categories-list');
      if (data.categories && data.categories.length > 0) {
        categoriesList.innerHTML = data.categories.map(c =>
          '<div class="settings-item">' +
            '<span>' +
              (c.color ? '<span class="cat-dot" style="background:' + c.color + '"></span>' : '') +
              escapeHtml(c.name) +
              (c.is_default ? ' <em>(default)</em>' : '') +
            '</span>' +
            (!c.is_default ? '<button class="delete-cat-btn" data-id="' + c.id + '">&times;</button>' : '') +
          '</div>'
        ).join('');

        categoriesList.querySelectorAll('.delete-cat-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            await fetch(API + '/api/categories/' + btn.dataset.id, { method: 'DELETE' });
            loadSettings();
            const authData = await (await fetch(API + '/auth/me')).json();
            if (authData.categories) buildFilterPills(authData.categories);
          });
        });
      }

      // Phone number
      if (data.user && data.user.phone_number) {
        document.getElementById('phone-number').value = data.user.phone_number;
      }
    } catch { /* ignore */ }
  }

  // Add category
  document.getElementById('add-category-btn').addEventListener('click', async () => {
    const name = document.getElementById('new-category-name').value.trim();
    const color = document.getElementById('new-category-color').value;
    if (!name) return;

    await fetch(API + '/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color }),
    });

    document.getElementById('new-category-name').value = '';
    loadSettings();
    const authData = await (await fetch(API + '/auth/me')).json();
    if (authData.categories) buildFilterPills(authData.categories);
  });

  // Save phone
  document.getElementById('save-phone-btn').addEventListener('click', async () => {
    const phone = document.getElementById('phone-number').value.trim();
    if (!phone) return;
    // TODO: add phone update endpoint
    alert('Phone number saved! (requires backend endpoint)');
  });

  // ---- Utilities ----
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ---- Init ----
  async function init() {
    const authData = await checkAuth();
    if (!authData) return; // redirected to login

    loadMessages();
    loadTasks();

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
  }

  init();
})();
