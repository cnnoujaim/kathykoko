// Kathy Koko Dashboard
(function () {
  const API = '';
  let userCategories = [];

  function getCategoryColor(name) {
    var cat = userCategories.find(function (c) { return c.name === name; });
    return cat && cat.color ? cat.color : '#c8b6ff';
  }

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

        // Hide "Category" group pill when filtering by a specific category
        var catGroupPill = document.querySelector('.group-pill[data-group="category"]');
        if (catGroupPill) {
          catGroupPill.style.display = (currentFilter !== 'all') ? 'none' : '';
          if (currentFilter !== 'all' && currentGrouping === 'category') {
            currentGrouping = 'status';
            document.getElementById('task-grouping').querySelectorAll('.group-pill').forEach(function (p) { p.classList.remove('active'); });
            document.querySelector('.group-pill[data-group="status"]').classList.add('active');
          }
        }

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
  var currentGrouping = 'status';
  let tasksData = []; // store for edit panel reference

  // Grouping configurations
  var groupConfigs = {
    status: {
      key: function (task) {
        if (task.status === 'pending' || task.status === 'active') return 'active';
        return task.status;
      },
      order: ['active', 'clarification_needed', 'deferred', 'completed'],
      labels: { active: 'Active', clarification_needed: 'Needs Clarification', deferred: 'Deferred', completed: 'Completed' },
      colors: { active: '#b8c0ff', clarification_needed: '#fde68a', deferred: '#d4cade', completed: '#c8b6ff' }
    },
    priority: {
      key: function (task) { return task.priority || 'none'; },
      order: ['urgent', 'high', 'medium', 'low', 'none'],
      labels: { urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low', none: 'No Priority' },
      colors: { urgent: '#ff8fab', high: '#ffb3c6', medium: '#bbd0ff', low: '#c8b6ff', none: '#d4cade' }
    },
    due: {
      key: function (task) {
        if (!task.due_date) return 'none';
        var now = new Date();
        now.setHours(0, 0, 0, 0);
        var due = new Date(task.due_date);
        due.setHours(0, 0, 0, 0);
        var diffDays = Math.floor((due - now) / 86400000);
        if (diffDays < 0) return 'overdue';
        if (diffDays === 0) return 'today';
        if (diffDays <= 7) return 'week';
        return 'later';
      },
      order: ['overdue', 'today', 'week', 'later', 'none'],
      labels: { overdue: 'Overdue', today: 'Today', week: 'This Week', later: 'Later', none: 'No Due Date' },
      colors: { overdue: '#ff8fab', today: '#ffb3c6', week: '#bbd0ff', later: '#c8b6ff', none: '#d4cade' }
    },
    category: {
      key: function (task) { return task.category || 'uncategorized'; },
      order: null,
      labels: null,
      colors: null
    }
  };

  function groupTasks(tasks, groupType) {
    var config = groupConfigs[groupType];
    var groups = {};

    tasks.forEach(function (task) {
      var groupKey = config.key(task);
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(task);
    });

    var order;
    if (config.order) {
      order = config.order.filter(function (k) { return groups[k] && groups[k].length > 0; });
    } else {
      order = userCategories.map(function (c) { return c.name; }).filter(function (k) { return groups[k]; });
      if (groups['uncategorized']) order.push('uncategorized');
    }

    return order.map(function (key) {
      var label = config.labels ? config.labels[key] : (key === 'uncategorized' ? 'Uncategorized' : key.charAt(0).toUpperCase() + key.slice(1));
      var color = config.colors ? config.colors[key] : getCategoryColor(key);
      return { key: key, label: label, color: color, tasks: groups[key] };
    });
  }

  function renderGroupedTasks(groups) {
    taskList.innerHTML = '';

    groups.forEach(function (group) {
      var section = document.createElement('div');
      section.className = 'task-group';
      section.dataset.group = group.key;

      var header = document.createElement('div');
      header.className = 'task-group-header';
      header.innerHTML =
        '<span class="task-group-chevron">&#9660;</span>' +
        '<span class="task-group-dot" style="background:' + group.color + '"></span>' +
        '<span class="task-group-name">' + escapeHtml(group.label) + '</span>' +
        '<span class="task-group-count">' + group.tasks.length + '</span>';

      header.addEventListener('click', function () {
        section.classList.toggle('collapsed');
      });

      var cards = document.createElement('div');
      cards.className = 'task-group-cards';

      group.tasks.forEach(function (task) {
        var card = buildTaskCard(task);
        cards.appendChild(card);
        bindTaskCardHandlers(card, task);
      });

      section.appendChild(header);
      section.appendChild(cards);
      taskList.appendChild(section);
    });
  }

  function initGroupingPills() {
    var container = document.getElementById('task-grouping');
    container.querySelectorAll('.group-pill').forEach(function (pill) {
      pill.addEventListener('click', function () {
        container.querySelectorAll('.group-pill').forEach(function (p) { p.classList.remove('active'); });
        pill.classList.add('active');
        currentGrouping = pill.dataset.group;
        if (tasksData.length > 0) {
          var groups = groupTasks(tasksData, currentGrouping);
          renderGroupedTasks(groups);
        }
      });
    });
  }

  function buildTaskCard(task) {
    const card = document.createElement('div');
    const statusClass = task.status === 'completed' ? ' completed' : task.status === 'deferred' ? ' deferred' : '';
    card.className = 'task-card' + statusClass;
    card.dataset.taskId = task.id;

    const dueStr = task.due_date
      ? new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : '';

    const priorityBadge = task.priority
      ? '<span class="task-badge ' + task.priority + '">' + task.priority + '</span>'
      : '';

    const deferredBadge = task.status === 'deferred'
      ? '<span class="task-badge deferred">deferred</span>'
      : '';

    const description = task.description
      ? '<div class="task-description">' + escapeHtml(task.description) + '</div>'
      : '';

    card.innerHTML =
      '<div class="task-main">' +
        '<div class="task-check" data-id="' + task.id + '" data-status="' + task.status + '"></div>' +
        '<div class="task-info" data-id="' + task.id + '">' +
          '<div class="task-title">' + escapeHtml(task.parsed_title || task.raw_text) + '</div>' +
          description +
          '<div class="task-meta">' +
            (task.category ? '<span class="task-badge" style="background:' + getCategoryColor(task.category) + '">' + task.category + '</span>' : '') +
            priorityBadge +
            deferredBadge +
            (dueStr ? '<span class="task-due">' + dueStr + '</span>' : '') +
            (task.estimated_hours ? '<span class="task-due">' + task.estimated_hours + 'h</span>' : '') +
          '</div>' +
        '</div>' +
        '<button class="task-delete" data-id="' + task.id + '" title="Delete">&times;</button>' +
      '</div>';

    return card;
  }

  function buildEditPanel(task) {
    var panel = document.createElement('div');
    panel.className = 'task-edit-panel';

    // Priority pills
    var priorities = ['urgent', 'high', 'medium', 'low'];
    var priorityHtml = '<div class="edit-row"><span class="edit-label">Priority</span><div class="edit-pills">';
    priorities.forEach(function (p) {
      var active = task.priority === p ? ' active' : '';
      priorityHtml += '<button class="edit-pill priority-pill ' + p + active + '" data-value="' + p + '">' + p + '</button>';
    });
    priorityHtml += '</div></div>';

    // Category pills
    var categoryHtml = '<div class="edit-row"><span class="edit-label">Category</span><div class="edit-pills">';
    userCategories.forEach(function (cat) {
      var active = task.category === cat.name ? ' active' : '';
      var dot = cat.color ? '<span class="cat-dot" style="background:' + cat.color + '"></span>' : '';
      categoryHtml += '<button class="edit-pill category-pill' + active + '" data-value="' + cat.name + '">' + dot + cat.name + '</button>';
    });
    categoryHtml += '</div></div>';

    // Due date
    var dateVal = task.due_date ? new Date(task.due_date).toISOString().split('T')[0] : '';
    var dateHtml = '<div class="edit-row"><span class="edit-label">Due</span>' +
      '<input type="date" class="edit-date" value="' + dateVal + '">' +
      (dateVal ? '<button class="edit-clear-date" title="Clear date">&times;</button>' : '') +
      '</div>';

    panel.innerHTML = priorityHtml + categoryHtml + dateHtml;

    // Bind priority pills
    panel.querySelectorAll('.priority-pill').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        panel.querySelectorAll('.priority-pill').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        await patchTask(task.id, { priority: btn.dataset.value });
        task.priority = btn.dataset.value;
        refreshTaskCard(task);
      });
    });

    // Bind category pills
    panel.querySelectorAll('.category-pill').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        panel.querySelectorAll('.category-pill').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        await patchTask(task.id, { category: btn.dataset.value });
        task.category = btn.dataset.value;
        refreshTaskCard(task);
      });
    });

    // Bind date input
    var dateInput = panel.querySelector('.edit-date');
    dateInput.addEventListener('change', async function () {
      var val = dateInput.value || null;
      await patchTask(task.id, { due_date: val });
      task.due_date = val;
      refreshTaskCard(task);
    });

    // Bind clear date
    var clearBtn = panel.querySelector('.edit-clear-date');
    if (clearBtn) {
      clearBtn.addEventListener('click', async function () {
        dateInput.value = '';
        await patchTask(task.id, { due_date: null });
        task.due_date = null;
        refreshTaskCard(task);
      });
    }

    return panel;
  }

  function refreshTaskCard(task) {
    var card = taskList.querySelector('.task-card[data-task-id="' + task.id + '"]');
    if (!card) return;
    var newCard = buildTaskCard(task);
    // Preserve edit panel if open
    var existingPanel = card.querySelector('.task-edit-panel');
    if (existingPanel) {
      newCard.appendChild(buildEditPanel(task));
      newCard.classList.add('editing');
    }
    card.replaceWith(newCard);
    bindTaskCardHandlers(newCard, task);
  }

  function bindTaskCardHandlers(card, task) {
    card.querySelector('.task-check').addEventListener('click', function () {
      toggleTask(task.id, task.status);
    });
    card.querySelector('.task-delete').addEventListener('click', function () {
      deleteTask(task.id);
    });
    card.querySelector('.task-info').addEventListener('click', function () {
      var existing = card.querySelector('.task-edit-panel');
      if (existing) {
        existing.remove();
        card.classList.remove('editing');
      } else {
        // Close any other open edit panels
        taskList.querySelectorAll('.task-edit-panel').forEach(function (p) {
          p.parentElement.classList.remove('editing');
          p.remove();
        });
        card.appendChild(buildEditPanel(task));
        card.classList.add('editing');
      }
    });
  }

  async function patchTask(id, data) {
    await fetch(API + '/api/tasks/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  }

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

      tasksData = sorted;

      var groups = groupTasks(sorted, currentGrouping);
      renderGroupedTasks(groups);
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

  // ---- Calendar (Week Grid) ----
  var calendarList = document.getElementById('calendar-list');
  var calendarWeekOffset = 0;
  var CAL_HOUR_HEIGHT = 44;

  var eventTypeColors = {
    work: '#b8c0ff',
    studio: '#e7c6ff',
    workout: '#bbd0ff',
    personal: '#c8b6ff',
    blocked: '#d4cade'
  };

  function getMonday(d) {
    var day = d.getDay();
    var diff = d.getDate() - day + (day === 0 ? -6 : 1);
    var mon = new Date(d);
    mon.setDate(diff);
    mon.setHours(0, 0, 0, 0);
    return mon;
  }

  function getWeekStart() {
    var now = new Date();
    var mon = getMonday(now);
    mon.setDate(mon.getDate() + calendarWeekOffset * 7);
    return mon;
  }

  function updateWeekLabel() {
    var weekStart = getWeekStart();
    var weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    var opts = { month: 'short', day: 'numeric' };
    var label = weekStart.toLocaleDateString('en-US', opts) + ' – ' + weekEnd.toLocaleDateString('en-US', opts);
    var yr = weekStart.getFullYear();
    if (yr !== new Date().getFullYear()) label += ', ' + yr;
    var el = document.getElementById('cal-week-label');
    if (el) el.textContent = label;
  }

  document.getElementById('cal-prev').addEventListener('click', function () {
    calendarWeekOffset--;
    updateWeekLabel();
    loadCalendar();
  });
  document.getElementById('cal-next').addEventListener('click', function () {
    calendarWeekOffset++;
    updateWeekLabel();
    loadCalendar();
  });
  document.getElementById('cal-today').addEventListener('click', function () {
    calendarWeekOffset = 0;
    updateWeekLabel();
    loadCalendar();
  });

  async function loadCalendar() {
    updateWeekLabel();
    calendarList.innerHTML = '<div class="loading">Loading calendar...</div>';

    var weekStart = getWeekStart();
    var startISO = weekStart.toISOString();

    try {
      var res = await fetch(API + '/api/calendar?days=7&start=' + encodeURIComponent(startISO));
      var data = await res.json();
      var events = data.events || [];

      // Build conflict map
      var conflictIds = {};
      for (var i = 0; i < events.length; i++) {
        for (var j = i + 1; j < events.length; j++) {
          var aS = new Date(events[i].start_time).getTime();
          var aE = new Date(events[i].end_time).getTime();
          var bS = new Date(events[j].start_time).getTime();
          var bE = new Date(events[j].end_time).getTime();
          if (aS < bE && aE > bS) {
            conflictIds[events[i].id] = true;
            conflictIds[events[j].id] = true;
          }
        }
      }

      // Group events by day-of-week index (0=Mon ... 6=Sun)
      var dayBuckets = [[], [], [], [], [], [], []];
      events.forEach(function (ev) {
        var evDate = new Date(ev.start_time);
        var dayIdx = (evDate.getDay() + 6) % 7; // Mon=0
        dayBuckets[dayIdx].push(ev);
      });

      // Compute visible hour range from events (default 8am-8pm, expand as needed)
      var CAL_START_HOUR = 8;
      var CAL_END_HOUR = 20;
      events.forEach(function (ev) {
        var s = new Date(ev.start_time);
        var e = new Date(ev.end_time);
        var sh = s.getHours();
        var eh = e.getHours() + (e.getMinutes() > 0 ? 1 : 0);
        if (sh < CAL_START_HOUR) CAL_START_HOUR = sh;
        if (eh > CAL_END_HOUR) CAL_END_HOUR = Math.min(eh, 24);
      });

      // Build grid HTML
      var totalHeight = (CAL_END_HOUR - CAL_START_HOUR) * CAL_HOUR_HEIGHT;
      var dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      var today = new Date();
      today.setHours(0, 0, 0, 0);

      var html = '<div class="cal-grid">';

      // Header row
      html += '<div class="cal-header-row">';
      html += '<div class="cal-time-gutter cal-header-cell"></div>';
      for (var d = 0; d < 7; d++) {
        var colDate = new Date(weekStart);
        colDate.setDate(colDate.getDate() + d);
        var isToday = colDate.getTime() === today.getTime();
        html += '<div class="cal-header-cell' + (isToday ? ' cal-today' : '') + '">';
        html += '<span class="cal-day-name">' + dayNames[d] + '</span>';
        html += '<span class="cal-day-num' + (isToday ? ' cal-today-num' : '') + '">' + colDate.getDate() + '</span>';
        html += '</div>';
      }
      html += '</div>';

      // Body: time gutter + day columns
      html += '<div class="cal-body" style="height:' + totalHeight + 'px">';

      // Time gutter
      html += '<div class="cal-time-gutter">';
      for (var h = CAL_START_HOUR; h < CAL_END_HOUR; h++) {
        var top = (h - CAL_START_HOUR) * CAL_HOUR_HEIGHT;
        var label = h === 0 ? '12 AM' : h < 12 ? h + ' AM' : h === 12 ? '12 PM' : (h - 12) + ' PM';
        html += '<div class="cal-time-label" style="top:' + top + 'px">' + label + '</div>';
      }
      html += '</div>';

      // Day columns
      for (var d = 0; d < 7; d++) {
        var colDate = new Date(weekStart);
        colDate.setDate(colDate.getDate() + d);
        var isToday = colDate.getTime() === today.getTime();

        html += '<div class="cal-day-col' + (isToday ? ' cal-today-col' : '') + '">';

        // Hour grid lines
        for (var h = CAL_START_HOUR; h < CAL_END_HOUR; h++) {
          var top = (h - CAL_START_HOUR) * CAL_HOUR_HEIGHT;
          html += '<div class="cal-hour-line" style="top:' + top + 'px"></div>';
        }

        // Now indicator
        if (isToday && calendarWeekOffset === 0) {
          var nowH = new Date().getHours() + new Date().getMinutes() / 60;
          if (nowH >= CAL_START_HOUR && nowH <= CAL_END_HOUR) {
            var nowTop = (nowH - CAL_START_HOUR) * CAL_HOUR_HEIGHT;
            html += '<div class="cal-now-line" style="top:' + nowTop + 'px"></div>';
          }
        }

        // Events
        var dayEvents = dayBuckets[d];
        dayEvents.forEach(function (ev) {
          var s = new Date(ev.start_time);
          var e = new Date(ev.end_time);
          var startH = s.getHours() + s.getMinutes() / 60;
          var endH = e.getHours() + e.getMinutes() / 60;

          // Handle events spanning past midnight (endH wraps around)
          if (endH <= startH) endH = CAL_END_HOUR;
          // Clamp to visible range
          if (endH <= CAL_START_HOUR || startH >= CAL_END_HOUR) return;
          startH = Math.max(startH, CAL_START_HOUR);
          endH = Math.min(endH, CAL_END_HOUR);

          var evTop = (startH - CAL_START_HOUR) * CAL_HOUR_HEIGHT;
          var evHeight = Math.max((endH - startH) * CAL_HOUR_HEIGHT, 18);
          var color = eventTypeColors[ev.event_type] || eventTypeColors.personal;
          var isConflict = conflictIds[ev.id];

          var timeStr = s.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
          var title = escapeHtml(ev.title || 'Untitled');

          html += '<div class="cal-event' + (isConflict ? ' cal-conflict' : '') + '" ' +
            'style="top:' + evTop + 'px;height:' + evHeight + 'px;background:' + color + '" ' +
            'title="' + timeStr + ' ' + title + '">';
          if (evHeight >= 34) {
            html += '<div class="cal-event-time">' + timeStr + '</div>';
          }
          html += '<div class="cal-event-title">' + title + '</div>';
          if (isConflict) {
            html += '<div class="cal-conflict-dot"></div>';
          }
          html += '</div>';
        });

        html += '</div>';
      }

      html += '</div>'; // .cal-body

      // Legend
      html += '<div class="cal-legend">';
      var types = [['work', 'Work'], ['studio', 'Studio'], ['workout', 'Workout'], ['personal', 'Personal'], ['blocked', 'Blocked']];
      types.forEach(function (t) {
        html += '<span class="cal-legend-item"><span class="cal-legend-dot" style="background:' + eventTypeColors[t[0]] + '"></span>' + t[1] + '</span>';
      });
      html += '</div>';

      calendarList.innerHTML = html;
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
  async function loadGoals(preserveScroll) {
    const content = document.getElementById('goals-content');
    var scrollTop = preserveScroll ? content.scrollTop : 0;
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

          html += '<div class="goal-card" data-goal-id="' + goal.id + '" data-goal-priority="' + goal.priority + '" data-goal-category="' + escapeHtml(goal.category) + '">' +
            '<div class="goal-header" style="cursor:pointer">' +
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
                '<span class="milestone-title" data-id="' + m.id + '">' + escapeHtml(m.title) + '</span>' +
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

      // Restore scroll position
      if (preserveScroll) content.scrollTop = scrollTop;

      // Bind milestone toggle handlers
      content.querySelectorAll('.milestone-check').forEach(function (el) {
        el.addEventListener('click', async function () {
          await fetch(API + '/api/goals/milestones/' + el.dataset.id + '/toggle', { method: 'PATCH' });
          loadGoals(true);
        });
      });

      // Bind milestone double-click to edit
      content.querySelectorAll('.milestone-title').forEach(function (span) {
        span.addEventListener('dblclick', function (e) {
          e.stopPropagation();
          if (span.querySelector('input')) return; // already editing

          var currentText = span.textContent;
          var milestoneId = span.dataset.id;
          var input = document.createElement('input');
          input.type = 'text';
          input.className = 'milestone-edit-input';
          input.value = currentText;

          span.textContent = '';
          span.appendChild(input);
          input.focus();
          input.select();

          async function save() {
            var newText = input.value.trim();
            if (newText && newText !== currentText) {
              await fetch(API + '/api/goals/milestones/' + milestoneId, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: newText }),
              });
              span.textContent = newText;
            } else {
              span.textContent = currentText;
            }
          }

          input.addEventListener('blur', save);
          input.addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter') { input.blur(); }
            if (ev.key === 'Escape') { input.value = currentText; input.blur(); }
          });
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
            loadGoals(true);
          }
        });
      });

      // Bind delete handlers
      content.querySelectorAll('.goal-delete-btn').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          await fetch(API + '/api/goals/' + btn.dataset.id, { method: 'DELETE' });
          loadGoals(true);
        });
      });

      // Bind goal header click → toggle edit panel
      content.querySelectorAll('.goal-header').forEach(function (header) {
        header.addEventListener('click', function () {
          var card = header.closest('.goal-card');
          var existing = card.querySelector('.goal-edit-panel');
          if (existing) {
            existing.remove();
            return;
          }
          // Close other open panels
          content.querySelectorAll('.goal-edit-panel').forEach(function (p) { p.remove(); });

          var goalId = card.dataset.goalId;
          var currentPriority = parseInt(card.dataset.goalPriority);
          var currentCategory = card.dataset.goalCategory;

          var panel = document.createElement('div');
          panel.className = 'goal-edit-panel';

          // Priority pills
          var priHtml = '<div class="edit-row"><span class="edit-label">Priority</span><div class="edit-pills">';
          [1, 2, 3].forEach(function (p) {
            var active = currentPriority === p ? ' active' : '';
            priHtml += '<button class="edit-pill goal-pri-pill p' + p + active + '" data-value="' + p + '">P' + p + '</button>';
          });
          priHtml += '</div></div>';

          // Category pills
          var catHtml = '<div class="edit-row"><span class="edit-label">Category</span><div class="edit-pills">';
          userCategories.forEach(function (cat) {
            var active = currentCategory === cat.name ? ' active' : '';
            var dot = cat.color ? '<span class="cat-dot" style="background:' + cat.color + '"></span>' : '';
            catHtml += '<button class="edit-pill goal-cat-pill' + active + '" data-value="' + cat.name + '">' + dot + cat.name + '</button>';
          });
          catHtml += '</div></div>';

          panel.innerHTML = priHtml + catHtml;
          header.after(panel);

          // Bind priority pill clicks
          panel.querySelectorAll('.goal-pri-pill').forEach(function (pill) {
            pill.addEventListener('click', async function () {
              var val = parseInt(pill.dataset.value);
              panel.querySelectorAll('.goal-pri-pill').forEach(function (p) { p.classList.remove('active'); });
              pill.classList.add('active');
              card.dataset.goalPriority = val;
              await fetch(API + '/api/goals/' + goalId, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ priority: val }),
              });
              // Update the priority badge in the header
              var badge = card.querySelector('.goal-priority');
              if (badge) {
                badge.className = 'goal-priority p' + val;
                badge.textContent = 'P' + val;
              }
            });
          });

          // Bind category pill clicks
          panel.querySelectorAll('.goal-cat-pill').forEach(function (pill) {
            pill.addEventListener('click', async function () {
              var val = pill.dataset.value;
              panel.querySelectorAll('.goal-cat-pill').forEach(function (p) { p.classList.remove('active'); });
              pill.classList.add('active');
              card.dataset.goalCategory = val;
              await fetch(API + '/api/goals/' + goalId, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ category: val }),
              });
              // Reload to move goal to new category section
              loadGoals(true);
            });
          });
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
              '<span class="task-badge" style="background:' + getCategoryColor(task.category || '') + '">' + (task.category || 'email') + '</span>' +
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
      var res = await fetch(API + '/auth/me');
      var data = await res.json();

      // Accounts list with per-account phone numbers
      var accountsList = document.getElementById('accounts-list');
      if (data.accounts && data.accounts.length > 0) {
        accountsList.innerHTML = data.accounts.map(function (a) {
          return '<div class="account-card" data-id="' + a.id + '">' +
            '<div class="account-info">' +
              '<span class="account-email">' + escapeHtml(a.email) + '</span>' +
              '<span class="settings-badge">' + a.account_type + (a.is_primary ? ' (primary)' : '') + '</span>' +
            '</div>' +
            '<div class="account-phone">' +
              '<input type="tel" class="account-phone-input" placeholder="+1234567890" value="' + (a.phone_number || '') + '" data-id="' + a.id + '" autocomplete="off">' +
              '<button class="save-account-phone-btn settings-btn" data-id="' + a.id + '">Save</button>' +
            '</div>' +
          '</div>';
        }).join('');

        // Wire up per-account phone save buttons
        accountsList.querySelectorAll('.save-account-phone-btn').forEach(function (btn) {
          btn.addEventListener('click', async function () {
            var accountId = btn.dataset.id;
            var input = accountsList.querySelector('.account-phone-input[data-id="' + accountId + '"]');
            var phone = input.value.trim();
            var resp = await fetch(API + '/api/accounts/' + accountId + '/phone', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ phone_number: phone || null }),
            });
            if (resp.ok) {
              btn.textContent = 'Saved!';
              setTimeout(function () { btn.textContent = 'Save'; }, 1500);
            }
          });
        });
      } else {
        accountsList.innerHTML = '<div class="empty-state">No accounts connected</div>';
      }

      // Categories list
      var categoriesList = document.getElementById('categories-list');
      if (data.categories && data.categories.length > 0) {
        categoriesList.innerHTML = data.categories.map(function (c) {
          return '<div class="settings-item">' +
            '<span>' +
              (c.color ? '<span class="cat-dot" style="background:' + c.color + '"></span>' : '') +
              escapeHtml(c.name) +
              (c.is_default ? ' <em>(default)</em>' : '') +
            '</span>' +
            (!c.is_default ? '<button class="delete-cat-btn" data-id="' + c.id + '">&times;</button>' : '') +
          '</div>';
        }).join('');

        categoriesList.querySelectorAll('.delete-cat-btn').forEach(function (btn) {
          btn.addEventListener('click', async function () {
            await fetch(API + '/api/categories/' + btn.dataset.id, { method: 'DELETE' });
            loadSettings();
            var authData = await (await fetch(API + '/auth/me')).json();
            if (authData.categories) buildFilterPills(authData.categories);
          });
        });
      }
    } catch (e) { /* ignore */ }
  }

  // Add category
  document.getElementById('add-category-btn').addEventListener('click', async function () {
    var name = document.getElementById('new-category-name').value.trim();
    var color = document.getElementById('new-category-color').value;
    if (!name) return;

    await fetch(API + '/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, color: color }),
    });

    document.getElementById('new-category-name').value = '';
    loadSettings();
    var authData = await (await fetch(API + '/auth/me')).json();
    if (authData.categories) buildFilterPills(authData.categories);
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
    initGroupingPills();
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
